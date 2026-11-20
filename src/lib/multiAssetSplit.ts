export const BPS_TOTAL = 10_000;

export interface PaymentSplitBps {
  creatorBps: number;
  platformBps: number;
  affiliatePoolBps: number;
}

export interface SaleSplitAllocations {
  creator: bigint;
  platformFee: bigint;
  affiliatePool: bigint;
}

export interface PaymentSplitValidation {
  valid: boolean;
  errors: string[];
  totalBps: number;
}

export function validatePaymentSplit(split: PaymentSplitBps): PaymentSplitValidation {
  const errors: string[] = [];
  const fields = [
    ["creatorBps", split.creatorBps],
    ["platformBps", split.platformBps],
    ["affiliatePoolBps", split.affiliatePoolBps],
  ] as const;

  for (const [name, value] of fields) {
    if (!Number.isInteger(value) || value < 0 || value > BPS_TOTAL) {
      errors.push(`${name} must be an integer between 0 and ${BPS_TOTAL}.`);
    }
  }

  const totalBps = fields.reduce((sum, [, value]) => sum + (Number.isFinite(value) ? value : 0), 0);
  if (totalBps !== BPS_TOTAL) {
    errors.push(`Allocation must sum to exactly ${BPS_TOTAL} bps (100%), received ${totalBps}.`);
  }

  return { valid: errors.length === 0, errors, totalBps };
}

export function splitSalePayment(
  totalBaseUnits: bigint,
  split: PaymentSplitBps,
): SaleSplitAllocations {
  if (totalBaseUnits < 0n) throw new Error("Total sale amount must not be negative.");

  const validation = validatePaymentSplit(split);
  if (!validation.valid) throw new Error(`Invalid payment split: ${validation.errors.join(" ")}`);

  if (totalBaseUnits === 0n) return { creator: 0n, platformFee: 0n, affiliatePool: 0n };

  const creator = (totalBaseUnits * BigInt(split.creatorBps)) / BigInt(BPS_TOTAL);
  const affiliatePool = (totalBaseUnits * BigInt(split.affiliatePoolBps)) / BigInt(BPS_TOTAL);
  const platformFee = totalBaseUnits - creator - affiliatePool;

  return { creator, platformFee, affiliatePool };
}

export interface MultiAssetQuote {
  fromAsset: string;
  toAsset: string;
  amountIn: bigint;
  expectedOut: bigint;
  fetchedAt: number;
}

export type QuoteProvider = (
  fromAsset: string,
  toAsset: string,
  amountIn: bigint,
) => Promise<bigint>;

export async function fetchMultiAssetQuote(
  fromAsset: string,
  toAsset: string,
  amountIn: bigint,
  quoteProvider: QuoteProvider,
): Promise<MultiAssetQuote> {
  if (!fromAsset || !toAsset) throw new Error("Both source and destination assets are required.");
  if (amountIn <= 0n) throw new Error("Quote amount must be greater than zero.");

  if (fromAsset === toAsset) {
    return { fromAsset, toAsset, amountIn, expectedOut: amountIn, fetchedAt: Date.now() };
  }

  const expectedOut = await quoteProvider(fromAsset, toAsset, amountIn);
  if (expectedOut <= 0n) throw new Error("Quote provider returned a non-positive output amount.");

  return { fromAsset, toAsset, amountIn, expectedOut, fetchedAt: Date.now() };
}

export interface QuotedSaleSplit {
  quote: MultiAssetQuote;
  allocations: SaleSplitAllocations;
}

export async function quoteAndSplitSalePayment(
  fromAsset: string,
  toAsset: string,
  amountIn: bigint,
  split: PaymentSplitBps,
  quoteProvider: QuoteProvider,
): Promise<QuotedSaleSplit> {
  const quote = await fetchMultiAssetQuote(fromAsset, toAsset, amountIn, quoteProvider);
  const allocations = splitSalePayment(quote.expectedOut, split);
  return { quote, allocations };
}
