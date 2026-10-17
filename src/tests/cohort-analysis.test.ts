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

  it("exports cohort analysis and partner metrics to valid CSV", () => {
    const cohorts = calculateCohortRetention(mockConversions);
    const partners = calculatePartnerMetrics(mockConversions);
    const csv = exportCohortDataToCSV(cohorts, partners);

    expect(csv).toContain("=== ADVERTISER COHORT RETENTION & LTV ANALYSIS ===");
    expect(csv).toContain("=== AFFILIATE PARTNER LTV & BASKET SIZE BREAKDOWN ===");
    expect(csv).toContain("Cohort,Acquired Users,Day 0 Rate,Day 30 Rate,Day 60 Rate,Day 90 Rate");
    expect(csv).toContain('"Alice Partner"');
    expect(csv).toContain('"Bob Partner"');
    expect(csv).toContain("50%");
  });
});
