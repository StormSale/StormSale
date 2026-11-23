/**
 * B2B Enterprise Bulk Campaign CSV Types (#437)
 */

export type BulkCampaignRowValidationStatus = "valid" | "malformed";

export interface BulkCampaignValidationError {
  field: "name" | "url" | "budget" | "payoutRate" | "clearingPeriod" | "general";
  value: string;
  message: string;
}

export interface BulkCampaignRow {
  id: string; // Unique row ID e.g. "campaign-row-1"
  rowNumber: number; // 1-indexed line position in the CSV
  name: string;
  nameRaw: string;
  url: string;
  urlRaw: string;
  budget: number; // Parsed numeric budget in XLM/token
  budgetRaw: string;
  payoutRate: number; // Parsed numeric payout rate (e.g. 10 for 10%)
  payoutRateRaw: string;
  clearingPeriod: number; // Parsed clearing period in seconds (e.g. 604800)
  clearingPeriodRaw: string;
  status: BulkCampaignRowValidationStatus;
  errors: BulkCampaignValidationError[];
}

export interface BulkCampaignHeaderMapping {
  nameColumn?: string;
  urlColumn?: string;
  budgetColumn?: string;
  payoutRateColumn?: string;
  clearingPeriodColumn?: string;
}

export interface BulkCampaignParseResult {
  rows: BulkCampaignRow[];
  totalRows: number;
  validCount: number;
  malformedCount: number;
  totalBudgetXlm: number;
  hasRequiredHeaders: boolean;
  missingHeaders: string[];
  headerMapping: BulkCampaignHeaderMapping;
  errorCallout?: string;
  workerUsed?: boolean;
}
