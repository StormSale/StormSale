import { Asset, Operation, StrKey, xdr } from "@stellar/stellar-sdk";

/**
 * Commission Auto-Split Engine (Issue #167)
 *
 * Lets affiliates configure percentage-based routing rules (e.g. 70% to the
 * main wallet, 30% to a cold-storage vault) that are applied automatically
 * when commissions are claimed. The split is executed as extra `payment`
 * operations appended to the same Stellar transaction envelope as the
 * `claim_payout` Soroban invocations, so allocation happens atomically at
 * withdrawal time (SEP-0007-style payout routing).
 */

export const STROOPS_PER_XLM = 10_000_000n;

export interface SplitDestination {
  /** Stable client-generated id for list keying */
  id: string;
  /** Human label, e.g. "Cold Storage Vault" */
  label: string;
  /** Stellar account public key (G...) receiving the share */
  address: string;
  /** Percentage of every claim routed here (0 < pct <= 100) */
  percentage: number;
}

export interface SplitPlan {
  enabled: boolean;
  destinations: SplitDestination[];
}

export interface SplitAllocation {
  destination: SplitDestination;
  amountStroops: bigint;
  /** Rounded display amount in XLM (exactly representable at 7 decimals) */
  amountXlm: number;
}

/** Serialisable form stored on the payout receipt */
export interface SplitAllocationReceipt {
  label: string;
  address: string;
  percentage: number;
  amountXlm: number;
  amountStroops: string;
}

export const DEFAULT_SPLIT_PLAN: SplitPlan = {
  enabled: false,
  destinations: [],
};

/** Percentage values are validated in integer basis points to avoid float drift. */
function toBasisPoints(percentage: number): number {
  return Math.round(percentage * 100);
}

export function isValidSplitAddress(address: string): boolean {
  try {
    return StrKey.isValidEd25519PublicKey(address.trim());
  } catch {
    return false;
  }
}

export interface SplitPlanValidation {
  valid: boolean;
  errors: string[];
  totalPercentage: number;
}

/**
 * Verifies a split plan: each destination needs a valid G... address, a usable
 * percentage, no duplicate keys, and the allocation must sum to exactly 100%.
 * Disabled plans are always valid (the affiliate simply claims in full).
 */
export function validateSplitPlan(plan: SplitPlan | null | undefined): SplitPlanValidation {
  const errors: string[] = [];
  const destinations = plan?.destinations ?? [];
  const totalBps = destinations.reduce((acc, d) => acc + toBasisPoints(d.percentage), 0);
  const totalPercentage = totalBps / 100;

  if (plan?.enabled) {
    if (destinations.length === 0) {
      errors.push("Auto-split is enabled but no destinations are configured.");
    }
    destinations.forEach((d, i) => {
      if (!isValidSplitAddress(d.address)) {
        errors.push(`Destination ${i + 1} ("${d.label || "untitled"}") is not a valid Stellar public key.`);
      }
      if (!(d.percentage > 0) || d.percentage > 100) {
        errors.push(`Destination ${i + 1} ("${d.label || "untitled"}") percentage must be between 0 and 100.`);
      }
    });
    const seen = new Set<string>();
    for (const d of destinations) {
      const key = d.address.trim();
      if (seen.has(key)) {
        errors.push(`Duplicate destination address ${key.slice(0, 6)}...${key.slice(-4)}.`);
        break;
      }
      seen.add(key);
    }
    if (destinations.length > 0 && totalBps !== 10000) {
      errors.push(
        `Total allocation is ${totalPercentage.toFixed(2)}% but must sum to exactly 100%.`,
      );
    }
  }

  return { valid: errors.length === 0, errors, totalPercentage };
}

/**
 * Allocates a claim total across destinations with exact stroop accounting.
 * Each share is floored to whole stroops; the leftover stroops are handed to
 * the destinations with the largest fractional remainder (largest-remainder
 * method), guaranteeing the allocations sum to the withdrawn amount exactly.
 */
export function computeSplitAllocations(
  totalStroops: bigint,
  destinations: SplitDestination[],
): SplitAllocation[] {
  if (totalStroops <= 0n || destinations.length === 0) return [];

  const bpsTotal = destinations.reduce((acc, d) => acc + toBasisPoints(d.percentage), 0);
  const shares = destinations.map((destination, index) => {
    const bps = BigInt(toBasisPoints(destination.percentage));
    const exact = totalStroops * bps;
    const floored = exact / BigInt(bpsTotal);
    return { destination, index, amount: floored, remainder: exact - floored * BigInt(bpsTotal) };
  });

  let allocated = shares.reduce((acc, s) => acc + s.amount, 0n);
  let leftover = totalStroops - allocated;

  const ordered = [...shares].sort((a, b) => {
    if (b.remainder !== a.remainder) return b.remainder > a.remainder ? 1 : -1;
    return a.index - b.index;
  });

  for (const share of ordered) {
    if (leftover <= 0n) break;
    share.amount += 1n;
    leftover -= 1n;
  }
  allocated = shares.reduce((acc, s) => acc + s.amount, 0n);

  return shares
    .sort((a, b) => a.index - b.index)
    .map((s) => ({
      destination: s.destination,
      amountStroops: s.amount,
      amountXlm: Number(s.amount) / 1e7,
    }))
    .filter((s) => allocated >= 0n && s.amountStroops > 0n);
}

export function xlmToStroops(xlm: number): bigint {
  return BigInt(Math.round(xlm * 1e7));
}

export function formatStroopsAsXlm(stroops: bigint): string {
  const whole = stroops / STROOPS_PER_XLM;
  const frac = (stroops % STROOPS_PER_XLM).toString().padStart(7, "0");
  return `${whole}.${frac}`;
}

export function toSplitAllocationReceipts(allocations: SplitAllocation[]): SplitAllocationReceipt[] {
  return allocations.map((a) => ({
    label: a.destination.label,
    address: a.destination.address,
    percentage: a.destination.percentage,
    amountXlm: a.amountXlm,
    amountStroops: a.amountStroops.toString(),
  }));
}

/**
 * Builds native XLM `payment` operations for each allocation. These are
 * appended to the claim transaction so every destination receives its share
 * inside one atomic envelope.
 */
export function buildSplitPaymentOperations(
  allocations: SplitAllocation[],
): xdr.Operation[] {
  return allocations.map((allocation) =>
    Operation.payment({
      destination: allocation.destination.address.trim(),
      asset: Asset.native(),
      amount: formatStroopsAsXlm(allocation.amountStroops),
    }),
  );
}

/**
 * Extracts an enabled + valid split plan from raw affiliate preference fields,
 * returning null when claims should pay out in full to the affiliate.
 */
export function resolveActiveSplitPlan(prefs: {
  autoSplitEnabled?: boolean;
  autoSplitDestinations?: SplitDestination[];
}): SplitPlan | null {
  if (!prefs.autoSplitEnabled || !Array.isArray(prefs.autoSplitDestinations)) return null;
  const plan: SplitPlan = {
    enabled: true,
    destinations: prefs.autoSplitDestinations,
  };
  return validateSplitPlan(plan).valid ? plan : null;
}
