import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  computeReferralChecksum,
  formatReferralCode,
  verifyReferralCodeChecksum,
  parseReferralQueryParams,
  buildAttributionCookieHeader,
  setAttributionCookie,
  getAttributionCookie,
  storeReferralAttribution,
  getStoredReferralAttribution,
  clearReferralAttribution,
  validateSelfReferral,
  trackPageTransition,
  cleanReferralParamsFromCurrentUrl,
  ATTRIBUTION_COOKIE_NAME,
  ATTRIBUTION_STORAGE_KEY,
  ATTRIBUTION_WINDOW_DAYS,
  ATTRIBUTION_WINDOW_SECONDS,
  ATTRIBUTION_WINDOW_MS,
} from "../lib/referralAttribution";
import { getLocalStorage } from "../lib/storage";

describe("Two-Tier Referral Code URL Parser & Attribution Persistence Engine (#446)", () => {
  const storage = getLocalStorage();

  // Test wallet fixtures
  const ALICE_WALLET = "GASTORMSALE7ALICE0000000000000000000000000000000000000001";
  const BOB_WALLET = "GASTORMSALE7BOB000000000000000000000000000000000000000002";
  const CHARLIE_WALLET = "GASTORMSALE7CHARLIE000000000000000000000000000000000000003";

  // Pre-generate valid formatted codes with checksums
  const ALICE_CODE = formatReferralCode("ALICE"); // e.g. REF-ALICE-E5B2
  const BOB_CODE = formatReferralCode("BOB");     // e.g. REF-BOB-D9A1
  const CODE_OWNER_MAP: Record<string, string> = {
    [ALICE_CODE]: ALICE_WALLET,
    ALICE: ALICE_WALLET,
    [BOB_CODE]: BOB_WALLET,
    BOB: BOB_WALLET,
  };

  beforeEach(() => {
    storage.clear();
    clearReferralAttribution();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    storage.clear();
    clearReferralAttribution();
  });

  // =========================================================================
  // ACCEPTANCE CRITERIA 1: Query parameter extraction without corruption
  // =========================================================================
  describe("1. Query Parameter Extraction and URL Sanitation", () => {
    it("computes deterministic FNV-1a checksums and verifies referral codes", () => {
      const checksum = computeReferralChecksum("REF-ALICE");
      expect(checksum).toHaveLength(4);
      expect(typeof checksum).toBe("string");

      const verified = verifyReferralCodeChecksum(ALICE_CODE);
      expect(verified.isValid).toBe(true);
      expect(verified.checksum).toBe(checksum);
    });

    it("extracts both ref and parent query parameters accurately", () => {
      const url = `https://stormsale.xyz/campaigns/42?ref=${ALICE_CODE}&parent=${BOB_CODE}`;
      const parsed = parseReferralQueryParams(url);

      expect(parsed.refCode).toBe(ALICE_CODE);
      expect(parsed.parentCode).toBe(BOB_CODE);
      expect(parsed.isRefValid).toBe(true);
      expect(parsed.isParentValid).toBe(true);
      expect(parsed.isValid).toBe(true);
      expect(parsed.cleanUrl).toBe("https://stormsale.xyz/campaigns/42");
    });

    it("preserves tracking parameters (UTM tags) without corruption", () => {
      const url = `https://stormsale.xyz/campaigns/101?utm_source=twitter&utm_medium=social&utm_campaign=summer_sale&ref=${ALICE_CODE}&utm_content=header_banner&parent=${BOB_CODE}&utm_term=crypto`;
      const parsed = parseReferralQueryParams(url);

      expect(parsed.refCode).toBe(ALICE_CODE);
      expect(parsed.parentCode).toBe(BOB_CODE);
      expect(parsed.remainingParams).toEqual({
        utm_source: "twitter",
        utm_medium: "social",
        utm_campaign: "summer_sale",
        utm_content: "header_banner",
        utm_term: "crypto",
      });

      // Assert ref and parent were stripped from cleanUrl, but all UTM params remain
      expect(parsed.cleanUrl).toContain("utm_source=twitter");
      expect(parsed.cleanUrl).toContain("utm_medium=social");
      expect(parsed.cleanUrl).toContain("utm_campaign=summer_sale");
      expect(parsed.cleanUrl).toContain("utm_content=header_banner");
      expect(parsed.cleanUrl).toContain("utm_term=crypto");
      expect(parsed.cleanUrl).not.toContain("ref=");
      expect(parsed.cleanUrl).not.toContain("parent=");
    });

    it("preserves complex and encoded query parameters and URL hash fragments", () => {
      const complexUrl = `https://stormsale.xyz/shop?category=hardware%20wallets&discount=15%25&tags=ledger%2Ctrezor&ref=${ALICE_CODE}&locale=en_US#reviews`;
      const parsed = parseReferralQueryParams(complexUrl);

      expect(parsed.remainingParams.category).toBe("hardware wallets");
      expect(parsed.remainingParams.discount).toBe("15%");
      expect(parsed.remainingParams.tags).toBe("ledger,trezor");
      expect(parsed.remainingParams.locale).toBe("en_US");
      expect(parsed.cleanUrl).toContain("#reviews");
      expect(parsed.cleanUrl).toContain("discount=15%25");
      expect(parsed.cleanUrl).not.toContain(ALICE_CODE);
    });

    it("supports relative URLs seamlessly without throwing", () => {
      const relativeUrl = `/checkout?item=premium-tier&ref=${ALICE_CODE}&qty=2`;
      const parsed = parseReferralQueryParams(relativeUrl);

      expect(parsed.refCode).toBe(ALICE_CODE);
      expect(parsed.remainingParams).toEqual({ item: "premium-tier", qty: "2" });
      expect(parsed.cleanUrl).toBe("/checkout?item=premium-tier&qty=2");
    });

    it("validates checksum and rejects tampered referral codes", () => {
      // Tamper 1 character of the ALICE_CODE
      const tamperedCode = ALICE_CODE.slice(0, -1) + (ALICE_CODE.endsWith("0") ? "1" : "0");
      const url = `https://stormsale.xyz/?ref=${tamperedCode}`;
      const parsed = parseReferralQueryParams(url);

      expect(parsed.refCode).toBe(tamperedCode);
      expect(parsed.isRefValid).toBe(false);
      expect(parsed.isValid).toBe(false);
      expect(parsed.error).toContain("Invalid checksum");
    });

    it("accepts valid Stellar public keys as direct referral codes", () => {
      const url = `https://stormsale.xyz/join?ref=${ALICE_WALLET}&parent=${BOB_WALLET}`;
      const parsed = parseReferralQueryParams(url);

      expect(parsed.refCode).toBe(ALICE_WALLET);
      expect(parsed.parentCode).toBe(BOB_WALLET);
      expect(parsed.isRefValid).toBe(true);
      expect(parsed.isParentValid).toBe(true);
      expect(parsed.isValid).toBe(true);
    });

    it("rejects invalid or malformed referral codes without delimiters or checksums", () => {
      const url = "https://stormsale.xyz/?ref=randomgibberishcode";
      const parsed = parseReferralQueryParams(url);

      expect(parsed.isRefValid).toBe(false);
      expect(parsed.isValid).toBe(false);
      expect(parsed.error).toBeDefined();
    });
  });

  // =========================================================================
  // ACCEPTANCE CRITERIA 2: Attribution cookie & localStorage persistence
  // =========================================================================
  describe("2. Attribution Cookie Security Directives & 30-Day Expiration", () => {
    it("builds attribution cookie header with SameSite=Lax, Secure, Path=/, and Max-Age=2592000", () => {
      expect(ATTRIBUTION_WINDOW_DAYS).toBe(30);
      const header = buildAttributionCookieHeader("test_cookie", "payload123");

      expect(header).toContain("SameSite=Lax");
      expect(header).toContain("Secure");
      expect(header).toContain("Path=/");
      expect(header).toContain(`Max-Age=${ATTRIBUTION_WINDOW_SECONDS}`);
      expect(ATTRIBUTION_WINDOW_SECONDS).toBe(30 * 24 * 60 * 60); // 2,592,000s = 30 days
      expect(header).toContain("Expires=");
    });

    it("persists attribution simultaneously in cookies and localStorage with 30-day window", () => {
      const now = 1774350000000;
      const payload = {
        refCode: ALICE_CODE,
        parentCode: BOB_CODE,
        referrerAddress: ALICE_WALLET,
        parentAddress: BOB_WALLET,
        campaignId: "camp_stellar_b2c",
        createdAt: now,
      };

      const stored = storeReferralAttribution(payload);

      expect(stored.refCode).toBe(ALICE_CODE);
      expect(stored.parentCode).toBe(BOB_CODE);
      expect(stored.windowDays).toBe(30);
      expect(stored.expiresAt).toBe(now + ATTRIBUTION_WINDOW_MS);

      // Verify localStorage was written
      const rawStorage = storage.getItem(ATTRIBUTION_STORAGE_KEY);
      expect(rawStorage).toBeTruthy();
      const parsedStorage = JSON.parse(rawStorage!);
      expect(parsedStorage.refCode).toBe(ALICE_CODE);
      expect(parsedStorage.parentCode).toBe(BOB_CODE);
      expect(parsedStorage.expiresAt).toBe(now + ATTRIBUTION_WINDOW_MS);

      // Verify cookie was set
      const cookieVal = getAttributionCookie(ATTRIBUTION_COOKIE_NAME);
      expect(cookieVal).toBeTruthy();
      const parsedCookie = JSON.parse(cookieVal!);
      expect(parsedCookie.refCode).toBe(ALICE_CODE);
    });

    it("recovers attribution from cookie fallback if localStorage is lost or unavailable", () => {
      const now = Date.now();
      storeReferralAttribution({
        refCode: ALICE_CODE,
        parentCode: BOB_CODE,
        createdAt: now,
      });

      // Simulate localStorage clear (e.g. storage quota exceeded or cleared by user)
      storage.removeItem(ATTRIBUTION_STORAGE_KEY);

      // Should recover seamlessly from cookie
      const recovered = getStoredReferralAttribution(now);
      expect(recovered).not.toBeNull();
      expect(recovered?.refCode).toBe(ALICE_CODE);
      expect(recovered?.parentCode).toBe(BOB_CODE);
    });

    it("recovers attribution from localStorage if cookies are blocked or empty", () => {
      const now = Date.now();
      storeReferralAttribution({
        refCode: ALICE_CODE,
        createdAt: now,
      });

      // Clear cookie only
      setAttributionCookie(ATTRIBUTION_COOKIE_NAME, "", { maxAge: 0, expires: new Date(0) });

      // Should recover from localStorage
      const recovered = getStoredReferralAttribution(now);
      expect(recovered).not.toBeNull();
      expect(recovered?.refCode).toBe(ALICE_CODE);
    });

    it("clears both cookie and localStorage when clearReferralAttribution is invoked", () => {
      storeReferralAttribution({ refCode: ALICE_CODE });
      expect(getStoredReferralAttribution()).not.toBeNull();

      clearReferralAttribution();

      expect(storage.getItem(ATTRIBUTION_STORAGE_KEY)).toBeNull();
      expect(getStoredReferralAttribution()).toBeNull();
    });
  });

  // =========================================================================
  // ACCEPTANCE CRITERIA 3: Self-referral prevention
  // =========================================================================
  describe("3. Self-Referral Prevention Engine", () => {
    it("detects and rejects direct self-referral when wallet matches referral code", () => {
      const result = validateSelfReferral(ALICE_WALLET, ALICE_WALLET);

      expect(result.allowed).toBe(false);
      expect(result.isSelfReferral).toBe(true);
      expect(result.reason).toContain("Connected user wallet cannot be the direct referral affiliate");
    });

    it("performs case-insensitive self-referral checks on wallet addresses", () => {
      const lowercaseWallet = ALICE_WALLET.toLowerCase();
      const uppercaseWallet = ALICE_WALLET.toUpperCase();

      const result = validateSelfReferral(lowercaseWallet, uppercaseWallet);
      expect(result.allowed).toBe(false);
      expect(result.isSelfReferral).toBe(true);
    });

    it("detects and rejects self-referral when wallet matches resolved code owner", () => {
      const result = validateSelfReferral(ALICE_WALLET, ALICE_CODE, undefined, CODE_OWNER_MAP);

      expect(result.allowed).toBe(false);
      expect(result.isSelfReferral).toBe(true);
      expect(result.reason).toContain("Connected user wallet cannot be the direct referral affiliate");
    });

    it("detects and rejects self-referral when user wallet matches parent recruiter code", () => {
      const result = validateSelfReferral(BOB_WALLET, ALICE_CODE, BOB_CODE, CODE_OWNER_MAP);

      expect(result.allowed).toBe(false);
      expect(result.isSelfReferral).toBe(true);
      expect(result.reason).toContain("Connected user wallet cannot be the parent recruiter affiliate");
    });

    it("rejects circular referral where direct ref code matches parent code", () => {
      const result = validateSelfReferral(CHARLIE_WALLET, ALICE_CODE, ALICE_CODE, CODE_OWNER_MAP);

      expect(result.allowed).toBe(false);
      expect(result.isSelfReferral).toBe(true);
      expect(result.reason).toContain("Direct referral code cannot match parent recruiter code");
    });

    it("permits legitimate third-party referrals when user wallet does not match ref or parent", () => {
      const result = validateSelfReferral(CHARLIE_WALLET, ALICE_CODE, BOB_CODE, CODE_OWNER_MAP);

      expect(result.allowed).toBe(true);
      expect(result.isSelfReferral).toBe(false);
    });

    it("blocks attribution persistence during trackPageTransition if self-referral is detected", () => {
      const url = `https://stormsale.xyz/?ref=${ALICE_CODE}&parent=${BOB_CODE}`;
      const transitionResult = trackPageTransition(url, ALICE_WALLET, CODE_OWNER_MAP);

      expect(transitionResult.success).toBe(false);
      expect(transitionResult.isSelfReferralBlocked).toBe(true);
      expect(transitionResult.attribution).toBeNull();
      // Verify nothing was persisted
      expect(getStoredReferralAttribution()).toBeNull();
    });

    it("invalidates existing attribution if user later connects a conflicting wallet", () => {
      // Step 1: User visits without wallet connected
      const url = `https://stormsale.xyz/?ref=${ALICE_CODE}`;
      const entryResult = trackPageTransition(url, undefined, CODE_OWNER_MAP);
      expect(entryResult.success).toBe(true);
      expect(getStoredReferralAttribution()).not.toBeNull();

      // Step 2: User connects Alice's wallet on checkout
      const checkoutResult = trackPageTransition("https://stormsale.xyz/checkout", ALICE_WALLET, CODE_OWNER_MAP);
      expect(checkoutResult.success).toBe(false);
      expect(checkoutResult.isSelfReferralBlocked).toBe(true);
      // Persistent storage cleared to prevent fraudulent commission
      expect(getStoredReferralAttribution()).toBeNull();
    });
  });

  // =========================================================================
  // ACCEPTANCE CRITERIA 4: Attribution persistence across page transitions
  // =========================================================================
  describe("4. Attribution Persistence Across Client-Side Page Transitions", () => {
    it("maintains attribution across internal client-side navigation without query params", () => {
      const baseTime = 1774350000000;

      // 1. Landing on campaign page with query parameters
      const landingUrl = `https://stormsale.xyz/campaigns/55?ref=${ALICE_CODE}&parent=${BOB_CODE}&utm_source=twitter`;
      const step1 = trackPageTransition(landingUrl, CHARLIE_WALLET, CODE_OWNER_MAP, baseTime);

      expect(step1.success).toBe(true);
      expect(step1.isNewTouch).toBe(true);
      expect(step1.attribution?.refCode).toBe(ALICE_CODE);
      expect(step1.attribution?.parentCode).toBe(BOB_CODE);

      // 2. Client transitions to catalog page (no referral query params)
      const step2 = trackPageTransition("https://stormsale.xyz/catalog", CHARLIE_WALLET, CODE_OWNER_MAP, baseTime + 10000);
      expect(step2.success).toBe(true);
      expect(step2.isPersistentTouch).toBe(true);
      expect(step2.isNewTouch).toBe(false);
      expect(step2.attribution?.refCode).toBe(ALICE_CODE);
      expect(step2.attribution?.parentCode).toBe(BOB_CODE);

      // 3. Client transitions to product details page
      const step3 = trackPageTransition("https://stormsale.xyz/products/sku-992", CHARLIE_WALLET, CODE_OWNER_MAP, baseTime + 60000);
      expect(step3.success).toBe(true);
      expect(step3.attribution?.refCode).toBe(ALICE_CODE);

      // 4. Client transitions to checkout with unrelated params (?step=payment&coupon=SPRING)
      const step4 = trackPageTransition("https://stormsale.xyz/checkout?step=payment&coupon=SPRING", CHARLIE_WALLET, CODE_OWNER_MAP, baseTime + 120000);
      expect(step4.success).toBe(true);
      expect(step4.attribution?.refCode).toBe(ALICE_CODE);
      expect(step4.attribution?.parentCode).toBe(BOB_CODE);
    });

    it("retains attribution within the 30-day window (29 days, 23 hours)", () => {
      const startTime = 1774350000000;
      trackPageTransition(`https://stormsale.xyz/?ref=${ALICE_CODE}`, CHARLIE_WALLET, CODE_OWNER_MAP, startTime);

      // Advance time to 29 days, 23 hours later
      const withinWindowTime = startTime + (29 * 24 * 3600 + 23 * 3600) * 1000;
      const result = trackPageTransition("https://stormsale.xyz/checkout", CHARLIE_WALLET, CODE_OWNER_MAP, withinWindowTime);

      expect(result.success).toBe(true);
      expect(result.attribution?.refCode).toBe(ALICE_CODE);
      expect(result.isExpired).toBe(false);
    });

    it("expires attribution and cleans storage after 30-day attribution window passes", () => {
      const startTime = 1774350000000;
      trackPageTransition(`https://stormsale.xyz/?ref=${ALICE_CODE}`, CHARLIE_WALLET, CODE_OWNER_MAP, startTime);

      // Advance time beyond 30 days (30 days + 1 hour)
      const expiredTime = startTime + (30 * 24 * 3600 + 3600) * 1000;
      const result = trackPageTransition("https://stormsale.xyz/checkout", CHARLIE_WALLET, CODE_OWNER_MAP, expiredTime);

      expect(result.success).toBe(false);
      expect(result.attribution).toBeNull();
      expect(getStoredReferralAttribution(expiredTime)).toBeNull();
    });

    it("allows a subsequent valid referral to overwrite under last-touch attribution", () => {
      const t0 = 1774350000000;
      // First referral from Alice
      trackPageTransition(`https://stormsale.xyz/?ref=${ALICE_CODE}`, CHARLIE_WALLET, CODE_OWNER_MAP, t0);
      expect(getStoredReferralAttribution(t0)?.refCode).toBe(ALICE_CODE);

      // 5 days later, customer clicks Bob's referral link
      const t1 = t0 + 5 * 24 * 3600 * 1000;
      const step2 = trackPageTransition(`https://stormsale.xyz/?ref=${BOB_CODE}`, CHARLIE_WALLET, CODE_OWNER_MAP, t1);

      expect(step2.success).toBe(true);
      expect(step2.attribution?.refCode).toBe(BOB_CODE);
      expect(getStoredReferralAttribution(t1)?.refCode).toBe(BOB_CODE);
    });

    it("cleans referral parameters from browser history without reloads using history.replaceState", () => {
      // Use standard pushState supported natively by JSDOM to set current URL
      window.history.pushState({}, "", `/campaigns/42?ref=${ALICE_CODE}&utm_campaign=winter`);
      expect(window.location.href).toContain(ALICE_CODE);

      const replaceStateSpy = vi.spyOn(window.history, "replaceState");

      const cleaned = cleanReferralParamsFromCurrentUrl();

      expect(replaceStateSpy).toHaveBeenCalledWith(
        {},
        document.title,
        "/campaigns/42?utm_campaign=winter",
      );
      expect(cleaned).toContain("/campaigns/42?utm_campaign=winter");
      expect(cleaned).not.toContain("ref=");

      replaceStateSpy.mockRestore();
    });
  });
});
