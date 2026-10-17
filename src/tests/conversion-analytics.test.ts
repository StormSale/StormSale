import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  calculateCVR,
  calculateTrend,
  fetchAffiliateConversionData,
  recordLinkClick,
  recordLinkConversion,
  clearConversionCache,
  type ActiveLinkAnalytics,
} from "../utils/api";

const mockBackendLinks: ActiveLinkAnalytics[] = [
  {
    id: "backend-link-1",
    campaignId: 10,
    campaignName: "Hardware Wallet SuperSale",
    linkUrl: "https://stormsale.xyz/c/10?ref=GBBD5678",
    targetUrl: "https://hardware.dev/buy",
    clicks: 1200,
    conversions: 60,
    conversionRate: 5.0,
    previousConversionRate: 4.5,
    previousPeriodConversionRate: 4.5,
    trendDelta: 0.5,
    trendDirection: "up",
    totalRevenueXlm: 6000,
    commissionEarnedXlm: 600,
    commissionRate: 10,
    status: "active",
    lastSyncedAt: new Date().toISOString(),
  },
  {
    id: "backend-link-2",
    campaignId: 20,
    campaignName: "Solidity & Rust Course",
    linkUrl: "https://stormsale.xyz/c/20?ref=GBBD5678",
    targetUrl: "https://rustcourse.com/join",
    clicks: 800,
    conversions: 32,
    conversionRate: 4.0,
    previousConversionRate: 4.0,
    previousPeriodConversionRate: 4.0,
    trendDelta: 0.0,
    trendDirection: "neutral",
    totalRevenueXlm: 3200,
    commissionEarnedXlm: 320,
    commissionRate: 10,
    status: "active",
    lastSyncedAt: new Date().toISOString(),
  },
];

