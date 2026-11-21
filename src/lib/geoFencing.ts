/**
 * IP Geo-Fencing & OFAC Sanctions Compliance Module (Issue #476)
 *
 * Implements:
 * 1. OFAC / international sanctions jurisdiction screening.
 * 2. Geo-blocking enforcement for Web3 wallet connection and monetary actions.
 * 3. Compliant read-only audit mode access for public verification.
 * 4. Regulatory compliance disclosure text management.
 */

// List of ISO 3166-1 alpha-2 country codes under comprehensive OFAC sanctions
export const OFAC_SANCTIONED_COUNTRIES: Record<string, string> = {
  CU: "Cuba",
  IR: "Iran",
  KP: "North Korea (DPRK)",
  SY: "Syria",
  RU: "Russia",
  BY: "Belarus",
  MM: "Myanmar (Burma)",
  VE: "Venezuela",
};

export const SANCTIONED_COUNTRY_CODES = new Set(
  Object.keys(OFAC_SANCTIONED_COUNTRIES).map((c) => c.toUpperCase()),
);

export const REGULATORY_DISCLOSURE_TEXT =
  "In accordance with U.S. Department of the Treasury Office of Foreign Assets Control (OFAC) regulations, FinCEN guidance, and international sanctions programs, access to StormSale decentralized escrow settlement, affiliate reward claims, and cryptographic wallet connection is strictly prohibited for individuals or entities located in or organized under the laws of comprehensively sanctioned jurisdictions. A compliant, read-only public audit mode is available to inspect verifiable Merkle trees, reserve proofs, and transparency ledgers without active transacting.";

const READ_ONLY_AUDIT_STORAGE_KEY = "stormsale.compliance.read_only_audit_mode";

let isReadOnlyAuditModeActive = false;

/**
 * Checks whether a given ISO 2-letter country code is in the OFAC sanctions list.
 */
export function isCountrySanctioned(countryCode?: string | null): boolean {
  if (!countryCode) return false;
  return SANCTIONED_COUNTRY_CODES.has(countryCode.trim().toUpperCase());
}

/**
 * Returns the country name for a sanctioned country code, or a fallback.
 */
export function getSanctionedCountryName(countryCode: string): string {
  const norm = countryCode.trim().toUpperCase();
  return OFAC_SANCTIONED_COUNTRIES[norm] || `Sanctioned Jurisdiction (${norm})`;
}

export interface JurisdictionComplianceResult {
  isCompliant: boolean;
  isSanctioned: boolean;
  countryCode: string;
  countryName?: string;
  blockedAction?: string;
  disclosure: string;
  allowReadOnlyAudit: boolean;
  error?: string;
}

/**
 * Checks compliance for a given country code and action.
 */
export function checkJurisdictionCompliance(
  countryCode: string,
  action: "wallet_connect" | "claim_payout" | "create_campaign" | "public_audit" = "wallet_connect",
): JurisdictionComplianceResult {
  const cleanCode = (countryCode || "").trim().toUpperCase();
  const sanctioned = isCountrySanctioned(cleanCode);

  if (sanctioned) {
    if (action === "public_audit") {
      return {
        isCompliant: true,
        isSanctioned: true,
        countryCode: cleanCode,
        countryName: getSanctionedCountryName(cleanCode),
        disclosure: REGULATORY_DISCLOSURE_TEXT,
        allowReadOnlyAudit: true,
      };
    }

    return {
      isCompliant: false,
      isSanctioned: true,
      countryCode: cleanCode,
      countryName: getSanctionedCountryName(cleanCode),
      blockedAction: action,
      disclosure: REGULATORY_DISCLOSURE_TEXT,
      allowReadOnlyAudit: true,
      error: `Access denied: Action '${action}' is prohibited from sanctioned jurisdiction ${getSanctionedCountryName(cleanCode)} (${cleanCode}) under OFAC compliance policies.`,
    };
  }

  return {
    isCompliant: true,
    isSanctioned: false,
    countryCode: cleanCode,
    disclosure: REGULATORY_DISCLOSURE_TEXT,
    allowReadOnlyAudit: true,
  };
}

/**
 * Enables or disables compliant read-only audit mode.
 */
export function setReadOnlyAuditMode(enabled: boolean): void {
  isReadOnlyAuditModeActive = enabled;
  try {
    if (enabled) {
      localStorage.setItem(READ_ONLY_AUDIT_STORAGE_KEY, "true");
    } else {
      localStorage.removeItem(READ_ONLY_AUDIT_STORAGE_KEY);
    }
  } catch {
    // Ignore in non-browser environments
  }
}

/**
 * Checks whether the client is currently in read-only audit mode.
 */
export function isReadOnlyAuditMode(): boolean {
  if (isReadOnlyAuditModeActive) return true;
  try {
    return localStorage.getItem(READ_ONLY_AUDIT_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}
