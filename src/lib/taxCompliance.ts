/**
 * Affiliate tax compliance helpers (Issue #457).
 *
 * High-earning B2C affiliates (cumulative earnings above USD 600 per year) must
 * self-certify their tax status (IRS W-9 for US persons, W-8BEN for non-US
 * persons) before commissions are paid out without withholding.
 *
 * NOTE: The withholding rates below are product defaults used for display and
 * payout previews only. They must be confirmed with tax counsel before being
 * relied upon for actual remittance.
 */

export const TAX_FORM_THRESHOLD_USD = 600;
export const BACKUP_WITHHOLDING_RATE_PCT = 24;
export const DEFAULT_NON_TREATY_RATE_PCT = 30;
export const US_COUNTRY_CODE = "US";

export type TaxFormType = "W-9" | "W-8BEN";

export interface TaxCountry {
  code: string;
  name: string;
  /** Withholding percentage applied once a valid form is on file. */
  ratePct: number;
}

export const TAX_COUNTRIES: readonly TaxCountry[] = [
  { code: "US", name: "United States", ratePct: 0 },
  { code: "GB", name: "United Kingdom", ratePct: 0 },
  { code: "CA", name: "Canada", ratePct: 0 },
  { code: "DE", name: "Germany", ratePct: 0 },
  { code: "IN", name: "India", ratePct: 15 },
  { code: "NG", name: "Nigeria", ratePct: DEFAULT_NON_TREATY_RATE_PCT },
  { code: "BR", name: "Brazil", ratePct: DEFAULT_NON_TREATY_RATE_PCT },
];

export interface TaxFormInput {
  countryCode: string;
  signatureAccepted: boolean;
  /** Typed legal name acting as the digital signature. */
  signatureName: string;
}

export interface TaxStatus {
  formType: TaxFormType;
  countryCode: string;
  signatureName: string;
  withholdingPct: number;
  submittedAt: number;
}

export type TaxFormErrors = Partial<Record<keyof TaxFormInput, string>>;

const STORAGE_PREFIX = "stormsale:tax-status:";

export function formTypeForCountry(countryCode: string): TaxFormType {
  return countryCode === US_COUNTRY_CODE ? "W-9" : "W-8BEN";
}

export function getCountryRatePct(countryCode: string): number {
  const match = TAX_COUNTRIES.find((c) => c.code === countryCode);
  return match ? match.ratePct : DEFAULT_NON_TREATY_RATE_PCT;
}

/** True once cumulative earnings cross (or equal) the regulatory threshold. */
export function hasCrossedTaxThreshold(cumulativeEarningsUsd: number): boolean {
  return Number.isFinite(cumulativeEarningsUsd) && cumulativeEarningsUsd >= TAX_FORM_THRESHOLD_USD;
}

/** A form is required when the threshold is crossed and none is on file. */
export function isTaxFormRequired(
  cumulativeEarningsUsd: number,
  status: TaxStatus | null,
): boolean {
  return hasCrossedTaxThreshold(cumulativeEarningsUsd) && status === null;
}

export function validateTaxForm(input: TaxFormInput): TaxFormErrors {
  const errors: TaxFormErrors = {};
  if (!TAX_COUNTRIES.some((c) => c.code === input.countryCode)) {
    errors.countryCode = "Select your country of tax residence.";
  }
  if (input.signatureName.trim().length < 2) {
    errors.signatureName = "Type your full legal name to sign.";
  }
  if (!input.signatureAccepted) {
    errors.signatureAccepted = "You must certify the declaration under penalties of perjury.";
  }
  return errors;
}

export function buildTaxStatus(input: TaxFormInput, now: number = Date.now()): TaxStatus {
  const errors = validateTaxForm(input);
  if (Object.keys(errors).length > 0) {
    throw new Error(Object.values(errors)[0]);
  }
  return {
    formType: formTypeForCountry(input.countryCode),
    countryCode: input.countryCode,
    signatureName: input.signatureName.trim(),
    withholdingPct: getCountryRatePct(input.countryCode),
    submittedAt: now,
  };
}

export function loadTaxStatus(address: string): TaxStatus | null {
  if (!address) return null;
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + address);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as TaxStatus;
    if (
      (parsed.formType === "W-9" || parsed.formType === "W-8BEN") &&
      typeof parsed.withholdingPct === "number"
    ) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

export function saveTaxStatus(address: string, status: TaxStatus): void {
  if (!address) return;
  try {
    localStorage.setItem(STORAGE_PREFIX + address, JSON.stringify(status));
  } catch {
    // Storage unavailable; status stays in component state for this session.
  }
}

/**
 * Withholding percentage shown at claim time: the declared rate when a form is
 * on file, backup withholding when the threshold is crossed without one, and
 * zero below the threshold.
 */
export function resolveWithholdingPct(
  cumulativeEarningsUsd: number,
  status: TaxStatus | null,
): number {
  if (status) return status.withholdingPct;
  return hasCrossedTaxThreshold(cumulativeEarningsUsd) ? BACKUP_WITHHOLDING_RATE_PCT : 0;
}

export function computeWithholding(
  grossXlm: number,
  pct: number,
): { withheldXlm: number; netXlm: number } {
  const withheldXlm = Math.round(grossXlm * pct) / 100;
  return { withheldXlm, netXlm: Math.round((grossXlm - withheldXlm) * 1e7) / 1e7 };
}
