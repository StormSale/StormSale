/**
 * Advertiser Cohort Analysis & Customer Lifetime Value (LTV) Engine
 * Groups conversions by customer attribution date, calculates repeat purchase rates,
 * computes 30/60/90-day retention metrics, and calculates partner average basket size & LTV.
 */

export interface CustomerConversion {
  id: string;
  customerRef: string;
  affiliateAddress: string;
  affiliateName: string;
  campaignId: string;
  campaignName: string;
  amount: number; // in USD equivalent
  timestamp: string; // ISO date string
}

export interface RetentionInterval {
  days: number;
  retainedUsers: number;
  retentionRate: number; // Percentage 0 - 100
  repeatPurchases: number;
  revenueGenerated: number;
  avgLtv: number;
  isMature: boolean;
}

export interface CohortRow {
  cohortId: string;
  cohortLabel: string;
  startDate: string;
  initialUsers: number;
  initialRevenue: number;
  day0: RetentionInterval;
  day30: RetentionInterval;
  day60: RetentionInterval;
  day90: RetentionInterval;
  totalCumulativeRevenue: number;
  totalLtv: number;
}

export interface PartnerCohortMetric {
  affiliateAddress: string;
  affiliateName: string;
  totalConversions: number;
  uniqueCustomers: number;
  repeatCustomers: number;
  repeatTransactionRate: number; // percentage
  averageBasketSize: number; // total revenue / total conversions
  totalRevenue: number;
  averageLtv: number; // total revenue / unique customers
}

export interface CohortFilterOptions {
  campaignId?: string;
  affiliateAddress?: string;
  timeframe?: "monthly" | "weekly";
}

/**
 * Format a Date into cohort key and display label
 */
export function getCohortKey(
  date: Date,
  timeframe: "monthly" | "weekly" = "monthly",
): { key: string; label: string } {
  const year = date.getUTCFullYear();
  if (timeframe === "monthly") {
    const month = date.getUTCMonth();
    const monthNames = [
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "May",
      "Jun",
      "Jul",
      "Aug",
      "Sep",
      "Oct",
      "Nov",
      "Dec",
    ];
    const key = `${year}-${String(month + 1).padStart(2, "0")}`;
    const label = `${monthNames[month]} ${year}`;
    return { key, label };
  } else {
    // Weekly cohort
    const startOfYear = new Date(Date.UTC(year, 0, 1));
    const pastDaysOfYear = Math.floor((date.getTime() - startOfYear.getTime()) / 86400000);
    const weekNum = Math.ceil((pastDaysOfYear + startOfYear.getUTCDay() + 1) / 7);
    const key = `${year}-W${String(weekNum).padStart(2, "0")}`;
    const label = `Week ${weekNum}, ${year}`;
    return { key, label };
  }
}

/**
 * Calculate cohort retention matrix from raw conversions
 */
