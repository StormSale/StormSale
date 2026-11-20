/**
 * src/utils/abTesting.ts
 *
 * A/B Testing Attribution Optimizer for Affiliate Landing Variants (Issue #155).
 * Deterministic referral hash routing, weight split management, and performance analytics.
 */

export interface LandingPageVariant {
  id: string;
  name: string;
  url: string;
  weight: number; // Split weight percentage (0 - 100)
}

export interface VariantMetrics {
  variantId: string;
  variantName: string;
  variantUrl: string;
  weight: number;
  visitors: number;
  bounces: number;
  conversions: number;
  totalRevenue: number;
  cvr: number; // Conversion rate % (conversions / visitors * 100)
  bounceRate: number; // Bounce rate % (bounces / visitors * 100)
  aov: number; // Average Basket / Order Value ($)
  isWinner?: boolean;
}

export interface CampaignVariantConfig {
  enabled: boolean;
  variants: LandingPageVariant[];
}

/**
 * Deterministically computes a numeric score in the range [0, 99]
 * from an input seed (e.g. referral hash, wallet address, or visitor ID).
 * Uses FNV-1a 32-bit hashing algorithm.
 */
export function computeReferralHashScore(seed: string): number {
  if (!seed) return 0;
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    hash ^= seed.charCodeAt(i);
    hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }
  return Math.abs(hash >>> 0) % 100;
}

/**
 * Normalizes an array of variants so that their weights sum to 100.
 * If total weight is 0, splits weights equally.
 */
export function normalizeVariantWeights(variants: LandingPageVariant[]): LandingPageVariant[] {
  if (variants.length === 0) return [];
  const totalWeight = variants.reduce((sum, v) => sum + Math.max(0, v.weight), 0);

  if (totalWeight <= 0) {
    const equalShare = Math.floor(100 / variants.length);
    const remainder = 100 % variants.length;
    return variants.map((v, i) => ({
      ...v,
      weight: equalShare + (i < remainder ? 1 : 0),
    }));
  }

  let cumulative = 0;
  return variants.map((v, i) => {
    if (i === variants.length - 1) {
      return { ...v, weight: 100 - cumulative };
    }
    const scaled = Math.round((Math.max(0, v.weight) / totalWeight) * 100);
    cumulative += scaled;
    return { ...v, weight: scaled };
  });
}

/**
 * Deterministically selects a landing page variant based on the referral seed
 * and the configured variant split weights.
 */
export function routeTrafficToVariant(
  variants: LandingPageVariant[],
  seed: string,
): LandingPageVariant | null {
  if (!variants || variants.length === 0) return null;
  if (variants.length === 1) return variants[0];

  const normalized = normalizeVariantWeights(variants);
  const score = computeReferralHashScore(seed);

  let threshold = 0;
  for (const variant of normalized) {
    threshold += variant.weight;
    if (score < threshold) {
      return variant;
    }
  }

  return normalized[normalized.length - 1];
}

/**
 * Calculates conversion rate, bounce rate, and average basket value (AOV) per variant,
 * and identifies the top-performing winner based on CVR.
 */
export function calculateVariantPerformance(
  variants: LandingPageVariant[],
  rawStats?: Array<{
    variantId: string;
    visitors: number;
    bounces: number;
    conversions: number;
    totalRevenue: number;
  }>,
): VariantMetrics[] {
  const statsMap = new Map(rawStats?.map((s) => [s.variantId, s]) || []);

  const results: VariantMetrics[] = variants.map((v) => {
    const s = statsMap.get(v.id) || {
      visitors: 0,
      bounces: 0,
      conversions: 0,
      totalRevenue: 0,
    };

    const visitors = Math.max(0, s.visitors);
    const conversions = Math.max(0, s.conversions);
    const bounces = Math.max(0, s.bounces);
    const totalRevenue = Math.max(0, s.totalRevenue);

    const cvr = visitors > 0 ? Number(((conversions / visitors) * 100).toFixed(2)) : 0;
    const bounceRate = visitors > 0 ? Number(((bounces / visitors) * 100).toFixed(2)) : 0;
    const aov = conversions > 0 ? Number((totalRevenue / conversions).toFixed(2)) : 0;

    return {
      variantId: v.id,
      variantName: v.name,
      variantUrl: v.url,
      weight: v.weight,
      visitors,
      bounces,
      conversions,
      totalRevenue,
      cvr,
      bounceRate,
      aov,
    };
  });

  // Determine winning variant by highest CVR (min 1 conversion)
  let maxCvr = -1;
  let winnerIndex = -1;

  results.forEach((r, idx) => {
    if (r.conversions > 0 && r.cvr > maxCvr) {
      maxCvr = r.cvr;
      winnerIndex = idx;
    }
  });

  if (winnerIndex >= 0) {
    results[winnerIndex].isWinner = true;
  }

  return results;
}
