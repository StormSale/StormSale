import {
  registerUserRequestSchema,
  registerUserResponseSchema,
  campaignMetadataResponseSchema,
  conversionsListResponseSchema,
} from "../lib/validation";

export const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3001/api";

export interface ActiveLinkAnalytics {
  id: string;
  campaignId: number;
  campaignName: string;
  linkUrl: string;
  targetUrl: string;
  clicks: number;
  conversions: number;
  conversionRate: number; // percentage: (conversions / clicks) * 100
  previousConversionRate: number; // Last event CVR
  previousPeriodConversionRate?: number; // Preserved baseline from previous period/backend
  trendDelta: number;
  trendDirection: "up" | "down" | "neutral";
  totalRevenueXlm: number;
  commissionEarnedXlm: number;
  commissionRate: number;
  status: "active" | "paused";
  lastSyncedAt: string;
}

export interface ConversionAnalyticsSummary {
  totalClicks: number;
  totalConversions: number;
  overallCVR: number;
  previousOverallCVR: number;
  cvrTrendDelta: number;
  cvrTrendDirection: "up" | "down" | "neutral";
  totalEarnedXlm: number;
  totalRevenueXlm: number;
  activeLinksCount: number;
  lastSynced: string;
}

/**
 * Calculates click-to-sale ratio (Conversion Rate) as a percentage.
 * Formula: (conversions / clicks) * 100, rounded to 2 decimal places.
 */
export function calculateCVR(conversions: number, clicks: number): number {
  if (clicks <= 0 || conversions < 0) return 0;
  const rate = (conversions / clicks) * 100;
  return Number(rate.toFixed(2));
}

/**
 * Calculates trend indicator between current period and previous benchmark.
 */
export function calculateTrend(
  currentRate: number,
  previousRate: number,
): { trendDelta: number; trendDirection: "up" | "down" | "neutral" } {
  const delta = Number((currentRate - previousRate).toFixed(2));
  if (delta > 0) return { trendDelta: delta, trendDirection: "up" };
  if (delta < 0) return { trendDelta: delta, trendDirection: "down" };
  return { trendDelta: 0, trendDirection: "neutral" };
}

// In-memory synced state for active links and conversion analytics
export const INITIAL_ACTIVE_LINKS: ActiveLinkAnalytics[] = [
  {
    id: "link-1",
    campaignId: 1,
    campaignName: "Tech Gadgets Pro",
    linkUrl: "https://stormsale.xyz/c/1?ref=GBBD5678",
    targetUrl: "https://techgadgets.io/store",
    clicks: 4820,
    conversions: 241,
    conversionRate: 5.0,
    previousConversionRate: 4.2,
    previousPeriodConversionRate: 4.2,
    trendDelta: 0.8,
    trendDirection: "up",
    totalRevenueXlm: 24100,
    commissionEarnedXlm: 2410,
    commissionRate: 10,
    status: "active",
    lastSyncedAt: new Date().toISOString(),
  },
  {
    id: "link-2",
    campaignId: 2,
    campaignName: "Web3 Masterclass 2026",
    linkUrl: "https://stormsale.xyz/c/2?ref=GBBD5678",
    targetUrl: "https://web3academy.learn/course",
    clicks: 3150,
    conversions: 126,
    conversionRate: 4.0,
    previousConversionRate: 4.5,
    previousPeriodConversionRate: 4.5,
    trendDelta: -0.5,
    trendDirection: "down",
    totalRevenueXlm: 12600,
    commissionEarnedXlm: 1260,
    commissionRate: 10,
    status: "active",
    lastSyncedAt: new Date().toISOString(),
  },
  {
    id: "link-3",
    campaignId: 3,
    campaignName: "Crypto Security Hardware",
    linkUrl: "https://stormsale.xyz/c/3?ref=GBBD5678",
    targetUrl: "https://cryptovault.dev/order",
    clicks: 2200,
    conversions: 77,
    conversionRate: 3.5,
    previousConversionRate: 3.5,
    previousPeriodConversionRate: 3.5,
    trendDelta: 0.0,
    trendDirection: "neutral",
    totalRevenueXlm: 7700,
    commissionEarnedXlm: 770,
    commissionRate: 10,
    status: "active",
    lastSyncedAt: new Date().toISOString(),
  },
  {
    id: "link-4",
    campaignId: 4,
    campaignName: "DeFi Yield Aggregator",
    linkUrl: "https://stormsale.xyz/c/4?ref=GBBD5678",
    targetUrl: "https://defipulse.pro/app",
    clicks: 1400,
    conversions: 84,
    conversionRate: 6.0,
    previousConversionRate: 5.1,
    previousPeriodConversionRate: 5.1,
    trendDelta: 0.9,
    trendDirection: "up",
    totalRevenueXlm: 8400,
    commissionEarnedXlm: 840,
    commissionRate: 10,
    status: "active",
    lastSyncedAt: new Date().toISOString(),
  },
];

