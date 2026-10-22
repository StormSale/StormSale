import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  buildCampaignSettings,
  saveCampaignSettings,
  loadCampaignSettings,
  parseCampaignId,
  resolveSettingsCampaignId,
} from "../lib/campaignSettings";
import { positiveIntSchema } from "../lib/validation";
import { isValidStellarAddress } from "../lib/stellar";
import {
  attributeConversion,
  clearAttributionClicks,
  recordAttributionClick,
  type ClickRecord,
} from "../lib/attribution";

// Real identifiers: both are base-32 StrKey values that routinely contain digit
// runs, which is exactly what made the old unanchored parseCampaignId resolve an
// unrelated campaign's settings.
const CONTRACT_ADDRESS = "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC";
const ACCOUNT_ADDRESS = "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN";

const AFFILIATE = ACCOUNT_ADDRESS;
const BASE = 1700000000; // unix seconds anchor
const DAY = 86400;

const makeClick = (overrides: Partial<ClickRecord> = {}): ClickRecord => ({
  clickId: overrides.clickId || "click_1",
  affiliateId: overrides.affiliateId || AFFILIATE,
  campaignId: overrides.campaignId ?? 4567,
  timestamp: overrides.timestamp ?? BASE,
  landingUrl: overrides.landingUrl,
});

