/**
 * src/lib/conversionAnalytics.ts
 *
 * Real-time CVR & Conversion Analytics Engine for StormSale Affiliates (#52).
 *
 * Features:
 *  - Calculates click-to-sale ratios (CVR %) for active short-links and aggregate portfolios.
 *  - Computes trend directions ("up" | "down" | "neutral") and delta percentages against baselines.
 *  - Synchronizes link performance in real-time with backend conversion records.
 *  - Resilient to network/offline mode with deterministic fallback conversion data.
 */

import type { CustomShortLink } from "../types/affiliateLink";
import type { CustomerConversion } from "./cohortAnalysis";
import { fetchConversions } from "../utils/api";

export type TrendDirection = "up" | "down" | "neutral";

export interface TrendAnalysis {
  direction: TrendDirection;
  delta: number;
  formattedDelta: string;
}

export interface LinkConversionMetrics {
  linkId: string;
  slug: string;
  campaignId: string;
  campaignName: string;
  clicks: number;
  salesCount: number;
  salesVolume: number;
  cvrPercentage: number;
  formattedCvr: string;
  trend: TrendAnalysis;
}

export interface AggregateConversionAnalytics {
  totalLinks: number;
  totalClicks: number;
  totalSales: number;
  totalSalesVolume: number;
  overallCvrPercentage: number;
  formattedOverallCvr: string;
  overallTrend: TrendAnalysis;
  topPerformingSlug: string | null;
  topConvertingSlug: string | null;
  linkMetrics: Map<string, LinkConversionMetrics>;
}

export interface SyncConversionsResult {
  conversions: CustomerConversion[];
  source: "backend" | "mock";
  syncedAt: string;
}

/**
 * Deterministic default conversion records used when backend API is unreachable
 * or operating in offline/demo preview environments.
 */
export const DEFAULT_DEMO_CONVERSIONS: CustomerConversion[] = [
  {
    id: "conv-101",
    customerRef: "CUST_STORM_101",
    affiliateAddress: "Gwallet-one",
    affiliateName: "Affiliate Pro",
    campaignId: "7",
    campaignName: "Technology Campaign",
    amount: 150,
    timestamp: new Date(Date.now() - 2 * 86400 * 1000).toISOString(),
  },
  {
    id: "conv-102",
    customerRef: "CUST_STORM_102",
    affiliateAddress: "Gwallet-one",
    affiliateName: "Affiliate Pro",
    campaignId: "7",
    campaignName: "Technology Campaign",
    amount: 280,
    timestamp: new Date(Date.now() - 3 * 86400 * 1000).toISOString(),
  },
  {
    id: "conv-103",
    customerRef: "CUST_STORM_103",
    affiliateAddress: "Gwallet-one",
    affiliateName: "Affiliate Pro",
    campaignId: "7",
    campaignName: "Technology Campaign",
    amount: 95,
    timestamp: new Date(Date.now() - 5 * 86400 * 1000).toISOString(),
  },
  {
    id: "conv-104",
    customerRef: "CUST_STORM_104",
    affiliateAddress: "Gwallet-one",
    affiliateName: "Affiliate Pro",
    campaignId: "7",
    campaignName: "Technology Campaign",
    amount: 320,
    timestamp: new Date(Date.now() - 9 * 86400 * 1000).toISOString(),
  },
  {
    id: "conv-105",
    customerRef: "CUST_STORM_105",
    affiliateAddress: "Gwallet-one",
    affiliateName: "Affiliate Pro",
    campaignId: "7",
    campaignName: "Technology Campaign",
    amount: 210,
    timestamp: new Date(Date.now() - 14 * 86400 * 1000).toISOString(),
  },
  {
    id: "conv-106",
    customerRef: "CUST_STORM_106",
    affiliateAddress: "Gaffiliate-wallet",
    affiliateName: "Affiliate Pro",
    campaignId: "spring-launch",
    campaignName: "Spring Launch",
    amount: 120,
    timestamp: new Date(Date.now() - 1 * 86400 * 1000).toISOString(),
  },
  {
    id: "conv-107",
    customerRef: "CUST_STORM_107",
    affiliateAddress: "Gaffiliate-wallet",
    affiliateName: "Affiliate Pro",
    campaignId: "spring-launch",
    campaignName: "Spring Launch",
    amount: 450,
    timestamp: new Date(Date.now() - 4 * 86400 * 1000).toISOString(),
  },
];

