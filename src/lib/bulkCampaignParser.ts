import Papa from "papaparse";
import type {
  BulkCampaignRow,
  BulkCampaignValidationError,
  BulkCampaignParseResult,
  BulkCampaignHeaderMapping,
} from "../types/bulkCampaign";

/**
 * Normalizes header string by lowercasing and stripping non-alphanumeric chars.
 */
export function normalizeHeader(header: string): string {
  return (header || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

const NAME_ALIASES = ["name", "campaignname", "campaign_name", "title", "campaign"];
const URL_ALIASES = [
  "url",
  "destinationurl",
  "destination_url",
  "landingurl",
  "landing_url",
  "website",
  "link",
  "targeturl",
  "target_url",
];
const BUDGET_ALIASES = [
  "budget",
  "totalbudget",
  "total_budget",
  "amount",
  "budgetxlm",
  "budget_xlm",
  "funding",
];
const PAYOUT_RATE_ALIASES = [
  "payoutrate",
  "payout_rate",
  "commissionrate",
  "commission_rate",
  "rate",
  "commission",
  "payoutpercentage",
  "payout_percentage",
  "payout",
];
const CLEARING_PERIOD_ALIASES = [
  "clearingperiod",
  "clearing_period",
  "duration",
  "lockperiod",
  "lock_period",
  "period",
];

export const REQUIRED_HEADERS_LIST = ["name", "url", "budget", "payout_rate"];

export function detectCampaignHeaders(headers: string[]): BulkCampaignHeaderMapping {
  const mapping: BulkCampaignHeaderMapping = {};

  for (const header of headers) {
    const normalized = normalizeHeader(header);
    if (!mapping.nameColumn && NAME_ALIASES.includes(normalized)) {
      mapping.nameColumn = header;
    } else if (!mapping.urlColumn && URL_ALIASES.includes(normalized)) {
      mapping.urlColumn = header;
    } else if (!mapping.budgetColumn && BUDGET_ALIASES.includes(normalized)) {
      mapping.budgetColumn = header;
    } else if (!mapping.payoutRateColumn && PAYOUT_RATE_ALIASES.includes(normalized)) {
      mapping.payoutRateColumn = header;
    } else if (!mapping.clearingPeriodColumn && CLEARING_PERIOD_ALIASES.includes(normalized)) {
      mapping.clearingPeriodColumn = header;
    }
  }

  return mapping;
}

/**
 * Validates a campaign destination URL.
 * Rejects javascript:, ftp:, invalid protocols, and malformed structures.
 */
export function validateCampaignUrl(rawUrl: string): { isValid: boolean; error?: string } {
  const trimmed = (rawUrl || "").trim();
  if (!trimmed) {
    return { isValid: false, error: "Destination URL is required." };
  }

  // Reject javascript: or data: pseudo-protocols immediately
  if (/^(javascript|data|vbscript):/i.test(trimmed)) {
    return { isValid: false, error: "Invalid URL scheme: insecure protocol detected." };
  }

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return {
        isValid: false,
        error: `Invalid URL protocol "${parsed.protocol}". Only HTTP and HTTPS are permitted.`,
      };
    }
    if (!parsed.hostname || parsed.hostname.length < 3) {
      return { isValid: false, error: "Destination URL must include a valid domain hostname." };
    }
    return { isValid: true };
  } catch {
    return {
      isValid: false,
      error: "Malformed URL: please provide a valid HTTP or HTTPS address.",
    };
  }
}

/**
 * Validates a campaign budget amount.
 * Must be a positive decimal number > 0.
 */
export function validateCampaignBudget(rawBudget: unknown): {
  isValid: boolean;
  value: number;
  error?: string;
} {
  if (rawBudget === null || rawBudget === undefined || rawBudget === "") {
    return { isValid: false, value: 0, error: "Budget amount is required." };
  }

  const str = String(rawBudget).trim().replace(/,/g, "");
  // Check strict positive decimal pattern (no exponent, no negative sign)
  if (!/^(0|[1-9]\d*)(\.\d+)?$/.test(str)) {
    if (str.startsWith("-")) {
      return { isValid: false, value: 0, error: "Budget cannot be negative." };
    }
    return { isValid: false, value: 0, error: "Budget must be a valid positive number." };
  }

  const num = parseFloat(str);
  if (isNaN(num) || num <= 0) {
    return { isValid: false, value: 0, error: "Budget must be greater than zero." };
  }

  return { isValid: true, value: num };
}

/**
 * Validates a campaign payout / commission rate.
 * Accepts numbers or strings (e.g. "10", "10%", "0.15").
 * Rate must be positive and <= 100%.
 */
