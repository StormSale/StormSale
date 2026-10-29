import Papa from "papaparse";
import { z } from "zod";
import { StrKey } from "@stellar/stellar-sdk";
import type {
  BatchParseResult,
  BatchSaleValidationError,
  ValidatedBatchSaleRow,
} from "../types/batchSale";
import { computeMerkleTree, hashSaleLeaf } from "./merkleTree";

/**
 * Normalizes header string by lowercasing and stripping non-alphanumeric chars.
 */
export function normalizeHeader(header: string): string {
  return header.toLowerCase().replace(/[^a-z0-9]/g, "");
}

const ORDER_ID_ALIASES = ["orderid", "order_id", "order", "id", "orderreference", "orderref"];
const AFFILIATE_ALIASES = [
  "affiliateaddress",
  "affiliate_address",
  "affiliate",
  "affiliatepublickey",
  "affiliate_public_key",
  "stellaraddress",
  "stellar_address",
  "address",
  "affiliateaccount",
];
const AMOUNT_ALIASES = [
  "saleamount",
  "sale_amount",
  "amount",
  "amountxlm",
  "amount_xlm",
  "sale_amount_xlm",
  "value",
  "total",
  "price",
];
const TIMESTAMP_ALIASES = [
  "timestamp",
  "time",
  "date",
  "createdat",
  "created_at",
  "orderdate",
  "order_date",
  "datetime",
  "isotimestamp",
];

export interface HeaderMapping {
  orderIdKey?: string;
  affiliateKey?: string;
  amountKey?: string;
  timestampKey?: string;
}

export function detectHeaders(headers: string[]): HeaderMapping {
  const mapping: HeaderMapping = {};

  for (const header of headers) {
    const normalized = normalizeHeader(header);
    if (!mapping.orderIdKey && ORDER_ID_ALIASES.includes(normalized)) {
      mapping.orderIdKey = header;
    } else if (!mapping.affiliateKey && AFFILIATE_ALIASES.includes(normalized)) {
      mapping.affiliateKey = header;
    } else if (!mapping.amountKey && AMOUNT_ALIASES.includes(normalized)) {
      mapping.amountKey = header;
    } else if (!mapping.timestampKey && TIMESTAMP_ALIASES.includes(normalized)) {
      mapping.timestampKey = header;
    }
  }

  return mapping;
}

/**
 * Validates a Stellar Ed25519 public key.
 */
export function validateStellarAddress(address: string): boolean {
  if (!address || typeof address !== "string") return false;
  const trimmed = address.trim();
  if (!trimmed.startsWith("G") || trimmed.length !== 56) return false;
  try {
    return StrKey.isValidEd25519PublicKey(trimmed);
  } catch {
    return false;
  }
}

/**
 * Parses numeric sale amount from string or number.
 */
export function parseSaleAmount(raw: unknown): { value: number; isValid: boolean; error?: string } {
  if (raw === null || raw === undefined || raw === "") {
    return { value: 0, isValid: false, error: "Sale Amount is required" };
  }
  let str = String(raw).trim();
  // Strip common currency prefixes/suffixes: $, XLM, commas
  str = str.replace(/[$,]/g, "").replace(/\s*xlm$/i, "");
  const num = parseFloat(str);

  if (isNaN(num)) {
    return {
      value: 0,
      isValid: false,
      error: `Invalid Sale Amount: "${raw}" is not a valid number`,
    };
  }
  if (!isFinite(num)) {
    return {
      value: 0,
      isValid: false,
      error: "Invalid Sale Amount: Value must be a finite number",
    };
  }
  if (num <= 0) {
    return {
      value: num,
      isValid: false,
      error: `Invalid Sale Amount: Must be greater than 0 XLM (received ${num})`,
    };
  }
  if (num > 10000000) {
    return {
      value: num,
      isValid: false,
      error: "Sale Amount exceeds maximum allowed transaction limit (10,000,000 XLM)",
    };
  }

  return { value: Number(num.toFixed(7)), isValid: true };
}

/**
 * Parses and normalizes a timestamp to ISO 8601 string.
 */