export function calculateCohortRetention(
  conversions: CustomerConversion[],
  filters: CohortFilterOptions = {},
  referenceDate: Date = new Date(),
): CohortRow[] {
  const { campaignId, affiliateAddress, timeframe = "monthly" } = filters;

  // 1. Filter conversions
  const filtered = conversions.filter((c) => {
    if (campaignId && campaignId !== "all" && c.campaignId !== campaignId) return false;
    if (affiliateAddress && affiliateAddress !== "all" && c.affiliateAddress !== affiliateAddress)
      return false;
    return true;
  });

  if (filtered.length === 0) return [];

  // 2. Identify first conversion date per customer (Attribution date)
  const customerFirstSeen = new Map<string, { date: Date; conversion: CustomerConversion }>();
  const customerAllPurchases = new Map<string, CustomerConversion[]>();

  filtered.forEach((c) => {
    const cDate = new Date(c.timestamp);
    const existing = customerFirstSeen.get(c.customerRef);
    if (!existing || cDate < existing.date) {
      customerFirstSeen.set(c.customerRef, { date: cDate, conversion: c });
    }

    const list = customerAllPurchases.get(c.customerRef) || [];
    list.push(c);
    customerAllPurchases.set(c.customerRef, list);
  });

  // 3. Group customers into cohorts by their first conversion date
  const cohortsMap = new Map<
    string,
    { label: string; startDate: string; customers: Set<string> }
  >();

  customerFirstSeen.forEach((info, customerRef) => {
    const { key, label } = getCohortKey(info.date, timeframe);
    if (!cohortsMap.has(key)) {
      cohortsMap.set(key, { label, startDate: info.date.toISOString(), customers: new Set() });
    }
    cohortsMap.get(key)!.customers.add(customerRef);
  });

  // 4. Calculate retention intervals (Day 0, Day 30, Day 60, Day 90)
  const results: CohortRow[] = [];

  Array.from(cohortsMap.entries())
    .sort(([keyA], [keyB]) => keyA.localeCompare(keyB))
    .forEach(([cohortId, cohortMeta]) => {
      const customerRefs = Array.from(cohortMeta.customers);
      const initialUsers = customerRefs.length;

      let initialRevenue = 0;
      let day0Purchases = 0;

      // Intervals accumulators
      const day30Users = new Set<string>();
      let day30Purchases = 0;
      let day30Revenue = 0;

      const day60Users = new Set<string>();
      let day60Purchases = 0;
      let day60Revenue = 0;

      const day90Users = new Set<string>();
      let day90Purchases = 0;
      let day90Revenue = 0;

      let latestFirstSeenDate: Date | null = null;

      customerRefs.forEach((ref) => {
        const firstSeenDate = customerFirstSeen.get(ref)!.date;
        if (!latestFirstSeenDate || firstSeenDate > latestFirstSeenDate) {
          latestFirstSeenDate = firstSeenDate;
        }

        const purchases = customerAllPurchases.get(ref) || [];

        purchases.forEach((p) => {
          const pDate = new Date(p.timestamp);
          const diffDays = Math.floor(
            (pDate.getTime() - firstSeenDate.getTime()) / (1000 * 60 * 60 * 24),
          );

          if (diffDays <= 0) {
            initialRevenue += p.amount;
            day0Purchases++;
          } else if (diffDays <= 30) {
            day30Users.add(ref);
            day30Purchases++;
            day30Revenue += p.amount;
          } else if (diffDays <= 60) {
            day60Users.add(ref);
            day60Purchases++;
            day60Revenue += p.amount;
          } else if (diffDays <= 90) {
            day90Users.add(ref);
            day90Purchases++;
            day90Revenue += p.amount;
          }
        });
      });

      const effectiveLatestDate = latestFirstSeenDate || new Date(cohortMeta.startDate);
      const elapsedDays = Math.floor(
        (referenceDate.getTime() - effectiveLatestDate.getTime()) / (1000 * 60 * 60 * 24),
      );
      const isDay30Mature = elapsedDays >= 30;
      const isDay60Mature = elapsedDays >= 60;
      const isDay90Mature = elapsedDays >= 90;

      const totalRevenue = initialRevenue + day30Revenue + day60Revenue + day90Revenue;
      const totalLtv = initialUsers > 0 ? Number((totalRevenue / initialUsers).toFixed(2)) : 0;

      results.push({
        cohortId,
        cohortLabel: cohortMeta.label,
        startDate: cohortMeta.startDate,
        initialUsers,
        initialRevenue: Number(initialRevenue.toFixed(2)),
        day0: {
          days: 0,
          retainedUsers: initialUsers,
          retentionRate: 100,
          repeatPurchases: day0Purchases,
          revenueGenerated: Number(initialRevenue.toFixed(2)),
          avgLtv: initialUsers > 0 ? Number((initialRevenue / initialUsers).toFixed(2)) : 0,
          isMature: true,
        },
        day30: {
          days: 30,
          retainedUsers: day30Users.size,
          retentionRate:
            initialUsers > 0 ? Number(((day30Users.size / initialUsers) * 100).toFixed(1)) : 0,
          repeatPurchases: day30Purchases,
          revenueGenerated: Number(day30Revenue.toFixed(2)),
          avgLtv:
            initialUsers > 0
              ? Number(((initialRevenue + day30Revenue) / initialUsers).toFixed(2))
              : 0,
          isMature: isDay30Mature,
        },
        day60: {
          days: 60,
          retainedUsers: day60Users.size,
          retentionRate:
            initialUsers > 0 ? Number(((day60Users.size / initialUsers) * 100).toFixed(1)) : 0,
          repeatPurchases: day60Purchases,
          revenueGenerated: Number(day60Revenue.toFixed(2)),
          avgLtv:
            initialUsers > 0
              ? Number(((initialRevenue + day30Revenue + day60Revenue) / initialUsers).toFixed(2))
              : 0,
          isMature: isDay60Mature,
        },
        day90: {
          days: 90,
          retainedUsers: day90Users.size,
          retentionRate:
            initialUsers > 0 ? Number(((day90Users.size / initialUsers) * 100).toFixed(1)) : 0,
          repeatPurchases: day90Purchases,
          revenueGenerated: Number(day90Revenue.toFixed(2)),
          avgLtv: totalLtv,
          isMature: isDay90Mature,
        },
        totalCumulativeRevenue: Number(totalRevenue.toFixed(2)),
        totalLtv,
      });
    });

  return results;
}

