// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import {
  recordReferralClick,
  evaluateAttribution,
  clearAttribution,
  getStoredClicks,
  ATTR_STORAGE_KEY,
} from "../lib/attributionEngine";

describe("attributionEngine (#151)", () => {
  beforeEach(() => {
    localStorage.clear();
    clearAttribution();
  });

  const CAMPAIGN = "101";
  const AFFILIATE_A = "GA7QW5KXGPTR4N2K9J2M3N4P5Q6R7S8T9U0V1W2X3Y4Z5A6B7C8D";
  const AFFILIATE_B = "GB4RN8XJLP8M1K3V6P7Q8R9S0T1U2V3W4X5Y6Z7A8B9C0D1E2F3G";

  it("records referral click in encrypted localStorage with fallback", () => {
    recordReferralClick(CAMPAIGN, AFFILIATE_A, "last_click", 1000);
    const stored = getStoredClicks();
    expect(stored[CAMPAIGN]).toBeDefined();
    expect(stored[CAMPAIGN].affiliateAddress).toBe(AFFILIATE_A);
    expect(stored[CAMPAIGN].clickTimestamp).toBe(1000);

    // Verify localStorage key is populated and obfuscated (not plaintext JSON)
    const raw = localStorage.getItem(ATTR_STORAGE_KEY);
    expect(raw).toBeTruthy();
    expect(raw?.startsWith("{")).toBe(false);
  });

  it("handles First-Click model: preserves initial referrer click", () => {
    // First click from Affiliate A at t = 100
    recordReferralClick(CAMPAIGN, AFFILIATE_A, "first_click", 100);
    // Subsequent click from Affiliate B at t = 200
    recordReferralClick(CAMPAIGN, AFFILIATE_B, "first_click", 200);

    const stored = getStoredClicks();
    expect(stored[CAMPAIGN].affiliateAddress).toBe(AFFILIATE_A);
    expect(stored[CAMPAIGN].clickTimestamp).toBe(100);
  });

  it("handles Last-Click model: updates to the most recent referrer", () => {
    // First click from Affiliate A at t = 100
    recordReferralClick(CAMPAIGN, AFFILIATE_A, "last_click", 100);
    // Subsequent click from Affiliate B at t = 200
    recordReferralClick(CAMPAIGN, AFFILIATE_B, "last_click", 200);

    const stored = getStoredClicks();
    expect(stored[CAMPAIGN].affiliateAddress).toBe(AFFILIATE_B);
    expect(stored[CAMPAIGN].clickTimestamp).toBe(200);
  });

  it("attributes conversion when within attribution window (e.g. 30 days)", () => {
    const clickTime = 1000000;
    recordReferralClick(CAMPAIGN, AFFILIATE_A, "last_click", clickTime);

    // Conversion happens 10 days later (10 * 86400 = 864,000 seconds)
    const conversionTime = clickTime + 10 * 86400;
    const result = evaluateAttribution(CAMPAIGN, 30, "last_click", conversionTime);

    expect(result.attributedAffiliate).toBe(AFFILIATE_A);
    expect(result.isUncommissioned).toBe(false);
    expect(result.expired).toBe(false);
  });

  it("treats conversion beyond attribution window as direct uncommissioned sale", () => {
    const clickTime = 1000000;
    recordReferralClick(CAMPAIGN, AFFILIATE_A, "last_click", clickTime);

    // Conversion happens 31 days later for a 30-day window (31 * 86400 = 2,678,400s)
    const conversionTime = clickTime + 31 * 86400;
    const result = evaluateAttribution(CAMPAIGN, 30, "last_click", conversionTime);

    expect(result.attributedAffiliate).toBeNull();
    expect(result.isUncommissioned).toBe(true);
    expect(result.expired).toBe(true);
    expect(result.reason).toContain("Attribution window expired");
  });

  it("treats conversions with no prior click as direct uncommissioned sale", () => {
    const result = evaluateAttribution("untracked_campaign", 7, "last_click", 5000);
    expect(result.attributedAffiliate).toBeNull();
    expect(result.isUncommissioned).toBe(true);
    expect(result.reason).toContain("No referral click recorded");
  });

  it("supports configurable window sizes (1, 7, 30, 60 days)", () => {
    const clickTime = 1000000;
    recordReferralClick(CAMPAIGN, AFFILIATE_A, "last_click", clickTime);

    // 2 days after click:
    // Expired for 1-day window:
    const res1d = evaluateAttribution(CAMPAIGN, 1, "last_click", clickTime + 2 * 86400);
    expect(res1d.isUncommissioned).toBe(true);
    expect(res1d.expired).toBe(true);

    // Valid for 7-day window:
    const res7d = evaluateAttribution(CAMPAIGN, 7, "last_click", clickTime + 2 * 86400);
    expect(res7d.isUncommissioned).toBe(false);
    expect(res7d.attributedAffiliate).toBe(AFFILIATE_A);
  });
});
