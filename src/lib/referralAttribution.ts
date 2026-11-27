/**
 * Two-Tier Referral Code URL Parser & Attribution Persistence Engine (#446)
 *
 * Implements:
 * 1. Two-tier URL query parameter extraction (?ref=CODE & ?parent=PARENT) without corrupting other query params.
 * 2. Deterministic checksum validation (FNV-1a / CRC16 / Stellar address checksum) for referral and parent codes.
 * 3. Secure attribution cookie persistence (SameSite=Lax, Secure, 30-day Max-Age: 2,592,000s) and localStorage fallback.
 * 4. Self-referral prevention (user wallet matching ref or parent code/owner).
 * 5. Attribution persistence and retrieval across internal client-side page transitions within 30-day window.
 */

import { isValidStellarAddress } from "./referralTree";
import { getLocalStorage } from "./storage";

export const ATTRIBUTION_COOKIE_NAME = "storm_b2c_attr";
export const ATTRIBUTION_STORAGE_KEY = "stormsale.b2c.referral.attribution";
export const ATTRIBUTION_WINDOW_DAYS = 30;
export const ATTRIBUTION_WINDOW_SECONDS = 30 * 24 * 60 * 60; // 2,592,000 seconds
export const ATTRIBUTION_WINDOW_MS = ATTRIBUTION_WINDOW_SECONDS * 1000;

export interface CookieOptions {
  sameSite?: "Lax" | "Strict" | "None";
  secure?: boolean;
  maxAge?: number;
  path?: string;
  domain?: string;
  expires?: Date;
}

export interface ReferralAttributionPayload {
  refCode: string;
  parentCode?: string;
  referrerAddress?: string;
  parentAddress?: string;
  campaignId?: string;
  createdAt?: number;
  expiresAt?: number;
  sourceUrl?: string;
  metadata?: Record<string, unknown>;
}

export interface StoredAttributionData {
  refCode: string;
  parentCode?: string;
  referrerAddress?: string;
  parentAddress?: string;
  campaignId?: string;
  createdAt: number;
  expiresAt: number;
  windowDays: number;
  sourceUrl?: string;
  metadata?: Record<string, unknown>;
}

export interface ParsedReferralParams {
  refCode: string | null;
  parentCode: string | null;
  isRefValid: boolean;
  isParentValid: boolean;
  isValid: boolean;
  refValidationReason?: string;
  parentValidationReason?: string;
  remainingParams: Record<string, string>;
  cleanUrl: string;
  cleanPath: string;
  rawUrl: string;
  error?: string;
}

export interface SelfReferralValidationResult {
  allowed: boolean;
  isSelfReferral: boolean;
  reason?: string;
}

export interface AttributionProcessResult {
  success: boolean;
  attribution: StoredAttributionData | null;
  isNewTouch: boolean;
  isPersistentTouch: boolean;
  isExpired: boolean;
  isSelfReferralBlocked: boolean;
  cleanUrl: string;
  reason: string;
}

/**
 * Computes a deterministic 4-character hex checksum for a given string using FNV-1a.
 */
