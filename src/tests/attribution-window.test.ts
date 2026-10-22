import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  isValidAttributionWindow,
  normalizeAttributionSettings,
  isWithinAttributionWindow,
  resolveAttribution,
  calculateAttributionCountdown,
  deriveVaultKey,
  encryptClickLog,
  decryptClickLog,
  recordAttributionClick,
  readAttributionClicks,
  attributeConversion,
  type ClickRecord,
} from "../lib/attribution";

const BASE = 1700000000; // unix seconds anchor
const DAY = 86400;

const makeClick = (overrides: Partial<ClickRecord> = {}): ClickRecord => ({
  clickId: overrides.clickId || "click_1",
  affiliateId: overrides.affiliateId || "GAFFILIATE7TEST7CLICK7TRACKING7ABC7DEF7GHI7JKL7MN",
  campaignId: overrides.campaignId ?? 101,
  timestamp: overrides.timestamp ?? BASE,
  landingUrl: overrides.landingUrl,
});

describe("Real-Time Attribution Window Calculator (#151)", () => {
  describe("Window configuration", () => {
    it("accepts only the supported window presets 1, 7, 30, 60 days", () => {
      expect(isValidAttributionWindow(1)).toBe(true);
      expect(isValidAttributionWindow(7)).toBe(true);
      expect(isValidAttributionWindow(30)).toBe(true);
      expect(isValidAttributionWindow(60)).toBe(true);
      expect(isValidAttributionWindow(14)).toBe(false);
      expect(isValidAttributionWindow(0)).toBe(false);
      expect(isValidAttributionWindow(-1)).toBe(false);
    });

    it("falls back to Last-Click / 30 days for invalid settings input", () => {
      expect(normalizeAttributionSettings({ model: "first_click", windowDays: 7 })).toEqual({
        model: "first_click",
        windowDays: 7,
      });
      expect(normalizeAttributionSettings({ windowDays: 13 })).toEqual({
        model: "last_click",
        windowDays: 30,
      });
      expect(normalizeAttributionSettings()).toEqual({ model: "last_click", windowDays: 30 });
    });

    it("treats the exact expiry instant as still inside the window", () => {
      const click = makeClick({ timestamp: BASE });
      expect(isWithinAttributionWindow(click, BASE + 7 * DAY, 7)).toBe(true);
      expect(isWithinAttributionWindow(click, BASE + 7 * DAY + 1, 7)).toBe(false);
      expect(isWithinAttributionWindow(click, BASE - 1, 7)).toBe(false);
    });
  });

  describe("First-Click vs Last-Click resolution", () => {
    const older = makeClick({ clickId: "c_old", timestamp: BASE });
    const newer = makeClick({ clickId: "c_new", timestamp: BASE + 2 * DAY });

    it("last-click credits the most recent click still inside its window", () => {
      const result = resolveAttribution([older, newer], BASE + 3 * DAY, {
        model: "last_click",
        windowDays: 7,
      });
      expect(result.attributed).toBe(true);
      expect(result.click?.clickId).toBe("c_new");
      expect(result.reason).toBe("attributed");
    });

    it("first-click credits the earliest touch", () => {
      const result = resolveAttribution([newer, older], BASE + 3 * DAY, {
        model: "first_click",
        windowDays: 7,
      });
      expect(result.attributed).toBe(true);
      expect(result.click?.clickId).toBe("c_old");
    });

    it("first-click converts to a direct sale once the first touch expires", () => {
      const result = resolveAttribution([older, newer], BASE + 40 * DAY, {
        model: "first_click",
        windowDays: 30,
      });
      expect(result.attributed).toBe(false);
      expect(result.reason).toBe("window_expired");
      expect(result.click).toBeNull();
    });

    it("marks conversions beyond the window as uncommissioned (window_expired)", () => {
      const result = resolveAttribution([older, newer], BASE + 60 * DAY, {
        model: "last_click",
        windowDays: 30,
      });
      expect(result.attributed).toBe(false);
      expect(result.reason).toBe("window_expired");
    });

    it("marks sales without any tracked click as no_referral_click", () => {
      const result = resolveAttribution([], BASE + DAY, { model: "last_click", windowDays: 30 });
      expect(result.attributed).toBe(false);
      expect(result.reason).toBe("no_referral_click");
    });

    it("last-click skips expired newer clicks and falls back to older in-window clicks", () => {
      const stale = makeClick({ clickId: "c_stale", timestamp: BASE });
      const fresh = makeClick({ clickId: "c_fresh", timestamp: BASE + 25 * DAY });
      // sale at day 31: stale click (day 0 + 30d window) expired,
      // fresh click (day 25 + 30d) still inside its window
      const result = resolveAttribution([stale, fresh], BASE + 31 * DAY, {
        model: "last_click",
        windowDays: 30,
      });
      // Note: shared window applies per click; stale expired at day 7, fresh expires day 55
      expect(result.attributed).toBe(true);
      expect(result.click?.clickId).toBe("c_fresh");
    });
  });

  describe("Real-time countdown", () => {
    it("counts down remaining window time without going negative", () => {
      const click = makeClick({ timestamp: BASE });
      const mid = calculateAttributionCountdown(click, 30, BASE + 15 * DAY);
      expect(mid.remainingSeconds).toBe(15 * DAY);
      expect(mid.isExpired).toBe(false);
      expect(mid.countdownText).toBe("15d 0h 0m");

      const past = calculateAttributionCountdown(click, 30, BASE + 40 * DAY);
      expect(past.remainingSeconds).toBe(0);
      expect(past.isExpired).toBe(true);
    });
  });

  describe("Encrypted localStorage vault with cookie fallback", () => {
    let store: Record<string, string>;
    let cookieJar: string;

    beforeEach(() => {
      store = {};
      cookieJar = "";
      vi.stubGlobal("localStorage", {
        getItem: (key: string) => store[key] ?? null,
        setItem: (key: string, value: string) => {
          store[key] = value;
        },
        removeItem: (key: string) => {
          delete store[key];
        },
      });
      vi.stubGlobal("document", {
        get cookie() {
          return cookieJar;
        },
        set cookie(value: string) {
          cookieJar = value;
        },
      });
    });

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it("round-trips the click log through AES-GCM encryption", async () => {
      const key = await deriveVaultKey("GDEVICE7SECRET7AAA");
      const clicks = [makeClick(), makeClick({ clickId: "click_2", timestamp: BASE + 100 })];
      const payload = await encryptClickLog(clicks, key);
      expect(payload).not.toContain(clicks[0].affiliateId);
      const restored = await decryptClickLog(payload, key);
      expect(restored.map((c) => c.clickId)).toEqual(["click_1", "click_2"]);
    });

    it("records clicks into localStorage without leaking plaintext identifiers", async () => {
      const source = await recordAttributionClick(makeClick(), "GDEVICE7SECRET7AAA");
      expect(source).toBe("local_storage");
      const raw = Object.values(store).join("");
      expect(raw).not.toContain("GAFFILIATE7TEST7CLICK7TRACKING");
      const clicks = await readAttributionClicks("GDEVICE7SECRET7AAA");
      expect(clicks.length).toBe(1);
    });

    it("falls back to an encrypted first-party cookie when localStorage writes fail", async () => {
      vi.stubGlobal("localStorage", {
        getItem: () => {
          throw new Error("Storage blocked");
        },
        setItem: () => {
          throw new Error("Quota exceeded");
        },
        removeItem: () => {},
      });

      const click = makeClick({ clickId: "cookie_click" });
      const source = await recordAttributionClick(click, "GDEVICE7SECRET7BBB");
      expect(source).toBe("cookie");
      expect(cookieJar).toContain("stormsale_attribution_clicks_v1");
      expect(cookieJar).not.toContain("cookie_click");

      const restored = await readAttributionClicks("GDEVICE7SECRET7BBB");
      expect(restored.length).toBe(1);
      expect(restored[0].clickId).toBe("cookie_click");
    });

    it("returns an empty vault when the decryption key does not match", async () => {
      await recordAttributionClick(makeClick(), "GDEVICE7SECRET7AAA");
      const intruder = await readAttributionClicks("GDIFFERENT7DEVICE7KEY");
      expect(intruder).toEqual([]);
    });

    it("attributeConversion filters vault clicks by campaign and affiliate", async () => {
      const affiliate = "GAFFILIATE7TEST7CLICK7TRACKING7ABC7DEF7GHI7JKL7MN";
      await recordAttributionClick(
        makeClick({ affiliateId: affiliate, campaignId: 101 }),
        affiliate,
      );
      await recordAttributionClick(
        makeClick({ clickId: "other", affiliateId: "GOTHER7AFFILIATE7AAA", campaignId: 101 }),
        affiliate,
      );

      const result = await attributeConversion(
        101,
        affiliate,
        BASE + DAY,
        { model: "last_click", windowDays: 7 },
        affiliate,
      );
      expect(result.attributed).toBe(true);
      expect(result.click?.affiliateId).toBe(affiliate);

      const wrongCampaign = await attributeConversion(
        999,
        affiliate,
        BASE + DAY,
        { model: "last_click", windowDays: 7 },
        affiliate,
      );
      expect(wrongCampaign.reason).toBe("no_referral_click");
    });
  });
});
