/**
 * Real-Time Attribution Window Calculator and Cookie/LocalStorage Fallback (Issue #151)
 *
 * Provides:
 *   1. First-Click vs Last-Click attribution models for incoming customer sales.
 *   2. Attribution windows (1, 7, 30, or 60 days).
 *   3. Click tracking in encrypted / obfuscated localStorage with resilient cookie fallback.
 *   4. Expiration window checks: conversions beyond the window are treated as direct uncommissioned sales.
 */

export type AttributionModel = "first_click" | "last_click";
export type AttributionWindowDays = 1 | 7 | 30 | 60;

export interface ClickRecord {
  affiliateAddress: string;
  campaignId: string;
  clickTimestamp: number; // Unix timestamp in seconds
  model: AttributionModel;
}

export interface AttributionEvaluationResult {
  attributedAffiliate: string | null;
  isUncommissioned: boolean;
  model: AttributionModel;
  windowDays: number;
  clickTimestamp?: number;
  conversionTimestamp: number;
  expired: boolean;
  reason: string;
}

export const ATTR_STORAGE_KEY = "_stormsale_attr_store_v1";
export const ATTR_COOKIE_PREFIX = "_storm_attr_";

/**
 * Lightweight reversible encoding to obscure client-side attribution state in localStorage.
 */
function obfuscateData(data: string): string {
  try {
    return btoa(encodeURIComponent(data));
  } catch {
    return data;
  }
}

function deobfuscateData(data: string): string {
  try {
    return decodeURIComponent(atob(data));
  } catch {
    return data;
  }
}

/**
 * Cookie storage helpers for cookie fallback.
 */
function getCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const prefix = name + "=";
  const parts = document.cookie.split(/;\s*/);
  for (const part of parts) {
    if (part.indexOf(prefix) === 0) {
      try {
        return decodeURIComponent(part.slice(prefix.length));
      } catch {
        return null;
      }
    }
  }
  return null;
}