export function computeReferralChecksum(payload: string): string {
  if (!payload || typeof payload !== "string") return "";
  const normalized = payload.trim().toUpperCase();
  let hash = 0x811c9dc5;
  for (let i = 0; i < normalized.length; i++) {
    hash ^= normalized.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return ((hash >>> 0) & 0xffff).toString(16).toUpperCase().padStart(4, "0");
}

/**
 * Formats a referral code with a deterministic checksum suffix.
 * e.g. formatReferralCode("ALICE") -> "REF-ALICE-E5B2"
 */
export function formatReferralCode(base: string, prefix: string = "REF"): string {
  const cleanBase = base.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  const codeBody = prefix ? `${prefix}-${cleanBase}` : cleanBase;
  const checksum = computeReferralChecksum(codeBody);
  return `${codeBody}-${checksum}`;
}

/**
 * Validates a referral code or Stellar address checksum.
 */
export function verifyReferralCodeChecksum(code: string | null | undefined): {
  isValid: boolean;
  baseCode: string;
  checksum?: string;
  isStellarAddress?: boolean;
  reason?: string;
} {
  if (!code || typeof code !== "string" || !code.trim()) {
    return { isValid: false, baseCode: "", reason: "Referral code cannot be empty." };
  }

  const trimmed = code.trim();

  // 1. Check if the code is a valid Stellar wallet address (56-char ed25519 with CRC16)
  if (isValidStellarAddress(trimmed)) {
    return {
      isValid: true,
      baseCode: trimmed,
      isStellarAddress: true,
    };
  }

  // 2. Check formatted referral code with checksum suffix: <BODY>-<CHECKSUM> or <BODY>_<CHECKSUM>
  const match = trimmed.match(/^(.*?)[-_]([A-Fa-f0-9]{4})$/);
  if (match) {
    const body = match[1];
    const extractedChecksum = match[2].toUpperCase();
    const expectedChecksum = computeReferralChecksum(body);

    if (extractedChecksum === expectedChecksum) {
      return {
        isValid: true,
        baseCode: body,
        checksum: extractedChecksum,
      };
    } else {
      return {
        isValid: false,
        baseCode: body,
        checksum: extractedChecksum,
        reason: `Invalid checksum for referral code "${trimmed}". Expected ${expectedChecksum}, got ${extractedChecksum}.`,
      };
    }
  }

  return {
    isValid: false,
    baseCode: trimmed,
    reason: `Invalid referral code format: "${trimmed}". Must be a valid Stellar public key or formatted code with a 4-char hex checksum (e.g. REF-USER-XXXX).`,
  };
}

/**
 * Parses referral query parameters (?ref=CODE and ?parent=PARENT) from a URL string
 * while preserving all other query parameters without corruption.
 */
export function parseReferralQueryParams(urlString: string): ParsedReferralParams {
  try {
    const fallbackBase = "https://stormsale.xyz";
    const isRelative = !urlString.startsWith("http://") && !urlString.startsWith("https://");
    const parsedUrl = new URL(urlString, fallbackBase);

    const ref = parsedUrl.searchParams.get("ref");
    const parent = parsedUrl.searchParams.get("parent");

    // Validate checksums
    const refValidation = ref ? verifyReferralCodeChecksum(ref) : { isValid: false, baseCode: "" };
    const parentValidation = parent
      ? verifyReferralCodeChecksum(parent)
      : { isValid: true, baseCode: "" }; // parent is optional

    const isRefValid = Boolean(ref && refValidation.isValid);
    const isParentValid = Boolean(!parent || parentValidation.isValid);
    const overallValid = Boolean(ref && isRefValid && isParentValid);

    // Extract remaining parameters without corrupting them
    const remainingParams: Record<string, string> = {};
    const cleanParams = new URLSearchParams();

    parsedUrl.searchParams.forEach((value, key) => {
      if (key !== "ref" && key !== "parent") {
        remainingParams[key] = value;
        cleanParams.append(key, value);
      }
    });

    const queryString = cleanParams.toString();
    const queryPart = queryString ? `?${queryString}` : "";
    const hashPart = parsedUrl.hash || "";

    const cleanPath = `${parsedUrl.pathname}${queryPart}${hashPart}`;
    const cleanUrl = isRelative
      ? cleanPath
      : `${parsedUrl.origin}${cleanPath}`;

    let error: string | undefined;
    if (ref && !refValidation.isValid) {
      error = refValidation.reason;
    } else if (parent && !parentValidation.isValid) {
      error = parentValidation.reason;
    }

    return {
      refCode: ref,
      parentCode: parent,
      isRefValid,
      isParentValid,
      isValid: overallValid,
      refValidationReason: refValidation.reason,
      parentValidationReason: parentValidation.reason,
      remainingParams,
      cleanUrl,
      cleanPath,
      rawUrl: urlString,
      error,
    };
  } catch (err) {
    return {
      refCode: null,
      parentCode: null,
      isRefValid: false,
      isParentValid: false,
      isValid: false,
      remainingParams: {},
      cleanUrl: urlString,
      cleanPath: urlString,
      rawUrl: urlString,
      error: err instanceof Error ? err.message : "Malformed URL",
    };
  }
}

/**
 * Builds standard compliant Set-Cookie header string with SameSite=Lax, Secure, and 30-day expiration.
 */
export function buildAttributionCookieHeader(
  name: string,
  value: string,
  options: CookieOptions = {},
): string {
  const maxAge = options.maxAge ?? ATTRIBUTION_WINDOW_SECONDS;
  const path = options.path ?? "/";
  const sameSite = options.sameSite ?? "Lax";
  const secure = options.secure ?? true;
  const expires = options.expires ?? new Date(Date.now() + maxAge * 1000);

  let header = `${name}=${encodeURIComponent(value)}; Path=${path}; Max-Age=${maxAge}; Expires=${expires.toUTCString()}; SameSite=${sameSite}`;
  if (secure) {
    header += "; Secure";
  }
  if (options.domain) {
    header += `; Domain=${options.domain}`;
  }
  return header;
}

/**
 * Sets the attribution cookie with SameSite=Lax, Secure, and 30-day expiration.
 * Returns the exact cookie header string set.
 */
export function setAttributionCookie(
  name: string,
  value: string,
  options: CookieOptions = {},
): string {
  const cookieString = buildAttributionCookieHeader(name, value, options);
  if (typeof document !== "undefined") {
    try {
      document.cookie = cookieString;
    } catch {
      // In restricted or server environments
    }
  }
  return cookieString;
}

/**
 * Retrieves a cookie value by name from document.cookie.
 */
export function getAttributionCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const prefix = `${name}=`;
  const cookies = document.cookie.split(/;\s*/);
  for (const part of cookies) {
    if (part.startsWith(prefix)) {
      try {
        return decodeURIComponent(part.slice(prefix.length));
      } catch {
        return part.slice(prefix.length);
      }
    }
  }
  return null;
}