describe("Affiliate Real-Time CVR & Conversion Analytics Suite (#52)", () => {
  beforeEach(() => {
    clearConversionCache();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string) => {
        if (url.includes("/affiliate/conversions")) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({
              links: mockBackendLinks,
              summary: {
                previousOverallCVR: 4.3,
              },
            }),
          });
        }
        if (url.includes("/click") || url.includes("/conversion")) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({ success: true }),
          });
        }
        return Promise.resolve({
          ok: false,
          status: 404,
          json: async () => ({ error: "Not found" }),
        });
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("Mathematical CVR (Click-to-Sale Ratio) Calculations", () => {
    it("calculates exact click-to-sale percentage correctly", () => {
      // 50 sales out of 1000 clicks = 5.0%
      expect(calculateCVR(50, 1000)).toBe(5.0);

      // 126 sales out of 3150 clicks = 4.0%
      expect(calculateCVR(126, 3150)).toBe(4.0);

      // 77 sales out of 2200 clicks = 3.5%
      expect(calculateCVR(77, 2200)).toBe(3.5);

      // 1 sale out of 30 clicks = 3.33%
      expect(calculateCVR(1, 30)).toBe(3.33);
    });

    it("handles zero clicks safely without NaN or divide-by-zero error", () => {
      expect(calculateCVR(0, 0)).toBe(0);
      expect(calculateCVR(5, 0)).toBe(0);
      expect(Number.isNaN(calculateCVR(0, 0))).toBe(false);
    });

    it("handles zero conversions accurately as 0.0%", () => {
      expect(calculateCVR(0, 500)).toBe(0);
    });

    it("handles 100% conversion rate edge case", () => {
      expect(calculateCVR(100, 100)).toBe(100.0);
    });

    it("correctly limits precision to 2 decimal places", () => {
      // 1 / 3 = 33.33333... -> 33.33
      expect(calculateCVR(1, 3)).toBe(33.33);
      // 2 / 7 = 28.5714... -> 28.57
      expect(calculateCVR(2, 7)).toBe(28.57);
    });
  });

  describe("Trend Indicator Calculations", () => {
    it("identifies positive (up) trend with positive delta", () => {
      const trend = calculateTrend(5.2, 4.0);
      expect(trend.trendDirection).toBe("up");
      expect(trend.trendDelta).toBe(1.2);
    });

    it("identifies negative (down) trend with negative delta", () => {
      const trend = calculateTrend(3.5, 4.2);
      expect(trend.trendDirection).toBe("down");
      expect(trend.trendDelta).toBe(-0.7);
    });

    it("identifies neutral (steady) trend when CVR is unchanged", () => {
      const trend = calculateTrend(4.5, 4.5);
      expect(trend.trendDirection).toBe("neutral");
      expect(trend.trendDelta).toBe(0.0);
    });
  });

  describe("Backend Conversion Data Synchronization", () => {
    it("synchronizes with successful GET /affiliate/conversions response from backend", async () => {
      const data = await fetchAffiliateConversionData(undefined, "7d");
      expect(data).toBeDefined();
      expect(data.links).toHaveLength(2);
      expect(data.links[0].id).toBe("backend-link-1");
      expect(data.links[0].campaignName).toBe("Hardware Wallet SuperSale");
      expect(data.links[0].clicks).toBe(1200);
      expect(data.links[0].conversions).toBe(60);

      const summary = data.summary;
      expect(summary.totalClicks).toBe(2000);
      expect(summary.totalConversions).toBe(92);
      expect(summary.overallCVR).toBe(4.6);
      expect(summary.previousOverallCVR).toBe(4.3);
      expect(summary.activeLinksCount).toBe(2);
      expect(summary.lastSynced).toBeDefined();
    });

    it("does not return another range's data when a different range fetch fails", async () => {
      // 7d succeeds and caches
      const data7d = await fetchAffiliateConversionData(undefined, "7d");
      expect(data7d.links[0].id).toBe("backend-link-1");

      // 24h fails on backend without cache
      vi.stubGlobal(
        "fetch",
        vi.fn().mockImplementation((url: string) => {
          if (url.includes("range=24h")) {
            return Promise.resolve({
              ok: false,
              status: 500,
              json: async () => ({ error: "Internal Server Error" }),
            });
          }
          return Promise.resolve({
            ok: true,
            json: async () => ({ links: mockBackendLinks }),
          });
        }),
      );

      await expect(fetchAffiliateConversionData(undefined, "24h")).rejects.toThrow(
        /Failed to fetch conversion analytics for range "24h"/,
      );
    });

    it("ensures each active link has verified click-to-sale ratios", async () => {
      const { links } = await fetchAffiliateConversionData();
      for (const link of links) {
        expect(link.id).toBeDefined();
        expect(link.campaignName).toBeDefined();
        expect(link.clicks).toBeGreaterThanOrEqual(0);
        expect(link.conversions).toBeGreaterThanOrEqual(0);

        // Verify CVR integrity matches calculation
        const expectedCVR = calculateCVR(link.conversions, link.clicks);
        expect(link.conversionRate).toBe(expectedCVR);

        // Verify trend direction matches trendDelta
        if (link.trendDelta > 0) {
          expect(link.trendDirection).toBe("up");
        } else if (link.trendDelta < 0) {
          expect(link.trendDirection).toBe("down");
        } else {
          expect(link.trendDirection).toBe("neutral");
        }
      }
    });

    it("updates CVR in real-time when link click event is recorded", async () => {
      const initial = await fetchAffiliateConversionData();
      const firstLink = initial.links[0];
      const initialClicks = firstLink.clicks;

      const updated = await recordLinkClick(firstLink.id);
      expect(updated.clicks).toBe(initialClicks + 1);
      expect(updated.conversionRate).toBe(calculateCVR(updated.conversions, updated.clicks));
      expect(updated.previousConversionRate).toBe(firstLink.conversionRate);
    });

    it("updates CVR and commission in real-time when link conversion event is recorded", async () => {
      const initial = await fetchAffiliateConversionData();
      const firstLink = initial.links[0];
      const initialConversions = firstLink.conversions;
      const initialRevenue = firstLink.totalRevenueXlm;
      const initialCommission = firstLink.commissionEarnedXlm;

      const updated = await recordLinkConversion(firstLink.id, 200);
      expect(updated.conversions).toBe(initialConversions + 1);
      expect(updated.totalRevenueXlm).toBe(initialRevenue + 200);
      expect(updated.commissionEarnedXlm).toBe(
        initialCommission + (200 * firstLink.commissionRate) / 100,
      );
      expect(updated.conversionRate).toBe(calculateCVR(updated.conversions, updated.clicks));
      expect(updated.trendDirection).toBe("up");
    });

    it("serializes concurrent click operations on the same link without race conditions", async () => {
      const initial = await fetchAffiliateConversionData();
      const link = initial.links[0];
      const initialClicks = link.clicks;

      const [res1, res2] = await Promise.all([
        recordLinkClick(link.id),
        recordLinkClick(link.id),
      ]);

      expect(res1.clicks).toBe(initialClicks + 1);
      expect(res2.clicks).toBe(initialClicks + 2);
    });

    it("rolls back click count to initial value when click recording fails", async () => {
      const initial = await fetchAffiliateConversionData();
      const link = initial.links[0];
      const initialClicks = link.clicks;

      vi.stubGlobal(
        "fetch",
        vi.fn().mockImplementation((url: string) => {
          if (url.includes("/click")) {
            return Promise.resolve({
              ok: false,
              status: 500,
              json: async () => ({ error: "Internal Server Error" }),
            });
          }
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({ success: true }),
          });
        }),
      );

      await expect(recordLinkClick(link.id)).rejects.toThrow(
        "Failed to record click: HTTP 500",
      );

      // Re-stub to success to verify that subsequent click proceeds from the reverted click count
      vi.stubGlobal(
        "fetch",
        vi.fn().mockImplementation(() =>
          Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({ success: true }),
          }),
        ),
      );

      const recovered = await recordLinkClick(link.id);
      expect(recovered.clicks).toBe(initialClicks + 1);
    });

    it("rolls back conversion count to initial value when conversion recording fails", async () => {
      const initial = await fetchAffiliateConversionData();
      const link = initial.links[0];
      const initialConversions = link.conversions;
      const initialRevenue = link.totalRevenueXlm;

      vi.stubGlobal(
        "fetch",
        vi.fn().mockImplementation((url: string) => {
          if (url.includes("/conversion")) {
            return Promise.resolve({
              ok: false,
              status: 500,
              json: async () => ({ error: "Internal Server Error" }),
            });
          }
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({ success: true }),
          });
        }),
      );

      await expect(recordLinkConversion(link.id, 100)).rejects.toThrow(
        "Failed to record conversion: HTTP 500",
      );

      // Re-stub to success to verify rollback preserved initial metrics
      vi.stubGlobal(
        "fetch",
        vi.fn().mockImplementation(() =>
          Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({ success: true }),
          }),
        ),
      );

      const recovered = await recordLinkConversion(link.id, 100);
      expect(recovered.conversions).toBe(initialConversions + 1);
      expect(recovered.totalRevenueXlm).toBe(initialRevenue + 100);
    });
  });
});
