export interface RewardTier {
  minSales: number;
  ratePercent: number;
}

/** Must be sorted by minSales, lowest first. */
export const DEFAULT_TIERS: RewardTier[] = [
  { minSales: 0, ratePercent: 10 },
  { minSales: 10, ratePercent: 15 },
  { minSales: 50, ratePercent: 20 },
];

export function tierRatePercent(confirmedSales: number, tiers: RewardTier[] = DEFAULT_TIERS) {
  let rate = tiers[0].ratePercent;
  for (const tier of tiers) {
    if (confirmedSales >= tier.minSales) rate = tier.ratePercent;
  }
  return rate;
}

/** Commission in major units, rounded down to the cent. */
export function calculateCommission(
  amount: number,
  confirmedSales: number,
  tiers: RewardTier[] = DEFAULT_TIERS,
): number {
  const rate = tierRatePercent(confirmedSales, tiers);
  return Math.floor(amount * rate) / 100;
}
