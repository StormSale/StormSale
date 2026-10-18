import { describe, it, expect } from "vitest";
import {
  calculateTotalClaimableXlm,
  fetchAffiliateMaturedClaims,
  executeBatchCommissionClaim,
  type ClaimableCampaignItem,
} from "../lib/batchClaim";

describe("Automated Batch Commission Claim Dispatcher (#158)", () => {
  const mockCampaigns: ClaimableCampaignItem[] = [
    {
      campaignId: 101,
      campaignName: "Apex Alpha Performance Tech",
      advertiserAddress: "GA7QW5KXGPTR4N2K9J2M3N4P5Q6R7S8T9U0V1W2X3Y4Z5A6B7C8D",
      maturedSalesCount: 4,
      claimableXlm: 45.5,
      clearingPeriodDays: 7,
      lastSaleDate: "2026-10-01",
      status: "matured",
    },
    {
      campaignId: 204,
      campaignName: "Nova Quantum Cloud Services",
      advertiserAddress: "GB4RN8XJLP8M1K3V6P7Q8R9S0T1U2V3W4X5Y6Z7A8B9C0D1E2F3G",
      maturedSalesCount: 7,
      claimableXlm: 78.0,
      clearingPeriodDays: 14,
      lastSaleDate: "2026-09-28",
      status: "matured",
    },
    {
      campaignId: 309,
      campaignName: "Stellar Horizon SaaS Hub",
      advertiserAddress: "GC1M2N3P4Q5R6S7T8U9V0W1X2Y3Z4A5B6C7D8E9F0G1H2I3J4K5L",
      maturedSalesCount: 3,
      claimableXlm: 32.25,
      clearingPeriodDays: 3,
      lastSaleDate: "2026-10-08",
      status: "matured",
    },
  ];

  describe("Claim Aggregation", () => {
    it("should calculate total withdrawable XLM balance accurately across multiple campaigns", () => {
      const total = calculateTotalClaimableXlm(mockCampaigns);
      expect(total).toBe(155.75); // 45.5 + 78.0 + 32.25
    });

    it("should return 0 when campaigns list is empty", () => {
      expect(calculateTotalClaimableXlm([])).toBe(0);
    });

    it("should fetch matured claims for an affiliate", async () => {
      const data = await fetchAffiliateMaturedClaims(
        "GA7QW5KXGPTR4N2K9J2M3N4P5Q6R7S8T9U0V1W2X3Y4Z5A6B7C8D",
      );
      expect(data.length).toBeGreaterThan(0);
      expect(data[0].status).toBe("matured");
    });
  });

  describe("Batch Transaction Envelope & Receipt Itemization", () => {
    it("should assemble and execute single transaction envelope in mock mode", async () => {
      const receipt = await executeBatchCommissionClaim(
        "GASTORMSALE7TESTNET7AFFILIATE7MERCHANT7ESCROW7XLM77777",
        mockCampaigns,
        "mock",
      );

      expect(receipt.success).toBe(true);
      expect(receipt.txHash).toBeDefined();
      expect(receipt.txHash.startsWith("0x")).toBe(true);
      expect(receipt.totalClaimedXlm).toBe(155.75);

      // Verify itemized claims breakdown
      expect(receipt.itemizedClaims.length).toBe(3);
      expect(receipt.itemizedClaims[0].campaignId).toBe(101);
      expect(receipt.itemizedClaims[0].claimedXlm).toBe(45.5);
      expect(receipt.itemizedClaims[1].campaignId).toBe(204);
      expect(receipt.itemizedClaims[1].claimedXlm).toBe(78.0);
      expect(receipt.itemizedClaims[2].campaignId).toBe(309);
      expect(receipt.itemizedClaims[2].claimedXlm).toBe(32.25);
    });

    it("should throw error when attempting to claim with no campaigns", async () => {
      await expect(
        executeBatchCommissionClaim(
          "GASTORMSALE7TESTNET7AFFILIATE7MERCHANT7ESCROW7XLM77777",
          [],
          "mock",
        ),
      ).rejects.toThrow("No campaigns selected for batch claim.");
    });
  });
});