export function parseTimestamp(raw: unknown): { iso: string; isValid: boolean; error?: string } {
  if (raw === null || raw === undefined || raw === "") {
    return { iso: "", isValid: false, error: "Timestamp is required" };
  }
  const str = String(raw).trim();

  // Check if numeric unix timestamp
  if (/^\d{9,13}$/.test(str)) {
    const num = parseInt(str, 10);
    // 10 digits = seconds, 13 digits = milliseconds
    const ms = str.length <= 10 ? num * 1000 : num;
    const date = new Date(ms);
    if (!isNaN(date.getTime())) {
      return { iso: date.toISOString(), isValid: true };
    }
  }

  const date = new Date(str);
  if (isNaN(date.getTime())) {
    return {
      iso: "",
      isValid: false,
      error: `Invalid Timestamp: "${raw}" is not a recognizable date or Unix timestamp`,
    };
  }

  return { iso: date.toISOString(), isValid: true };
}

/**
 * Zod schema for clean, strict row validation.
 */
export const BatchRowSchema = z.object({
  orderId: z.string().trim().min(1, "Order ID cannot be empty"),
  affiliateAddress: z
    .string()
    .trim()
    .refine(
      validateStellarAddress,
      "Invalid Stellar address: Must be a valid 56-character Ed25519 public key (starts with G)",
    ),
  saleAmount: z
    .number()
    .positive("Sale Amount must be greater than 0 XLM")
    .finite("Sale Amount must be a finite number"),
  timestamp: z.string().refine((val) => {
    const d = new Date(val);
    return !isNaN(d.getTime());
  }, "Invalid Timestamp: Must be a valid date"),
});

/**
 * Validates a single batch sale record against schema rules.
 */
export function validateBatchSaleRow(
  rawOrderId: unknown,
  rawAffiliate: unknown,
  rawAmount: unknown,
  rawTimestamp: unknown,
  rowNumber: number,
): ValidatedBatchSaleRow {
  const errors: BatchSaleValidationError[] = [];
  const orderId = String(rawOrderId ?? "").trim();
  const affiliateAddress = String(rawAffiliate ?? "").trim();
  const rawAmountStr = String(rawAmount ?? "").trim();
  const rawTimestampStr = String(rawTimestamp ?? "").trim();

  if (!orderId) {
    errors.push({ field: "orderId", message: "Order ID is required" });
  }

  if (!affiliateAddress) {
    errors.push({ field: "affiliateAddress", message: "Affiliate Address is required" });
  } else if (!validateStellarAddress(affiliateAddress)) {
    errors.push({
      field: "affiliateAddress",
      message: `Invalid Stellar address: "${affiliateAddress}" is not a valid 56-char Ed25519 public key`,
    });
  }

  const parsedAmount = parseSaleAmount(rawAmount);
  if (!parsedAmount.isValid) {
    errors.push({ field: "saleAmount", message: parsedAmount.error || "Invalid Sale Amount" });
  }

  const parsedDate = parseTimestamp(rawTimestamp);
  if (!parsedDate.isValid) {
    errors.push({ field: "timestamp", message: parsedDate.error || "Invalid Timestamp" });
  }

  const isValid = errors.length === 0;
  const normalizedAmount = parsedAmount.value;
  const normalizedTimestamp = parsedDate.isValid ? parsedDate.iso : rawTimestampStr;

  let leafHash: string | undefined;
  if (isValid) {
    leafHash = hashSaleLeaf(orderId, affiliateAddress, normalizedAmount, normalizedTimestamp);
  }

  return {
    id: `row-${rowNumber}-${orderId || Math.random().toString(36).substring(2, 7)}`,
    rowNumber,
    orderId,
    affiliateAddress,
    saleAmount: normalizedAmount,
    saleAmountRaw: rawAmountStr,
    timestamp: normalizedTimestamp,
    timestampRaw: rawTimestampStr,
    status: isValid ? "valid" : "malformed",
    errors,
    leafHash,
    onChainStatus: "idle",
  };
}

/**
 * Analyzes parsed row objects and verifies required columns.
 */
