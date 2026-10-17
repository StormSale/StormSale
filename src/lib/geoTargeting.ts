import { API_URL } from "../utils/api";

export const COUNTRY_CODES = [
  "AD",
  "AE",
  "AF",
  "AG",
  "AI",
  "AL",
  "AM",
  "AO",
  "AQ",
  "AR",
  "AS",
  "AT",
  "AU",
  "AW",
  "AX",
  "AZ",
  "BA",
  "BB",
  "BD",
  "BE",
  "BF",
  "BG",
  "BH",
  "BI",
  "BJ",
  "BL",
  "BM",
  "BN",
  "BO",
  "BQ",
  "BR",
  "BS",
  "BT",
  "BV",
  "BW",
  "BY",
  "BZ",
  "CA",
  "CC",
  "CD",
  "CF",
  "CG",
  "CH",
  "CI",
  "CK",
  "CL",
  "CM",
  "CN",
  "CO",
  "CR",
  "CU",
  "CV",
  "CW",
  "CX",
  "CY",
  "CZ",
  "DE",
  "DJ",
  "DK",
  "DM",
  "DO",
  "DZ",
  "EC",
  "EE",
  "EG",
  "EH",
  "ER",
  "ES",
  "ET",
  "FI",
  "FJ",
  "FK",
  "FM",
  "FO",
  "FR",
  "GA",
  "GB",
  "GD",
  "GE",
  "GF",
  "GG",
  "GH",
  "GI",
  "GL",
  "GM",
  "GN",
  "GP",
  "GQ",
  "GR",
  "GS",
  "GT",
  "GU",
  "GW",
  "GY",
  "HK",
  "HM",
  "HN",
  "HR",
  "HT",
  "HU",
  "ID",
  "IE",
  "IL",
  "IM",
  "IN",
  "IO",
  "IQ",
  "IR",
  "IS",
  "IT",
  "JE",
  "JM",
  "JO",
  "JP",
  "KE",
  "KG",
  "KH",
  "KI",
  "KM",
  "KN",
  "KP",
  "KR",
  "KW",
  "KY",
  "KZ",
  "LA",
  "LB",
  "LC",
  "LI",
  "LK",
  "LR",
  "LS",
  "LT",
  "LU",
  "LV",
  "LY",
  "MA",
  "MC",
  "MD",
  "ME",
  "MF",
  "MG",
  "MH",
  "MK",
  "ML",
  "MM",
  "MN",
  "MO",
  "MP",
  "MQ",
  "MR",
  "MS",
  "MT",
  "MU",
  "MV",
  "MW",
  "MX",
  "MY",
  "MZ",
  "NA",
  "NC",
  "NE",
  "NF",
  "NG",
  "NI",
  "NL",
  "NO",
  "NP",
  "NR",
  "NU",
  "NZ",
  "OM",
  "PA",
  "PE",
  "PF",
  "PG",
  "PH",
  "PK",
  "PL",
  "PM",
  "PN",
  "PR",
  "PS",
  "PT",
  "PW",
  "PY",
  "QA",
  "RE",
  "RO",
  "RS",
  "RU",
  "RW",
  "SA",
  "SB",
  "SC",
  "SD",
  "SE",
  "SG",
  "SH",
  "SI",
  "SJ",
  "SK",
  "SL",
  "SM",
  "SN",
  "SO",
  "SR",
  "SS",
  "ST",
  "SV",
  "SX",
  "SY",
  "SZ",
  "TC",
  "TD",
  "TF",
  "TG",
  "TH",
  "TJ",
  "TK",
  "TL",
  "TM",
  "TN",
  "TO",
  "TR",
  "TT",
  "TV",
  "TW",
  "TZ",
  "UA",
  "UG",
  "UM",
  "US",
  "UY",
  "UZ",
  "VA",
  "VC",
  "VE",
  "VG",
  "VI",
  "VN",
  "VU",
  "WF",
  "WS",
  "YE",
  "YT",
  "ZA",
  "ZM",
  "ZW",
] as const;

export type CountryCode = (typeof COUNTRY_CODES)[number];
export type GeoRestrictionMode = "allowlist" | "blocklist";

export interface CampaignGeoRestriction {
  campaignAddress: string;
  mode: GeoRestrictionMode;
  countries: CountryCode[];
  jurisdictionalTags: string[];
}

const GEO_RESTRICTIONS_KEY = "stormsale.campaignGeoRestrictions";
const countryCodeSet = new Set<string>(COUNTRY_CODES);

export const getCountryName = (countryCode: CountryCode): string =>
  new Intl.DisplayNames(["en"], { type: "region" }).of(countryCode) ?? countryCode;

