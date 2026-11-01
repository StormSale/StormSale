import { xdr, nativeToScVal, scValToNative } from "@stellar/stellar-sdk";

export interface CommissionTier {
  id: string;
  name: string;
  minSales: number;
  commissionRate: number; // percentage, e.g. 15 for 15%
  description?: string;
}

export const DEFAULT_COMMISSION_TIERS: CommissionTier[] = [
  {
    id: "tier-1",
    name: "Base Tier",
    minSales: 0,
    commissionRate: 10,
    description: "Standard entry rate for all affiliates",
  },
  {
    id: "tier-2",
    name: "Silver Tier",
    minSales: 50,
    commissionRate: 15,
    description: "Unlocked after reaching 50+ sales",
  },
  {
    id: "tier-3",
    name: "Gold Tier",
    minSales: 100,
    commissionRate: 20,
    description: "High-volume performers (>100 sales)",
  },
  {
    id: "tier-4",
    name: "Platinum Tier",
    minSales: 250,
    commissionRate: 25,
    description: "Top-echelon affiliates (>250 sales)",
  },
];

/**
 * Validates a collection of commission tiers.
 */
export function validateCommissionTiers(tiers: CommissionTier[]): {
  valid: boolean;
  error?: string;
} {
  if (!tiers || tiers.length === 0) {
    return { valid: false, error: "At least one commission tier is required." };
  }

  const seenThresholds = new Set<number>();

  for (let i = 0; i < tiers.length; i++) {
    const tier = tiers[i];

    if (!tier.name || tier.name.trim() === "") {
      return { valid: false, error: `Tier #${i + 1} must have a name.` };
    }

    if (
      tier.minSales === undefined ||
      tier.minSales === null ||
      isNaN(tier.minSales) ||
      tier.minSales < 0
    ) {
      return {
        valid: false,
        error: `Tier "${tier.name}" must have a valid sales threshold of 0 or greater.`,
      };
    }

    if (
      tier.commissionRate === undefined ||
      tier.commissionRate === null ||
      isNaN(tier.commissionRate) ||
      tier.commissionRate <= 0 ||
      tier.commissionRate > 100
    ) {
      return {
        valid: false,
        error: `Tier "${tier.name}" commission rate must be between 1% and 100%.`,
      };
    }

    if (seenThresholds.has(tier.minSales)) {
      return {
        valid: false,
        error: `Multiple tiers share the same sales threshold (${tier.minSales} sales). Thresholds must be unique.`,
      };
    }
    seenThresholds.add(tier.minSales);
  }

  // Ensure there is at least one baseline tier starting at 0 sales
  if (!seenThresholds.has(0)) {
    return {
      valid: false,
      error: "A baseline tier with a threshold of 0 sales is required for new affiliates.",
    };
  }

  return { valid: true };
}

/**
 * Maps a single CommissionTier into a Soroban ScVal Map for on-chain storage/invocation.
 */
export function mapTierToScVal(tier: CommissionTier): xdr.ScVal {
  const rateBps = Math.floor(tier.commissionRate * 100);
  const minSales = Math.floor(Math.max(0, tier.minSales));

  return xdr.ScVal.scvMap([
    new xdr.ScMapEntry({
      key: xdr.ScVal.scvSymbol("name"),
      val: nativeToScVal(tier.name, { type: "string" }),
    }),
    new xdr.ScMapEntry({
      key: xdr.ScVal.scvSymbol("min_sales"),
      val: nativeToScVal(minSales, { type: "u32" }),
    }),
    new xdr.ScMapEntry({
      key: xdr.ScVal.scvSymbol("rate_bps"),
      val: nativeToScVal(rateBps, { type: "u32" }),
    }),
  ]);
}

/**
 * Maps an array of CommissionTiers into a Soroban ScVal Vec for on-chain contract submission.
 */
export function mapTiersToScValVec(tiers: CommissionTier[]): xdr.ScVal {
  const sorted = [...tiers].sort((a, b) => a.minSales - b.minSales);
  const scValTiers = sorted.map((tier) => mapTierToScVal(tier));
  return xdr.ScVal.scvVec(scValTiers);
}

/**
 * Decodes an on-chain Soroban ScVal Map back into a CommissionTier.
 */
export function mapScValToTier(scVal: xdr.ScVal, index: number = 0): CommissionTier {
  const raw = scValToNative(scVal);

  if (typeof raw === "object" && raw !== null) {
    const name = raw.name || `Tier ${index + 1}`;
    const minSales = typeof raw.min_sales === "number" ? raw.min_sales : Number(raw.min_sales || 0);
    const rateBps = typeof raw.rate_bps === "number" ? raw.rate_bps : Number(raw.rate_bps || 0);
    const commissionRate = rateBps / 100;

    return {
      id: `onchain-tier-${index}-${minSales}`,
      name,
      minSales,
      commissionRate,
    };
  }

  return {
    id: `onchain-tier-${index}`,
    name: `Tier ${index + 1}`,
    minSales: 0,
    commissionRate: 10,
  };
}

/**
 * Decodes an on-chain Soroban ScVal Vec back into an array of CommissionTiers.
 */
export function mapScValVecToTiers(scValVec: xdr.ScVal): CommissionTier[] {
  const raw = scValVec as unknown as { type?: string; vec?: xdr.ScVal[] | (() => xdr.ScVal[]) };
  if (raw.type !== "scvVec") {
    return [];
  }

  const vec = typeof raw.vec === "function" ? raw.vec() : raw.vec;
  if (!Array.isArray(vec)) return [];

  return vec.map((entry: xdr.ScVal, idx: number) => mapScValToTier(entry, idx));
}

/**
 * Calculates the active tier and applicable commission rate for an affiliate
 * based on their cumulative sales count against defined campaign tiers.
 */
export function resolveTierForSales(
  salesCount: number,
  tiers: CommissionTier[],
  fallbackRate: number = 10,
): {
  tier: CommissionTier | null;
  commissionRate: number;
  nextTier: CommissionTier | null;
  salesToNextTier: number;
} {
  if (!tiers || tiers.length === 0) {
    return {
      tier: null,
      commissionRate: fallbackRate,
      nextTier: null,
      salesToNextTier: 0,
    };
  }

  // Sort ascending for nextTier determination
  const sortedAsc = [...tiers].sort((a, b) => a.minSales - b.minSales);
  // Sort descending to find highest matching threshold
  const sortedDesc = [...tiers].sort((b, a) => a.minSales - b.minSales);

  const matchedTier = sortedDesc.find((t) => salesCount >= t.minSales) || sortedAsc[0];
  const nextTier = sortedAsc.find((t) => t.minSales > salesCount) || null;
  const salesToNextTier = nextTier ? Math.max(0, nextTier.minSales - salesCount) : 0;

  return {
    tier: matchedTier,
    commissionRate: matchedTier ? matchedTier.commissionRate : fallbackRate,
    nextTier,
    salesToNextTier,
  };
}