describe("Sale logging resolves campaign settings by explicit campaign ID (#151)", () => {
  describe("parseCampaignId can no longer harvest digits out of a StrKey value", () => {
    it("still accepts the bare numeric and Campaign #N forms", () => {
      expect(parseCampaignId("Campaign #1234")).toBe(1234);
      expect(parseCampaignId("777")).toBe(777);
      expect(parseCampaignId("no digits here")).toBeNull();
    });

    it("returns null for a Soroban contract ID and a Stellar public key", () => {
      expect(parseCampaignId(CONTRACT_ADDRESS)).toBeNull();
      expect(parseCampaignId(ACCOUNT_ADDRESS)).toBeNull();
      // The old unanchored /#?(\d{1,9})/ returned 3 and 5 for these respectively.
      expect(parseCampaignId(CONTRACT_ADDRESS)).not.toBe(3);
      expect(parseCampaignId(ACCOUNT_ADDRESS)).not.toBe(5);
    });

    it("rejects identifiers that merely start with digits or exceed 9 digits", () => {
      expect(parseCampaignId("1234abc")).toBeNull();
      expect(parseCampaignId("Campaign #1234567890")).toBeNull();
      expect(parseCampaignId("")).toBeNull();
    });
  });

  describe("resolveSettingsCampaignId requires the numeric campaign ID", () => {
    it("accepts only a bare positive integer id, tolerating surrounding spaces", () => {
      expect(resolveSettingsCampaignId("4567")).toBe(4567);
      expect(resolveSettingsCampaignId("  4567  ")).toBe(4567);
      expect(resolveSettingsCampaignId("1")).toBe(1);
    });

    it("returns null for missing, non-numeric, non-positive, or address-shaped input", () => {
      expect(resolveSettingsCampaignId("")).toBeNull();
      expect(resolveSettingsCampaignId(undefined)).toBeNull();
      expect(resolveSettingsCampaignId("0")).toBeNull();
      expect(resolveSettingsCampaignId("-7")).toBeNull();
      expect(resolveSettingsCampaignId("1.5")).toBeNull();
      expect(resolveSettingsCampaignId("abc")).toBeNull();
      expect(resolveSettingsCampaignId(CONTRACT_ADDRESS)).toBeNull();
      expect(resolveSettingsCampaignId(ACCOUNT_ADDRESS)).toBeNull();
      // The settings resolver is stricter than the friendly label parser.
      expect(resolveSettingsCampaignId("Campaign #4567")).toBeNull();
    });

    it("agrees with the form's positiveIntSchema on what counts as an ID", () => {
      const invalid = ["", "abc", "0", "-7", "1.5", CONTRACT_ADDRESS];
      for (const value of invalid) {
        expect(positiveIntSchema.safeParse(value).success).toBe(false);
        expect(resolveSettingsCampaignId(value)).toBeNull();
      }
      expect(positiveIntSchema.safeParse("4567").success).toBe(true);
      expect(resolveSettingsCampaignId("4567")).toBe(4567);
    });
  });

  describe("Stellar keys are validated before they reach the contract", () => {
    it("accepts well-formed G… and C… values and rejects everything else", () => {
      expect(isValidStellarAddress(CONTRACT_ADDRESS)).toBe(true);
      expect(isValidStellarAddress(ACCOUNT_ADDRESS)).toBe(true);
      expect(isValidStellarAddress("campaign-1234")).toBe(false);
      expect(isValidStellarAddress("CDLZFC3")).toBe(false);
      expect(isValidStellarAddress("")).toBe(false);
    });
  });

  describe("The attribution gate is keyed by the entered ID, never by the address", () => {
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

    afterEach(async () => {
      await clearAttributionClicks();
      vi.unstubAllGlobals();
    });

    it("does not resolve any settings from the campaign address", () => {
      saveCampaignSettings(
        buildCampaignSettings(3, {
          campaignName: "Unrelated Campaign",
          attributionModel: "first_click",
          attributionWindowDays: 1,
        }),
      );

      // The address used to be parsed into `3`, hijacking this unrelated record.
      const fromAddress = parseCampaignId(CONTRACT_ADDRESS);
      expect(fromAddress).toBeNull();
      expect(fromAddress === null ? null : loadCampaignSettings(fromAddress)).toBeNull();

      expect(resolveSettingsCampaignId(CONTRACT_ADDRESS)).toBeNull();
      expect(loadCampaignSettings(3)).not.toBeNull();
    });

    it("applies the attribution gate when the entered ID finds the settings record", async () => {
      saveCampaignSettings(
        buildCampaignSettings(4567, {
          campaignName: "Summer Sale",
          attributionModel: "first_click",
          attributionWindowDays: 1,
        }),
      );

      const settingsCampaignId = resolveSettingsCampaignId("4567");
      expect(settingsCampaignId).toBe(4567);
      const campaignSettings = loadCampaignSettings(settingsCampaignId!);
      expect(campaignSettings).not.toBeNull();
      expect(campaignSettings!.attribution).toEqual({ model: "first_click", windowDays: 1 });

      // Empty vault: the gate engages and the sale is a direct, uncommissioned one.
      const noClick = await attributeConversion(
        campaignSettings!.campaignId,
        AFFILIATE,
        BASE + DAY,
        campaignSettings!.attribution,
        AFFILIATE,
      );
      expect(noClick.attributed).toBe(false);
      expect(noClick.reason).toBe("no_referral_click");

      // Click inside the 1-day window: the same settings now authorise the sale.
      await recordAttributionClick(
        makeClick({ affiliateId: AFFILIATE, campaignId: 4567, timestamp: BASE }),
        AFFILIATE,
      );
      const withClick = await attributeConversion(
        campaignSettings!.campaignId,
        AFFILIATE,
        BASE + DAY,
        campaignSettings!.attribution,
        AFFILIATE,
      );
      expect(withClick.attributed).toBe(true);
      expect(withClick.click?.campaignId).toBe(4567);

      // Outside the window: expired, so the commission is withheld.
      const expired = await attributeConversion(
        campaignSettings!.campaignId,
        AFFILIATE,
        BASE + 2 * DAY,
        campaignSettings!.attribution,
        AFFILIATE,
      );
      expect(expired.attributed).toBe(false);
      expect(expired.reason).toBe("window_expired");
    });

    it("leaves the sale ungated when no settings record exists for the entered ID", () => {
      expect(resolveSettingsCampaignId("999999")).toBe(999999);
      expect(loadCampaignSettings(999999)).toBeNull();
    });
  });
});