/**
 * Persists attribution payload into both secure cookies (30-day window, SameSite=Lax, Secure)
 * and localStorage.
 */
export function storeReferralAttribution(
  payload: ReferralAttributionPayload,
): StoredAttributionData {
  const now = payload.createdAt || Date.now();
  const expiresAt = payload.expiresAt || now + ATTRIBUTION_WINDOW_MS;

  const storedData: StoredAttributionData = {
    refCode: payload.refCode.trim(),
    parentCode: payload.parentCode?.trim() || undefined,
    referrerAddress: payload.referrerAddress?.trim() || undefined,
    parentAddress: payload.parentAddress?.trim() || undefined,
    campaignId: payload.campaignId?.trim() || undefined,
    createdAt: now,
    expiresAt,
    windowDays: ATTRIBUTION_WINDOW_DAYS,
    sourceUrl: payload.sourceUrl,
    metadata: payload.metadata,
  };

  const serialized = JSON.stringify(storedData);

  // 1. Persist to Cookie
  setAttributionCookie(ATTRIBUTION_COOKIE_NAME, serialized, {
    maxAge: ATTRIBUTION_WINDOW_SECONDS,
    sameSite: "Lax",
    secure: true,
    path: "/",
    expires: new Date(expiresAt),
  });

  // 2. Persist to localStorage
  const storage = getLocalStorage();
  try {
    storage.setItem(ATTRIBUTION_STORAGE_KEY, serialized);
  } catch (err) {
    console.warn("Failed to save referral attribution to localStorage:", err);
  }

  return storedData;
}

/**
 * Clears stored referral attribution across both localStorage and cookies.
 */
export function clearReferralAttribution(): void {
  // 1. Clear cookie (Max-Age=0, expired date)
  if (typeof document !== "undefined") {
    setAttributionCookie(ATTRIBUTION_COOKIE_NAME, "", {
      maxAge: 0,
      sameSite: "Lax",
      secure: true,
      path: "/",
      expires: new Date(0),
    });
  }

  // 2. Clear localStorage
  const storage = getLocalStorage();
  try {
    storage.removeItem(ATTRIBUTION_STORAGE_KEY);
  } catch {
    // Ignore error
  }
}

/**
 * Retrieves the currently active attribution data from localStorage or cookie fallback.
 * Automatically clears and returns null if the 30-day attribution window has expired.
 */
