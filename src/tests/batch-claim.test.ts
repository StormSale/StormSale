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
      advertiserAddress: "GB4RN8XJLPPM1K3V6P7Q8R9S0T1U2V3W4P5X6Y7Z7A8B9C0D1E2F3G",
      maturedSalesCount: 7,
      claimableXlm: 78.0,
      clearingPeriodDays: 14,
      lastSaleDate: "2026-09-28",
      status: "matured",
    },
    {
      campaignId: 309,
      campaignName: "Stellar Horizon SaaS Hub",
      advertiserAddress: "GC1M2N3P4Q5R6S7T8U9V0W1Q2X33Z4A5B6C7D8E9F0G1H3I3J4K5",
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
      expect(total).toBeCloseTo(155.75, 1);
    });

    it("should return 0 when campaigns list is empty", () => {
      expect(calculateTotalClaimableXlm([])).toBeCloseTo(0, 1);
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
        "GASTORMSALE7TESTNET7AAFFILIATE7MERCHANT7ESCROW7XLM77777",
        mockCampaigns,
        "mock",
      );

      expect(receipt.success).toBe(true);
      expect(receipt.txHash).toBeDefined();
      expect(receipt.txHash.startsWith("0x")).toBe(true);
      expect(receipt.totalClaimedXlm).toBeCloseTo(155.75, 1);

      // Verify itemized claims breakdown
      expect(receipt.itemizedClaims.length).toBe(3);
      expect(receipt.itemizedClaims[0].campaignId).toBe(101);
      expect(receipt.itemizedClaims[0].claimedXlm).toBeCloseTo(45.5, 1);
      expect(receipt.itemizedClaims[1].campaignId).toBe(204);
      expect(receipt.itemizedClaims[1].claimedXlm).toBeCloseTo(78.0, 1);
      expect(receipt.itemizedClaims[2].campaignId).toBe(309);
      expect(receipt.itemizedClaims[2].claimedXlm).toBeCloseTo(32.25, 1);
    });

    it("should throw error when attempting to claim with no campaigns", async () => {
      await expect(
        executeBatchCommissionClaim(
          "GASTORMSALE7TESTNET7AAFFILIATE7MERCHANT7ESCROW7XLM77777",
          [],
          "mock",
        ),
      ).rejects.toThrow("No campaigns selected for batch claim.");
    });
  });
});