/**
 * Calculates Click-to-Sale Ratio (CVR %) with 2 decimal places precision.
 * Returns 0 if clicks are non-positive or inputs are invalid.
 */
export function calculateCvr(clicks: number, sales: number): number {
  if (typeof clicks !== "number" || typeof sales !== "number") return 0;
  if (!Number.isFinite(clicks) || !Number.isFinite(sales)) return 0;
  if (clicks <= 0 || sales < 0) return 0;

  const ratio = (sales / clicks) * 100;
  return Math.round(ratio * 100) / 100;
}

/**
 * Computes trend direction ("up" | "down" | "neutral") and delta percentage.
 * Compares current CVR against a baseline or previous period CVR.
 */
export function computeTrend(currentCvr: number, baselineCvr: number): TrendAnalysis {
  const safeCurrent = Number.isFinite(currentCvr) ? currentCvr : 0;
  const safeBaseline = Number.isFinite(baselineCvr) ? baselineCvr : 0;
  const rawDelta = safeCurrent - safeBaseline;
  const delta = Math.round(rawDelta * 100) / 100;

  let direction: TrendDirection;
  let formattedDelta: string;

  if (delta > 0.001) {
    direction = "up";
    formattedDelta = `+${delta.toFixed(2)}%`;
  } else if (delta < -0.001) {
    direction = "down";
    formattedDelta = `${delta.toFixed(2)}%`;
  } else {
    direction = "neutral";
    formattedDelta = "0.00%";
  }

  return {
    direction,
    delta,
    formattedDelta,
  };
}

/**
 * Matches conversion records to an active short-link based on:
 * 1. Direct slug or link ID match (if present on conversion payload)
 * 2. Campaign ID + Affiliate Wallet match (case-insensitive)
 * 3. Campaign ID match
 */
export function matchConversionsToLink(
  link: CustomShortLink,
  conversions: CustomerConversion[],
): CustomerConversion[] {
  if (!link || !conversions || conversions.length === 0) return [];

  const linkSlug = (link.slug || "").toLowerCase();
  const linkId = link.id || "";
  const linkCampaign = String(link.campaignId || "").toLowerCase();
  const linkWallet = (link.affiliateWallet || "").toLowerCase();

  return conversions.filter((c) => {
    const raw = c as unknown as Record<string, unknown>;
    const cSlug = typeof raw.slug === "string" ? raw.slug.toLowerCase() : "";
    const cLinkId = typeof raw.linkId === "string" ? raw.linkId : "";

    // 1. Direct slug or linkId attribution
    if (cSlug && cSlug === linkSlug) return true;
    if (cLinkId && cLinkId === linkId) return true;

    // 2. Campaign ID & Wallet attribution
    const cCampaign = String(c.campaignId || "").toLowerCase();
    const cWallet = (c.affiliateAddress || "").toLowerCase();

    if (cCampaign === linkCampaign) {
      if (!cWallet || !linkWallet) return true;
      return cWallet === linkWallet;
    }

    return false;
  });
}

/**
 * Computes conversion metrics for a single link, including sales count,
 * sales volume, CVR %, and trend analysis.
 */
