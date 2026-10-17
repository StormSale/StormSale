import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getCampaignGeoRestriction,
  getCampaignGeoRestrictionForAddress,
  isCountryAllowed,
  resolveClientCountryCode,
  saveCampaignGeoRestriction,
  type CampaignGeoRestriction,
} from "./geoTargeting";

describe("campaign geo-targeting", () => {
  const storage = new Map<string, string>();

  beforeEach(() => {
    storage.clear();
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => storage.set(key, value),
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("persists country restrictions and jurisdictional tags by campaign", () => {
    const restriction = saveCampaignGeoRestriction("campaign-1", "CCAMPAIGN123", "allowlist", [
      "US",
      "CA",
    ]);

    expect(restriction.campaignAddress).toBe("CCAMPAIGN123");
    expect(restriction.jurisdictionalTags).toEqual(["allowlist", "country:US", "country:CA"]);
    expect(getCampaignGeoRestriction("campaign-1")).toEqual(restriction);
    expect(getCampaignGeoRestrictionForAddress("ccampaign123")).toEqual(restriction);
  });

  it("requires at least one country in allowlist mode", () => {
    expect(() => saveCampaignGeoRestriction("campaign-1", "CCAMPAIGN123", "allowlist", [])).toThrow(
      "Select at least one allowed country",
    );
  });

  it("accepts or rejects conversions according to allowlist and blocklist settings", () => {
    const allowedCountries: CampaignGeoRestriction = {
      campaignAddress: "CCAMPAIGN123",
      mode: "allowlist",
      countries: ["US"],
      jurisdictionalTags: [],
    };
    const blockedCountries: CampaignGeoRestriction = {
      ...allowedCountries,
      mode: "blocklist",
    };

    expect(isCountryAllowed("US", allowedCountries)).toBe(true);
    expect(isCountryAllowed("CA", allowedCountries)).toBe(false);
    expect(isCountryAllowed("US", blockedCountries)).toBe(false);
    expect(isCountryAllowed("CA", blockedCountries)).toBe(true);
  });

  it("requires a valid country response from the first-party geo endpoint", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ countryCode: "us" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );
    await expect(resolveClientCountryCode()).resolves.toBe("US");
  });

  it("fails closed if geographic verification is unavailable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    await expect(resolveClientCountryCode()).rejects.toThrow("offline");
  });
});