export function validateCampaignPayoutRate(rawRate: unknown): {
  isValid: boolean;
  value: number;
  error?: string;
} {
  if (rawRate === null || rawRate === undefined || rawRate === "") {
    return { isValid: false, value: 0, error: "Payout rate is required." };
  }

  const rawStr = String(rawRate).trim();
  // Validate percentage syntax: accept at most one trailing percent sign without embedded/repeated percent signs
  if (rawStr.includes("%")) {
    if (!rawStr.endsWith("%") || rawStr.indexOf("%") !== rawStr.length - 1) {
      return { isValid: false, value: 0, error: "Payout rate must be a valid percentage." };
    }
  }

  const str = rawStr.replace(/%$/, "").replace(/,/g, "").trim();
  if (!/^(0|[1-9]\d*)(\.\d+)?$/.test(str)) {
    if (str.startsWith("-")) {
      return { isValid: false, value: 0, error: "Payout rate cannot be negative." };
    }
    return { isValid: false, value: 0, error: "Payout rate must be a valid percentage." };
  }

  const num = parseFloat(str);
  if (isNaN(num) || num <= 0) {
    return { isValid: false, value: 0, error: "Payout rate must be greater than 0%." };
  }
  if (num > 100) {
    return { isValid: false, value: num, error: "Payout rate cannot exceed 100%." };
  }

  return { isValid: true, value: num };
}

/**
 * Validates an optional clearing period in seconds.
 * Defaults to 604800 (7 days) if omitted.
 */
export function validateClearingPeriod(rawPeriod: unknown): {
  isValid: boolean;
  value: number;
  error?: string;
} {
  if (rawPeriod === null || rawPeriod === undefined || String(rawPeriod).trim() === "") {
    return { isValid: true, value: 604800 }; // 7 days default
  }

  const str = String(rawPeriod).trim();
  if (!/^\d+$/.test(str)) {
    return { isValid: false, value: 0, error: "Clearing period must be a non-negative integer." };
  }

  const num = parseInt(str, 10);
  if (isNaN(num) || num < 0) {
    return { isValid: false, value: 0, error: "Clearing period must be a non-negative integer." };
  }

  return { isValid: true, value: num };
}

/**
 * Validates an individual parsed or edited campaign row.
 */
export function validateCampaignRow(
  data: {
    name?: unknown;
    url?: unknown;
    budget?: unknown;
    payoutRate?: unknown;
    clearingPeriod?: unknown;
  },
  rowNumber: number,
  id = `campaign-row-${rowNumber}`,
): BulkCampaignRow {
  const errors: BulkCampaignValidationError[] = [];

  // 1. Name validation
  const nameRaw = String(data.name ?? "").trim();
  if (!nameRaw) {
    errors.push({ field: "name", value: nameRaw, message: "Campaign name is required." });
  } else if (nameRaw.length > 120) {
    errors.push({
      field: "name",
      value: nameRaw,
      message: "Campaign name must not exceed 120 characters.",
    });
  }

  // 2. Destination URL validation
  const urlRaw = String(data.url ?? "").trim();
  const urlCheck = validateCampaignUrl(urlRaw);
  if (!urlCheck.isValid) {
    errors.push({ field: "url", value: urlRaw, message: urlCheck.error || "Invalid URL." });
  }

  // 3. Budget validation
  const budgetRaw = String(data.budget ?? "").trim();
  const budgetCheck = validateCampaignBudget(budgetRaw);
  if (!budgetCheck.isValid) {
    errors.push({
      field: "budget",
      value: budgetRaw,
      message: budgetCheck.error || "Invalid budget.",
    });
  }

  // 4. Payout rate validation
  const payoutRaw = String(data.payoutRate ?? "").trim();
  const payoutCheck = validateCampaignPayoutRate(payoutRaw);
  if (!payoutCheck.isValid) {
    errors.push({
      field: "payoutRate",
      value: payoutRaw,
      message: payoutCheck.error || "Invalid payout rate.",
    });
  }

  // 5. Clearing period validation
  const clearingRaw = String(data.clearingPeriod ?? "").trim();
  const clearingCheck = validateClearingPeriod(clearingRaw);
  if (!clearingCheck.isValid) {
    errors.push({
      field: "clearingPeriod",
      value: clearingRaw,
      message: clearingCheck.error || "Invalid clearing period.",
    });
  }

  return {
    id,
    rowNumber,
    name: nameRaw,
    nameRaw,
    url: urlRaw,
    urlRaw,
    budget: budgetCheck.value,
    budgetRaw,
    payoutRate: payoutCheck.value,
    payoutRateRaw: payoutRaw,
    clearingPeriod: clearingCheck.value,
    clearingPeriodRaw: clearingRaw,
    status: errors.length === 0 ? "valid" : "malformed",
    errors,
  };
}

/**
 * Parses and validates raw CSV content into validated campaign rows.
 * Supports Web Worker execution via PapaParse `worker: true` to prevent main thread blocking on 1,000+ rows.
 */