export const isCountryCode = (value: unknown): value is CountryCode =>
  typeof value === "string" && countryCodeSet.has(value);

const parseGeoRestrictions = (raw: string): Record<string, CampaignGeoRestriction> => {
  const parsed: unknown = JSON.parse(raw);
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("Saved campaign geographic settings have an invalid format.");
  }

  const restrictions: Record<string, CampaignGeoRestriction> = {};
  for (const [campaignId, value] of Object.entries(parsed)) {
    if (
      typeof value !== "object" ||
      value === null ||
      !("campaignAddress" in value) ||
      typeof value.campaignAddress !== "string" ||
      !("mode" in value) ||
      (value.mode !== "allowlist" && value.mode !== "blocklist") ||
      !("countries" in value) ||
      !Array.isArray(value.countries)
    ) {
      throw new Error(`Saved geographic settings for ${campaignId} have an invalid format.`);
    }

    const countries: CountryCode[] = [];
    for (const country of value.countries) {
      if (isCountryCode(country) && !countries.includes(country)) countries.push(country);
    }
    restrictions[campaignId] = {
      campaignAddress: value.campaignAddress,
      mode: value.mode,
      countries,
      jurisdictionalTags: [value.mode, ...countries.map((country) => `country:${country}`)],
    };
  }
  return restrictions;
};

const getAllGeoRestrictions = (): Record<string, CampaignGeoRestriction> => {
  const raw = window.localStorage.getItem(GEO_RESTRICTIONS_KEY);
  return raw ? parseGeoRestrictions(raw) : {};
};

export const getCampaignGeoRestriction = (campaignId: string): CampaignGeoRestriction => {
  const saved = getAllGeoRestrictions()[campaignId];
  if (!saved)
    return { campaignAddress: "", mode: "blocklist", countries: [], jurisdictionalTags: [] };

  return saved;
};

export const getCampaignGeoRestrictionForAddress = (
  campaignAddress: string,
): CampaignGeoRestriction => {
  const normalizedAddress = campaignAddress.trim().toUpperCase();
  const matchingRestriction = Object.values(getAllGeoRestrictions()).find(
    (restriction) =>
      typeof restriction.campaignAddress === "string" &&
      restriction.campaignAddress.trim().toUpperCase() === normalizedAddress,
  );
  if (!matchingRestriction) {
    return { campaignAddress: "", mode: "blocklist", countries: [], jurisdictionalTags: [] };
  }

  return matchingRestriction;
};

export const saveCampaignGeoRestriction = (
  campaignId: string,
  campaignAddress: string,
  mode: GeoRestrictionMode,
  countries: CountryCode[],
): CampaignGeoRestriction => {
  const normalizedAddress = campaignAddress.trim();
  if (!normalizedAddress) {
    throw new Error("Enter the campaign contract address before saving geo-targeting.");
  }
  const normalizedCountries = [...new Set(countries)].filter(isCountryCode);
  if (mode === "allowlist" && normalizedCountries.length === 0) {
    throw new Error("Select at least one allowed country, or use the blocklist mode.");
  }

  const restriction: CampaignGeoRestriction = {
    campaignAddress: normalizedAddress,
    mode,
    countries: normalizedCountries,
    jurisdictionalTags: [mode, ...normalizedCountries.map((country) => `country:${country}`)],
  };
  const allRestrictions = getAllGeoRestrictions();
  allRestrictions[campaignId] = restriction;
  window.localStorage.setItem(GEO_RESTRICTIONS_KEY, JSON.stringify(allRestrictions));
  return restriction;
};

export const isCountryAllowed = (
  countryCode: CountryCode,
  restriction: CampaignGeoRestriction,
): boolean => {
  const isSelected = restriction.countries.includes(countryCode);
  return restriction.mode === "allowlist" ? isSelected : !isSelected;
};

export const resolveClientCountryCode = async (): Promise<CountryCode> => {
  let response: Response;
  try {
    response = await fetch(`${API_URL}/geo/country`, {
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
  } catch (error) {
    const reason = error instanceof Error ? `: ${error.message}` : "";
    throw new Error(`Could not reach the StormSale geo verification service${reason}`, {
      cause: error,
    });
  }
  if (!response.ok) {
    throw new Error(`Geographic verification failed (HTTP ${response.status}).`);
  }

  const result: unknown = await response.json();
  if (
    typeof result !== "object" ||
    result === null ||
    !("countryCode" in result) ||
    typeof result.countryCode !== "string"
  ) {
    throw new Error("Geographic verification returned an invalid country.");
  }

  const countryCode = result.countryCode.toUpperCase();
  if (!isCountryCode(countryCode)) {
    throw new Error("Geographic verification did not return a supported country code.");
  }
  return countryCode;
};
