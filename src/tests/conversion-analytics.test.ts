// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  calculateCvr,
  computeTrend,
  matchConversionsToLink,
  computeLinkConversionMetrics,
  computeAggregateConversionAnalytics,
  syncBackendConversions,
  DEFAULT_DEMO_CONVERSIONS,
} from "../lib/conversionAnalytics";
import type { CustomShortLink } from "../types/affiliateLink";
import type { CustomerConversion } from "../lib/cohortAnalysis";
import * as api from "../utils/api";

describe("conversionAnalytics engine", () => {
  describe("calculateCvr", () => {
    it("calculates click-to-sale percentage with 2 decimal precision", () => {
      expect(calculateCvr(100, 5)).toBe(5);
      expect(calculateCvr(1250, 5)).toBe(0.4);
      expect(calculateCvr(200, 15)).toBe(7.5);
      expect(calculateCvr(333, 11)).toBe(3.3);
    });

    it("handles edge cases safely without division by zero or NaN", () => {
      expect(calculateCvr(0, 0)).toBe(0);
      expect(calculateCvr(0, 10)).toBe(0);
      expect(calculateCvr(-10, 5)).toBe(0);
      expect(calculateCvr(100, -5)).toBe(0);
      expect(calculateCvr(NaN, 5)).toBe(0);
      expect(calculateCvr(100, Infinity)).toBe(0);
    });
  });

  describe("computeTrend", () => {
    it("detects upward trend with formatted positive delta", () => {
      const trend = computeTrend(5.5, 3.2);
      expect(trend.direction).toBe("up");
      expect(trend.delta).toBe(2.3);
      expect(trend.formattedDelta).toBe("+2.30%");
    });

    it("detects downward trend with formatted negative delta", () => {
      const trend = computeTrend(2.1, 3.5);
      expect(trend.direction).toBe("down");
      expect(trend.delta).toBe(-1.4);
      expect(trend.formattedDelta).toBe("-1.40%");
    });

    it("detects neutral trend when change is negligible or zero", () => {
      const trend = computeTrend(4.0, 4.0);
      expect(trend.direction).toBe("neutral");
      expect(trend.delta).toBe(0);
      expect(trend.formattedDelta).toBe("0.00%");
    });

    it("handles non-finite inputs safely", () => {
      const trend = computeTrend(NaN, 2.5);
      expect(trend.direction).toBe("down");
      expect(trend.delta).toBe(-2.5);
    });
  });

  describe("matchConversionsToLink", () => {
    const link: CustomShortLink = {
      id: "link-1",
      slug: "tech-deals",
      affiliateWallet: "GBBD...5678",
      walletFingerprint: "wf_123",
      campaignId: "7",
      campaignName: "Technology",
      destinationUrl: "https://example.com/tech",
      trackingParams: {},
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z",
      clickCount: 100,
    };

    const conversions: CustomerConversion[] = [
      {
        id: "c1",
        customerRef: "CUST_1",
        affiliateAddress: "GBBD...5678",
        affiliateName: "Alice",
        campaignId: "7",
        campaignName: "Technology",
        amount: 100,
        timestamp: "2026-01-02T00:00:00Z",
      },
      {
        id: "c2",
        customerRef: "CUST_2",
        affiliateAddress: "GOTHER...9999",
        affiliateName: "Bob",
        campaignId: "7",
        campaignName: "Technology",
        amount: 200,
        timestamp: "2026-01-03T00:00:00Z",
      },
      {
        id: "c3",
        customerRef: "CUST_3",
        affiliateAddress: "GBBD...5678",
        campaignId: "99",
        campaignName: "Fashion",
        affiliateName: "Alice",
        amount: 50,
        timestamp: "2026-01-04T00:00:00Z",
      },
    ];

    it("matches conversions by campaign ID and matching affiliate wallet", () => {
      const matched = matchConversionsToLink(link, conversions);
      expect(matched).toHaveLength(1);
      expect(matched[0].id).toBe("c1");
    });

    it("matches conversion with explicit slug override", () => {
      const taggedConversions = [
        ...conversions,
        {
          ...conversions[1],
          id: "c-tagged",
          slug: "tech-deals",
        } as unknown as CustomerConversion,
      ];
      const matched = matchConversionsToLink(link, taggedConversions);
      expect(matched.map((m) => m.id)).toContain("c-tagged");
    });

    it("returns empty array when input links or conversions are missing", () => {
      expect(matchConversionsToLink(null as unknown as CustomShortLink, conversions)).toEqual([]);
      expect(matchConversionsToLink(link, [])).toEqual([]);
    });
  });

  describe("computeLinkConversionMetrics", () => {
    const link: CustomShortLink = {
      id: "link-alpha",
      slug: "crypto-tools",
      affiliateWallet: "Gwallet-one",
      walletFingerprint: "wf_alpha",
      campaignId: "7",
      campaignName: "Technology",
      destinationUrl: "https://example.com",
      trackingParams: {},
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z",
      clickCount: 200,
    };

    const conversions: CustomerConversion[] = [
      {
        id: "c1",
        customerRef: "C1",
        affiliateAddress: "Gwallet-one",
        affiliateName: "Pro",
        campaignId: "7",
        campaignName: "Technology",
        amount: 150,
        timestamp: "2026-01-02T00:00:00Z",
      },
      {
        id: "c2",
        customerRef: "C2",
        affiliateAddress: "Gwallet-one",
        affiliateName: "Pro",
        campaignId: "7",
        campaignName: "Technology",
        amount: 250,
        timestamp: "2026-01-05T00:00:00Z",
      },
    ];

    it("calculates link CVR %, sales count, total volume, and trend", () => {
      const metrics = computeLinkConversionMetrics(link, conversions, 0.5);
      expect(metrics.clicks).toBe(200);
      expect(metrics.salesCount).toBe(2);
      expect(metrics.salesVolume).toBe(400);
      expect(metrics.cvrPercentage).toBe(1.0);
      expect(metrics.formattedCvr).toBe("1.00%");
      expect(metrics.trend.direction).toBe("up");
      expect(metrics.trend.formattedDelta).toBe("+0.50%");
    });

    it("handles links with 0 clicks gracefully", () => {
      const zeroClickLink = { ...link, clickCount: 0 };
      const metrics = computeLinkConversionMetrics(zeroClickLink, conversions);
      expect(metrics.clicks).toBe(0);
      expect(metrics.cvrPercentage).toBe(0);
      expect(metrics.formattedCvr).toBe("0.00%");
      expect(metrics.trend.direction).toBe("neutral");
    });
  });

  describe("computeAggregateConversionAnalytics", () => {
    const links: CustomShortLink[] = [
      {
        id: "l1",
        slug: "link-high",
        affiliateWallet: "Gwallet-one",
        walletFingerprint: "wf_1",
        campaignId: "7",
        campaignName: "Technology",
        destinationUrl: "https://example.com",
        trackingParams: {},
        createdAt: "2026-01-01T00:00:00Z",
        updatedAt: "2026-01-01T00:00:00Z",
        clickCount: 500,
      },
      {
        id: "l2",
        slug: "link-low",
        affiliateWallet: "Gwallet-two",
        walletFingerprint: "wf_2",
        campaignId: "8",
        campaignName: "Finance",
        destinationUrl: "https://example.com/fin",
        trackingParams: {},
        createdAt: "2026-01-01T00:00:00Z",
        updatedAt: "2026-01-01T00:00:00Z",
        clickCount: 100,
      },
    ];

    const conversions: CustomerConversion[] = [
      {
        id: "c1",
        customerRef: "C1",
        affiliateAddress: "Gwallet-one",
        affiliateName: "Pro",
        campaignId: "7",
        campaignName: "Technology",
        amount: 200,
        timestamp: "2026-01-02T00:00:00Z",
      },
      {
        id: "c2",
        customerRef: "C2",
        affiliateAddress: "Gwallet-one",
        affiliateName: "Pro",
        campaignId: "7",
        campaignName: "Technology",
        amount: 300,
        timestamp: "2026-01-03T00:00:00Z",
      },
      {
        id: "c3",
        customerRef: "C3",
        affiliateAddress: "Gwallet-two",
        affiliateName: "Partner",
        campaignId: "8",
        campaignName: "Finance",
        amount: 100,
        timestamp: "2026-01-04T00:00:00Z",
      },
    ];

    it("aggregates clicks, sales, and computes overall CVR and top slugs", () => {
      const summary = computeAggregateConversionAnalytics(links, conversions);
      expect(summary.totalLinks).toBe(2);
      expect(summary.totalClicks).toBe(600);
      expect(summary.totalSales).toBe(3);
      expect(summary.totalSalesVolume).toBe(600);
      // Overall CVR: (3 / 600) * 100 = 0.50%
      expect(summary.overallCvrPercentage).toBe(0.5);
      expect(summary.formattedOverallCvr).toBe("0.50%");
      expect(summary.topPerformingSlug).toBe("link-high");
      expect(summary.linkMetrics.size).toBe(2);
    });

    it("handles empty links list", () => {
      const summary = computeAggregateConversionAnalytics([], []);
      expect(summary.totalLinks).toBe(0);
      expect(summary.totalClicks).toBe(0);
      expect(summary.totalSales).toBe(0);
      expect(summary.overallCvrPercentage).toBe(0);
      expect(summary.topPerformingSlug).toBeNull();
      expect(summary.topConvertingSlug).toBeNull();
    });
  });

  describe("syncBackendConversions", () => {
    beforeEach(() => {
      vi.restoreAllMocks();
    });

    it("returns backend data when API returns conversions", async () => {
      const mockApiData = [
        {
          id: "api-c1",
          customerRef: "CUST_API",
          affiliateAddress: "GBBD...5678",
          affiliateName: "Alice",
          campaignId: "CAMP_1",
          campaignName: "Live Campaign",
          amount: 500,
          timestamp: "2026-02-01T00:00:00Z",
        },
      ];
      vi.spyOn(api, "fetchConversions").mockResolvedValueOnce(
        mockApiData as unknown as Awaited<ReturnType<typeof api.fetchConversions>>,
      );

      const result = await syncBackendConversions("CAMP_1");
      expect(result.source).toBe("backend");
      expect(result.conversions).toHaveLength(1);
      expect(result.conversions[0].id).toBe("api-c1");
    });

    it("falls back to demo conversions when API returns empty array", async () => {
      vi.spyOn(api, "fetchConversions").mockResolvedValueOnce([]);

      const result = await syncBackendConversions();
      expect(result.source).toBe("mock");
      expect(result.conversions.length).toBeGreaterThan(0);
      expect(result.conversions).toEqual(DEFAULT_DEMO_CONVERSIONS);
    });

    it("falls back gracefully to demo conversions when API throws an error", async () => {
      vi.spyOn(api, "fetchConversions").mockRejectedValueOnce(new Error("Network offline"));

      const result = await syncBackendConversions();
      expect(result.source).toBe("mock");
      expect(result.conversions.length).toBeGreaterThan(0);
    });
  });
});