/**
 * Calculate per-partner performance, average basket size, and repeat transaction frequency
 */
export function calculatePartnerMetrics(
  conversions: CustomerConversion[],
  filters: { campaignId?: string; affiliateAddress?: string } = {},
): PartnerCohortMetric[] {
  const filtered = conversions.filter((c) => {
    if (filters.campaignId && filters.campaignId !== "all" && c.campaignId !== filters.campaignId)
      return false;
    if (
      filters.affiliateAddress &&
      filters.affiliateAddress !== "all" &&
      c.affiliateAddress !== filters.affiliateAddress
    )
      return false;
    return true;
  });

  const partnerMap = new Map<
    string,
    {
      name: string;
      conversions: number;
      revenue: number;
      customerOrders: Map<string, number>;
    }
  >();

  filtered.forEach((c) => {
    if (!partnerMap.has(c.affiliateAddress)) {
      partnerMap.set(c.affiliateAddress, {
        name: c.affiliateName,
        conversions: 0,
        revenue: 0,
        customerOrders: new Map(),
      });
    }

    const partner = partnerMap.get(c.affiliateAddress)!;
    partner.conversions += 1;
    partner.revenue += c.amount;
    const count = partner.customerOrders.get(c.customerRef) || 0;
    partner.customerOrders.set(c.customerRef, count + 1);
  });

  const metrics: PartnerCohortMetric[] = [];

  partnerMap.forEach((data, address) => {
    const uniqueCustomers = data.customerOrders.size;
    let repeatCustomers = 0;
    data.customerOrders.forEach((orders) => {
      if (orders > 1) repeatCustomers++;
    });

    const repeatRate =
      uniqueCustomers > 0 ? Number(((repeatCustomers / uniqueCustomers) * 100).toFixed(1)) : 0;
    const avgBasket =
      data.conversions > 0 ? Number((data.revenue / data.conversions).toFixed(2)) : 0;
    const avgLtv = uniqueCustomers > 0 ? Number((data.revenue / uniqueCustomers).toFixed(2)) : 0;

    metrics.push({
      affiliateAddress: address,
      affiliateName: data.name,
      totalConversions: data.conversions,
      uniqueCustomers,
      repeatCustomers,
      repeatTransactionRate: repeatRate,
      averageBasketSize: avgBasket,
      totalRevenue: Number(data.revenue.toFixed(2)),
      averageLtv: avgLtv,
    });
  });

  return metrics.sort((a, b) => b.totalRevenue - a.totalRevenue);
}

/**
 * Export Cohort Matrix and Partner Metrics to RFC-4180 CSV
 */
export function exportCohortDataToCSV(
  cohorts: CohortRow[],
  partners: PartnerCohortMetric[],
): string {
  const rows: string[] = [];

  const csvCell = (value: string | number): string => {
    let cell = String(value ?? "");
    if (/^[=+\-@\t\r]/.test(cell)) {
      cell = `'${cell}`;
    }
    return `"${cell.replace(/"/g, '""')}"`;
  };

  const formatRate = (interval: RetentionInterval) =>
    interval.isMature ? `${interval.retentionRate}%` : "—";

  // Section 1: Cohort Retention Matrix
  rows.push("=== ADVERTISER COHORT RETENTION & LTV ANALYSIS ===");
  rows.push(`Generated Date,${new Date().toISOString()}`);
  rows.push("");
  rows.push(
    "Cohort,Acquired Users,Day 0 Rate,Day 30 Rate,Day 60 Rate,Day 90 Rate,Total Cumulative Revenue ($),Average LTV ($)",
  );

  cohorts.forEach((c) => {
    rows.push(
      [
        csvCell(c.cohortLabel),
        c.initialUsers,
        "100%",
        formatRate(c.day30),
        formatRate(c.day60),
        formatRate(c.day90),
        `$${c.totalCumulativeRevenue.toFixed(2)}`,
        `$${c.totalLtv.toFixed(2)}`,
      ].join(","),
    );
  });

  rows.push("");
  rows.push("=== AFFILIATE PARTNER LTV & BASKET SIZE BREAKDOWN ===");
  rows.push(
    "Affiliate Partner,Stellar Wallet,Total Sales,Unique Customers,Repeat Customers,Repeat Rate,Avg Basket Size ($),Total Revenue ($),Customer LTV ($)",
  );

  partners.forEach((p) => {
    rows.push(
      [
        csvCell(p.affiliateName),
        csvCell(p.affiliateAddress),
        p.totalConversions,
        p.uniqueCustomers,
        p.repeatCustomers,
        `${p.repeatTransactionRate}%`,
        `$${p.averageBasketSize.toFixed(2)}`,
        `$${p.totalRevenue.toFixed(2)}`,
        `$${p.averageLtv.toFixed(2)}`,
      ].join(","),
    );
  });

  return rows.join("\r\n");
}