export function getStoredReferralAttribution(
  currentTimeMs: number = Date.now(),
): StoredAttributionData | null {
  let raw: string | null = null;

  // 1. Try localStorage
  const storage = getLocalStorage();
  try {
    raw = storage.getItem(ATTRIBUTION_STORAGE_KEY);
  } catch {
    raw = null;
  }

  // 2. Fallback to cookie if localStorage is empty
  if (!raw) {
    raw = getAttributionCookie(ATTRIBUTION_COOKIE_NAME);
  }

  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as StoredAttributionData;
    if (!parsed || !parsed.refCode) {
      clearReferralAttribution();
      return null;
    }

    // Check 30-day expiration window
    if (currentTimeMs > parsed.expiresAt) {
      clearReferralAttribution();
      return null;
    }

    return parsed;
  } catch {
    clearReferralAttribution();
    return null;
  }
}

/**
 * Validates against self-referrals:
 * Ensures a connected user's wallet does not match the referral code owner or parent code owner,
 * and that refCode != parentCode.
 */
export function validateSelfReferral(
  userWallet: string | null | undefined,
  refCode: string,
  parentCode?: string,
  codeOwnerMap?: Record<string, string>,
): SelfReferralValidationResult {
  if (!userWallet || typeof userWallet !== "string" || !userWallet.trim()) {
    return { allowed: true, isSelfReferral: false };
  }

  const normalizedUser = userWallet.trim().toLowerCase();
  const normalizedRef = refCode.trim().toLowerCase();
  const normalizedParent = parentCode?.trim().toLowerCase();

  // Helper to resolve wallet address from a code case-insensitively
  const resolveOwner = (code: string): string => {
    const trimmed = code.trim();
    // If the code is already a Stellar address
    if (isValidStellarAddress(trimmed)) {
      return trimmed.toLowerCase();
    }

    if (codeOwnerMap) {
      for (const [key, owner] of Object.entries(codeOwnerMap)) {
        if (key.trim().toLowerCase() === trimmed.toLowerCase()) {
          return owner.trim().toLowerCase();
        }
      }
    }

    // If the baseCode inside matches a mapped wallet (handling prefixes like REF-)
    const check = verifyReferralCodeChecksum(trimmed);
    if (check.isValid && codeOwnerMap) {
      const baseClean = check.baseCode.replace(/^REF[-_]/i, "").trim().toLowerCase();
      for (const [key, owner] of Object.entries(codeOwnerMap)) {
        const keyLower = key.trim().toLowerCase();
        if (keyLower === check.baseCode.toLowerCase() || keyLower === baseClean) {
          return owner.trim().toLowerCase();
        }
      }
    }

    return trimmed.toLowerCase();
  };

  const refOwner = resolveOwner(refCode);

  // Check 1: User wallet matches direct referral code or its owner
  if (normalizedUser === normalizedRef || normalizedUser === refOwner) {
    return {
      allowed: false,
      isSelfReferral: true,
      reason: "Self-referral prohibited: Connected user wallet cannot be the direct referral affiliate.",
    };
  }

  // Check 2: User wallet matches parent recruiter code or its owner
  if (normalizedParent) {
    const parentOwner = resolveOwner(normalizedParent);
    if (normalizedUser === normalizedParent || normalizedUser === parentOwner) {
      return {
        allowed: false,
        isSelfReferral: true,
        reason: "Self-referral prohibited: Connected user wallet cannot be the parent recruiter affiliate.",
      };
    }

    // Check 3: Ref code owner matches Parent code owner
    if (normalizedRef === normalizedParent || refOwner === parentOwner) {
      return {
        allowed: false,
        isSelfReferral: true,
        reason: "Invalid referral chain: Direct referral code cannot match parent recruiter code.",
      };
    }
  }

  return { allowed: true, isSelfReferral: false };
}

/**
 * Handles incoming URL navigation or internal client-side page transitions:
 * - If referral parameters exist: validates checksum, checks self-referral, persists attribution for 30 days.
 * - If transitioning to an internal page without query parameters: maintains and returns active attribution.
 * - If attribution expired (>30 days): clears storage and returns uncommissioned direct state.
 */
