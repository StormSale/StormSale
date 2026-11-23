import { convertFiatToXlm, convertXlmToFiat, type OracleRates } from "./priceOracle";

export type AffiliateTierName = "Bronze" | "Silver" | "Gold" | "Platinum";

export interface AffiliateTier {
  name: AffiliateTierName;
  minVolumeUsd: number;
  commissionRate: number;
}

export const AFFILIATE_TIERS: readonly AffiliateTier[] = [
  { name: "Bronze", minVolumeUsd: 0, commissionRate: 0.05 },
  { name: "Silver", minVolumeUsd: 10_000, commissionRate: 0.08 },
  { name: "Gold", minVolumeUsd: 50_000, commissionRate: 0.12 },
  { name: "Platinum", minVolumeUsd: 250_000, commissionRate: 0.15 },
];

function normalizeVolume(volumeUsd: number): number {
  return Number.isFinite(volumeUsd) && volumeUsd > 0 ? volumeUsd : 0;
}

export function getTierForVolume(lifetimeVolumeUsd: number): AffiliateTier {
  const volume = normalizeVolume(lifetimeVolumeUsd);
  let current = AFFILIATE_TIERS[0];
  for (const tier of AFFILIATE_TIERS) {
    if (volume < tier.minVolumeUsd) break;
    current = tier;
  }
  return current;
}

export interface TierProgress {
  tier: AffiliateTier;
  nextTier: AffiliateTier | null;
  progressPercentage: number;
  remainingVolumeUsd: number;
}

export function getTierProgress(lifetimeVolumeUsd: number): TierProgress {
  const volume = normalizeVolume(lifetimeVolumeUsd);
  const tier = getTierForVolume(volume);
  const nextTier = AFFILIATE_TIERS[AFFILIATE_TIERS.indexOf(tier) + 1] ?? null;

  if (!nextTier) {
    return { tier, nextTier: null, progressPercentage: 100, remainingVolumeUsd: 0 };
  }

  const tierSpan = nextTier.minVolumeUsd - tier.minVolumeUsd;
  const progress = ((volume - tier.minVolumeUsd) / tierSpan) * 100;

  return {
    tier,
    nextTier,
    progressPercentage: Math.min(100, Math.max(0, Math.round(progress))),
    remainingVolumeUsd: Math.round((nextTier.minVolumeUsd - volume) * 100) / 100,
  };
}

export interface CommissionEstimate {
  tier: AffiliateTier;
  ratePercent: number;
  volumeUsd: number;
  usd: number;
  xlm: number;
  usdc: number;
  eur: number;
}

export function calculateCommissionEstimate(
  referredVolumeUsd: number,
  lifetimeVolumeUsd: number,
  rates: OracleRates,
): CommissionEstimate {
  const volume = normalizeVolume(referredVolumeUsd);
  const tier = getTierForVolume(lifetimeVolumeUsd);
  const usd = Math.round(volume * tier.commissionRate * 100) / 100;
  const xlm = convertFiatToXlm(usd, "USD", rates);

  return {
    tier,
    ratePercent: Math.round(tier.commissionRate * 100),
    volumeUsd: volume,
    usd,
    xlm,
    usdc: convertXlmToFiat(xlm, "USDC", rates),
    eur: convertXlmToFiat(xlm, "EUR", rates),
  };
}
