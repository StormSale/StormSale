import { getLocalStorage } from "./storage";

export interface CommissionTier {
  name: string;
  volumeThreshold: number;
  commissionRate: number;
}

export interface CampaignCommissionConfig {
  campaignId: string;
  baseRate: number;
  tiers: CommissionTier[];
  updatedAt: string;
}

export interface CommissionAssessment {
  currentTier: CommissionTier | null;
  nextTier: CommissionTier | null;
  commissionRate: number;
  progressPercent: number;
}

const COMMISSION_CONFIG_PREFIX = "stormsale_commission_tiers_v1_";
const AFFILIATE_VOLUME_PREFIX = "stormsale_commission_volume_v1_";

export function normalizeCommissionCampaignId(campaignId: string): string {
  return campaignId.trim().replace(/^campaign\s*#\s*/i, "");
}

export function getCommissionTierValidationError(
  baseRate: number,
  tiers: CommissionTier[],
): string | null {
  if (!Number.isFinite(baseRate) || baseRate < 1 || baseRate > 50) {
    return "The base commission rate must be between 1% and 50%.";
  }

  const thresholds = new Set<number>();
  let previousRate = baseRate;
  const orderedTiers = [...tiers].sort((a, b) => a.volumeThreshold - b.volumeThreshold);
  for (const tier of orderedTiers) {
    if (!tier.name.trim()) return "Every tier needs a name.";
    if (!Number.isFinite(tier.volumeThreshold) || tier.volumeThreshold <= 0) {
      return `Enter a positive sales-volume threshold for ${tier.name}.`;
    }
    if (thresholds.has(tier.volumeThreshold)) {
      return "Each tier must have a unique sales-volume threshold.";
    }
    thresholds.add(tier.volumeThreshold);
    if (
      !Number.isFinite(tier.commissionRate) ||
      tier.commissionRate < 1 ||
      tier.commissionRate > 50
    ) {
      return `The commission rate for ${tier.name} must be between 1% and 50%.`;
    }
    if (tier.commissionRate <= previousRate) {
      return "Each higher-volume tier must have a higher commission rate than the previous tier.";
    }
    previousRate = tier.commissionRate;
  }

  return null;
}

function commissionConfigKey(campaignId: string): string {
  return `${COMMISSION_CONFIG_PREFIX}${normalizeCommissionCampaignId(campaignId)}`;
}

function affiliateVolumeKey(campaignId: string, affiliateAddress: string): string {
  return `${AFFILIATE_VOLUME_PREFIX}${normalizeCommissionCampaignId(campaignId)}_${affiliateAddress.trim().toLowerCase()}`;
}

function parseCommissionConfig(value: unknown, campaignId: string): CampaignCommissionConfig {
  if (!value || typeof value !== "object") {
    throw new Error("Stored campaign commission metadata is invalid.");
  }

  const config = value as Partial<CampaignCommissionConfig>;
  if (
    typeof config.baseRate !== "number" ||
    !Array.isArray(config.tiers) ||
    typeof config.updatedAt !== "string"
  ) {
    throw new Error("Stored campaign commission metadata is incomplete.");
  }

  const tiers = config.tiers.map((tier) => {
    if (
      !tier ||
      typeof tier !== "object" ||
      typeof tier.name !== "string" ||
      typeof tier.volumeThreshold !== "number" ||
      typeof tier.commissionRate !== "number"
    ) {
      throw new Error("Stored campaign commission tier is invalid.");
    }
    return {
      name: tier.name,
      volumeThreshold: tier.volumeThreshold,
      commissionRate: tier.commissionRate,
    };
  });
  const validationError = getCommissionTierValidationError(config.baseRate, tiers);
  if (validationError) throw new Error(validationError);

  return {
    campaignId: normalizeCommissionCampaignId(campaignId),
    baseRate: config.baseRate,
    tiers: [...tiers].sort((a, b) => a.volumeThreshold - b.volumeThreshold),
    updatedAt: config.updatedAt,
  };
}

export function saveCampaignCommissionConfig(
  campaignId: string,
  baseRate: number,
  tiers: CommissionTier[],
): CampaignCommissionConfig {
  const normalizedCampaignId = normalizeCommissionCampaignId(campaignId);
  if (!normalizedCampaignId) throw new Error("A campaign ID is required to save commission tiers.");

  const validationError = getCommissionTierValidationError(baseRate, tiers);
  if (validationError) throw new Error(validationError);

  const config: CampaignCommissionConfig = {
    campaignId: normalizedCampaignId,
    baseRate,
    tiers: [...tiers].sort((a, b) => a.volumeThreshold - b.volumeThreshold),
    updatedAt: new Date().toISOString(),
  };
  getLocalStorage().setItem(commissionConfigKey(normalizedCampaignId), JSON.stringify(config));
  return config;
}

export function loadCampaignCommissionConfig(campaignId: string): CampaignCommissionConfig | null {
  const normalizedCampaignId = normalizeCommissionCampaignId(campaignId);
  if (!normalizedCampaignId) return null;
  const raw = getLocalStorage().getItem(commissionConfigKey(normalizedCampaignId));
  if (!raw) return null;

  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch (error) {
    throw new Error("Stored campaign commission metadata could not be read.", { cause: error });
  }
  return parseCommissionConfig(value, normalizedCampaignId);
}

export function assessCommissionTier(
  config: CampaignCommissionConfig,
  historicalVolume: number,
): CommissionAssessment {
  if (!Number.isFinite(historicalVolume) || historicalVolume < 0) {
    throw new Error("Historical sales volume must be a non-negative number.");
  }

  const currentTier =
    [...config.tiers]
      .sort((a, b) => a.volumeThreshold - b.volumeThreshold)
      .filter((tier) => historicalVolume >= tier.volumeThreshold)
      .at(-1) ?? null;
  const nextTier =
    config.tiers
      .filter((tier) => historicalVolume < tier.volumeThreshold)
      .sort((a, b) => a.volumeThreshold - b.volumeThreshold)[0] ?? null;

  const lowerBound = currentTier?.volumeThreshold ?? 0;
  const progressPercent = nextTier
    ? Math.min(
        100,
        Math.max(
          0,
          ((historicalVolume - lowerBound) / (nextTier.volumeThreshold - lowerBound)) * 100,
        ),
      )
    : 100;

  return {
    currentTier,
    nextTier,
    commissionRate: currentTier?.commissionRate ?? config.baseRate,
    progressPercent,
  };
}

export function getAffiliateCampaignVolume(campaignId: string, affiliateAddress: string): number {
  if (!affiliateAddress.trim()) return 0;
  const raw = getLocalStorage().getItem(affiliateVolumeKey(campaignId, affiliateAddress));
  if (!raw) return 0;

  const volume = Number(raw);
  if (!Number.isFinite(volume) || volume < 0) {
    throw new Error("Stored affiliate sales volume is invalid.");
  }
  return volume;
}

export function recordAffiliateCampaignSale(
  campaignId: string,
  affiliateAddress: string,
  saleAmount: number,
): number {
  if (!affiliateAddress.trim()) throw new Error("An affiliate address is required.");
  if (!Number.isFinite(saleAmount) || saleAmount <= 0) {
    throw new Error("Sale amount must be a positive number.");
  }

  const newVolume = getAffiliateCampaignVolume(campaignId, affiliateAddress) + saleAmount;
  getLocalStorage().setItem(affiliateVolumeKey(campaignId, affiliateAddress), newVolume.toString());
  return newVolume;
}

export function calculateCommissionAmount(saleAmount: number, commissionRate: number): number {
  if (
    !Number.isFinite(saleAmount) ||
    saleAmount < 0 ||
    !Number.isFinite(commissionRate) ||
    commissionRate < 0
  ) {
    throw new Error("Sale amount and commission rate must be non-negative numbers.");
  }
  return Number(((saleAmount * commissionRate) / 100).toFixed(7));
}