function setCookie(name: string, value: string, maxAgeSeconds: number): void {
  if (typeof document === "undefined") return;
  const secure =
    typeof window !== "undefined" && window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${name}=${encodeURIComponent(value)}; Max-Age=${maxAgeSeconds}; Path=/; SameSite=Lax${secure}`;
}

/**
 * Retrieves all stored click records across localStorage and cookie fallback.
 */
export function getStoredClicks(): Record<string, ClickRecord> {
  const records: Record<string, ClickRecord> = {};

  // 1. Try LocalStorage
  if (typeof localStorage !== "undefined") {
    try {
      const raw = localStorage.getItem(ATTR_STORAGE_KEY);
      if (raw) {
        const decoded = JSON.parse(deobfuscateData(raw));
        if (typeof decoded === "object" && decoded !== null) {
          Object.assign(records, decoded);
        }
      }
    } catch {
      // LocalStorage unavailable or corrupt
    }
  }

  // 2. Cookie fallback recovery if localStorage was empty or partial
  if (typeof document !== "undefined") {
    try {
      const cookieParts = document.cookie.split(/;\s*/);
      for (const part of cookieParts) {
        if (part.startsWith(ATTR_COOKIE_PREFIX)) {
          const sepIndex = part.indexOf("=");
          const name = part.slice(0, sepIndex);
          const campaignId = name.replace(ATTR_COOKIE_PREFIX, "");
          const cookieVal = getCookie(name);
          if (cookieVal && !records[campaignId]) {
            try {
              const parsed = JSON.parse(cookieVal);
              if (parsed.affiliateAddress && parsed.clickTimestamp) {
                records[campaignId] = parsed;
              }
            } catch {
              // Non-JSON or malformed
            }
          }
        }
      }
    } catch {
      // Document cookies unavailable
    }
  }

  return records;
}

/**
 * Persists clicks into both obfuscated localStorage and resilient cookie fallback.
 */
export function saveClicks(records: Record<string, ClickRecord>): void {
  // 1. LocalStorage
  if (typeof localStorage !== "undefined") {
    try {
      localStorage.setItem(ATTR_STORAGE_KEY, obfuscateData(JSON.stringify(records)));
    } catch (e) {
      console.warn("LocalStorage save failed, falling back to cookies:", e);
    }
  }

  // 2. Cookie Fallback (60-day maximum lifetime)
  for (const [campaignId, record] of Object.entries(records)) {
    try {
      setCookie(`${ATTR_COOKIE_PREFIX}${campaignId}`, JSON.stringify(record), 60 * 24 * 60 * 60);
    } catch {
      // Ignore cookie write failure
    }
  }
}

/**
 * Records an incoming referral click according to the campaign's attribution model.
 *
 * - First-Click: Keeps the earliest recorded click for the campaign.
 * - Last-Click: Overwrites with the latest click for the campaign.
 */
export function recordReferralClick(
  campaignId: string | number,
  affiliateAddress: string,
  model: AttributionModel = "last_click",
  clickTimestampSec: number = Math.floor(Date.now() / 1000),
): ClickRecord {
  const normCampaign = String(campaignId).trim();
  const normAffiliate = affiliateAddress.trim();
  const existing = getStoredClicks();
  const currentRecord = existing[normCampaign];

  if (model === "first_click" && currentRecord) {
    // Retain initial first-touch attribution
    return currentRecord;
  }

  const newRecord: ClickRecord = {
    affiliateAddress: normAffiliate,
    campaignId: normCampaign,
    clickTimestamp: clickTimestampSec,
    model,
  };

  existing[normCampaign] = newRecord;
  saveClicks(existing);
  return newRecord;
}

/**
 * Evaluates attribution for an incoming conversion:
 * Checks whether the click exists and is within the allowed attribution window.
 *
 * If expired or missing, returns an uncommissioned direct sale result.
 */
export function evaluateAttribution(
  campaignId: string | number,
  windowDays: AttributionWindowDays = 30,
  model: AttributionModel = "last_click",
  conversionTimestampSec: number = Math.floor(Date.now() / 1000),
): AttributionEvaluationResult {
  const normCampaign = String(campaignId).trim();
  const clicks = getStoredClicks();
  const record = clicks[normCampaign];

  if (!record || !record.affiliateAddress) {
    return {
      attributedAffiliate: null,
      isUncommissioned: true,
      model,
      windowDays,
      conversionTimestamp: conversionTimestampSec,
      expired: false,
      reason:
        "No referral click recorded for this campaign. Treated as direct uncommissioned sale.",
    };
  }

  const windowSeconds = windowDays * 24 * 60 * 60;
  const elapsedSeconds = conversionTimestampSec - record.clickTimestamp;

  if (elapsedSeconds < 0) {
    // Clock drift or future timestamp
    return {
      attributedAffiliate: record.affiliateAddress,
      isUncommissioned: false,
      model: record.model || model,
      windowDays,
      clickTimestamp: record.clickTimestamp,
      conversionTimestamp: conversionTimestampSec,
      expired: false,
      reason: `Attributed via ${record.model || model} model within ${windowDays}-day window.`,
    };
  }

  if (elapsedSeconds > windowSeconds) {
    return {
      attributedAffiliate: null,
      isUncommissioned: true,
      model: record.model || model,
      windowDays,
      clickTimestamp: record.clickTimestamp,
      conversionTimestamp: conversionTimestampSec,
      expired: true,
      reason: `Attribution window expired (${(elapsedSeconds / 86400).toFixed(1)} days elapsed, max ${windowDays} days). Treated as direct uncommissioned sale.`,
    };
  }

  return {
    attributedAffiliate: record.affiliateAddress,
    isUncommissioned: false,
    model: record.model || model,
    windowDays,
    clickTimestamp: record.clickTimestamp,
    conversionTimestamp: conversionTimestampSec,
    expired: false,
    reason: `Attributed to ${record.affiliateAddress} via ${record.model || model} model (${(elapsedSeconds / 86400).toFixed(1)} days within ${windowDays}-day window).`,
  };
}

/**
 * Clears stored click attribution for a specific campaign or all campaigns.
 */
export function clearAttribution(campaignId?: string | number): void {
  if (campaignId === undefined) {
    if (typeof localStorage !== "undefined") {
      localStorage.removeItem(ATTR_STORAGE_KEY);
    }
    if (typeof document !== "undefined") {
      const parts = document.cookie.split(/;\s*/);
      for (const part of parts) {
        if (part.startsWith(ATTR_COOKIE_PREFIX)) {
          const sepIndex = part.indexOf("=");
          const name = sepIndex >= 0 ? part.slice(0, sepIndex) : part;
          setCookie(name, "", 0);
        }
      }
    }
    return;
  }
  const normCampaign = String(campaignId).trim();
  const clicks = getStoredClicks();
  delete clicks[normCampaign];
  saveClicks(clicks);

  if (typeof document !== "undefined") {
    setCookie(`${ATTR_COOKIE_PREFIX}${normCampaign}`, "", 0);
  }
}
