/**
 * Multi-Asset Batch Sale Payment Split Calculations (Issue #466)
 *
 * Implements:
 * 1. Basis point (bps) fee split validation ensuring creator + platformFee + affiliatePool == 10,000 bps (100%).
 * 2. Strict dust handling: remainder Stroops/cents allocated to platform fee without loss.
 * 3. Dynamic quote fetching & conversion across multi-payment assets (USDC, XLM, EURC).
 */

import { fetchLiveOracleRates, FALLBACK_RATES, type OracleRates } from "./priceOracle";

export type SupportedPaymentAsset = "XLM" | "USDC" | "EURC";

export const SUPPORTED_PAYMENT_ASSETS: readonly SupportedPaymentAsset[] = [
  "XLM",
  "USDC",
  "EURC",
] as const;

export const TOTAL_BPS = 10_000; // 100.00%
export const BASE_UNITS_SCALE = 10_000_000n; // 7 decimal places (Stellar standard)

export interface PaymentSplitConfig {
  creatorBps: number;
  platformFeeBps: number;
  affiliatePoolBps: number;
  creatorAddress?: string;
  platformFeeAddress?: string;
  affiliatePoolAddress?: string;
}

export interface SplitValidationResult {
  valid: boolean;
  totalBps: number;
  errors: string[];
}

export interface PaymentSplitAllocation {
  asset: SupportedPaymentAsset;
  totalAmount: bigint;
  creatorAmount: bigint;
  platformFeeAmount: bigint;
  affiliatePoolAmount: bigint;
  dustAllocatedToPlatform: bigint;
  totalFormatted: string;
  creatorFormatted: string;
  platformFeeFormatted: string;
  affiliatePoolFormatted: string;
}

export interface AssetQuote {
  fromAsset: SupportedPaymentAsset;
  toAsset: SupportedPaymentAsset;
  rate: number;
  quotedAt: number;
  source: "oracle" | "direct" | "fallback";
}

export interface BatchSalePaymentItem {
  id: string;
  orderId: string;
  asset: SupportedPaymentAsset;
  amount: bigint; // in base units (Stroops / cents)
}

export interface BatchSalePaymentSummary {
  totalByAsset: Record<SupportedPaymentAsset, bigint>;
  creatorTotalByAsset: Record<SupportedPaymentAsset, bigint>;
  platformFeeTotalByAsset: Record<SupportedPaymentAsset, bigint>;
  affiliatePoolTotalByAsset: Record<SupportedPaymentAsset, bigint>;
  totalDustByAsset: Record<SupportedPaymentAsset, bigint>;
  itemAllocations: Array<{
    item: BatchSalePaymentItem;
    allocation: PaymentSplitAllocation;
  }>;
}

/**
 * Validates basis point (bps) fee splits ensuring the sum equals exactly 10,000 bps (100%).
 */
export function validateSplitBps(config: PaymentSplitConfig): SplitValidationResult {
  const errors: string[] = [];

  if (
    typeof config.creatorBps !== "number" ||
    !Number.isInteger(config.creatorBps) ||
    config.creatorBps < 0
  ) {
    errors.push("Creator fee basis points must be a non-negative integer.");
  }
  if (
    typeof config.platformFeeBps !== "number" ||
    !Number.isInteger(config.platformFeeBps) ||
    config.platformFeeBps < 0
  ) {
    errors.push("Platform fee basis points must be a non-negative integer.");
  }
  if (
    typeof config.affiliatePoolBps !== "number" ||
    !Number.isInteger(config.affiliatePoolBps) ||
    config.affiliatePoolBps < 0
  ) {
    errors.push("Affiliate pool fee basis points must be a non-negative integer.");
  }

  const totalBps =
    (config.creatorBps || 0) + (config.platformFeeBps || 0) + (config.affiliatePoolBps || 0);

  if (totalBps !== TOTAL_BPS) {
    errors.push(
      `Sum of fee allocations must equal exactly 10,000 bps (100%), but got ${totalBps} bps (${(totalBps / 100).toFixed(2)}%).`,
    );
  }

  return {
    valid: errors.length === 0,
    totalBps,
    errors,
  };
}

/**
 * Formats base units (7 decimals) to standard human-readable string.
 */
export function formatBaseUnits(amount: bigint): string {
  const isNegative = amount < 0n;
  const abs = isNegative ? -amount : amount;
  const whole = abs / BASE_UNITS_SCALE;
  const frac = (abs % BASE_UNITS_SCALE).toString().padStart(7, "0");
  return `${isNegative ? "-" : ""}${whole}.${frac}`;
}

/**
 * Expands numeric strings in scientific notation (e.g. "1.0000005e1" -> "10.000005")
 * using exact string manipulation to prevent IEEE 754 precision loss.
 */
