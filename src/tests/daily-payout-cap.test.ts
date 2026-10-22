import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  validateDailyPayoutCap,
  evaluateRollingQuota,
  isClaimWithinCap,
  appendClaimEvent,
  loadClaimEvents,
  claimsForAffiliate,
  formatQuotaLabel,
  ROLLING_WINDOW_SECONDS,
  type AffiliateClaimEvent,
} from "../lib/payoutCap";
import {
  buildCampaignSettings,
  defaultExtendedSettings,
  saveCampaignSettings,
  loadCampaignSettings,
  parseCampaignId,
} from "../lib/campaignSettings";

const NOW = 1760000000; // unix seconds
const HOUR = 3600;

const claim = (hoursAgo: number, amountXlm: number, campaignId = 101): AffiliateClaimEvent => ({
  campaignId,
  timestamp: NOW - hoursAgo * HOUR,
  amountXlm,
});

describe("Custom Commission Payout Caps per Affiliate per 24h (#156)", () => {
  describe("Cap configuration", () => {
    it("treats empty input as no cap and rejects non-positive amounts", () => {
      expect(validateDailyPayoutCap("")).toEqual({ valid: true, capXlm: null });
      expect(validateDailyPayoutCap(undefined).capXlm).toBeNull();
      expect(validateDailyPayoutCap("1000")).toEqual({ valid: true, capXlm: 1000 });
      expect(validateDailyPayoutCap("12.5").capXlm).toBe(12.5);
      expect(validateDailyPayoutCap("-5").valid).toBe(false);
      expect(validateDailyPayoutCap("0").valid).toBe(false);
      expect(validateDailyPayoutCap("abc").valid).toBe(false);
    });

    it("parses campaign ids from advertiser free-form identifiers", () => {
      expect(parseCampaignId("Campaign #1234")).toBe(1234);
      expect(parseCampaignId("777")).toBe(777);
      expect(parseCampaignId("no digits here")).toBeNull();
    });
  });

  describe("Rolling 24-hour quota evaluation", () => {
    it("sums only claims inside the rolling window and reports remaining quota", () => {
      const events = [claim(26, 50), claim(10, 60), claim(2, 30)];
      const quota = evaluateRollingQuota(events, NOW, 100);
      expect(quota.usedInWindowXlm).toBe(90); // 26h-old claim aged out
      expect(quota.remainingQuotaXlm).toBe(10);
      expect(quota.windowClaimCount).toBe(2);
      expect(quota.capped).toBe(false);
    });

    it("flags the affiliate as capped once the daily quota is exhausted", () => {
      const events = [claim(5, 70), claim(1, 30)];
      const quota = evaluateRollingQuota(events, NOW, 100);
      expect(quota.usedInWindowXlm).toBe(100);
      expect(quota.remainingQuotaXlm).toBe(0);
      expect(quota.capped).toBe(true);
      // Oldest in-window claim (5h ago) frees the window in 19 more hours
      expect(quota.resetsAt).toBe(NOW - 5 * HOUR + ROLLING_WINDOW_SECONDS);
      expect(quota.nextResetSeconds).toBe(19 * HOUR);
      expect(quota.resetCountdownText).toBe("19h 0m 0s");
    });

    it("avoids float drift when accumulating basket amounts", () => {
      const events = [claim(3, 0.1), claim(2, 0.2)];
      const quota = evaluateRollingQuota(events, NOW, 0.3);
      expect(quota.usedInWindowXlm).toBe(0.3);
      expect(quota.capped).toBe(true);
    });

    it("returns unlimited status when the campaign defines no cap", () => {
      const quota = evaluateRollingQuota([claim(1, 500)], NOW, null);
      expect(quota.capXlm).toBeNull();
      expect(quota.capped).toBe(false);
      expect(quota.remainingQuotaXlm).toBe(Number.POSITIVE_INFINITY);
      expect(quota.resetsAt).toBeNull();
    });

    it("ignores future-dated events", () => {
      const events = [claim(-5, 999), claim(1, 40)];
      const quota = evaluateRollingQuota(events, NOW, 100);
      expect(quota.usedInWindowXlm).toBe(40);
    });
  });

  describe("Pre-sign claim verification", () => {
    it("allows claims that fit the remaining quota and blocks over-cap claims", () => {
      const events = [claim(4, 60)];
      expect(isClaimWithinCap(events, NOW, 100, 40)).toBe(true);
      expect(isClaimWithinCap(events, NOW, 100, 40.01)).toBe(false);
      expect(isClaimWithinCap(events, NOW, 100, 100)).toBe(false);
      expect(isClaimWithinCap([], NOW, 100, 100)).toBe(true);
      expect(isClaimWithinCap(events, NOW, null, 5000)).toBe(true);
      expect(isClaimWithinCap(events, NOW, 100, Number.NaN)).toBe(false);
    });

    it("unblocks claiming as soon as an old claim slides out of the window", () => {
      const events = [claim(23.9, 100)];
      expect(isClaimWithinCap(events, NOW, 100, 1)).toBe(false);
      const later = NOW + 0.2 * HOUR; // now 24.1h after the claim
      expect(isClaimWithinCap(events, later, 100, 100)).toBe(true);
    });
  });

  describe("Claim ledger persistence & UI quota labels", () => {
    let store: Record<string, string>;

    beforeEach(() => {
      store = {};
      vi.stubGlobal("window", {});
      vi.stubGlobal("localStorage", {
        getItem: (key: string) => store[key] ?? null,
        setItem: (key: string, value: string) => {
          store[key] = value;
        },
        removeItem: (key: string) => {
          delete store[key];
        },
      });
    });

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it("persists settled claims across reloads for rolling-window checks", () => {
      appendClaimEvent(claim(1, 45));
      appendClaimEvent(claim(2, 30));
      const reloaded = loadClaimEvents();
      expect(reloaded.length).toBe(2);
      expect(reloaded.reduce((s, e) => s + e.amountXlm, 0)).toBe(75);
    });

    it("survives corrupted persisted ledgers", () => {
      store["stormsale_affiliate_claim_log_v1"] = "{not json";
      expect(loadClaimEvents()).toEqual([]);
    });

    it("keys claim history by affiliate so a switched wallet keeps its own quota", () => {
      const walletA = "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN";
      const walletB = "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5";

      appendClaimEvent({ ...claim(1, 90), affiliateAddress: walletA });

      const ledger = loadClaimEvents();
      expect(ledger[0].affiliateAddress).toBe(walletA);
      expect(claimsForAffiliate(ledger, 101, walletA).length).toBe(1);
      // Wallet B shares this browser but must not inherit wallet A's usage.
      expect(claimsForAffiliate(ledger, 101, walletB)).toEqual([]);
      expect(
        evaluateRollingQuota(claimsForAffiliate(ledger, 101, walletB), NOW, 100).remainingQuotaXlm,
      ).toBe(100);
      expect(
        evaluateRollingQuota(claimsForAffiliate(ledger, 101, walletA), NOW, 100).remainingQuotaXlm,
      ).toBe(10);

      // Legacy entries written before the ledger carried an affiliate key have no
      // owner to attribute, so they still count instead of freeing quota.
      const legacy = claim(1, 20);
      expect(claimsForAffiliate([legacy], 101, walletB)).toEqual([legacy]);
      expect(claimsForAffiliate([legacy], 101, null)).toEqual([legacy]);
      // Filtering is per campaign as well as per affiliate.
      expect(claimsForAffiliate(ledger, 777, walletA)).toEqual([]);
    });

    it("formats affiliate-facing quota notices with reset countdown", () => {
      const capped = evaluateRollingQuota([claim(1, 100)], NOW, 100);
      expect(formatQuotaLabel(capped)).toContain("Daily cap reached");
      expect(formatQuotaLabel(capped)).toContain("resets in 23h");

      const open = evaluateRollingQuota([claim(1, 40)], NOW, 100);
      expect(formatQuotaLabel(open)).toBe("60.00 of 100 XLM daily quota remaining");

      expect(formatQuotaLabel(evaluateRollingQuota([], NOW, null))).toBe(
        "No daily payout cap on this campaign",
      );
    });

    it("anchors extended campaign parameters (cap, attribution, split) per campaign id", () => {
      const settings = buildCampaignSettings(4567, {
        campaignName: "Summer Sale",
        attributionModel: "first_click",
        attributionWindowDays: 60,
        dailyPayoutCapInput: "1000",
      });
      saveCampaignSettings(settings);
      const loaded = loadCampaignSettings(4567);
      expect(loaded?.dailyPayoutCapXlm).toBe(1000);
      expect(loaded?.attribution).toEqual({ model: "first_click", windowDays: 60 });

      const invalidCap = buildCampaignSettings(4568, {
        campaignName: "Bad Cap",
        dailyPayoutCapInput: "-1",
      });
      expect(invalidCap.dailyPayoutCapXlm).toBeNull();
    });

    it("defaults unknown campaigns to no cap and Last-Click 30d attribution", () => {
      expect(loadCampaignSettings(999999)).toBeNull();
      const fallback = defaultExtendedSettings(1, "Default");
      expect(fallback.dailyPayoutCapXlm).toBeNull();
      expect(fallback.attribution).toEqual({ model: "last_click", windowDays: 30 });
      expect(fallback.landingSplit.enabled).toBe(false);
    });
  });
});