/**
 * Trigger file download for CSV in browser
 */
export function downloadCSV(csvContent: string, fileName = "cohort-retention-analysis.csv"): void {
  if (typeof window === "undefined") return;
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", fileName);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Default Seed Conversion Data generator spanning 90+ days
 */
export function getSampleConversions(): CustomerConversion[] {
  const partners = [
    { name: "Alex Johnson", address: "GAFFILIATE_ALEX_123456789" },
    { name: "Sarah Miller", address: "GAFFILIATE_SARAH_987654321" },
    { name: "Mike Chen", address: "GAFFILIATE_MIKE_456789123" },
    { name: "Emily Davis", address: "GAFFILIATE_EMILY_789123456" },
  ];

  const campaigns = [
    { id: "camp-1", name: "Tech Gadgets Pro" },
    { id: "camp-2", name: "Web3 Masterclass" },
    { id: "camp-3", name: "Crypto Tools Suite" },
  ];

  const conversions: CustomerConversion[] = [];
  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;

  // Generate 5 cohorts over the past 120 days
  const cohortOffsets = [120, 90, 60, 30, 10]; // days ago

  cohortOffsets.forEach((cohortDayOffset, cohortIdx) => {
    const customerCountInCohort = 20 + cohortIdx * 6; // 20 - 44 customers

    for (let c = 1; c <= customerCountInCohort; c++) {
      const customerRef = `CUST_COHORT_${cohortIdx}_${c}`;
      const partner = partners[c % partners.length];
      const campaign = campaigns[c % campaigns.length];

      // Day 0: Acquisition Conversion
      const acquisitionTime = new Date(
        now - cohortDayOffset * dayMs + (c % 5) * 3600000,
      ).toISOString();
      const initialAmount = 45 + (c % 7) * 15; // $45 - $135
      conversions.push({
        id: `TX_ACQ_${cohortIdx}_${c}`,
        customerRef,
        affiliateAddress: partner.address,
        affiliateName: partner.name,
        campaignId: campaign.id,
        campaignName: campaign.name,
        amount: initialAmount,
        timestamp: acquisitionTime,
      });

      // Repeat purchase at ~25 days (within 30 days)
      if (cohortDayOffset >= 30 && c % 3 === 0) {
        conversions.push({
          id: `TX_D30_${cohortIdx}_${c}`,
          customerRef,
          affiliateAddress: partner.address,
          affiliateName: partner.name,
          campaignId: campaign.id,
          campaignName: campaign.name,
          amount: 60 + (c % 4) * 20,
          timestamp: new Date(new Date(acquisitionTime).getTime() + 25 * dayMs).toISOString(),
        });
      }

      // Repeat purchase at ~50 days (within 60 days)
      if (cohortDayOffset >= 60 && c % 4 === 0) {
        conversions.push({
          id: `TX_D60_${cohortIdx}_${c}`,
          customerRef,
          affiliateAddress: partner.address,
          affiliateName: partner.name,
          campaignId: campaign.id,
          campaignName: campaign.name,
          amount: 75 + (c % 5) * 25,
          timestamp: new Date(new Date(acquisitionTime).getTime() + 50 * dayMs).toISOString(),
        });
      }

      // Repeat purchase at ~80 days (within 90 days)
      if (cohortDayOffset >= 90 && c % 5 === 0) {
        conversions.push({
          id: `TX_D90_${cohortIdx}_${c}`,
          customerRef,
          affiliateAddress: partner.address,
          affiliateName: partner.name,
          campaignId: campaign.id,
          campaignName: campaign.name,
          amount: 90 + (c % 6) * 30,
          timestamp: new Date(new Date(acquisitionTime).getTime() + 80 * dayMs).toISOString(),
        });
      }
    }
  });

  return conversions;
}
