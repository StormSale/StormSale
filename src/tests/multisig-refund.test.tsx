import { describe, it, expect, beforeEach, vi } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";

vi.mock("@radix-ui/react-dialog", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@radix-ui/react-dialog")>();
  return {
    ...actual,
    Portal: ({ children }: { children: React.ReactNode }) => (
      <div data-testid="dialog-portal">{children}</div>
    ),
  };
});
import {
  LARGE_REFUND_THRESHOLD,
  MULTISIG_STORAGE_KEY,
  isLargeRefund,
  initiateMultiSigRefund,
  coSignMultiSigRefund,
  executeMultiSigRefund,
  getAllMultiSigRefundProposals,
  saveMultiSigRefundProposals,
  getLatestProposalForCampaign,
  generateMockSignature,
  type MultiSigRefundProposal,
} from "../lib/multiSigSafe";
import { MultiSigRefundModal } from "../components/advertiser/MultiSigRefundModal";
import { NotificationProvider } from "../context/NotificationContext";
import { initialMockCampaigns } from "../components/advertiser/MyCampaignsList";
import { getLocalStorage } from "../lib/storage";

describe("[Security] Multi-Sig Integration for Large Refunds (#104)", () => {
  const storage = getLocalStorage();

  beforeEach(() => {
    storage.clear();
  });

  describe("Escrow Refund Threshold Policy (> $10k)", () => {
    it("exports standard $10,000 threshold constant", () => {
      expect(LARGE_REFUND_THRESHOLD).toBe(10000);
    });

    it("evaluates amounts less than 10,000 as regular refunds", () => {
      expect(isLargeRefund(0)).toBe(false);
      expect(isLargeRefund(1200)).toBe(false);
      expect(isLargeRefund(5000)).toBe(false);
      expect(isLargeRefund(9999.99)).toBe(false);
    });

    it("evaluates amounts equal to or greater than 10,000 as large multi-sig refunds", () => {
      expect(isLargeRefund(10000)).toBe(true);
      expect(isLargeRefund(15000)).toBe(true);
      expect(isLargeRefund(18500)).toBe(true);
      expect(isLargeRefund(100000)).toBe(true);
    });
  });

  describe("Gnosis Safe / Stellar Multi-Sig Proposal Engine", () => {
    const mockCampaign = {
      id: "6",
      name: "Enterprise Soroban Summit",
      escrowBalance: 18500,
      contractAddress: "CF8R...4321",
    };

    it("initiates a multi-sig proposal with primary signature and pending secondary approval", () => {
      const primaryWallet = "G_ADVERTISER_PRIMARY_KEY_99XX";
      const proposal = initiateMultiSigRefund(mockCampaign, primaryWallet);

      expect(proposal.id).toContain("safe-refund-6-");
      expect(proposal.campaignId).toBe("6");
      expect(proposal.campaignName).toBe("Enterprise Soroban Summit");
      expect(proposal.amount).toBe(18500);
      expect(proposal.amountUsd).toBe("$18,500");
      expect(proposal.threshold).toBe(2);
      expect(proposal.currentSignatures).toBe(1);
      expect(proposal.status).toBe("pending_secondary");

      // Verify signers
      expect(proposal.signers).toHaveLength(3);
      expect(proposal.signers[0].address).toBe(primaryWallet);
      expect(proposal.signers[0].hasSigned).toBe(true);
      expect(proposal.signers[0].signature).toBeDefined();

      expect(proposal.signers[1].role).toBe("Security Approver");
      expect(proposal.signers[1].hasSigned).toBe(false);

      expect(proposal.signers[2].role).toBe("Treasury Guardian");
      expect(proposal.signers[2].hasSigned).toBe(false);
    });

    it("blocks execution when threshold is not yet met", () => {
      const proposal = initiateMultiSigRefund(mockCampaign, "G_PRIMARY");

      expect(() => {
        executeMultiSigRefund(proposal.id);
      }).toThrowError(/requires 2 signatures, but only has 1/);
    });

    it("co-signs proposal to meet 2-of-3 threshold and transitions status to approved", () => {
      const proposal = initiateMultiSigRefund(mockCampaign, "G_PRIMARY");
      const updated = coSignMultiSigRefund(proposal.id);

      expect(updated.currentSignatures).toBe(2);
      expect(updated.status).toBe("approved");
      expect(updated.signers[1].hasSigned).toBe(true);
      expect(updated.signers[1].signature).toContain("0xsafe_sig_");
      expect(updated.signers[1].signedAt).toBeDefined();
    });

    it("executes an approved proposal and produces on-chain settlement txHash", () => {
      const proposal = initiateMultiSigRefund(mockCampaign, "G_PRIMARY");
      coSignMultiSigRefund(proposal.id);

      const execution = executeMultiSigRefund(proposal.id);
      expect(execution.success).toBe(true);
      expect(execution.txHash).toMatch(/^0xsafe_tx_/);
      expect(execution.proposal.status).toBe("executed");
      expect(execution.proposal.executedAt).toBeDefined();
      expect(execution.proposal.txHash).toBe(execution.txHash);
    });

    it("throws error when co-signing or executing an invalid proposal id", () => {
      expect(() => coSignMultiSigRefund("invalid-id")).toThrowError(
        /Multi-sig proposal invalid-id not found/,
      );
      expect(() => executeMultiSigRefund("invalid-id")).toThrowError(
        /Multi-sig proposal invalid-id not found/,
      );
    });

    it("generates deterministic mock signatures with address and proposal fragments", () => {
      const sig = generateMockSignature("GB6M4O99", "prop1234");
      expect(sig).toContain("0xsafe_sig_GB6M4O99_prop1234_");
    });
  });

  describe("LocalStorage Proposal Persistence & State Retrieval", () => {
    it("persists proposals across sessions via LocalStorage", () => {
      const sampleProposal: MultiSigRefundProposal = {
        id: "safe-101",
        campaignId: "test-c",
        campaignName: "Test Campaign",
        amount: 25000,
        amountUsd: "$25,000",
        safeAddress: "GSAFE-STORM-REFUND",
        contractAddress: "CA7Q...1234",
        threshold: 2,
        currentSignatures: 1,
        signers: [
          {
            address: "G_ADDR1",
            role: "Primary Advertiser",
            hasSigned: true,
          },
        ],
        status: "pending_secondary",
        createdAt: "2026-04-01T00:00:00.000Z",
      };

      saveMultiSigRefundProposals([sampleProposal]);
      const loaded = getAllMultiSigRefundProposals();
      expect(loaded).toHaveLength(1);
      expect(loaded[0].id).toBe("safe-101");
      expect(loaded[0].amount).toBe(25000);

      const latest = getLatestProposalForCampaign("test-c");
      expect(latest).toBeDefined();
      expect(latest?.id).toBe("safe-101");
    });

    it("gracefully handles empty or corrupted localStorage storage", () => {
      storage.setItem(MULTISIG_STORAGE_KEY, "invalid-json{{");
      expect(getAllMultiSigRefundProposals()).toEqual([]);
      expect(getLatestProposalForCampaign("any")).toBeNull();
    });
  });

  describe("Advertiser Campaign List Mock Dataset Integration", () => {
    it("includes Campaign 6 with > $10,000 escrow balance for multi-sig testing", () => {
      const campaign6 = initialMockCampaigns.find((c) => c.id === "6");
      expect(campaign6).toBeDefined();
      expect(campaign6!.status).toBe("Completed");
      expect(campaign6!.escrowBalance).toBe(18500);
      expect(campaign6!.isRefunded).toBe(false);
      expect(isLargeRefund(campaign6!.escrowBalance)).toBe(true);
    });

    it("distinguishes small refund campaign 4 (< $10k) from large refund campaign 6 (> $10k)", () => {
      const campaign4 = initialMockCampaigns.find((c) => c.id === "4");
      const campaign6 = initialMockCampaigns.find((c) => c.id === "6");

      expect(campaign4).toBeDefined();
      expect(campaign6).toBeDefined();

      expect(isLargeRefund(campaign4!.escrowBalance)).toBe(false);
      expect(isLargeRefund(campaign6!.escrowBalance)).toBe(true);
    });
  });

  describe("MultiSigRefundModal UI Rendering", () => {
    const testProposal: MultiSigRefundProposal = {
      id: "safe-refund-modal-test",
      campaignId: "6",
      campaignName: "Enterprise Soroban Summit",
      amount: 18500,
      amountUsd: "$18,500",
      safeAddress: "GSAFE-STORM-REFUND-SAFE-2OF3",
      contractAddress: "CF8R...4321",
      threshold: 2,
      currentSignatures: 1,
      signers: [
        {
          address: "G_PRIMARY_ADVERTISER_WAL_99XX",
          role: "Primary Advertiser",
          hasSigned: true,
          signature: "0xsafe_sig_123",
          signedAt: "2026-04-18T12:00:00Z",
        },
        {
          address: "GSAFE-SECURITY-OFFICER-7X9K-88QP",
          role: "Security Approver",
          hasSigned: false,
        },
        {
          address: "GSAFE-TREASURY-GUARDIAN-3M2P-44LK",
          role: "Treasury Guardian",
          hasSigned: false,
        },
      ],
      status: "pending_secondary",
      createdAt: "2026-04-18T12:00:00Z",
    };

    it("returns null when proposal is null", () => {
      const html = renderToString(
        <NotificationProvider>
          <MultiSigRefundModal
            isOpen={true}
            onClose={() => {}}
            proposal={null}
            onProposalUpdated={() => {}}
            onRefundExecuted={() => {}}
          />
        </NotificationProvider>,
      );
      expect(html).toBe("");
    });

    it("renders modal structure with campaign details, threshold badges, and signer checklist", () => {
      const html = renderToString(
        <NotificationProvider>
          <MultiSigRefundModal
            isOpen={true}
            onClose={() => {}}
            proposal={testProposal}
            onProposalUpdated={() => {}}
            onRefundExecuted={() => {}}
          />
        </NotificationProvider>,
      );

      expect(html).toContain("Multi-Sig Escrow Refund Tracker");
      expect(html).toContain("Enterprise Soroban Summit");
      expect(html).toContain("18,500 XLM");
      expect(html).toContain("$18,500 USD Value");
      expect(html).toContain("Threshold: 1/2 Signatures");
      expect(html).toContain("Primary Advertiser");
      expect(html).toContain("Security Approver");
      expect(html).toContain("Treasury Guardian");
      expect(html).toContain("Provide Secondary Signature (Safe Approver)");
    });

    it("renders execution button when threshold is met (2 of 2)", () => {
      const approvedProposal: MultiSigRefundProposal = {
        ...testProposal,
        currentSignatures: 2,
        status: "approved",
        signers: [
          testProposal.signers[0],
          {
            ...testProposal.signers[1],
            hasSigned: true,
            signature: "0xsafe_sig_456",
          },
          testProposal.signers[2],
        ],
      };

      const html = renderToString(
        <NotificationProvider>
          <MultiSigRefundModal
            isOpen={true}
            onClose={() => {}}
            proposal={approvedProposal}
            onProposalUpdated={() => {}}
            onRefundExecuted={() => {}}
          />
        </NotificationProvider>,
      );

      expect(html).toContain("Execute Multi-Sig Escrow Release");
      expect(html).toContain("Threshold: 2/2 Signatures");
    });
  });
});
