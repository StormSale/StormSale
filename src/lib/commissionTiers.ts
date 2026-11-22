export interface CommissionTier {
  id: string;
  thresholdSales: number;
  ratePercent: number;
}

export const DEFAULT_COMMISSION_TIERS: CommissionTier[] = [
  { id: "tier-1", thresholdSales: 0, ratePercent: 10 },
  { id: "tier-2", thresholdSales: 100, ratePercent: 15 },
];

/**
 * Returns the highest tier an affiliate has unlocked. Tiers are evaluated by
 * threshold, so the result is deterministic even when the UI order changes.
 */
export function getCommissionRateForSales(
  tiers: CommissionTier[],
  sales: number,
): number {
  const eligible = tiers
    .filter((tier) => tier.thresholdSales <= sales)
    .sort((a, b) => b.thresholdSales - a.thresholdSales);

  return eligible[0]?.ratePercent ?? 0;
}

export function validateCommissionTiers(tiers: CommissionTier[]): string | null {
  if (tiers.length === 0) return "Add at least one commission tier.";

  const sorted = [...tiers].sort((a, b) => a.thresholdSales - b.thresholdSales);
  if (sorted[0].thresholdSales !== 0) {
    return "The first tier must start at 0 sales.";
  }

  for (let index = 0; index < sorted.length; index += 1) {
    const tier = sorted[index];
    if (!Number.isInteger(tier.thresholdSales) || tier.thresholdSales < 0) {
      return "Tier thresholds must be whole numbers of sales.";
    }
    if (!Number.isFinite(tier.ratePercent) || tier.ratePercent < 1 || tier.ratePercent > 50) {
      return "Tier commission rates must be between 1% and 50%.";
    }
    if (index > 0 && tier.thresholdSales === sorted[index - 1].thresholdSales) {
      return "Each tier must have a unique sales threshold.";
    }
  }

  return null;
}