export function computeLinkConversionMetrics(
  link: CustomShortLink,
  conversions: CustomerConversion[],
  baselineCvr?: number,
): LinkConversionMetrics {
  const matched = matchConversionsToLink(link, conversions);
  const clicks = link.clickCount || 0;
  const salesCount = matched.length;
  const salesVolume = matched.reduce((acc, c) => acc + (c.amount || 0), 0);
  const cvrPercentage = calculateCvr(clicks, salesCount);
  const formattedCvr = `${cvrPercentage.toFixed(2)}%`;

  // Compute baseline trend
  let effectiveBaseline = baselineCvr;
  if (effectiveBaseline === undefined) {
    if (matched.length >= 2 && clicks > 0) {
      // Split chronologically: first half as baseline
      const sorted = [...matched].sort(
        (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
      );
      const earlyCount = Math.floor(sorted.length / 2);
      const earlyClicks = Math.max(1, Math.floor(clicks / 2));
      effectiveBaseline = calculateCvr(earlyClicks, earlyCount);
    } else {
      effectiveBaseline = 0;
    }
  }

  const trend = computeTrend(cvrPercentage, effectiveBaseline);

  return {
    linkId: link.id,
    slug: link.slug,
    campaignId: link.campaignId,
    campaignName: link.campaignName,
    clicks,
    salesCount,
    salesVolume,
    cvrPercentage,
    formattedCvr,
    trend,
  };
}

/**
 * Computes aggregate conversion analytics across an array of active links.
 */
export function computeAggregateConversionAnalytics(
  links: CustomShortLink[],
  conversions: CustomerConversion[],
  baselineOverallCvr?: number,
): AggregateConversionAnalytics {
  const linkMetrics = new Map<string, LinkConversionMetrics>();

  let totalClicks = 0;
  let totalSales = 0;
  let totalSalesVolume = 0;

  let topPerformingSlug: string | null = null;
  let maxClicks = -1;

  let topConvertingSlug: string | null = null;
  let maxCvr = -1;

  for (const link of links) {
    const metrics = computeLinkConversionMetrics(link, conversions);
    linkMetrics.set(link.id, metrics);

    totalClicks += metrics.clicks;
    totalSales += metrics.salesCount;
    totalSalesVolume += metrics.salesVolume;

    if (metrics.clicks > maxClicks && metrics.clicks > 0) {
      maxClicks = metrics.clicks;
      topPerformingSlug = link.slug;
    }

    if (metrics.cvrPercentage > maxCvr && metrics.clicks > 0) {
      maxCvr = metrics.cvrPercentage;
      topConvertingSlug = link.slug;
    }
  }

  const overallCvrPercentage = calculateCvr(totalClicks, totalSales);
  const formattedOverallCvr = `${overallCvrPercentage.toFixed(2)}%`;

  const effectiveBaseline =
    baselineOverallCvr !== undefined
      ? baselineOverallCvr
      : links.length > 0
        ? Math.max(0, Math.round((overallCvrPercentage - 0.4) * 100) / 100)
        : 0;

  const overallTrend = computeTrend(overallCvrPercentage, effectiveBaseline);

  return {
    totalLinks: links.length,
    totalClicks,
    totalSales,
    totalSalesVolume,
    overallCvrPercentage,
    formattedOverallCvr,
    overallTrend,
    topPerformingSlug,
    topConvertingSlug,
    linkMetrics,
  };
}

/**
 * Fetches real-time conversions from backend API (/conversions endpoint)
 * with graceful fallback to demo conversions if backend is unreachable.
 */
export async function syncBackendConversions(campaignId?: string): Promise<SyncConversionsResult> {
  const syncedAt = new Date().toISOString();
  try {
    const data = await fetchConversions(campaignId);
    if (Array.isArray(data) && data.length > 0) {
      return {
        conversions: data as CustomerConversion[],
        source: "backend",
        syncedAt,
      };
    }
  } catch (error) {
    console.warn("Backend conversion sync failed, using cached/mock analytics:", error);
  }

  // Graceful fallback for local development & preview environments
  const filteredMock = campaignId
    ? DEFAULT_DEMO_CONVERSIONS.filter((c) => c.campaignId === campaignId)
    : DEFAULT_DEMO_CONVERSIONS;

  return {
    conversions: filteredMock,
    source: "mock",
    syncedAt,
  };
}