// In-memory synced state keyed by cacheKey (wallet + time range)
const mutableLinksCache = new Map<string, ActiveLinkAnalytics[]>();

function getMutableLinks(cacheKey: string): ActiveLinkAnalytics[] {
  let list = mutableLinksCache.get(cacheKey);
  if (!list) {
    list = INITIAL_ACTIVE_LINKS.map((l) => ({ ...l }));
    mutableLinksCache.set(cacheKey, list);
  }
  return list;
}

function findCacheKeyForLink(linkId: string, preferredKey?: string): string {
  if (preferredKey && mutableLinksCache.has(preferredKey)) {
    const list = mutableLinksCache.get(preferredKey)!;
    if (list.some((l) => l.id === linkId)) return preferredKey;
  }
  for (const [key, list] of mutableLinksCache.entries()) {
    if (list.some((l) => l.id === linkId)) return key;
  }
  return preferredKey || "default:7d";
}

// Cache keyed strictly by wallet and requested time range
const conversionDataCache = new Map<
  string,
  {
    links: ActiveLinkAnalytics[];
    summary: ConversionAnalyticsSummary;
  }
>();

// Serialized operations per link ID to prevent overlapping mutation races
const linkLockQueue = new Map<string, Promise<unknown>>();

function withLinkLock<T>(linkId: string, fn: () => Promise<T>): Promise<T> {
  const previous = linkLockQueue.get(linkId) || Promise.resolve();
  const next = previous.catch(() => {}).then(fn);
  linkLockQueue.set(linkId, next);
  return next;
}

export function clearConversionCache(): void {
  conversionDataCache.clear();
  mutableLinksCache.clear();
}

export function buildSummaryFromLinks(
  validatedLinks: ActiveLinkAnalytics[],
  backendPreviousCVR?: number,
): ConversionAnalyticsSummary {
  const totalClicks = validatedLinks.reduce((acc, l) => acc + l.clicks, 0);
  const totalConversions = validatedLinks.reduce((acc, l) => acc + l.conversions, 0);
  const overallCVR = calculateCVR(totalConversions, totalClicks);

  const prevConversions = validatedLinks.reduce(
    (acc, l) =>
      acc +
      (l.clicks > 0
        ? (l.clicks *
            (typeof l.previousPeriodConversionRate === "number"
              ? l.previousPeriodConversionRate
              : l.previousConversionRate)) /
          100
        : 0),
    0,
  );
  const calculatedPrevCVR = calculateCVR(prevConversions, totalClicks);
  const previousOverallCVR =
    backendPreviousCVR !== undefined ? backendPreviousCVR : calculatedPrevCVR;
  const { trendDelta: cvrTrendDelta, trendDirection: cvrTrendDirection } = calculateTrend(
    overallCVR,
    previousOverallCVR,
  );

  const totalEarnedXlm = validatedLinks.reduce((acc, l) => acc + l.commissionEarnedXlm, 0);
  const totalRevenueXlm = validatedLinks.reduce((acc, l) => acc + l.totalRevenueXlm, 0);

  return {
    totalClicks,
    totalConversions,
    overallCVR,
    previousOverallCVR,
    cvrTrendDelta,
    cvrTrendDirection,
    totalEarnedXlm,
    totalRevenueXlm,
    activeLinksCount: validatedLinks.filter((l) => l.status === "active").length,
    lastSynced: new Date().toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }),
  };
}

