/**
 * Custom Commission Payout Caps per Affiliate per 24-Hour Window (Issue #156)
 *
 * Advertisers can define an optional daily payout cap (e.g. 1,000 XLM / day) per affiliate.
 * The application enforces a rolling 24-hour window:
 *   - Verifies affiliate rolling 24-hour claimed volume before signing claim payouts.
 *   - Prevents runaway liabilities by blocking claims exceeding the remaining quota.
 *   - Informs affiliates of their remaining daily claiming quota with countdown to reset.
 */

export const AFFILIATE_CLAIMS_STORAGE_KEY = "stormsale_affiliate_claims_v1";
export const ROLLING_WINDOW_MS = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

export interface AffiliateClaimRecord {
  affiliateAddress: string;
  campaignId: number;
  amountXlm: number;
  timestamp: number; // Unix timestamp in ms
}

export interface PayoutCapCheckResult {
  allowed: boolean;
  current24hVolume: number;
  remainingQuota: number;
  dailyPayoutCap: number | null;
  resetTimeMs: number;
  reason?: string;
}

export interface StorageBackend {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function resolveStorage(storage?: StorageBackend): StorageBackend {
  if (storage) return storage;
  if (typeof localStorage !== "undefined") return localStorage;
  return {
    getItem: () => null,
    setItem: () => {},
  };
}

/**
 * Loads all recorded affiliate claims from storage.
 */
export function loadAffiliateClaimRecords(storage?: StorageBackend): AffiliateClaimRecord[] {
  try {
    const raw = resolveStorage(storage).getItem(AFFILIATE_CLAIMS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch {
    return [];
  }
}

/**
 * Records an executed affiliate payout claim to persistent storage.
 */
export function recordAffiliateClaim(
  affiliateAddress: string,
  campaignId: number,
  amountXlm: number,
  timestamp: number = Date.now(),
  storage?: StorageBackend,
): void {
  const store = resolveStorage(storage);
  const records = loadAffiliateClaimRecords(store);
  const newRecord: AffiliateClaimRecord = {
    affiliateAddress: affiliateAddress.trim(),
    campaignId,
    amountXlm: Math.max(0, amountXlm),
    timestamp,
  };
  // Prune entries older than 48 hours to prevent unbounded storage growth
  const pruned = records.filter((r) => r.timestamp >= timestamp - 48 * 60 * 60 * 1000);
  pruned.push(newRecord);
  try {
    store.setItem(AFFILIATE_CLAIMS_STORAGE_KEY, JSON.stringify(pruned));
  } catch (err) {
    console.warn("Failed to persist affiliate claim record:", err);
  }
}

/**
 * Calculates the affiliate's rolling 24-hour claimed volume.
 */
export function getRolling24HourClaimVolume(
  affiliateAddress: string,
  campaignId?: number,
  referenceTimeMs: number = Date.now(),
  storage?: StorageBackend,
): number {
  if (!affiliateAddress) return 0;
  const records = loadAffiliateClaimRecords(storage);
  const windowStart = referenceTimeMs - ROLLING_WINDOW_MS;
  const targetAffiliate = affiliateAddress.trim();

  return records
    .filter((r) => {
      const matchesAffiliate = r.affiliateAddress === targetAffiliate;
      const matchesCampaign = campaignId === undefined || r.campaignId === campaignId;
      const withinWindow = r.timestamp >= windowStart && r.timestamp <= referenceTimeMs;
      return matchesAffiliate && matchesCampaign && withinWindow;
    })
    .reduce((sum, r) => sum + r.amountXlm, 0);
}

/**
 * Calculates timestamp of when the earliest claim in the active 24h window will roll off.
 */
export function getNextResetTimeMs(
  affiliateAddress: string,
  campaignId?: number,
  referenceTimeMs: number = Date.now(),
  storage?: StorageBackend,
): number {
  if (!affiliateAddress) return referenceTimeMs + ROLLING_WINDOW_MS;
  const records = loadAffiliateClaimRecords(storage);
  const windowStart = referenceTimeMs - ROLLING_WINDOW_MS;
  const targetAffiliate = affiliateAddress.trim();

  const activeClaims = records
    .filter((r) => {
      const matchesAffiliate = r.affiliateAddress === targetAffiliate;
      const matchesCampaign = campaignId === undefined || r.campaignId === campaignId;
      const withinWindow = r.timestamp >= windowStart && r.timestamp <= referenceTimeMs;
      return matchesAffiliate && matchesCampaign && withinWindow;
    })
    .sort((a, b) => a.timestamp - b.timestamp);

  if (activeClaims.length === 0) {
    return referenceTimeMs + ROLLING_WINDOW_MS;
  }

  // Earliest active claim rolls off after 24h
  return activeClaims[0].timestamp + ROLLING_WINDOW_MS;
}

/**
 * Enforces the daily payout cap constraint before signing claim payouts.
 */
export function checkDailyPayoutCap(
  affiliateAddress: string,
  requestedAmount: number,
  dailyPayoutCap?: number | null,
  campaignId?: number,
  referenceTimeMs: number = Date.now(),
  storage?: StorageBackend,
): PayoutCapCheckResult {
  // If no cap is defined or cap <= 0, no limitation is imposed
  if (dailyPayoutCap === undefined || dailyPayoutCap === null || dailyPayoutCap <= 0) {
    return {
      allowed: true,
      current24hVolume: 0,
      remainingQuota: Infinity,
      dailyPayoutCap: null,
      resetTimeMs: 0,
    };
  }

  const current24hVolume = getRolling24HourClaimVolume(
    affiliateAddress,
    campaignId,
    referenceTimeMs,
    storage,
  );
  const remainingQuota = Math.max(0, dailyPayoutCap - current24hVolume);
  const resetTimeMs = getNextResetTimeMs(affiliateAddress, campaignId, referenceTimeMs, storage);

  if (requestedAmount > remainingQuota) {
    const timeRemainingStr = formatTimeUntilReset(resetTimeMs, referenceTimeMs);
    const reason =
      remainingQuota <= 0
        ? `Daily maximum payout cap of ${dailyPayoutCap.toLocaleString()} XLM has been reached for this 24-hour window. Resets in ${timeRemainingStr}.`
        : `Requested claim of ${requestedAmount.toFixed(2)} XLM exceeds your remaining daily quota of ${remainingQuota.toFixed(2)} XLM (${dailyPayoutCap.toLocaleString()} XLM / 24h cap). Resets in ${timeRemainingStr}.`;

    return {
      allowed: false,
      current24hVolume,
      remainingQuota,
      dailyPayoutCap,
      resetTimeMs,
      reason,
    };
  }

  return {
    allowed: true,
    current24hVolume,
    remainingQuota,
    dailyPayoutCap,
    resetTimeMs,
  };
}

/**
 * Human-readable countdown string until the rolling window reset.
 */
export function formatTimeUntilReset(
  resetTimeMs: number,
  referenceTimeMs: number = Date.now(),
): string {
  const diffMs = Math.max(0, resetTimeMs - referenceTimeMs);
  const hours = Math.floor(diffMs / (1000 * 60 * 60));
  const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((diffMs % (1000 * 60)) / 1000);

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }
  return `${seconds}s`;
}
