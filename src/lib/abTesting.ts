/**
 * A/B Testing Attribution Optimizer for Affiliate Landing Variants (#155)
 *
 * Advertisers split incoming affiliate referral traffic across multiple landing
 * page destination URLs using weight sliders (default 50/50). The redirect
 * engine routes each visitor deterministically from a referral hash so the same
 * visitor always lands on the same variant, and the optimizer aggregates CVR,
 * bounce rate, and average basket value per variant for side-by-side comparison.
 */

export interface LandingVariant {
  id: string;
  label: string;
  url: string;
  /** Relative split weight (integer 0-100 slider value) */
  weight: number;
}

export interface LandingSplitSettings {
  enabled: boolean;
  variants: LandingVariant[];
}

export type VariantEventType = "page_view" | "bounce" | "conversion";

export interface VariantEvent {
  variantId: string;
  type: VariantEventType;
  /** Sale value in XLM; required on "conversion" events */
  basketValueXlm?: number;
  /** Unix seconds */
  timestamp: number;
}

export interface VariantPerformance {
  variantId: string;
  label: string;
  url: string;
  weight: number;
  views: number;
  bounces: number;
  conversions: number;
  totalRevenueXlm: number;
  /** Share of recorded page views across the split, in percent */
  trafficSharePercent: number;
  /** Conversions per view, in percent */
  cvrPercent: number;
  /** Bounces per view, in percent */
  bounceRatePercent: number;
  avgBasketValueXlm: number;
}

export interface VariantWinner {
  winnerId: string;
  runnerUpId: string;
  /** CVR lift of the winner over the runner-up, in percent */
  cvrLiftPercent: number;
}

export const DEFAULT_LANDING_SPLIT: LandingSplitSettings = {
  enabled: false,
  variants: [
    { id: "variant_a", label: "Variant A", url: "", weight: 50 },
    { id: "variant_b", label: "Variant B", url: "", weight: 50 },
  ],
};

/**
 * FNV-1a 32-bit hash: fast, dependency-free, and evenly distributed enough for
 * deterministic traffic bucketing from `campaignId:visitorRef` strings.
 */
export function fnv1a32(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** Validates a landing destination URL (http/https only). */
export function isValidVariantUrl(url: string): boolean {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

/** Variants eligible to receive traffic: positive weight and a valid URL. */
export function activeVariants(variants: LandingVariant[]): LandingVariant[] {
  return variants.filter((v) => v.weight > 0 && isValidVariantUrl(v.url));
}

/**
 * Client redirect engine: routes a referral visit to a landing variant
 * deterministically from the hash of `campaignId:visitorRef` mapped onto the
 * cumulative weight distribution. Same visitor + campaign always resolves to
 * the same variant, and traffic distributes proportionally to the configured
 * split ratios.
 */
export function routeLandingVariant(
  campaignId: number,
  visitorRef: string,
  variants: LandingVariant[],
): LandingVariant | null {
  const eligible = activeVariants(variants);
  if (eligible.length === 0 || !visitorRef) return null;

  const total = eligible.reduce((sum, v) => sum + v.weight, 0);
  const bucket = fnv1a32(`${campaignId}:${visitorRef}`) % total;

  let cumulative = 0;
  for (const variant of eligible) {
    cumulative += variant.weight;
    if (bucket < cumulative) return variant;
  }
  return eligible[eligible.length - 1];
}

/**
 * Validates split configuration coming from the campaign creator form:
 * enabled splits need at least two routable variants and a positive total weight.
 */
export function validateLandingSplit(settings: LandingSplitSettings): {
  valid: boolean;
  error?: string;
} {
  if (!settings.enabled) return { valid: true };
  if (settings.variants.length < 2) {
    return { valid: false, error: "A/B testing requires at least two landing variants." };
  }
  const invalid = settings.variants.find((v) => !isValidVariantUrl(v.url));
  if (invalid) {
    return { valid: false, error: `Invalid landing URL for ${invalid.label || invalid.id}.` };
  }
  const total = settings.variants.reduce((sum, v) => sum + Math.max(0, v.weight), 0);
  if (total <= 0) {
    return { valid: false, error: "Variant traffic weights must add up to more than zero." };
  }
  return { valid: true };
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Aggregates per-variant performance: traffic share, conversion rate (CVR),
 * bounce rate, and average basket value from raw variant events.
 */
export function computeVariantPerformance(
  variants: LandingVariant[],
  events: VariantEvent[],
): VariantPerformance[] {
  const totalViews = events.filter((e) => e.type === "page_view").length;

  return variants.map((variant) => {
    const variantEvents = events.filter((e) => e.variantId === variant.id);
    const views = variantEvents.filter((e) => e.type === "page_view").length;
    const bounces = variantEvents.filter((e) => e.type === "bounce").length;
    const conversions = variantEvents.filter((e) => e.type === "conversion");
    const totalRevenueXlm = round2(
      conversions.reduce((sum, e) => sum + (e.basketValueXlm || 0), 0),
    );

    return {
      variantId: variant.id,
      label: variant.label,
      url: variant.url,
      weight: variant.weight,
      views,
      bounces,
      conversions: conversions.length,
      totalRevenueXlm,
      trafficSharePercent: totalViews > 0 ? round2((views / totalViews) * 100) : 0,
      cvrPercent: views > 0 ? round2((conversions.length / views) * 100) : 0,
      bounceRatePercent: views > 0 ? round2((bounces / views) * 100) : 0,
      avgBasketValueXlm: conversions.length > 0 ? round2(totalRevenueXlm / conversions.length) : 0,
    };
  });
}

/**
 * Picks the winning variant by conversion rate and reports the CVR lift over
 * the runner-up. Returns null when fewer than two variants recorded any views.
 */
export function determineWinningVariant(performance: VariantPerformance[]): VariantWinner | null {
  const measured = performance.filter((p) => p.views > 0);
  if (measured.length < 2) return null;

  const ranked = [...measured].sort(
    (a, b) => b.cvrPercent - a.cvrPercent || b.avgBasketValueXlm - a.avgBasketValueXlm,
  );
  const winner = ranked[0];
  const runnerUp = ranked[1];

  const cvrLiftPercent =
    runnerUp.cvrPercent > 0
      ? round2(((winner.cvrPercent - runnerUp.cvrPercent) / runnerUp.cvrPercent) * 100)
      : 0;

  return { winnerId: winner.variantId, runnerUpId: runnerUp.variantId, cvrLiftPercent };
}

/**
 * Builds an affiliate referral link carrying the campaign and visitor hint so
 * the redirect engine can bucket the visit deterministically.
 */
export function buildVariantReferralLink(
  baseUrl: string,
  campaignId: number,
  affiliateId: string,
): string {
  const sep = baseUrl.includes("?") ? "&" : "?";
  return `${baseUrl}${sep}campaign=${campaignId}&aff=${encodeURIComponent(affiliateId)}`;
}