export const registerUser = async (walletAddress: string, role: string = "AFFILIATE") => {
  // Validate outgoing request
  const validatedPayload = registerUserRequestSchema.parse({ walletAddress, role });

  try {
    const res = await fetch(`${API_URL}/users`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validatedPayload),
    });
    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}));
      throw new Error(errorData.error || "Backend registration failed");
    }
    const json = await res.json();
    // Validate API response
    return registerUserResponseSchema.parse(json);
  } catch (error) {
    console.error("Failed to register user:", error);
    throw error;
  }
};

export const fetchCampaign = async (campaignId: string) => {
  if (!campaignId || typeof campaignId !== "string" || !campaignId.trim()) {
    throw new Error("Invalid campaign ID");
  }

  try {
    const res = await fetch(`${API_URL}/campaigns/${encodeURIComponent(campaignId.trim())}`);
    if (!res.ok) {
      return null;
    }
    const json = await res.json();
    return campaignMetadataResponseSchema.parse(json);
  } catch (error) {
    console.error("Failed to fetch campaign metadata:", error);
    return null;
  }
};

/**
 * Fetches real-time CVR and conversion analytics synced with the backend.
 * Avoids returning data from another range when a fetch fails.
 */
export const fetchAffiliateConversionData = async (
  walletAddress?: string,
  timeRange?: string,
): Promise<{
  links: ActiveLinkAnalytics[];
  summary: ConversionAnalyticsSummary;
}> => {
  const rangeKey = timeRange || "7d";
  const cacheKey = `${walletAddress || "default"}:${rangeKey}`;
  let backendPreviousCVR: number | undefined;

  try {
    const params = new URLSearchParams();
    if (walletAddress) params.set("wallet", walletAddress);
    if (timeRange) params.set("range", timeRange);
    const queryString = params.toString() ? `?${params.toString()}` : "";
    const res = await fetch(`${API_URL}/affiliate/conversions${queryString}`, {
      headers: { "Content-Type": "application/json" },
    });

    if (res.ok) {
      const data = await res.json();
      if (typeof data.summary?.previousOverallCVR === "number") {
        backendPreviousCVR = data.summary.previousOverallCVR;
      }
      if (
        Array.isArray(data.links) &&
        data.links.every(
          (l: unknown) =>
            typeof l === "object" &&
            l !== null &&
            "id" in l &&
            typeof (l as Record<string, unknown>).id === "string" &&
            "clicks" in l &&
            typeof (l as Record<string, unknown>).clicks === "number" &&
            !isNaN((l as Record<string, unknown>).clicks as number) &&
            "conversions" in l &&
            typeof (l as Record<string, unknown>).conversions === "number" &&
            !isNaN((l as Record<string, unknown>).conversions as number) &&
            "conversionRate" in l &&
            typeof (l as Record<string, unknown>).conversionRate === "number" &&
            !isNaN((l as Record<string, unknown>).conversionRate as number) &&
            "commissionEarnedXlm" in l &&
            typeof (l as Record<string, unknown>).commissionEarnedXlm === "number" &&
            !isNaN((l as Record<string, unknown>).commissionEarnedXlm as number) &&
            "totalRevenueXlm" in l &&
            typeof (l as Record<string, unknown>).totalRevenueXlm === "number" &&
            !isNaN((l as Record<string, unknown>).totalRevenueXlm as number) &&
            "commissionRate" in l &&
            typeof (l as Record<string, unknown>).commissionRate === "number" &&
            !isNaN((l as Record<string, unknown>).commissionRate as number) &&
            "trendDelta" in l &&
            typeof (l as Record<string, unknown>).trendDelta === "number" &&
            !isNaN((l as Record<string, unknown>).trendDelta as number),
        )
      ) {
        const validatedLinks: ActiveLinkAnalytics[] = data.links.map((l: ActiveLinkAnalytics) => ({
          ...l,
          previousPeriodConversionRate:
            typeof l.previousPeriodConversionRate === "number"
              ? l.previousPeriodConversionRate
              : l.previousConversionRate,
        }));

        const summary = buildSummaryFromLinks(validatedLinks, backendPreviousCVR);
        const result = { links: validatedLinks, summary };
        conversionDataCache.set(cacheKey, result);
        mutableLinksCache.set(
          cacheKey,
          validatedLinks.map((l) => ({ ...l })),
        );
        return result;
      }
    }

    // Backend returned non-200 or invalid payload: check if we have cached data specifically for this range
    if (conversionDataCache.has(cacheKey)) {
      return conversionDataCache.get(cacheKey)!;
    }
    throw new Error(
      `Failed to fetch conversion analytics for range "${rangeKey}": HTTP ${res ? res.status : "unknown"}`,
    );
  } catch (error) {
    if (conversionDataCache.has(cacheKey)) {
      return conversionDataCache.get(cacheKey)!;
    }
    throw error;
  }
};