export function expandScientificNotation(rawStr: string): string {
  const str = rawStr.trim();
  const eIndex = str.search(/[eE]/);
  if (eIndex === -1) return str;

  const mantissa = str.slice(0, eIndex);
  const exp = parseInt(str.slice(eIndex + 1), 10);
  if (isNaN(exp) || exp === 0) return mantissa;

  const isNeg = mantissa.startsWith("-");
  const cleanMantissa = isNeg ? mantissa.slice(1) : mantissa;
  const [wholeStr = "", fracStr = ""] = cleanMantissa.split(".");

  if (exp > 0) {
    if (exp < fracStr.length) {
      const newWhole = wholeStr + fracStr.slice(0, exp);
      const newFrac = fracStr.slice(exp);
      return `${isNeg ? "-" : ""}${newWhole}.${newFrac}`;
    } else {
      const zeros = "0".repeat(exp - fracStr.length);
      return `${isNeg ? "-" : ""}${wholeStr}${fracStr}${zeros}`;
    }
  } else {
    const absExp = -exp;
    const zeros = "0".repeat(absExp - 1);
    const combined = `${zeros}${wholeStr}${fracStr}`;
    return `${isNeg ? "-" : ""}0.${combined}`;
  }
}

/**
 * Parses a decimal string (e.g. "12.3456789") into base units (7 decimals).
 */
export function parseToBaseUnits(amountStr: string | number): bigint {
  const rawStr = String(amountStr).trim();
  if (!rawStr) return 0n;

  const str = expandScientificNotation(rawStr);
  if (!str || isNaN(Number(str))) return 0n;

  const parts = str.split(".");
  const whole = BigInt(parts[0] || "0");
  const fracPart = (parts[1] || "").slice(0, 7).padEnd(7, "0");
  const frac = BigInt(fracPart);

  if (whole < 0n || str.startsWith("-")) {
    return whole * BASE_UNITS_SCALE - frac;
  }
  return whole * BASE_UNITS_SCALE + frac;
}

/**
 * Calculates payment split between Creator, Platform Fee, and Affiliate Pool.
 * Remainder Stroops/cents (dust) are allocated directly to the platform fee without loss.
 */
export function calculatePaymentSplit(
  totalAmount: bigint,
  asset: SupportedPaymentAsset,
  config: PaymentSplitConfig,
): PaymentSplitAllocation {
  if (totalAmount < 0n) {
    throw new Error("Total payment amount cannot be negative.");
  }

  const validation = validateSplitBps(config);
  if (!validation.valid) {
    throw new Error(`Invalid fee split configuration: ${validation.errors.join("; ")}`);
  }

  if (totalAmount === 0n) {
    return {
      asset,
      totalAmount: 0n,
      creatorAmount: 0n,
      platformFeeAmount: 0n,
      affiliatePoolAmount: 0n,
      dustAllocatedToPlatform: 0n,
      totalFormatted: "0.0000000",
      creatorFormatted: "0.0000000",
      platformFeeFormatted: "0.0000000",
      affiliatePoolFormatted: "0.0000000",
    };
  }

  const bpsDivisor = BigInt(TOTAL_BPS);

  // Exact integer allocations floored to base units
  const creatorAmount = (totalAmount * BigInt(config.creatorBps)) / bpsDivisor;
  const affiliatePoolAmount = (totalAmount * BigInt(config.affiliatePoolBps)) / bpsDivisor;
  const standardPlatformFee = (totalAmount * BigInt(config.platformFeeBps)) / bpsDivisor;

  // Remainder dust calculation
  const subtotal = creatorAmount + affiliatePoolAmount + standardPlatformFee;
  const dust = totalAmount - subtotal;

  // Dust handling: remainder allocated to platform fee
  const platformFeeAmount = standardPlatformFee + dust;

  // Sanity invariant verification: creator + platformFee + affiliatePool === totalAmount
  if (creatorAmount + platformFeeAmount + affiliatePoolAmount !== totalAmount) {
    throw new Error("Invariant failed: Split allocations do not sum to total amount.");
  }

  return {
    asset,
    totalAmount,
    creatorAmount,
    platformFeeAmount,
    affiliatePoolAmount,
    dustAllocatedToPlatform: dust,
    totalFormatted: formatBaseUnits(totalAmount),
    creatorFormatted: formatBaseUnits(creatorAmount),
    platformFeeFormatted: formatBaseUnits(platformFeeAmount),
    affiliatePoolFormatted: formatBaseUnits(affiliatePoolAmount),
  };
}

/**
 * Resolves conversion exchange rate between any pair of supported payment assets.
 * Uses live/cached Oracle rates (CoinGecko / Pyth Network feeds).
 */
