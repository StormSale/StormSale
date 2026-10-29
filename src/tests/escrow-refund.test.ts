// @vitest-environment jsdom
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import {
  canConcludeAndRefundEscrow,
  isClearingPeriodExpired,
  hasClearedAllClaims,
  getRefundBreakdown,
  applyRefundConcludedState,
  type EscrowRefundCampaign,
} from "../lib/escrowRefund";
import { ConcludeRefundModal } from "../components/advertiser/ConcludeRefundModal";
import { initialMockCampaigns } from "../components/advertiser/MyCampaignsList";
import { refundEscrowContractCall } from "../lib/stellar";
import { STORMSALE_CONTRACT_METHODS } from "../config/abis";

describe("[Advertiser] Campaign Budget Clawback and Time-Locked Escrow Refund Flow", () => {
  const baseCampaign: EscrowRefundCampaign = {
    id: "4",
    name: "DeFi Starter Pack",
    status: "Completed",
    escrowBalance: 1200,
    escrowInitial: 3000,
    pendingClaims: 0,
    outstandingLiabilities: 0,
    clearingPeriodSecs: 14 * 86400,
    clearingExpiresAt: Date.now() - 10000, // Expired
    isRefunded: false,
  };

  describe("Contract Method & ABI Specification", () => {
    it("defines refund_escrow method symbol in contract ABIs", () => {
      expect(STORMSALE_CONTRACT_METHODS.REFUND_ESCROW).toBe("refund_escrow");
    });

    it("invokes contract refund_escrow method with advertiser signature", async () => {
      const advertiser = "GASTORMSALE7TESTNET7AFFILIATE7MERCHANT7ESCROW7XLM77777";
      const result = await refundEscrowContractCall(advertiser, 4, "mock");
      expect(result.success).toBe(true);
      expect(result.txHash).toBeDefined();
      expect(typeof result.txHash).toBe("string");
    });
  });

  describe("Acceptance Criterion 1: Button Enabled Only After Clearing Period Expires", () => {
    it("allows refund when clearing period has expired and no claims are pending", () => {
      const validation = canConcludeAndRefundEscrow(baseCampaign);
      expect(validation.canRefund).toBe(true);
      expect(validation.isClearingExpired).toBe(true);
      expect(validation.hasClearedAllClaims).toBe(true);
    });

    it("disallows refund and shows remaining time if clearing period has not expired", () => {
      const activeCampaign: EscrowRefundCampaign = {
        ...baseCampaign,
        clearingExpiresAt: Date.now() + 60000, // 60s in future
      };
      const validation = canConcludeAndRefundEscrow(activeCampaign);
      expect(validation.canRefund).toBe(false);
      expect(validation.isClearingExpired).toBe(false);
      expect(validation.remainingClearingSeconds).toBeGreaterThan(0);
      expect(validation.reason).toContain("Clearing period is still active");
    });

    it("checks isClearingPeriodExpired directly with timestamps, ISO strings, and Dates", () => {
      const now = Date.now();
      expect(isClearingPeriodExpired(now - 1000, now)).toBe(true);
      expect(isClearingPeriodExpired(now + 1000, now)).toBe(false);
      expect(isClearingPeriodExpired(new Date(now - 2000).toISOString(), now)).toBe(true);
      expect(isClearingPeriodExpired(new Date(now + 2000), now)).toBe(false);
      expect(isClearingPeriodExpired(undefined, now)).toBe(true);
    });

    it("disallows refund when refundable balance is zero or negative", () => {
      const emptyCampaign: EscrowRefundCampaign = {
        ...baseCampaign,
        escrowBalance: 0,
      };
      const validation = canConcludeAndRefundEscrow(emptyCampaign);
      expect(validation.canRefund).toBe(false);
      expect(validation.refundableAmount).toBe(0);
      expect(validation.reason).toContain("No remaining escrow balance to refund");
    });

    it("handles string or Date clearingExpiresAt in canConcludeAndRefundEscrow", () => {
      const isoCampaign: EscrowRefundCampaign = {
        ...baseCampaign,
        clearingExpiresAt: new Date(Date.now() - 5000).toISOString(),
      };
      expect(canConcludeAndRefundEscrow(isoCampaign).canRefund).toBe(true);

      const noExpiryCampaign: EscrowRefundCampaign = {
        ...baseCampaign,
        clearingExpiresAt: undefined,
      };
      expect(canConcludeAndRefundEscrow(noExpiryCampaign).canRefund).toBe(true);
    });
  });

  describe("Acceptance Criterion 2: Modal Displays Exact Refundable XLM and Zero Outstanding Liabilities", () => {
    it("extracts exact refundable XLM amount and liability breakdown", () => {
      const breakdown = getRefundBreakdown(baseCampaign);
      expect(breakdown.refundableAmount).toBe(1200);
      expect(breakdown.pendingClaims).toBe(0);
      expect(breakdown.outstandingLiabilities).toBe(0);
    });

    it("fails validation if affiliate claims are pending or liabilities exist", () => {
      const campaignWithPendingClaims: EscrowRefundCampaign = {
        ...baseCampaign,
        pendingClaims: 2,
        outstandingLiabilities: 350,
      };
      const validation = canConcludeAndRefundEscrow(campaignWithPendingClaims);
      expect(validation.canRefund).toBe(false);
      expect(validation.hasClearedAllClaims).toBe(false);
      expect(validation.pendingClaimsCount).toBe(2);
      expect(validation.outstandingLiabilities).toBe(350);
      expect(validation.reason).toContain("affiliate claims are still pending");
    });

    it("verifies hasClearedAllClaims logic", () => {
      expect(hasClearedAllClaims()).toBe(true);
      expect(hasClearedAllClaims(0, 0)).toBe(true);
      expect(hasClearedAllClaims(1, 0)).toBe(false);
      expect(hasClearedAllClaims(0, 50)).toBe(false);
      expect(hasClearedAllClaims(2, 100)).toBe(false);
    });

    it("renders ConcludeRefundModal with exact refundable XLM and zero liabilities", () => {
      const onClose = vi.fn();
      const onConfirm = vi.fn().mockResolvedValue(undefined);

      const { rerender } = render(
        React.createElement(ConcludeRefundModal, {
          isOpen: true,
          onClose,
          campaign: null,
          treasuryAddress: null,
          onConfirm,
        }),
      );
      expect(screen.queryByText("Conclude & Refund Escrow")).toBeNull();

      rerender(
        React.createElement(ConcludeRefundModal, {
          isOpen: true,
          onClose,
          campaign: baseCampaign,
          treasuryAddress: "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
          onConfirm,
        }),
      );

      expect(screen.getByText("Conclude & Refund Escrow")).toBeTruthy();
      expect(screen.getByText("Zero Outstanding Liabilities")).toBeTruthy();
      expect(screen.getByText("0.00 XLM (0 pending)")).toBeTruthy();
      expect(screen.getByText("Expired / Concluded")).toBeTruthy();

      const confirmBtn = screen.getByRole("button", { name: /Confirm & Refund/i });
      fireEvent.click(confirmBtn);
      expect(onConfirm).toHaveBeenCalledWith(baseCampaign);

      const cancelBtn = screen.getByRole("button", { name: /Cancel/i });
      fireEvent.click(cancelBtn);
      expect(onClose).toHaveBeenCalled();
    });

    it("renders ConcludeRefundModal in ineligible and submitting states", () => {
      const blockedCampaign: EscrowRefundCampaign = {
        ...baseCampaign,
        clearingExpiresAt: Date.now() + 120000,
        pendingClaims: 2,
        outstandingLiabilities: 200,
      };

      const { rerender } = render(
        React.createElement(ConcludeRefundModal, {
          isOpen: true,
          onClose: vi.fn(),
          campaign: blockedCampaign,
          treasuryAddress: null,
          onConfirm: vi.fn(),
          isSubmitting: false,
        }),
      );

      expect(screen.getByText("Advertiser Signer")).toBeTruthy();
      expect(screen.getByText("200.00 XLM (2 pending)")).toBeTruthy();

      rerender(
        React.createElement(ConcludeRefundModal, {
          isOpen: true,
          onClose: vi.fn(),
          campaign: baseCampaign,
          treasuryAddress: null,
          onConfirm: vi.fn(),
          isSubmitting: true,
        }),
      );

      expect(screen.getByText(/Submitting Contract Refund/i)).toBeTruthy();
    });
  });

  describe("Technical Specification & State Transition: CONCLUDED and Balance 0.00", () => {
    it("transitions campaign status to CONCLUDED and balance to 0.00 upon refund", () => {
      const concluded = applyRefundConcludedState(baseCampaign);
      expect(concluded.status).toBe("CONCLUDED");
      expect(concluded.escrowBalance).toBe(0);
      expect(concluded.isRefunded).toBe(true);
    });

    it("prevents re-refunding a campaign once CONCLUDED or already refunded", () => {
      const concludedCampaign: EscrowRefundCampaign = {
        ...baseCampaign,
        status: "CONCLUDED",
        escrowBalance: 0,
        isRefunded: true,
      };
      const validation = canConcludeAndRefundEscrow(concludedCampaign);
      expect(validation.canRefund).toBe(false);
      expect(validation.refundableAmount).toBe(0);
      expect(validation.reason).toContain("already been concluded and refunded");
    });
  });

  describe("Integration with initialMockCampaigns", () => {
    it("identifies Campaign 4 as eligible for Conclude & Refund Escrow", () => {
      const campaign4 = initialMockCampaigns.find((c) => c.id === "4");
      expect(campaign4).toBeDefined();
      const validation = canConcludeAndRefundEscrow(campaign4!);
      expect(validation.canRefund).toBe(true);
      expect(validation.refundableAmount).toBe(1200);
    });

    it("identifies Campaign 7 as ineligible due to unexpired clearing period and pending claims", () => {
      const campaign7 = initialMockCampaigns.find((c) => c.id === "7");
      expect(campaign7).toBeDefined();
      const validation = canConcludeAndRefundEscrow(campaign7!);
      expect(validation.canRefund).toBe(false);
      expect(validation.isClearingExpired).toBe(false);
      expect(validation.hasClearedAllClaims).toBe(false);
    });
  });
});