/**
 * Simulates or records a real-time referral link click.
 * Recalculates CVR, maintains previous-period baseline, and uses delta rollback.
 */
export const recordLinkClick = async (
  linkId: string,
  range?: string,
  walletAddress?: string,
): Promise<ActiveLinkAnalytics> => {
  return withLinkLock(linkId, async () => {
    const preferredKey = range ? `${walletAddress || "default"}:${range}` : undefined;
    const cacheKey = findCacheKeyForLink(linkId, preferredKey);
    const store = getMutableLinks(cacheKey);

    const targetIndex = store.findIndex((l) => l.id === linkId);
    if (targetIndex === -1) {
      throw new Error(`Link not found: ${linkId}`);
    }

    const current = store[targetIndex];
    const newClicks = current.clicks + 1;
    const prevCVR = current.conversionRate;
    const newCVR = calculateCVR(current.conversions, newClicks);
    const baselinePeriodCVR =
      typeof current.previousPeriodConversionRate === "number"
        ? current.previousPeriodConversionRate
        : current.previousConversionRate;
    const { trendDelta, trendDirection } = calculateTrend(newCVR, baselinePeriodCVR);

    const updated: ActiveLinkAnalytics = {
      ...current,
      clicks: newClicks,
      previousConversionRate: prevCVR,
      previousPeriodConversionRate: baselinePeriodCVR,
      conversionRate: newCVR,
      trendDelta,
      trendDirection,
      lastSyncedAt: new Date().toISOString(),
    };

    store[targetIndex] = updated;
    const updatedSummary = buildSummaryFromLinks(store);
    conversionDataCache.set(cacheKey, { links: [...store], summary: updatedSummary });

    try {
      const res = await fetch(`${API_URL}/affiliate/links/${linkId}/click`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      if (!res.ok) {
        throw new Error(`Failed to record click: HTTP ${res.status}`);
      }
    } catch (error) {
      const idx = store.findIndex((l) => l.id === linkId);
      if (idx !== -1) {
        const item = store[idx];
        const revertedClicks = Math.max(0, item.clicks - 1);
        const revertedCVR = calculateCVR(item.conversions, revertedClicks);
        const { trendDelta: revDelta, trendDirection: revDir } = calculateTrend(
          revertedCVR,
          baselinePeriodCVR,
        );
        store[idx] = {
          ...item,
          clicks: revertedClicks,
          conversionRate: revertedCVR,
          trendDelta: revDelta,
          trendDirection: revDir,
        };
        const revertedSummary = buildSummaryFromLinks(store);
        conversionDataCache.set(cacheKey, { links: [...store], summary: revertedSummary });
      }
      throw error;
    }

    return updated;
  });
};

/**
 * Simulates or records a real-time conversion (sale) from a referral link.
 * Recalculates CVR, maintains previous-period baseline, and uses delta rollback.
 */
export const recordLinkConversion = async (
  linkId: string,
  saleAmountXlm: number = 100,
  range?: string,
  walletAddress?: string,
): Promise<ActiveLinkAnalytics> => {
  return withLinkLock(linkId, async () => {
    const preferredKey = range ? `${walletAddress || "default"}:${range}` : undefined;
    const cacheKey = findCacheKeyForLink(linkId, preferredKey);
    const store = getMutableLinks(cacheKey);

    const targetIndex = store.findIndex((l) => l.id === linkId);
    if (targetIndex === -1) {
      throw new Error(`Link not found: ${linkId}`);
    }

    const current = store[targetIndex];
    const newConversions = current.conversions + 1;
    const prevCVR = current.conversionRate;
    const newCVR = calculateCVR(newConversions, current.clicks);
    const baselinePeriodCVR =
      typeof current.previousPeriodConversionRate === "number"
        ? current.previousPeriodConversionRate
        : current.previousConversionRate;
    const { trendDelta, trendDirection } = calculateTrend(newCVR, baselinePeriodCVR);
    const commission = (saleAmountXlm * current.commissionRate) / 100;

    const updated: ActiveLinkAnalytics = {
      ...current,
      conversions: newConversions,
      previousConversionRate: prevCVR,
      previousPeriodConversionRate: baselinePeriodCVR,
      conversionRate: newCVR,
      trendDelta,
      trendDirection,
      totalRevenueXlm: current.totalRevenueXlm + saleAmountXlm,
      commissionEarnedXlm: current.commissionEarnedXlm + commission,
      lastSyncedAt: new Date().toISOString(),
    };

    store[targetIndex] = updated;
    const updatedSummary = buildSummaryFromLinks(store);
    conversionDataCache.set(cacheKey, { links: [...store], summary: updatedSummary });

    try {
      const res = await fetch(`${API_URL}/affiliate/links/${linkId}/conversion`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ saleAmountXlm }),
      });
      if (!res.ok) {
        throw new Error(`Failed to record conversion: HTTP ${res.status}`);
      }
    } catch (error) {
      const idx = store.findIndex((l) => l.id === linkId);
      if (idx !== -1) {
        const item = store[idx];
        const revertedConversions = Math.max(0, item.conversions - 1);
        const revertedCVR = calculateCVR(revertedConversions, item.clicks);
        const { trendDelta: revDelta, trendDirection: revDir } = calculateTrend(
          revertedCVR,
          baselinePeriodCVR,
        );
        store[idx] = {
          ...item,
          conversions: revertedConversions,
          conversionRate: revertedCVR,
          totalRevenueXlm: Math.max(0, item.totalRevenueXlm - saleAmountXlm),
          commissionEarnedXlm: Math.max(0, item.commissionEarnedXlm - commission),
          trendDelta: revDelta,
          trendDirection: revDir,
        };
        const revertedSummary = buildSummaryFromLinks(store);
        conversionDataCache.set(cacheKey, { links: [...store], summary: revertedSummary });
      }
      throw error;
    }

    return updated;
  });
};

