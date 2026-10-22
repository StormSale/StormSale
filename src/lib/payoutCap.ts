/**
 * Custom Commission Payout Caps per Affiliate per 24-Hour Window (#156)
 *
 * Advertisers define an optional `daily_payout_cap` (XLM) in campaign
 * parameters. Before signing any `claim_payout` transaction the affiliate
 * client verifies the rolling 24-hour claim volume against the cap, and the UI
 * informs affiliates of their remaining daily quota with a countdown to the
 * window reset. Claim history is persisted locally so quota survives reloads.
 */

export const ROLLING_WINDOW_SECONDS = 86400;

const CLAIM_LOG_STORAGE_KEY = "stormsale_affiliate_claim_log_v1";

export interface AffiliateClaimEvent {
  campaignId: number;
  /** Unix seconds */
  timestamp: number;
  amountXlm: number;
  txHash?: string;
  /**
   * Stellar account the claim settled for. The cap in #156 is defined per
   * affiliate, but the ledger is a single browser-wide list, so without this key
   * a second wallet in the same browser inherits the first wallet's usage.
   * Events written before the ledger carried this field are left as-is and still
   * count for whoever reads them.
   */
  affiliateAddress?: string;
}

export interface PayoutQuotaStatus {
  /** null when the campaign defines no cap (unlimited claiming) */
  capXlm: number | null;
  /** Total XLM claimed by the affiliate within the rolling 24h window */
  usedInWindowXlm: number;
  remainingQuotaXlm: number;
  /** True when the cap is reached and no further claims fit */
  capped: boolean;
  windowClaimCount: number;
  /** Instant (unix seconds) when the oldest in-window claim slides out */
  resetsAt: number | null;
  nextResetSeconds: number | null;
  resetCountdownText: string | null;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Filters the browser-wide claim ledger down to one affiliate's claims for one
 * campaign. #156's cap is defined per affiliate, but `loadClaimEvents()` returns
 * every claim recorded in this browser, so without this filter a second wallet
 * inherits the first wallet's usage and is blocked incorrectly. Entries written
 * before the ledger carried an affiliate key have no owner to attribute and are
 * kept, so quota is never silently freed for legacy records.
 */
export function claimsForAffiliate(
  events: AffiliateClaimEvent[],
  campaignId: number,
  affiliateAddress?: string | null,
): AffiliateClaimEvent[] {
  return events.filter(
    (e) =>
      e.campaignId === campaignId &&
      (!e.affiliateAddress || !affiliateAddress || e.affiliateAddress === affiliateAddress),
  );
}

/**
 * Validates the optional cap input from the campaign settings form.
 * Empty input means "no cap"; caps must be positive finite numbers.
 */
export function validateDailyPayoutCap(input: string | number | null | undefined): {
  valid: boolean;
  capXlm: number | null;
  error?: string;
} {
  if (input === null || input === undefined || input === "") {
    return { valid: true, capXlm: null };
  }
  const parsed = typeof input === "number" ? input : parseFloat(String(input));
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return { valid: false, capXlm: null, error: "Daily payout cap must be a positive XLM amount." };
  }
  return { valid: true, capXlm: round2(parsed) };
}

/**
 * Evaluates an affiliate's rolling 24-hour claim volume against a campaign's
 * daily payout cap. Only claims strictly inside the window (older than
 * `now - 24h` excluded, future claims ignored) count toward the quota.
 */