export function processRawRecords(records: Record<string, unknown>[]): BatchParseResult {
  if (records.length === 0) {
    return {
      rows: [],
      totalRows: 0,
      validCount: 0,
      malformedCount: 0,
      totalValidAmountXlm: 0,
      hasRequiredColumns: false,
      missingColumns: ["Order ID", "Affiliate Address", "Sale Amount", "Timestamp"],
      columnMapping: {},
    };
  }

  const sampleHeaders = Object.keys(records[0]);
  const mapping = detectHeaders(sampleHeaders);

  const missingColumns: string[] = [];
  if (!mapping.orderIdKey) missingColumns.push("Order ID");
  if (!mapping.affiliateKey) missingColumns.push("Affiliate Address");
  if (!mapping.amountKey) missingColumns.push("Sale Amount");
  if (!mapping.timestampKey) missingColumns.push("Timestamp");

  const hasRequiredColumns = missingColumns.length === 0;

  const validatedRows: ValidatedBatchSaleRow[] = [];
  let totalValidAmountXlm = 0;
  let validCount = 0;
  let malformedCount = 0;
  const validLeaves: string[] = [];

  records.forEach((record, index) => {
    // If required columns are missing, mark row as malformed with general error
    if (!hasRequiredColumns) {
      validatedRows.push({
        id: `row-${index + 1}`,
        rowNumber: index + 1,
        orderId: String(record[mapping.orderIdKey || ""] ?? ""),
        affiliateAddress: String(record[mapping.affiliateKey || ""] ?? ""),
        saleAmount: 0,
        saleAmountRaw: String(record[mapping.amountKey || ""] ?? ""),
        timestamp: "",
        timestampRaw: String(record[mapping.timestampKey || ""] ?? ""),
        status: "malformed",
        errors: [
          {
            field: "general",
            message: `Missing required column(s): ${missingColumns.join(", ")}`,
          },
        ],
        onChainStatus: "idle",
      });
      malformedCount++;
      return;
    }

    const row = validateBatchSaleRow(
      record[mapping.orderIdKey!],
      record[mapping.affiliateKey!],
      record[mapping.amountKey!],
      record[mapping.timestampKey!],
      index + 1,
    );

    if (row.status === "valid") {
      validCount++;
      totalValidAmountXlm += row.saleAmount;
      if (row.leafHash) {
        validLeaves.push(row.leafHash);
      }
    } else {
      malformedCount++;
    }

    validatedRows.push(row);
  });

  const merkleTree =
    validLeaves.length > 0 ? computeMerkleTree(validLeaves, totalValidAmountXlm) : undefined;

  return {
    rows: validatedRows,
    totalRows: validatedRows.length,
    validCount,
    malformedCount,
    totalValidAmountXlm: Number(totalValidAmountXlm.toFixed(7)),
    hasRequiredColumns,
    missingColumns,
    columnMapping: {
      orderIdColumn: mapping.orderIdKey,
      affiliateAddressColumn: mapping.affiliateKey,
      saleAmountColumn: mapping.amountKey,
      timestampColumn: mapping.timestampKey,
    },
    merkleTree,
  };
}

/**
 * Parses raw CSV string using PapaParse.
 */
export async function parseBatchCsv(csvContent: string): Promise<BatchParseResult> {
  return new Promise((resolve) => {
    Papa.parse<Record<string, unknown>>(csvContent.trim(), {
      header: true,
      skipEmptyLines: "greedy",
      transformHeader: (h) => h.trim(),
      complete: (results) => {
        const parsed = processRawRecords(results.data);
        resolve(parsed);
      },
      error: (_err: Error) => {
        resolve({
          rows: [],
          totalRows: 0,
          validCount: 0,
          malformedCount: 0,
          totalValidAmountXlm: 0,
          hasRequiredColumns: false,
          missingColumns: ["Order ID", "Affiliate Address", "Sale Amount", "Timestamp"],
          columnMapping: {},
        });
      },
    });
  });
}

/**
 * Parses raw JSON string into batch sale rows.
 */
export async function parseBatchJson(jsonContent: string): Promise<BatchParseResult> {
  try {
    const parsed = JSON.parse(jsonContent);
    let items: Record<string, unknown>[] = [];

    if (Array.isArray(parsed)) {
      items = parsed;
    } else if (parsed && typeof parsed === "object") {
      if (Array.isArray(parsed.orders)) {
        items = parsed.orders;
      } else if (Array.isArray(parsed.sales)) {
        items = parsed.sales;
      } else if (Array.isArray(parsed.data)) {
        items = parsed.data;
      } else {
        throw new Error(
          "JSON payload must be an array or contain an 'orders', 'sales', or 'data' array",
        );
      }
    }

    return processRawRecords(items);
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Malformed JSON syntax";
    return {
      rows: [
        {
          id: "row-json-err",
          rowNumber: 1,
          orderId: "",
          affiliateAddress: "",
          saleAmount: 0,
          saleAmountRaw: "",
          timestamp: "",
          timestampRaw: "",
          status: "malformed",
          errors: [{ field: "general", message: `Failed to parse JSON file: ${errorMsg}` }],
          onChainStatus: "idle",
        },
      ],
      totalRows: 1,
      validCount: 0,
      malformedCount: 1,
      totalValidAmountXlm: 0,
      hasRequiredColumns: false,
      missingColumns: ["Order ID", "Affiliate Address", "Sale Amount", "Timestamp"],
      columnMapping: {},
    };
  }
}

