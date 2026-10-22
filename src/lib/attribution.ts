/**
 * Real-Time Attribution Window Calculator & Cookie/LocalStorage Fallback (#151)
 *
 * Advertisers configure an attribution model (First-Click or Last-Click) and a
 * tracking window (1, 7, 30, or 60 days). Referral clicks are tracked client-side
 * in AES-GCM encrypted localStorage with an encrypted first-party cookie fallback
 * when storage is blocked (e.g. Safari private mode or strict privacy extensions).
 *
 * The calculator resolves which affiliate click (if any) earns the commission for
 * a conversion timestamp. Conversions that fall beyond the configured window are
 * treated as direct, uncommissioned sales.
 */

export type AttributionModel = "first_click" | "last_click";

export const VALID_ATTRIBUTION_WINDOW_DAYS = [1, 7, 30, 60] as const;
export const DEFAULT_ATTRIBUTION_MODEL: AttributionModel = "last_click";
export const DEFAULT_ATTRIBUTION_WINDOW_DAYS = 30;

export interface AttributionSettings {
  model: AttributionModel;
  windowDays: number;
}

export interface ClickRecord {
  clickId: string;
  /** Affiliate identifier (Stellar public key) that owns the referral link */
  affiliateId: string;
  campaignId: number;
  /** Unix timestamp in seconds, anchored to ledger-comparable clock */
  timestamp: number;
  landingUrl?: string;
}

export type AttributionFailureReason = "no_referral_click" | "window_expired";

export interface AttributionResult {
  attributed: boolean;
  model: AttributionModel;
  windowDays: number;
  /** The click that earned the commission (null when uncommissioned) */
  click: ClickRecord | null;
  /** Expiry instant of the winning click's window (unix seconds) */
  expiryTimestamp: number | null;
  reason: "attributed" | AttributionFailureReason;
}

export interface AttributionCountdown {
  expiryTimestamp: number;
  remainingSeconds: number;
  isExpired: boolean;
  countdownText: string;
}

export const SECONDS_PER_DAY = 86400;

/**
 * Validates that a tracking window is one of the supported presets (1, 7, 30, 60 days).
 */
export function isValidAttributionWindow(days: number): boolean {
  return (VALID_ATTRIBUTION_WINDOW_DAYS as readonly number[]).includes(days);
}

/**
 * Coerces partial or untrusted input into safe attribution settings,
 * falling back to Last-Click / 30 days for invalid values.
 */
export function normalizeAttributionSettings(
  input?: Partial<AttributionSettings>,
): AttributionSettings {
  const model: AttributionModel = input?.model === "first_click" ? "first_click" : "last_click";
  const windowDays =
    typeof input?.windowDays === "number" && isValidAttributionWindow(input.windowDays)
      ? input.windowDays
      : DEFAULT_ATTRIBUTION_WINDOW_DAYS;
  return { model, windowDays };
}

/**
 * Checks whether a click timestamp still attributes to a conversion timestamp
 * under the configured window. The boundary is inclusive: a conversion landing
 * exactly on the expiry instant is still commissioned.
 */
export function isWithinAttributionWindow(
  click: Pick<ClickRecord, "timestamp">,
  saleTimestamp: number,
  windowDays: number,
): boolean {
  const expiry = click.timestamp + windowDays * SECONDS_PER_DAY;
  return saleTimestamp >= click.timestamp && saleTimestamp <= expiry;
}

/**
 * Core attribution engine: given all recorded clicks for a campaign/affiliate,
 * the sale timestamp, and campaign attribution settings, decide which click (if
 * any) earns the commission.
 *
 * - Last-Click: the most recent click still inside its window wins.
 * - First-Click: the earliest click wins outright, provided it has not expired;
 *   once the first touch expires, the conversion becomes a direct sale.
 * - No clicks: "no_referral_click" -> uncommissioned direct sale.
 * - Clicks exist but all fall outside the window: "window_expired".
 */
export function resolveAttribution(
  clicks: ClickRecord[],
  saleTimestamp: number,
  settings: AttributionSettings,
): AttributionResult {
  const base = { model: settings.model, windowDays: settings.windowDays };

  if (clicks.length === 0) {
    return {
      attributed: false,
      click: null,
      expiryTimestamp: null,
      reason: "no_referral_click",
      ...base,
    };
  }

  const sorted = [...clicks].sort(
    (a, b) => a.timestamp - b.timestamp || a.clickId.localeCompare(b.clickId),
  );

  if (settings.model === "first_click") {
    const first = sorted[0];
    const expiry = first.timestamp + settings.windowDays * SECONDS_PER_DAY;
    if (saleTimestamp > expiry) {
      return {
        attributed: false,
        click: null,
        expiryTimestamp: expiry,
        reason: "window_expired",
        ...base,
      };
    }
    return {
      attributed: true,
      click: first,
      expiryTimestamp: expiry,
      reason: "attributed",
      ...base,
    };
  }

  // last_click: newest click that is still inside its own window
  for (let i = sorted.length - 1; i >= 0; i--) {
    const click = sorted[i];
    const expiry = click.timestamp + settings.windowDays * SECONDS_PER_DAY;
    if (saleTimestamp >= click.timestamp && saleTimestamp <= expiry) {
      return { attributed: true, click, expiryTimestamp: expiry, reason: "attributed", ...base };
    }
  }

  const newest = sorted[sorted.length - 1];
  return {
    attributed: false,
    click: null,
    expiryTimestamp: newest.timestamp + settings.windowDays * SECONDS_PER_DAY,
    reason: "window_expired",
    ...base,
  };
}

