import { describe, it, expect } from "vitest";
import {
  calculateCohortRetention,
  calculatePartnerMetrics,
  exportCohortDataToCSV,
  getCohortKey,
  type CustomerConversion,
} from "../lib/cohortAnalysis";

describe("Advertiser Cohort Analysis & LTV Engine Suite", () => {
  const baseDate = new Date("2026-01-01T12:00:00Z");
  const dayMs = 24 * 60 * 60 * 1000;

  // Controlled test conversions
  const mockConversions: CustomerConversion[] = [
    // Customer A (Affiliate 1, Campaign 1)
    {
      id: "tx-1",
      customerRef: "CUST_A",
      affiliateAddress: "GAFFILIATE_1",
      affiliateName: "Alice Partner",
      campaignId: "CAMP_1",
      campaignName: "Tech Campaign",
      amount: 100,
      timestamp: baseDate.toISOString(), // Day 0
    },
    {
      id: "tx-2",
      customerRef: "CUST_A",
      affiliateAddress: "GAFFILIATE_1",
      affiliateName: "Alice Partner",
      campaignId: "CAMP_1",
      campaignName: "Tech Campaign",
      amount: 50,
      timestamp: new Date(baseDate.getTime() + 20 * dayMs).toISOString(), // Day 20 (Day 30 interval)
    },
    {
      id: "tx-3",
      customerRef: "CUST_A",
      affiliateAddress: "GAFFILIATE_1",
      affiliateName: "Alice Partner",
      campaignId: "CAMP_1",
      campaignName: "Tech Campaign",
      amount: 75,
      timestamp: new Date(baseDate.getTime() + 55 * dayMs).toISOString(), // Day 55 (Day 60 interval)
    },
    // Customer B (Affiliate 1, Campaign 1) - Only initial purchase
    {
      id: "tx-4",
      customerRef: "CUST_B",
      affiliateAddress: "GAFFILIATE_1",
      affiliateName: "Alice Partner",
      campaignId: "CAMP_1",
      campaignName: "Tech Campaign",
      amount: 80,
      timestamp: baseDate.toISOString(), // Day 0
    },
    // Customer C (Affiliate 2, Campaign 2) - Joined in Feb 2026
    {
      id: "tx-5",
      customerRef: "CUST_C",
      affiliateAddress: "GAFFILIATE_2",
      affiliateName: "Bob Partner",
      campaignId: "CAMP_2",
      campaignName: "Crypto Campaign",
      amount: 200,
      timestamp: new Date("2026-02-01T10:00:00Z").toISOString(),
    },
    {
      id: "tx-6",
      customerRef: "CUST_C",
      affiliateAddress: "GAFFILIATE_2",
      affiliateName: "Bob Partner",
      campaignId: "CAMP_2",
      campaignName: "Crypto Campaign",
      amount: 120,
      timestamp: new Date("2026-02-25T10:00:00Z").toISOString(), // within 30 days of Feb
    },
  ];

  it("generates correct monthly and weekly cohort keys", () => {
    const testDate = new Date("2026-01-15T00:00:00Z");
    const monthly = getCohortKey(testDate, "monthly");
    expect(monthly.key).toBe("2026-01");
    expect(monthly.label).toBe("Jan 2026");

    const weekly = getCohortKey(testDate, "weekly");
    expect(weekly.key).toContain("2026-W");
  });

  it("groups customers into cohorts by initial conversion date and calculates retention rates", () => {
    const cohorts = calculateCohortRetention(mockConversions, { timeframe: "monthly" });

    expect(cohorts.length).toBe(2); // Jan 2026 and Feb 2026 cohorts

    // Jan 2026 cohort (Customer A and Customer B)
    const janCohort = cohorts.find((c) => c.cohortId === "2026-01");
    expect(janCohort).toBeDefined();
    expect(janCohort?.initialUsers).toBe(2);
    expect(janCohort?.initialRevenue).toBe(180); // 100 + 80
    expect(janCohort?.day0.retentionRate).toBe(100);

    // Day 30: Only Customer A returned (1 out of 2 = 50%)
    expect(janCohort?.day30.retainedUsers).toBe(1);
    expect(janCohort?.day30.retentionRate).toBe(50);
    expect(janCohort?.day30.revenueGenerated).toBe(50);

    // Day 60: Customer A returned again (1 out of 2 = 50%)
    expect(janCohort?.day60.retainedUsers).toBe(1);
    expect(janCohort?.day60.retentionRate).toBe(50);
    expect(janCohort?.day60.revenueGenerated).toBe(75);

    // Total LTV for Jan cohort: (180 + 50 + 75) / 2 = 305 / 2 = 152.50
    expect(janCohort?.totalCumulativeRevenue).toBe(305);
    expect(janCohort?.totalLtv).toBe(152.5);
  });

  it("filters cohort analysis by affiliate wallet address", () => {
    const filteredByBob = calculateCohortRetention(mockConversions, {
      affiliateAddress: "GAFFILIATE_2",
      timeframe: "monthly",
    });

    expect(filteredByBob.length).toBe(1);
    expect(filteredByBob[0].cohortId).toBe("2026-02");
    expect(filteredByBob[0].initialUsers).toBe(1);
    expect(filteredByBob[0].day30.retentionRate).toBe(100);
  });

  it("filters cohort analysis by campaign ID", () => {
    const filteredByCampaign = calculateCohortRetention(mockConversions, {
      campaignId: "CAMP_1",
      timeframe: "monthly",
    });

    expect(filteredByCampaign.length).toBe(1);
    expect(filteredByCampaign[0].cohortId).toBe("2026-01");
    expect(filteredByCampaign[0].initialUsers).toBe(2);
  });

  it("ensures Saturday acquisitions stay in the same weekly cohort regardless of time and Sunday at 00:00 lands in the next week", () => {
    const satMorning = new Date("2026-01-03T08:00:00Z");
    const satNoon = new Date("2026-01-03T12:00:00Z");
    const satNight = new Date("2026-01-03T23:59:59Z");
    const sunMidnight = new Date("2026-01-04T00:00:00Z");

    const wSatMorning = getCohortKey(satMorning, "weekly");
    const wSatNoon = getCohortKey(satNoon, "weekly");
    const wSatNight = getCohortKey(satNight, "weekly");
    const wSun = getCohortKey(sunMidnight, "weekly");

    // All Saturday acquisitions must stay in the same week (W01)
    expect(wSatMorning.key).toBe("2026-W01");
    expect(wSatNoon.key).toBe("2026-W01");
    expect(wSatNight.key).toBe("2026-W01");

    // Sunday lands in the adjacent next week (W02)
    expect(wSun.key).toBe("2026-W02");
  });

  it("tracks interval maturity based on referenceDate and marks unelapsed intervals as immature", () => {
    // Reference date 19 days after Jan 1, 2026 acquisition
    const refDay19 = new Date("2026-01-20T12:00:00Z");
    const cohortsDay19 = calculateCohortRetention(
      mockConversions,
      { timeframe: "monthly" },
      refDay19,
    );
    const jan19 = cohortsDay19.find((c) => c.cohortId === "2026-01");

    expect(jan19?.day0.isMature).toBe(true);
    expect(jan19?.day30.isMature).toBe(false);
    expect(jan19?.day60.isMature).toBe(false);
    expect(jan19?.day90.isMature).toBe(false);

    // Reference date 45 days after Jan 1: Day 30 mature, Day 60/90 immature
    const refDay45 = new Date("2026-02-15T12:00:00Z");
    const cohortsDay45 = calculateCohortRetention(
      mockConversions,
      { timeframe: "monthly" },
      refDay45,
    );
    const jan45 = cohortsDay45.find((c) => c.cohortId === "2026-01");

    expect(jan45?.day30.isMature).toBe(true);
    expect(jan45?.day60.isMature).toBe(false);
    expect(jan45?.day90.isMature).toBe(false);

    // Reference date 105 days after Jan 1: all intervals mature
    const refDay105 = new Date("2026-04-16T12:00:00Z");
    const cohortsDay105 = calculateCohortRetention(
      mockConversions,
      { timeframe: "monthly" },
      refDay105,
    );
    const jan105 = cohortsDay105.find((c) => c.cohortId === "2026-01");

    expect(jan105?.day30.isMature).toBe(true);
    expect(jan105?.day60.isMature).toBe(true);
    expect(jan105?.day90.isMature).toBe(true);
  });

  it("filters partner metrics by affiliateAddress when specified", () => {
    const allPartners = calculatePartnerMetrics(mockConversions);
    expect(allPartners.length).toBe(2);

    const aliceOnly = calculatePartnerMetrics(mockConversions, {
      affiliateAddress: "GAFFILIATE_1",
    });
    expect(aliceOnly.length).toBe(1);
    expect(aliceOnly[0].affiliateAddress).toBe("GAFFILIATE_1");

    const bobOnly = calculatePartnerMetrics(mockConversions, {
      affiliateAddress: "GAFFILIATE_2",
    });
    expect(bobOnly.length).toBe(1);
    expect(bobOnly[0].affiliateAddress).toBe("GAFFILIATE_2");

    const filteredBoth = calculatePartnerMetrics(mockConversions, {
      campaignId: "CAMP_1",
      affiliateAddress: "GAFFILIATE_1",
    });
    expect(filteredBoth.length).toBe(1);
    expect(filteredBoth[0].affiliateName).toBe("Alice Partner");
  });

  it("computes partner repeat transaction rates and average basket size", () => {
    const partnerMetrics = calculatePartnerMetrics(mockConversions);

    expect(partnerMetrics.length).toBe(2);

    // Alice: 4 conversions, 2 unique customers, 1 repeat customer (Customer A has 3 orders)
    const alice = partnerMetrics.find((p) => p.affiliateAddress === "GAFFILIATE_1");
    expect(alice).toBeDefined();
    expect(alice?.totalConversions).toBe(4);
    expect(alice?.uniqueCustomers).toBe(2);
    expect(alice?.repeatCustomers).toBe(1);
    expect(alice?.repeatTransactionRate).toBe(50); // 1 / 2 = 50%
    expect(alice?.totalRevenue).toBe(305); // 100 + 50 + 75 + 80
    expect(alice?.averageBasketSize).toBe(76.25); // 305 / 4
    expect(alice?.averageLtv).toBe(152.5); // 305 / 2

    // Bob: 2 conversions, 1 unique customer with 2 orders (100% repeat rate)
    const bob = partnerMetrics.find((p) => p.affiliateAddress === "GAFFILIATE_2");
    expect(bob).toBeDefined();
    expect(bob?.repeatTransactionRate).toBe(100);
    expect(bob?.totalRevenue).toBe(320);
    expect(bob?.averageBasketSize).toBe(160);
    expect(bob?.averageLtv).toBe(320);
  });

  it("exports cohort analysis and partner metrics to valid RFC-4180 CSV with formula sanitization", () => {
    const refDay19 = new Date("2026-01-20T12:00:00Z");
    const cohorts = calculateCohortRetention(mockConversions, {}, refDay19);

    const maliciousPartners = [
      {
        affiliateName: '=HYPERLINK("http://evil.com")',
        affiliateAddress: 'G_TEST_"SPECIAL"',
        totalConversions: 5,
        uniqueCustomers: 3,
        repeatCustomers: 2,
        repeatTransactionRate: 66.7,
        averageBasketSize: 50.0,
        totalRevenue: 250.0,
        averageLtv: 83.33,
      },
    ];

    const csv = exportCohortDataToCSV(cohorts, maliciousPartners);

    // Header validations
    expect(csv).toContain("=== ADVERTISER COHORT RETENTION & LTV ANALYSIS ===");
    expect(csv).toContain("=== AFFILIATE PARTNER LTV & BASKET SIZE BREAKDOWN ===");
    expect(csv).toContain("Cohort,Acquired Users,Day 0 Rate,Day 30 Rate,Day 60 Rate,Day 90 Rate");

    // CRLF line endings check (RFC-4180)
    expect(csv).toContain("\r\n");

    // Immature cohort rates should render as "—"
    expect(csv).toContain("—");

    // Formula prefix neutralization: prepended with apostrophe
    expect(csv).toContain(`"'=HYPERLINK(""http://evil.com"")"`);

    // Double-quote escaping: "SPECIAL" -> ""SPECIAL""
    expect(csv).toContain(`"G_TEST_""SPECIAL"""`);
  });
});
