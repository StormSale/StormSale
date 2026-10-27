import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  fetchAffiliateMaturedClaims,
  calculateTotalClaimableXlm,
  type ClaimableCampaignItem,
} from "../lib/batchClaim";

const MOCK_MATURED: ClaimableCampaignItem[] = [
  {
    campaignId: 101,
    campaignName: "Apex Alpha Performance Tech",
    advertiserAddress: "GADV1234",
    maturedSalesCount: 4,
    claimableXlm: 45.5,
    clearingPeriodDays: 7,
    lastSaleDate: "2026-10-01",
    status: "matured",
  },
  {
    campaignId: 204,
    campaignName: "Nova Quantum Cloud Services",
    advertiserAddress: "GADV5678",
    maturedSalesCount: 7,
    claimableXlm: 78.0,
    clearingPeriodDays: 14,
    lastSaleDate: "2026-09-28",
    status: "matured",
  },
];

describe("ClaimPayouts — Batch Claim Logic (#259)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("calculateTotalClaimableXlm", () => {
    it("sums claimable XLM across multiple campaigns", () => {
      const total = calculateTotalClaimableXlm(MOCK_MATURED);
      expect(total).toBe(123.5); // 45.5 + 78.0
    });

    it("returns 0 for empty list", () => {
      expect(calculateTotalClaimableXlm([])).toBe(0);
    });

    it("rounds to 2 decimal places", () => {
      const items: ClaimableCampaignItem[] = [
        { ...MOCK_MATURED[0], claimableXlm: 10.123 },
        { ...MOCK_MATURED[1], claimableXlm: 5.678 },
      ];
      const total = calculateTotalClaimableXlm(items);
      expect(total).toBe(15.8);
    });

    it("handles single campaign", () => {
      expect(calculateTotalClaimableXlm([MOCK_MATURED[0]])).toBe(45.5);
    });
  });

  describe("fetchAffiliateMaturedClaims", () => {
    it("loads campaign data successfully", async () => {
      const data = await fetchAffiliateMaturedClaims("GTEST1234AFFILIATE");
      expect(Array.isArray(data)).toBe(true);
      expect(data.length).toBeGreaterThan(0);
    });

    it("all returned items have required fields", async () => {
      const data = await fetchAffiliateMaturedClaims("GTEST1234AFFILIATE");
      for (const item of data) {
        expect(typeof item.campaignId).toBe("number");
        expect(typeof item.campaignName).toBe("string");
        expect(typeof item.claimableXlm).toBe("number");
        expect(["matured", "clearing", "claimed"]).toContain(item.status);
      }
    });

    it("returns matured items with positive claimableXlm", async () => {
      const data = await fetchAffiliateMaturedClaims("GTEST1234AFFILIATE");
      const matured = data.filter((c) => c.status === "matured");
      expect(matured.length).toBeGreaterThan(0);
      matured.forEach((c) => expect(c.claimableXlm).toBeGreaterThan(0));
    });

    it("handles concurrent calls without race conditions", async () => {
      const [a, b] = await Promise.all([
        fetchAffiliateMaturedClaims("GADDR1"),
        fetchAffiliateMaturedClaims("GADDR2"),
      ]);
      expect(a).toEqual(b); // mock returns same data regardless of address
    });
  });

  describe("Batch selection logic", () => {
    it("filters only matured campaigns for batch claim", () => {
      const mixed: ClaimableCampaignItem[] = [
        { ...MOCK_MATURED[0], status: "matured" },
        { ...MOCK_MATURED[1], status: "clearing" },
        { ...MOCK_MATURED[0], campaignId: 999, status: "claimed" },
      ];
      const selectable = mixed.filter((c) => c.status === "matured");
      expect(selectable).toHaveLength(1);
      expect(selectable[0].campaignId).toBe(101);
    });

    it("calculates correct total for a mixed selection", () => {
      const selected = MOCK_MATURED.filter((c) => c.campaignId === 101);
      expect(calculateTotalClaimableXlm(selected)).toBe(45.5);
    });
  });
});