/**
 * Real-time countdown for the live "time remaining in attribution window"
 * widget. Never shows negative remaining time.
 */
export function calculateAttributionCountdown(
  click: Pick<ClickRecord, "timestamp">,
  windowDays: number,
  nowSeconds: number,
): AttributionCountdown {
  const expiryTimestamp = click.timestamp + windowDays * SECONDS_PER_DAY;
  const remainingSeconds = Math.max(0, expiryTimestamp - nowSeconds);
  const isExpired = remainingSeconds === 0;

  const days = Math.floor(remainingSeconds / SECONDS_PER_DAY);
  const hours = Math.floor((remainingSeconds % SECONDS_PER_DAY) / 3600);
  const minutes = Math.floor((remainingSeconds % 3600) / 60);

  let countdownText: string;
  if (days > 0) countdownText = `${days}d ${hours}h ${minutes}m`;
  else if (hours > 0) countdownText = `${hours}h ${minutes}m`;
  else if (minutes > 0) countdownText = `${minutes}m`;
  else countdownText = "expiring now";

  return { expiryTimestamp, remainingSeconds, isExpired, countdownText };
}

// ---------------------------------------------------------------------------
// Encrypted click tracking: AES-GCM localStorage vault + cookie fallback
// ---------------------------------------------------------------------------

const VAULT_STORAGE_KEY = "stormsale_attribution_clicks_v1";
const VAULT_SALT = "stormsale-attribution-v1";
const VAULT_ITERATIONS = 10_000;
/** Cookie fallback keeps only the most recent clicks (cookie size limits). */
const COOKIE_MAX_CLICKS = 8;
const COOKIE_MAX_VALUE_CHARS = 3800;

export interface KVStorage {
  isAvailable(): boolean;
  getItem(key: string): string | null;
  setItem(key: string, value: string): boolean;
  removeItem(key: string): void;
}

/** Safe localStorage adapter: survives quota errors and blocked storage. */
export const localStorageAdapter: KVStorage = {
  isAvailable: () => {
    try {
      return typeof localStorage !== "undefined";
    } catch {
      return false;
    }
  },
  getItem: (key) => {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  setItem: (key, value) => {
    try {
      localStorage.setItem(key, value);
      return true;
    } catch {
      return false;
    }
  },
  removeItem: (key) => {
    try {
      localStorage.removeItem(key);
    } catch {
      // Blocked storage: nothing to clean up
    }
  },
};

/** First-party cookie adapter used when localStorage is unavailable or fails. */
export const cookieStorageAdapter: KVStorage = {
  isAvailable: () => typeof document !== "undefined" && typeof document.cookie === "string",
  getItem: (key) => {
    if (typeof document === "undefined") return null;
    const match = document.cookie
      .split("; ")
      .find((row) => row.startsWith(`${encodeURIComponent(key)}=`));
    if (!match) return null;
    return decodeURIComponent(match.split("=").slice(1).join("="));
  },
  setItem: (key, value) => {
    if (typeof document === "undefined" || value.length > COOKIE_MAX_VALUE_CHARS) return false;
    const expires = new Date(Date.now() + 90 * SECONDS_PER_DAY * 1000).toUTCString();
    document.cookie = `${encodeURIComponent(key)}=${encodeURIComponent(value)}; Expires=${expires}; Path=/; SameSite=Lax`;
    return true;
  },
  removeItem: (key) => {
    if (typeof document === "undefined") return;
    document.cookie = `${encodeURIComponent(key)}=; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Path=/`;
  },
};

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(value: string): Uint8Array {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/**
 * Derives the device-bound AES-GCM key from the wallet address (or session id)
 * acting as the click-tracking secret. Deterministic so the same browser
 * session can decrypt its own vault.
 */
export async function deriveVaultKey(deviceSecret: string): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const baseKey = await crypto.subtle.importKey("raw", enc.encode(deviceSecret), "PBKDF2", false, [
    "deriveKey",
  ]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: enc.encode(VAULT_SALT), iterations: VAULT_ITERATIONS, hash: "SHA-256" },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

/** Encrypts the click log into a base64url `iv.ciphertext` envelope. */
export async function encryptClickLog(clicks: ClickRecord[], key: CryptoKey): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plaintext = new TextEncoder().encode(JSON.stringify(clicks));
  const cipherBuffer = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plaintext);
  const cipher = new Uint8Array(cipherBuffer);
  return `${toBase64Url(iv)}.${toBase64Url(cipher)}`;
}