export async function fetchDynamicAssetQuote(
  fromAsset: SupportedPaymentAsset,
  toAsset: SupportedPaymentAsset,
  customRates?: OracleRates,
): Promise<AssetQuote> {
  const quotedAt = Date.now();

  if (fromAsset === toAsset) {
    return {
      fromAsset,
      toAsset,
      rate: 1.0,
      quotedAt,
      source: "direct",
    };
  }

  let rates: OracleRates;
  let source: "direct" | "oracle" | "fallback";

  if (customRates) {
    rates = customRates;
    source = "oracle";
  } else {
    try {
      const oracleResp = await fetchLiveOracleRates();
      rates = oracleResp.rates || FALLBACK_RATES;
      source = oracleResp.source === "Authoritative Fallback" ? "fallback" : "oracle";
    } catch {
      rates = FALLBACK_RATES;
      source = "fallback";
    }
  }

  const usdRate = rates.USDC || rates.USD;
  const eurRate = rates.EUR;

  if (typeof usdRate !== "number" || !Number.isFinite(usdRate) || usdRate <= 0) {
    throw new Error(
      `Invalid USD/USDC exchange rate: ${usdRate}. Rate must be finite and greater than zero.`,
    );
  }
  if (typeof eurRate !== "number" || !Number.isFinite(eurRate) || eurRate <= 0) {
    throw new Error(
      `Invalid EUR exchange rate: ${eurRate}. Rate must be finite and greater than zero.`,
    );
  }

  // Asset prices in USD:
  // XLM: rates.USD (e.g. 0.125 USD per XLM)
  // USDC: rates.USDC (or 1.0 USD per USDC)
  // EURC: rates.EUR (e.g. 1.08 USD per EURC or EUR/USD reciprocal)
  // Standard conversion: 1 XLM = rates.USD in USD.
  // In priceOracle:
  // rates.USD = stellar price in USD (e.g. 0.125)
  // rates.EUR = stellar price in EUR (e.g. 0.115)
  // rates.USDC = stellar price in USDC (e.g. 0.125)
  // So:
  // 1 XLM = rates.USD USD
  // 1 XLM = rates.EUR EURC
  // 1 XLM = rates.USDC USDC

  let rate = 1.0;

  if (fromAsset === "XLM" && toAsset === "USDC") {
    rate = usdRate;
  } else if (fromAsset === "XLM" && toAsset === "EURC") {
    rate = eurRate;
  } else if (fromAsset === "USDC" && toAsset === "XLM") {
    rate = 1 / usdRate;
  } else if (fromAsset === "EURC" && toAsset === "XLM") {
    rate = 1 / eurRate;
  } else if (fromAsset === "USDC" && toAsset === "EURC") {
    rate = eurRate / usdRate;
  } else if (fromAsset === "EURC" && toAsset === "USDC") {
    rate = usdRate / eurRate;
  }

  return {
    fromAsset,
    toAsset,
    rate,
    quotedAt,
    source,
  };
}

export const RATE_PRECISION = 1_000_000_000_000n; // 10^12 high precision scale

/**
 * Converts an amount from one asset to another using an asset quote.
 */
export function convertAssetAmount(amount: bigint, quote: AssetQuote): bigint {
  if (typeof quote.rate !== "number" || !Number.isFinite(quote.rate) || quote.rate <= 0) {
    throw new Error(
      `Invalid conversion quote rate: ${quote.rate}. Rate must be finite and greater than zero.`,
    );
  }
  if (amount <= 0n) return 0n;
  if (quote.fromAsset === quote.toAsset || quote.rate === 1.0) return amount;

  // Multiply by scaled rate (10^12) so rate retains full precision through multiplication
  // and only the final destination amount is rounded.
  const scaledRate = BigInt(Math.round(quote.rate * Number(RATE_PRECISION)));
  return (amount * scaledRate + RATE_PRECISION / 2n) / RATE_PRECISION;
}

/**
 * Calculates payment splits across a multi-asset batch sale list.
 */
export function calculateMultiAssetBatchSaleSplit(
  items: BatchSalePaymentItem[],
  config: PaymentSplitConfig,
): BatchSalePaymentSummary {
  const validation = validateSplitBps(config);
  if (!validation.valid) {
    throw new Error(`Invalid fee split configuration: ${validation.errors.join("; ")}`);
  }

  const initialTotals: Record<SupportedPaymentAsset, bigint> = {
    XLM: 0n,
    USDC: 0n,
    EURC: 0n,
  };

  const summary: BatchSalePaymentSummary = {
    totalByAsset: { ...initialTotals },
    creatorTotalByAsset: { ...initialTotals },
    platformFeeTotalByAsset: { ...initialTotals },
    affiliatePoolTotalByAsset: { ...initialTotals },
    totalDustByAsset: { ...initialTotals },
    itemAllocations: [],
  };

  for (const item of items) {
    const allocation = calculatePaymentSplit(item.amount, item.asset, config);

    summary.totalByAsset[item.asset] += allocation.totalAmount;
    summary.creatorTotalByAsset[item.asset] += allocation.creatorAmount;
    summary.platformFeeTotalByAsset[item.asset] += allocation.platformFeeAmount;
    summary.affiliatePoolTotalByAsset[item.asset] += allocation.affiliatePoolAmount;
    summary.totalDustByAsset[item.asset] += allocation.dustAllocatedToPlatform;

    summary.itemAllocations.push({ item, allocation });
  }

  return summary;
}
