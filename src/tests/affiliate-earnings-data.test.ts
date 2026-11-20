import { describe, it, expect } from "vitest";
import {
  formatUtcDateKey,
  formatDayLabel,
  formatMonthLabel,
  aggregateDailyEarnings,
  aggregateMonthlyEarnings,
  generateDeterministicSales,
  generateDeterministicClaims,
  buildPayoutHistory,
  exportPayoutHistoryToCsv,
  fetchAffiliateEarningsReport,
} from "../lib/affiliateEarningsData";
import type { IndexerSale, IndexerClaim } from "../lib/indexer/goldskyIndexer";

describe("affiliateEarningsData (#48)", () => {
  const fixedNow = new Date("2026-11-20T12:00:00Z").getTime();

  it("formats date keys and labels consistently in UTC", () => {
    const timestamp = new Date("2026-10-15T08:30:00Z").getTime();
    expect(formatUtcDateKey(timestamp)).toBe("2026-10-15");
    expect(formatDayLabel(timestamp)).toBe("Oct 15");
    expect(formatMonthLabel(timestamp)).toBe("Oct 2026");
  });

  describe("aggregateDailyEarnings", () => {
    it("creates consecutive daily buckets without gaps and sums sales correctly", () => {
      const mockSales: IndexerSale[] = [
        {
          id: "s1",
          campaignId: "101",
          affiliateAddress: "GAFF",
          amountXlm: 200,
          commissionEarnedXlm: 20,
          buyerHash: "h1",
          status: "CLEARED",
          timestamp: fixedNow - 24 * 60 * 60 * 1000, // 1 day ago
          txHash: "0x1",
        },
        {
          id: "s2",
          campaignId: "101",
          affiliateAddress: "GAFF",
          amountXlm: 300,
          commissionEarnedXlm: 30,
          buyerHash: "h2",
          status: "CLEARED",
          timestamp: fixedNow - 24 * 60 * 60 * 1000, // same day
          txHash: "0x2",
        },
      ];

      const daily = aggregateDailyEarnings(mockSales, 7, 0.5, fixedNow);
      expect(daily.length).toBe(7);

      // Check the day with 2 sales (yesterday)
      const yesterdayKey = formatUtcDateKey(fixedNow - 24 * 60 * 60 * 1000);
      const yesterdayItem = daily.find((d) => d.date === yesterdayKey);
      expect(yesterdayItem).toBeDefined();
      expect(yesterdayItem?.commissionXlm).toBe(50);
      expect(yesterdayItem?.commissionUsd).toBe(25); // 50 * 0.5
      expect(yesterdayItem?.grossSalesXlm).toBe(500);
      expect(yesterdayItem?.salesCount).toBe(2);

      // Other days should be 0
      const emptyDays = daily.filter((d) => d.date !== yesterdayKey);
      expect(emptyDays.every((d) => d.commissionXlm === 0)).toBe(true);
    });
  });

  describe("aggregateMonthlyEarnings", () => {
    it("aggregates sales into monthly buckets with correct labels and sums", () => {
      const mockSales: IndexerSale[] = [
        {
          id: "s1",
          campaignId: "101",
          affiliateAddress: "GAFF",
          amountXlm: 1000,
          commissionEarnedXlm: 100,
          buyerHash: "h1",
          status: "CLEARED",
          timestamp: new Date("2026-10-10T12:00:00Z").getTime(),
          txHash: "0x1",
        },
        {
          id: "s2",
          campaignId: "204",
          affiliateAddress: "GAFF",
          amountXlm: 500,
          commissionEarnedXlm: 60,
          buyerHash: "h2",
          status: "CLEARED",
          timestamp: new Date("2026-10-25T12:00:00Z").getTime(),
          txHash: "0x2",
        },
      ];

      const monthly = aggregateMonthlyEarnings(mockSales, 6, 0.4, fixedNow);
      expect(monthly.length).toBe(6);

      const oct = monthly.find((m) => m.monthKey === "2026-10");
      expect(oct).toBeDefined();
      expect(oct?.commissionXlm).toBe(160);
      expect(oct?.commissionUsd).toBe(64); // 160 * 0.4
      expect(oct?.grossSalesXlm).toBe(1500);
      expect(oct?.salesCount).toBe(2);
    });
  });

  describe("generateDeterministicSales & claims", () => {
    it("generates deterministic sales proportional to volume", () => {
      const sales = generateDeterministicSales("GAFFILIATE1234567890", 5000, fixedNow);
      expect(sales.length).toBeGreaterThan(0);
      expect(sales[0].affiliateAddress).toBe("GAFFILIATE1234567890");
      expect(sales[0].commissionEarnedXlm).toBeGreaterThan(0);
    });

    it("generates deterministic claims matching paid-out amount", () => {
      const claims = generateDeterministicClaims("GAFFILIATE1234567890", 800, fixedNow);
      expect(claims.length).toBeGreaterThan(0);
      expect(claims[0].amountXlm).toBeGreaterThan(0);
      expect(claims[0].asset).toBe("XLM");
    });
  });

  describe("buildPayoutHistory", () => {
    it("maps claims into sorted payout records with campaign names and USD values", () => {
      const claims: IndexerClaim[] = [
        {
          id: "c1",
          campaignId: "101",
          affiliateAddress: "GAFF",
          amountXlm: 120,
          asset: "XLM",
          timestamp: 1000,
          txHash: "0xabc",
        },
        {
          id: "c2",
          campaignId: "204",
          affiliateAddress: "GAFF",
          amountXlm: 250,
          asset: "XLM",
          timestamp: 5000,
          txHash: "0xdef",
        },
      ];

      const history = buildPayoutHistory(claims, [], 0.5, "GAFF");
      expect(history.length).toBe(2);
      // Sorted descending by timestamp
      expect(history[0].id).toBe("c2");
      expect(history[0].amountXlm).toBe(250);
      expect(history[0].amountUsd).toBe(125);
      expect(history[0].campaignName).toBe("Nova Quantum Cloud Services");
    });
  });

  describe("exportPayoutHistoryToCsv", () => {
    it("properly escapes commas and quotes into valid CSV format", () => {
      const payouts = [
        {
          id: "c1",
          campaignId: 101,
          campaignName: 'Tech, "Gadgets" & Co',
          amountXlm: 150.5,
          amountUsd: 75.25,
          asset: "XLM" as const,
          timestamp: new Date("2026-10-15T12:00:00Z").getTime(),
          txHash: "0xhash123",
          status: "completed" as const,
          recipient: "GUSER123",
        },
      ];

      const csv = exportPayoutHistoryToCsv(payouts);
      expect(csv).toContain("Payout ID,Campaign ID,Campaign Name,Amount (XLM)");
      expect(csv).toContain('"Tech, ""Gadgets"" & Co"');
      expect(csv).toContain("150.50");
      expect(csv).toContain("75.25");
      expect(csv).toContain("0xhash123");
    });
  });

  describe("fetchAffiliateEarningsReport", () => {
    it("returns a comprehensive report with balances, daily, monthly, and payouts", async () => {
      const report = await fetchAffiliateEarningsReport("GBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFSHONUCEOASW7QC7OX2H");
      expect(report.balances).toBeDefined();
      expect(report.balances.totalEarningsXlm).toBeGreaterThan(0);
      expect(report.balances.withdrawableXlm).toBeGreaterThanOrEqual(0);
      expect(report.daily.length).toBe(14);
      expect(report.monthly.length).toBe(6);
      expect(report.payouts.length).toBeGreaterThan(0);
    });
  });
});