/** Decrypts an `iv.ciphertext` envelope back into click records. */
export async function decryptClickLog(payload: string, key: CryptoKey): Promise<ClickRecord[]> {
  const [ivPart, dataPart] = payload.split(".");
  if (!ivPart || !dataPart) return [];
  const plainBuffer = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromBase64Url(ivPart) as BufferSource },
    key,
    fromBase64Url(dataPart) as BufferSource,
  );
  const parsed = JSON.parse(new TextDecoder().decode(plainBuffer));
  return Array.isArray(parsed) ? (parsed as ClickRecord[]) : [];
}

export type ClickStorageSource = "local_storage" | "cookie" | "none";

/**
 * Persists a referral click into the encrypted vault. Prefers localStorage and
 * transparently falls back to an encrypted first-party cookie when storage is
 * blocked or writes fail (privacy mode, quota exceeded).
 */
export async function recordAttributionClick(
  click: ClickRecord,
  deviceSecret: string,
): Promise<ClickStorageSource> {
  const key = await deriveVaultKey(deviceSecret);

  if (localStorageAdapter.isAvailable()) {
    const raw = localStorageAdapter.getItem(VAULT_STORAGE_KEY);
    let clicks: ClickRecord[] = [];
    if (raw) {
      try {
        clicks = await decryptClickLog(raw, key);
      } catch {
        clicks = [];
      }
    }
    clicks = clicks.filter((c) => c.clickId !== click.clickId);
    clicks.push(click);
    if (localStorageAdapter.setItem(VAULT_STORAGE_KEY, await encryptClickLog(clicks, key))) {
      return "local_storage";
    }
  }

  if (cookieStorageAdapter.isAvailable()) {
    const raw = cookieStorageAdapter.getItem(VAULT_STORAGE_KEY);
    let clicks: ClickRecord[] = [];
    if (raw) {
      try {
        clicks = await decryptClickLog(raw, key);
      } catch {
        clicks = [];
      }
    }
    clicks = clicks.filter((c) => c.clickId !== click.clickId);
    clicks.push(click);
    clicks.sort((a, b) => a.timestamp - b.timestamp);
    clicks = clicks.slice(-COOKIE_MAX_CLICKS);
    const payload = await encryptClickLog(clicks, key);
    if (cookieStorageAdapter.setItem(VAULT_STORAGE_KEY, payload)) {
      return "cookie";
    }
  }

  return "none";
}

/**
 * Reads and decrypts the tracked click log, preferring localStorage and falling
 * back to the cookie vault. Tampered or unreadable payloads resolve to an empty
 * log so a broken vault never fakes an attribution.
 */
export async function readAttributionClicks(deviceSecret: string): Promise<ClickRecord[]> {
  const key = await deriveVaultKey(deviceSecret);

  if (localStorageAdapter.isAvailable()) {
    const raw = localStorageAdapter.getItem(VAULT_STORAGE_KEY);
    if (raw) {
      try {
        return await decryptClickLog(raw, key);
      } catch {
        return [];
      }
    }
  }

  const cookieRaw = cookieStorageAdapter.getItem(VAULT_STORAGE_KEY);
  if (cookieRaw) {
    try {
      return await decryptClickLog(cookieRaw, key);
    } catch {
      return [];
    }
  }

  return [];
}

/** Wipes the encrypted click vault from both storage tiers. */
export async function clearAttributionClicks(): Promise<void> {
  localStorageAdapter.removeItem(VAULT_STORAGE_KEY);
  cookieStorageAdapter.removeItem(VAULT_STORAGE_KEY);
}

/**
 * Convenience entry point used by sale-logging flows: reads the encrypted
 * vault, keeps only the clicks for the given affiliate/campaign, and resolves
 * the commission decision for a conversion timestamp.
 */
export async function attributeConversion(
  campaignId: number,
  affiliateId: string,
  saleTimestamp: number,
  settings: AttributionSettings,
  deviceSecret: string,
): Promise<AttributionResult> {
  const allClicks = await readAttributionClicks(deviceSecret);
  const clicks = allClicks.filter(
    (c) => c.campaignId === campaignId && c.affiliateId === affiliateId,
  );
  return resolveAttribution(clicks, saleTimestamp, settings);
}