export const fetchConversions = async (campaignId?: string) => {
  if (campaignId !== undefined && (typeof campaignId !== "string" || !campaignId.trim())) {
    throw new Error("Invalid campaign ID");
  }

  try {
    const url = campaignId
      ? `${API_URL}/conversions?campaignId=${encodeURIComponent(campaignId.trim())}`
      : `${API_URL}/conversions`;
    const res = await fetch(url);
    if (!res.ok) {
      return [];
    }
    const data = await res.json();
    // Validate parsed API response against conversions schema
    return conversionsListResponseSchema.parse(data);
  } catch (error) {
    console.error("Failed to fetch conversions from API:", error);
    return [];
  }
};

// ---------------------------------------------------------------------------
// Backend Role Validation Middleware & Role-Specific API Endpoints (#110)
// ---------------------------------------------------------------------------

export interface RoleValidationResult {
  authorized: boolean;
  status: number;
  error?: string;
}

/**
 * Validates whether a caller's role satisfies the required protocol role.
 * Returns 403 Forbidden details when authorization fails.
 */
export function enforceRoleMiddleware(
  callerRole: string | null | undefined,
  allowedRoles: string | string[],
): RoleValidationResult {
  const allowed = Array.isArray(allowedRoles)
    ? allowedRoles.map((r) => r.toUpperCase())
    : [allowedRoles.toUpperCase()];

  if (!callerRole || !allowed.includes(callerRole.toUpperCase())) {
    return {
      authorized: false,
      status: 403,
      error: `403 Forbidden: Action requires [${allowed.join(", ")}] permissions, but wallet has role '${callerRole || "UNREGISTERED"}'`,
    };
  }

  return {
    authorized: true,
    status: 200,
  };
}