export async function parseBulkCampaignCsv(
  csvContent: string,
  options: { useWorker?: boolean } = {},
): Promise<BulkCampaignParseResult> {
  const trimmed = (csvContent || "").trim();
  if (!trimmed) {
    return {
      rows: [],
      totalRows: 0,
      validCount: 0,
      malformedCount: 0,
      totalBudgetXlm: 0,
      hasRequiredHeaders: false,
      missingHeaders: REQUIRED_HEADERS_LIST,
      headerMapping: {},
      errorCallout: "CSV file is empty. Please provide a file with campaign rows.",
      workerUsed: false,
    };
  }

  // Parse CSV asynchronously (using worker when requested or available)
  const parsePromise = new Promise<Papa.ParseResult<Record<string, string>>>((resolve, reject) => {
    // Check if worker should be used
    const canUseWorker =
      options.useWorker !== false && typeof Worker !== "undefined" && typeof window !== "undefined";

    if (canUseWorker) {
      Papa.parse<Record<string, string>>(csvContent, {
        header: true,
        skipEmptyLines: "greedy",
        worker: true,
        complete: (results: Papa.ParseResult<Record<string, string>>) => resolve(results),
        error: (error: Error) => reject(error),
      });
    } else {
      Papa.parse<Record<string, string>>(csvContent, {
        header: true,
        skipEmptyLines: "greedy",
        worker: false,
        complete: (results: Papa.ParseResult<Record<string, string>>) => resolve(results),
        error: (error: Error) => reject(error),
      });
    }
  });

  const parsed = await parsePromise;
  const rawHeaders = parsed.meta.fields || [];

  if (rawHeaders.length === 0) {
    return {
      rows: [],
      totalRows: 0,
      validCount: 0,
      malformedCount: 0,
      totalBudgetXlm: 0,
      hasRequiredHeaders: false,
      missingHeaders: REQUIRED_HEADERS_LIST,
      headerMapping: {},
      errorCallout:
        "CSV header row is empty or malformed. Expected columns: name, url, budget, payout_rate, clearing_period.",
      workerUsed: Boolean(options.useWorker && typeof Worker !== "undefined"),
    };
  }

  const mapping = detectCampaignHeaders(rawHeaders);
  const missingHeaders: string[] = [];

  if (!mapping.nameColumn) missingHeaders.push("name");
  if (!mapping.urlColumn) missingHeaders.push("url");
  if (!mapping.budgetColumn) missingHeaders.push("budget");
  if (!mapping.payoutRateColumn) missingHeaders.push("payout_rate");

  if (missingHeaders.length > 0) {
    const errorCallout = `Missing required column(s): ${missingHeaders.map((h) => `'${h}'`).join(", ")}. Found headers: [${rawHeaders.join(", ")}]. Expected columns: name, url, budget, payout_rate, clearing_period.`;

    return {
      rows: [],
      totalRows: parsed.data.length,
      validCount: 0,
      malformedCount: parsed.data.length,
      totalBudgetXlm: 0,
      hasRequiredHeaders: false,
      missingHeaders,
      headerMapping: mapping,
      errorCallout,
      workerUsed: Boolean(options.useWorker && typeof Worker !== "undefined"),
    };
  }

  // Validate each row
  const rows: BulkCampaignRow[] = [];
  let validCount = 0;
  let malformedCount = 0;
  let totalBudgetXlm = 0;

  for (let i = 0; i < parsed.data.length; i++) {
    const rawRow = parsed.data[i];
    const rowNumber = i + 1;

    const row = validateCampaignRow(
      {
        name: mapping.nameColumn ? rawRow[mapping.nameColumn] : undefined,
        url: mapping.urlColumn ? rawRow[mapping.urlColumn] : undefined,
        budget: mapping.budgetColumn ? rawRow[mapping.budgetColumn] : undefined,
        payoutRate: mapping.payoutRateColumn ? rawRow[mapping.payoutRateColumn] : undefined,
        clearingPeriod: mapping.clearingPeriodColumn
          ? rawRow[mapping.clearingPeriodColumn]
          : undefined,
      },
      rowNumber,
    );

    if (row.status === "valid") {
      validCount++;
      totalBudgetXlm += row.budget;
    } else {
      malformedCount++;
    }

    rows.push(row);
  }

  return {
    rows,
    totalRows: rows.length,
    validCount,
    malformedCount,
    totalBudgetXlm: Number(totalBudgetXlm.toFixed(4)),
    hasRequiredHeaders: true,
    missingHeaders: [],
    headerMapping: mapping,
    workerUsed: Boolean(options.useWorker && typeof Worker !== "undefined"),
  };
}

/**
 * Generates sample CSV string for tests and demo downloads.
 */
export function generateSampleCampaignCsv(count = 10, withErrors = false): string {
  const headers = "name,url,budget,payout_rate,clearing_period";
  const rows: string[] = [];

  for (let i = 1; i <= count; i++) {
    if (withErrors && i === 1) {
      // Invalid URL
      rows.push(`Enterprise Campaign ${i},ftp://invalid-server.com/deals,1000,10%,604800`);
    } else if (withErrors && i === 2) {
      // Negative Budget
      rows.push(`Flash Sale ${i},https://example.com/promo,-500,15%,604800`);
    } else if (withErrors && i === 3) {
      // Malformed Payout Rate
      rows.push(`Affiliate Launch ${i},https://example.com/launch,2500,150%,604800`);
    } else {
      rows.push(`Campaign ${i},https://brand.com/campaign/${i},${500 * i},10%,604800`);
    }
  }

  return [headers, ...rows].join("\n");
}