export function trackPageTransition(
  targetUrl: string,
  userWallet?: string,
  codeOwnerMap?: Record<string, string>,
  currentTimeMs: number = Date.now(),
): AttributionProcessResult {
  const parsed = parseReferralQueryParams(targetUrl);

  // Case A: New referral parameters present in incoming URL
  if (parsed.refCode) {
    if (!parsed.isValid) {
      return {
        success: false,
        attribution: null,
        isNewTouch: false,
        isPersistentTouch: false,
        isExpired: false,
        isSelfReferralBlocked: false,
        cleanUrl: parsed.cleanUrl,
        reason: parsed.error || "Invalid referral query parameters.",
      };
    }

    // Validate self-referral
    const selfRefCheck = validateSelfReferral(
      userWallet,
      parsed.refCode,
      parsed.parentCode || undefined,
      codeOwnerMap,
    );

    if (!selfRefCheck.allowed) {
      return {
        success: false,
        attribution: null,
        isNewTouch: false,
        isPersistentTouch: false,
        isExpired: false,
        isSelfReferralBlocked: true,
        cleanUrl: parsed.cleanUrl,
        reason: selfRefCheck.reason || "Self-referral blocked.",
      };
    }

    // Resolve addresses if known
    const referrerAddress = codeOwnerMap?.[parsed.refCode] || (isValidStellarAddress(parsed.refCode) ? parsed.refCode : undefined);
    const parentAddress = parsed.parentCode
      ? codeOwnerMap?.[parsed.parentCode] || (isValidStellarAddress(parsed.parentCode) ? parsed.parentCode : undefined)
      : undefined;

    // Persist new attribution with 30-day window
    const stored = storeReferralAttribution({
      refCode: parsed.refCode,
      parentCode: parsed.parentCode || undefined,
      referrerAddress,
      parentAddress,
      createdAt: currentTimeMs,
      expiresAt: currentTimeMs + ATTRIBUTION_WINDOW_MS,
      sourceUrl: targetUrl,
    });

    return {
      success: true,
      attribution: stored,
      isNewTouch: true,
      isPersistentTouch: false,
      isExpired: false,
      isSelfReferralBlocked: false,
      cleanUrl: parsed.cleanUrl,
      reason: `Attribution registered successfully for ${parsed.refCode}${parsed.parentCode ? ` with parent ${parsed.parentCode}` : ""}.`,
    };
  }

  // Case B: Client-side internal navigation (no referral params in targetUrl)
  const existing = getStoredReferralAttribution(currentTimeMs);

  if (!existing) {
    return {
      success: false,
      attribution: null,
      isNewTouch: false,
      isPersistentTouch: false,
      isExpired: false,
      isSelfReferralBlocked: false,
      cleanUrl: targetUrl,
      reason: "No active referral attribution for session.",
    };
  }

  // Check if connected wallet conflicts with existing attribution
  if (userWallet) {
    const selfCheck = validateSelfReferral(
      userWallet,
      existing.refCode,
      existing.parentCode,
      codeOwnerMap,
    );
    if (!selfCheck.allowed) {
      clearReferralAttribution();
      return {
        success: false,
        attribution: null,
        isNewTouch: false,
        isPersistentTouch: false,
        isExpired: false,
        isSelfReferralBlocked: true,
        cleanUrl: targetUrl,
        reason: selfCheck.reason || "Self-referral invalidated existing attribution.",
      };
    }
  }

  return {
    success: true,
    attribution: existing,
    isNewTouch: false,
    isPersistentTouch: true,
    isExpired: false,
    isSelfReferralBlocked: false,
    cleanUrl: targetUrl,
    reason: `Attribution persisted across client navigation from initial source (${existing.refCode}).`,
  };
}

/**
 * Strips referral parameters from the current browser URL using history.replaceState
 * without reloading the page or corrupting other query parameters.
 */
export function cleanReferralParamsFromCurrentUrl(): string | null {
  if (typeof window === "undefined" || !window.location) return null;
  const currentUrl = window.location.href;
  const parsed = parseReferralQueryParams(currentUrl);

  if (parsed.refCode && window.history && typeof window.history.replaceState === "function") {
    window.history.replaceState({}, document.title, parsed.cleanPath);
    return parsed.cleanUrl;
  }

  return null;
}