/**
 * Real Stellar public keys for realistic testing and sample generation.
 */
export const SAMPLE_STELLAR_KEYS = [
  "GCG76QBVHBCR3W6OR3A5JV7LXH65SR3TDMILQ4LHEEAP2TMK4NRWGNO6",
  "GBM2MKU2RB2MUFNG763EEDCXCPW43OPD5AQEQH23O4P7MTNV3XXZ5HZU",
  "GCJQJ7YPTDBFSFHKDNBNTIEMGZUJGVIYTQRA6E5QF56FEGQ6VKLYU7OH",
  "GCKMAUZNHOTUKT4SNLYDFXNPPSSH357YOYIY3SUNUVAVL6TBOFBLP25C",
  "GBIL2YS3PUHJFKOFTULICFPCMHI4II75GY54C7WYPWD2D6FTT7JSYACC",
  "GAU7ISQW2ARVOBL2TQMKRMA4PJDURQ6EHHKEWVZMEOQJHH4RY6IZQY74",
];

/**
 * Generates sample CSV string with 50+ rows.
 * @param count Number of rows (defaults to 52)
 * @param includeMalformed If true, injects a few malformed rows for visual testing
 */
export function generateSampleCSV(count: number = 52, includeMalformed: boolean = false): string {
  const headers = "Order ID,Affiliate Address,Sale Amount,Timestamp";
  const rows: string[] = [headers];
  const now = Date.now();

  for (let i = 1; i <= count; i++) {
    const orderId = `ORD-2026-${(1000 + i).toString()}`;
    const key = SAMPLE_STELLAR_KEYS[i % SAMPLE_STELLAR_KEYS.length];
    // Realistic sale amount between 15.00 and 450.00 XLM
    const amount = (15 + ((i * 37) % 435) + (i % 3) * 0.5).toFixed(2);
    // Timestamp within last 14 days
    const timeMs = now - (count - i) * 6 * 3600 * 1000;
    const timestamp = new Date(timeMs).toISOString();

    // Invert couple rows if malformed requested
    if (includeMalformed && i === 5) {
      // Bad stellar key
      rows.push(`ORD-2026-1005,GBAD_STELLAR_ADDRESS_CHECKSUM_ERROR_SHORT,120.00,${timestamp}`);
    } else if (includeMalformed && i === 12) {
      // Negative amount
      rows.push(`ORD-2026-1012,${key},-45.50,${timestamp}`);
    } else if (includeMalformed && i === 20) {
      // Invalid timestamp
      rows.push(`ORD-2026-1020,${key},85.00,NOT_A_VALID_DATE`);
    } else {
      rows.push(`${orderId},${key},${amount},${timestamp}`);
    }
  }

  return rows.join("\n");
}

/**
 * Generates sample JSON string with 50+ rows.
 */
export function generateSampleJSON(count: number = 52, includeMalformed: boolean = false): string {
  const records = [];
  const now = Date.now();

  for (let i = 1; i <= count; i++) {
    const orderId = `ORD-2026-${(1000 + i).toString()}`;
    const key = SAMPLE_STELLAR_KEYS[i % SAMPLE_STELLAR_KEYS.length];
    const amount = Number((15 + ((i * 37) % 435) + (i % 3) * 0.5).toFixed(2));
    const timeMs = now - (count - i) * 6 * 3600 * 1000;
    const timestamp = new Date(timeMs).toISOString();

    if (includeMalformed && i === 5) {
      records.push({
        "Order ID": orderId,
        "Affiliate Address": "GBAD_INVALID_KEY",
        "Sale Amount": 120.0,
        Timestamp: timestamp,
      });
    } else if (includeMalformed && i === 12) {
      records.push({
        "Order ID": orderId,
        "Affiliate Address": key,
        "Sale Amount": -25.0,
        Timestamp: timestamp,
      });
    } else {
      records.push({
        "Order ID": orderId,
        "Affiliate Address": key,
        "Sale Amount": amount,
        Timestamp: timestamp,
      });
    }
  }

  return JSON.stringify({ orders: records }, null, 2);
}
