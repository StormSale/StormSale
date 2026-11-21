// @vitest-environment jsdom
import { Buffer } from "buffer";
globalThis.Buffer = Buffer;

import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { scValToNative } from "@stellar/stellar-sdk";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const web3Mock = vi.hoisted(() => ({
  current: {
    userAddress: "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
    connectorType: "mock",
    isConnected: true,
  },
}));

vi.mock("../hooks/useWeb3", () => ({ useWeb3: () => web3Mock.current }));

const organizationMock = vi.hoisted(() => ({
  current: { currentRole: "FINANCE", hasCapability: () => true },
}));

vi.mock("../hooks/useOrganization", () => ({
  useOrganization: () => organizationMock.current,
}));

import * as stellarModule from "../lib/stellar";
import * as escrowAutoRefillModule from "../lib/escrowAutoRefill";
import {
  calculateEscrowReserveStatus,
  getAutoRefillConfig,
  MAX_REFILL_THRESHOLD_PERCENT,
  MIN_REFILL_THRESHOLD_PERCENT,
  saveAutoRefillConfig,
} from "../lib/escrowAutoRefill";
import {
  evaluateAutoTopUpTrigger,
  executeEscrowTopUpWithAllowanceCheck,
  getDefaultAutoTopUpConfig,
  topUpCampaignEscrowContractCall,
} from "../lib/escrowTopUp";
import { CONTRACT_ADDRESSES } from "../config/contracts";
import { SUPPORTED_ESCROW_ASSETS } from "../config/stellar";
import { AutoRefillConfigModal } from "../components/advertiser/AutoRefillConfigModal";
import { EscrowReserveIndicator } from "../components/advertiser/EscrowReserveIndicator";
import { TooltipProvider } from "../components/ui/tooltip";
import {
  buildLowEscrowNotification,
  NotificationProvider,
  useNotification,
  type EscrowMonitoredCampaign,
  type Notification,
} from "../context/NotificationContext";

const ADVERTISER = "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5";
const SUCCESS_HASH = "0x" + "a".repeat(64);

const AlertTrigger: React.FC<{ payload: Omit<Notification, "id"> }> = ({ payload }) => {
  const { showNotification } = useNotification();
  return React.createElement(
    "button",
    { type: "button", onClick: () => showNotification(payload) },
    "Show low-escrow alert",
  );
};

const BalanceCheckTrigger: React.FC<{ campaigns: EscrowMonitoredCampaign[] }> = ({ campaigns }) => {
  const { checkEscrowBalances, notifications } = useNotification();
  return React.createElement(
    "div",
    null,
    React.createElement(
      "button",
      { type: "button", onClick: () => checkEscrowBalances(campaigns) },
      "Check escrow balances",
    ),
    React.createElement(
      "span",
      { "data-testid": "notification-count" },
      String(notifications.length),
    ),
  );
};