export function evaluateRollingQuota(
  events: AffiliateClaimEvent[],
  nowSeconds: number,
  capXlm: number | null,
): PayoutQuotaStatus {
  const windowStart = nowSeconds - ROLLING_WINDOW_SECONDS;
  const inWindow = events
    .filter((e) => e.timestamp > windowStart && e.timestamp <= nowSeconds)
    .sort((a, b) => a.timestamp - b.timestamp);

  const usedRaw = inWindow.reduce((sum, e) => sum + e.amountXlm, 0);
  const usedInWindowXlm = round2(usedRaw);

  if (capXlm === null) {
    return {
      capXlm: null,
      usedInWindowXlm,
      remainingQuotaXlm: Number.POSITIVE_INFINITY,
      capped: false,
      windowClaimCount: inWindow.length,
      resetsAt: null,
      nextResetSeconds: null,
      resetCountdownText: null,
    };
  }

  const remaining = Math.max(0, round2(capXlm - usedInWindowXlm));
  const capped = remaining <= 0;

  // The quota starts freeing again once the oldest in-window claim ages out.
  const resetsAt = inWindow.length > 0 ? inWindow[0].timestamp + ROLLING_WINDOW_SECONDS : null;
  const nextResetSeconds = resetsAt !== null ? Math.max(0, resetsAt - nowSeconds) : null;

  let resetCountdownText: string | null = null;
  if (capped && nextResetSeconds !== null && nextResetSeconds > 0) {
    const hours = Math.floor(nextResetSeconds / 3600);
    const minutes = Math.floor((nextResetSeconds % 3600) / 60);
    const seconds = Math.floor(nextResetSeconds % 60);
    if (hours > 0) resetCountdownText = `${hours}h ${minutes}m ${seconds}s`;
    else if (minutes > 0) resetCountdownText = `${minutes}m ${seconds}s`;
    else resetCountdownText = `${seconds}s`;
  } else if (capped) {
    resetCountdownText = "0s";
  }

  return {
    capXlm,
    usedInWindowXlm,
    remainingQuotaXlm: remaining,
    capped,
    windowClaimCount: inWindow.length,
    resetsAt,
    nextResetSeconds,
    resetCountdownText,
  };
}

/**
 * Pre-sign verification gate: whether a requested claim payout fits inside the
 * affiliate's remaining daily quota for the campaign. Uncapped campaigns always
 * pass; when capped, the full requested amount must fit (the Soroban contract
 * rejects over-cap claims, so the client must not sign them).
 */
export function isClaimWithinCap(
  events: AffiliateClaimEvent[],
  nowSeconds: number,
  capXlm: number | null,
  requestedXlm: number,
): boolean {
  if (capXlm === null) return true;
  if (!Number.isFinite(requestedXlm) || requestedXlm < 0) return false;
  const quota = evaluateRollingQuota(events, nowSeconds, capXlm);
  return round2(requestedXlm) <= quota.remainingQuotaXlm;
}

/**
 * Persists a settled claim into the local rolling-window claim ledger so quota
 * evaluation reflects payouts already signed this session and previous sessions.
 */
export function appendClaimEvent(event: AffiliateClaimEvent): AffiliateClaimEvent[] {
  const events = loadClaimEvents();
  events.push(event);
  if (typeof window === "undefined") return events;
  try {
    localStorage.setItem(CLAIM_LOG_STORAGE_KEY, JSON.stringify(events));
  } catch {
    // Storage blocked: quota tracking degrades to in-memory only
  }
  return events;
}

/** Loads the persisted affiliate claim ledger (empty array when unavailable). */
export function loadClaimEvents(): AffiliateClaimEvent[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(CLAIM_LOG_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (e): e is AffiliateClaimEvent =>
        typeof e?.timestamp === "number" &&
        typeof e?.amountXlm === "number" &&
        typeof e?.campaignId === "number",
    );
  } catch {
    return [];
  }
}

/** Formats a friendly remaining-quota label for the affiliate UI banner. */
export function formatQuotaLabel(quota: PayoutQuotaStatus): string {
  if (quota.capXlm === null) return "No daily payout cap on this campaign";
  if (quota.capped) {
    return `Daily cap reached (${quota.capXlm} XLM) — resets in ${quota.resetCountdownText || "less than a minute"}`;
  }
  return `${quota.remainingQuotaXlm.toFixed(2)} of ${quota.capXlm} XLM daily quota remaining`;
}