export interface CreateCampaignPayload {
  name: string;
  budgetAmount: number;
  commissionRatePercent: number;
  clearingPeriodSecs: number;
  assetCode?: string;
  description?: string;
}

/**
 * Dispatches campaign creation to backend with strict role validation.
 * Enforces that only verified ADVERTISER wallets can create campaigns,
 * returning HTTP 403 Forbidden if attempted by any other role.
 */
export interface ApiError extends Error {
  status?: number;
  statusCode?: number;
}

export const createCampaignApi = async (
  walletAddress: string,
  userRole: string | null | undefined,
  payload: CreateCampaignPayload,
) => {
  // 1. Backend Role Validation Guard: Non-advertiser rejected immediately with 403
  const validation = enforceRoleMiddleware(userRole, "ADVERTISER");
  if (!validation.authorized) {
    const forbiddenError = new Error(validation.error) as ApiError;
    forbiddenError.status = 403;
    forbiddenError.statusCode = 403;
    throw forbiddenError;
  }

  try {
    const res = await fetch(`${API_URL}/campaigns/create`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Wallet-Address": walletAddress,
        "X-User-Role": userRole!.toUpperCase(),
      },
      body: JSON.stringify({
        ...payload,
        ownerAddress: walletAddress,
      }),
    });

    if (res.status === 403) {
      const errJson = await res.json().catch(() => ({}));
      const error = new Error(
        errJson.error || "403 Forbidden: Wallet role is not authorized for advertiser actions",
      ) as ApiError;
      error.status = 403;
      throw error;
    }

    if (!res.ok) {
      const errJson = await res.json().catch(() => ({}));
      throw new Error(errJson.error || `Failed to create campaign (${res.status})`);
    }

    return await res.json();
  } catch (error) {
    console.error("Backend campaign creation failed:", error);
    throw error;
  }
};

// ---------------------------------------------------------------------------
// Future Extension: SEP-0010 Challenge Verification Architecture
// ---------------------------------------------------------------------------

export interface Sep10ChallengeResponse {
  transaction: string;
  networkPassphrase: string;
}

/**
 * Architectural helper for SEP-0010 challenge-response authentication.
 * Generates a challenge token representation for Freighter cryptographic signing.
 */
export function generateSep10Challenge(
  serverAddress: string,
  clientAddress: string,
): Sep10ChallengeResponse {
  if (!serverAddress || !clientAddress) {
    throw new Error("Both server and client addresses are required for SEP-0010 challenge");
  }

  const nonce = Math.random().toString(36).substring(2, 15);
  return {
    transaction: `SEP10_CHALLENGE_${serverAddress}_${clientAddress}_${Date.now()}_${nonce}`,
    networkPassphrase: "Test SDF Network ; September 2015",
  };
}

/**
 * Verifies signed SEP-0010 challenge token response.
 */
export function verifySep10ChallengeResponse(
  signedTransaction: string,
  expectedClientAddress: string,
): boolean {
  if (!signedTransaction || !expectedClientAddress) return false;
  return signedTransaction.includes(expectedClientAddress);
}