describe("[B2B Enterprise] Escrow Auto-Replenishment Thresholds & Pre-Authorization (#443)", () => {
  beforeEach(() => {
    window.localStorage.clear();
    web3Mock.current.userAddress = ADVERTISER;
    web3Mock.current.connectorType = "mock";
    organizationMock.current = { currentRole: "FINANCE", hasCapability: () => true };
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  const modalProps = (campaignId: string) => ({
    isOpen: true,
    onClose: vi.fn(),
    campaignId,
    campaignName: "Enterprise Fall Campaign",
    currentBalanceXlm: 800,
    initialBudgetXlm: 10000,
  });

  describe("1. Low-balance threshold with visual slider and input box", () => {
    it("renders the slider and XLM input box with the configured default threshold", () => {
      render(
        React.createElement(NotificationProvider, {
          children: React.createElement(AutoRefillConfigModal, modalProps("b2b-slider-default")),
        }),
      );

      const slider = screen.getByRole("slider") as HTMLInputElement;
      expect(slider.min).toBe(String(MIN_REFILL_THRESHOLD_PERCENT));
      expect(slider.max).toBe(String(MAX_REFILL_THRESHOLD_PERCENT));
      expect(slider.value).toBe("15");
      expect(screen.getByText("Low-Balance Warning Trigger")).toBeTruthy();
      expect(screen.getByText(/15% \(1500 XLM\)/)).toBeTruthy();

      const amountInput = screen.getByRole("spinbutton") as HTMLInputElement;
      expect(amountInput.value).toBe("500");
      expect(amountInput.getAttribute("placeholder")).toBe("Amount in XLM");
    });

    it("persists the threshold chosen on the visual slider and confirms the save", () => {
      const props = modalProps("b2b-slider-save");
      render(
        React.createElement(NotificationProvider, {
          children: React.createElement(AutoRefillConfigModal, props),
        }),
      );

      fireEvent.change(screen.getByRole("slider"), { target: { value: "22" } });
      expect((screen.getByRole("slider") as HTMLInputElement).value).toBe("22");
      expect(screen.getByText(/22% \(2200 XLM\)/)).toBeTruthy();

      fireEvent.click(screen.getByRole("button", { name: "Save Threshold" }));

      expect(getAutoRefillConfig("b2b-slider-save").thresholdPercent).toBe(22);
      expect(props.onClose).toHaveBeenCalledOnce();
      expect(screen.getByText("Settings Saved")).toBeTruthy();
      expect(screen.getByText(/Auto-refill threshold set to 22% \(2200 XLM\)/)).toBeTruthy();
    });

    it("updates the slider through a preset threshold button", () => {
      render(
        React.createElement(NotificationProvider, {
          children: React.createElement(AutoRefillConfigModal, modalProps("b2b-slider-preset")),
        }),
      );

      fireEvent.click(screen.getByRole("button", { name: "25%" }));

      expect((screen.getByRole("slider") as HTMLInputElement).value).toBe("25");
      expect(screen.getByText(/25% \(2500 XLM\)/)).toBeTruthy();
    });

    it("uses the input box amount to build and submit the instant top-up", async () => {
      const depositSpy = vi
        .spyOn(escrowAutoRefillModule, "depositEscrowRefillContractCall")
        .mockResolvedValue({
          success: true,
          txHash: "0xrefill",
          campaignId: "b2b-input-deposit",
          depositedAmountXlm: 1250,
          newBalanceXlm: 2050,
          timestamp: 1,
          message: "Escrow deposit submitted.",
        });
      const onRefillComplete = vi.fn();
      const props = { ...modalProps("b2b-input-deposit"), onRefillComplete };

      render(
        React.createElement(NotificationProvider, {
          children: React.createElement(AutoRefillConfigModal, props),
        }),
      );

      const amountInput = screen.getByRole("spinbutton") as HTMLInputElement;
      fireEvent.change(amountInput, { target: { value: "1250" } });
      expect(amountInput.value).toBe("1250");

      fireEvent.click(screen.getByRole("button", { name: "Deposit Now" }));

      await waitFor(() =>
        expect(depositSpy).toHaveBeenCalledWith(
          expect.objectContaining({
            campaignId: "b2b-input-deposit",
            amountXlm: 1250,
            callerAddress: ADVERTISER,
            walletType: "mock",
          }),
        ),
      );
      await waitFor(() => expect(onRefillComplete).toHaveBeenCalledWith(2050));
      expect(screen.getByText("Escrow Refilled!")).toBeTruthy();
    });
  });

  describe("2. Notification banner below the configured escrow percentage", () => {
    it("flags a balance below the configured floor and renders the warning banner", () => {
      saveAutoRefillConfig({
        campaignId: "b2b-banner-warning",
        thresholdPercent: 20,
        autoRefillAmountXlm: 500,
        isAutoRefillEnabled: true,
      });
      const config = getAutoRefillConfig("b2b-banner-warning");
      const status = calculateEscrowReserveStatus(
        1200,
        10000,
        config.thresholdPercent,
        config.campaignId,
      );

      expect(status.remainingPercent).toBe(12);
      expect(status.thresholdBalanceXlm).toBe(2000);
      expect(status.isLowReserve).toBe(true);
      expect(status.warningLevel).toBe("warning");

      const onQuickRefill = vi.fn();
      render(
        React.createElement(TooltipProvider, {
          children: React.createElement(EscrowReserveIndicator, { status, onQuickRefill }),
        }),
      );

      expect(
        screen.getByRole("status", { name: "Escrow status: Low Reserve (< 20%)" }),
      ).toBeTruthy();
      expect(
        (screen.getByRole("progressbar") as HTMLElement).getAttribute("aria-valuenow"),
      ).toBe("12");
      expect(screen.getByText(/Trigger threshold: 20%/)).toBeTruthy();

      fireEvent.click(screen.getByRole("button", { name: "1-Click Refill" }));
      expect(onQuickRefill).toHaveBeenCalledOnce();
    });

    it("keeps the banner healthy when remaining escrow is above the configured threshold", () => {
      const status = calculateEscrowReserveStatus(4500, 10000, 20, "b2b-banner-healthy");

      expect(status.isLowReserve).toBe(false);
      expect(status.warningLevel).toBe("healthy");

      render(
        React.createElement(TooltipProvider, {
          children: React.createElement(EscrowReserveIndicator, { status, onQuickRefill: vi.fn() }),
        }),
      );

      expect(screen.getByRole("status", { name: "Escrow status: Escrow Healthy" })).toBeTruthy();
      expect(screen.queryByRole("button", { name: "1-Click Refill" })).toBeNull();
    });

    it("raises a persistent top-up alert for a campaign below the configured floor", async () => {
      const status = calculateEscrowReserveStatus(800, 10000, 20, "b2b-toast-breached");
      expect(status.isLowReserve).toBe(true);

      const payload = buildLowEscrowNotification({
        campaignName: "Enterprise Fall Campaign",
        remainingXlm: status.currentBalanceXlm,
        percentageRemaining: status.remainingPercent,
        campaignId: status.campaignId,
      });
      expect(payload.type).toBe("warning");
      expect(payload.persistent).toBe(true);
      expect(payload.duration).toBe(0);
      expect(payload.message).toContain("800 XLM (8.0%)");

      render(
        React.createElement(NotificationProvider, {
          children: React.createElement(AlertTrigger, { payload }),
        }),
      );

      fireEvent.click(screen.getByRole("button", { name: "Show low-escrow alert" }));

      await waitFor(() =>
        expect(screen.getByText("Low Escrow Alert: Enterprise Fall Campaign")).toBeTruthy(),
      );
      expect(screen.getByText(/800 XLM \(8\.0%\)/)).toBeTruthy();
      expect(screen.getByText("Persistent Alert")).toBeTruthy();
      expect(screen.getByRole("link", { name: "Top Up Escrow" }).getAttribute("href")).toBe(
        "/advertiser?action=topup&campaignId=b2b-toast-breached",
      );
    });

    it("does not duplicate a persistent escrow alert on repeated balance checks", async () => {
      const campaign: EscrowMonitoredCampaign = {
        id: "b2b-toast-dedupe",
        name: "Enterprise Spring Campaign",
        escrowInitial: 10000,
        escrowBalance: 600,
        status: "Active",
      };

      render(
        React.createElement(NotificationProvider, {
          children: React.createElement(BalanceCheckTrigger, { campaigns: [campaign] }),
        }),
      );

      fireEvent.click(screen.getByRole("button", { name: "Check escrow balances" }));
      await waitFor(() =>
        expect(screen.getByText("Low Escrow Alert: Enterprise Spring Campaign")).toBeTruthy(),
      );
      expect(screen.getAllByTestId("notification-toast")).toHaveLength(1);

      fireEvent.click(screen.getByRole("button", { name: "Check escrow balances" }));
      await waitFor(() => expect(screen.getByTestId("notification-count").textContent).toBe("1"));
      expect(screen.getAllByTestId("notification-toast")).toHaveLength(1);
    });

    it("does not raise an alert when the campaign escrow is above the floor", () => {
      const campaign: EscrowMonitoredCampaign = {
        id: "b2b-toast-healthy",
        name: "Healthy Enterprise Campaign",
        escrowInitial: 10000,
        escrowBalance: 4500,
        status: "Active",
      };

      render(
        React.createElement(NotificationProvider, {
          children: React.createElement(BalanceCheckTrigger, { campaigns: [campaign] }),
        }),
      );

      fireEvent.click(screen.getByRole("button", { name: "Check escrow balances" }));

      expect(screen.queryByTestId("notification-toast")).toBeNull();
    });
  });

  describe("3. Pre-authorized top-up transaction construction with Soroban escrow", () => {
    it("builds top_up_escrow ScVals with advertiser, campaign id and stroop amount", async () => {
      vi.stubEnv("NODE_ENV", "production");
      const invokeSpy = vi
        .spyOn(stellarModule.stellarOperations, "invokeSorobanMethod")
        .mockResolvedValue({ success: true, txHash: SUCCESS_HASH, resultValue: 1 });

      const result = await topUpCampaignEscrowContractCall(
        ADVERTISER,
        4242,
        1500,
        "freighter",
        "XLM",
      );

      expect(result).toMatchObject({
        success: true,
        txHash: SUCCESS_HASH,
        toppedUpAmount: 1500,
      });
      expect(invokeSpy).toHaveBeenCalledOnce();

      const [caller, method, args, walletType] = invokeSpy.mock.calls[0];
      expect(caller).toBe(ADVERTISER);
      expect(method).toBe("top_up_escrow");
      expect(walletType).toBe("freighter");
      expect(args).toHaveLength(3);
      expect(scValToNative(args[0])).toBe(ADVERTISER);
      expect(scValToNative(args[1])).toBe(4242);
      expect(scValToNative(args[2])).toBe(15000000000n);
    });

    it("scales stablecoin top-ups by the SAC asset decimals", async () => {
      vi.stubEnv("NODE_ENV", "production");
      const invokeSpy = vi
        .spyOn(stellarModule.stellarOperations, "invokeSorobanMethod")
        .mockResolvedValue({ success: true, txHash: SUCCESS_HASH });

      await topUpCampaignEscrowContractCall(ADVERTISER, 99, 250.5, "freighter", "USDC");

      const [, method, args] = invokeSpy.mock.calls[0];
      expect(method).toBe("top_up_escrow");
      expect(scValToNative(args[2])).toBe(2505000000n);
    });

    it("delegates the missing SAC allowance before submitting the escrow top-up", async () => {
      vi.stubEnv("NODE_ENV", "production");
      const approveSpy = vi.spyOn(stellarModule, "approveTokenContractCall").mockResolvedValue({
        success: true,
        txHash: "0xapprove",
        allowance: 3000,
      });
      const invokeSpy = vi
        .spyOn(stellarModule.stellarOperations, "invokeSorobanMethod")
        .mockResolvedValue({ success: true, txHash: SUCCESS_HASH });

      const result = await executeEscrowTopUpWithAllowanceCheck({
        advertiserAddress: ADVERTISER,
        campaignId: 77,
        amount: 3000,
        assetCode: "USDC",
        walletType: "freighter",
        currentAllowance: 500,
      });

      expect(result.success).toBe(true);
      expect(result.allowanceApproved).toBe(3000);
      expect(result.approvalTxHash).toBe("0xapprove");
      expect(result.simulationFeedback).toMatchObject({ simulated: true });
      expect(approveSpy).toHaveBeenCalledWith(
        ADVERTISER,
        3000,
        CONTRACT_ADDRESSES.CAMPAIGN_ESCROW,
        "freighter",
        SUPPORTED_ESCROW_ASSETS.USDC.contractAddress,
        SUPPORTED_ESCROW_ASSETS.USDC.decimals,
      );

      const [caller, method, args] = invokeSpy.mock.calls[0];
      expect(caller).toBe(ADVERTISER);
      expect(method).toBe("top_up_escrow");
      expect(scValToNative(args[0])).toBe(ADVERTISER);
      expect(scValToNative(args[1])).toBe(77);
      expect(scValToNative(args[2])).toBe(30000000000n);
    });

    it("does not submit a Soroban top-up without the pre-authorized allowance", async () => {
      const invokeSpy = vi
        .spyOn(stellarModule.stellarOperations, "invokeSorobanMethod")
        .mockResolvedValue({ success: true, txHash: SUCCESS_HASH });

      await expect(
        executeEscrowTopUpWithAllowanceCheck({
          advertiserAddress: ADVERTISER,
          campaignId: 78,
          amount: 3000,
          walletType: "freighter",
          currentAllowance: 500,
          autoApproveDeficit: false,
        }),
      ).rejects.toThrow("Pre-authorized SAC allowance deficit");

      expect(invokeSpy).not.toHaveBeenCalled();
    });

    it("gates the pre-authorized top-up on the configured threshold and allowance", () => {
      const config = getDefaultAutoTopUpConfig("b2b-eval", 10000);
      config.thresholdValue = 20;
      config.topUpAmount = 1500;
      const campaign = {
        id: "b2b-eval",
        status: "Active",
        escrowInitial: 10000,
        escrowBalance: 1500,
      };

      const underAuthorized = evaluateAutoTopUpTrigger(campaign, config, 900);
      expect(underAuthorized.shouldTrigger).toBe(false);
      expect(underAuthorized.hasSufficientAllowance).toBe(false);
      expect(underAuthorized.allowanceDeficit).toBe(600);

      const preAuthorized = evaluateAutoTopUpTrigger(campaign, config, 1500);
      expect(preAuthorized.shouldTrigger).toBe(true);
      expect(preAuthorized.requiredTopUpAmount).toBe(1500);
      expect(preAuthorized.thresholdAmount).toBe(2000);
    });
  });
});
