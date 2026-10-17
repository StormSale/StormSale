import { describe, it, expect } from "vitest";
import {
  fnv1a32,
  isValidVariantUrl,
  activeVariants,
  routeLandingVariant,
  validateLandingSplit,
  computeVariantPerformance,
  determineWinningVariant,
  buildVariantReferralLink,
  DEFAULT_LANDING_SPLIT,
  type LandingVariant,
  type VariantEvent,
} from "../lib/abTesting";

const DAY = 86400;
const BASE = 1700000000;

const variants: LandingVariant[] = [
  { id: "variant_a", label: "Variant A", url: "https://store.example.com/a", weight: 50 },
  { id: "variant_b", label: "Variant B", url: "https://store.example.com/b", weight: 50 },
];

describe("A/B Testing Attribution Optimizer (#155)", () => {
  describe("Deterministic redirect engine", () => {
    it("routes the same visitor to the same variant every time", () => {
      const first = routeLandingVariant(101, "visitor-hash-abc", variants);
      const second = routeLandingVariant(101, "visitor-hash-abc", variants);
      expect(first?.id).toBe(second?.id);
      expect(first?.id).toBeTruthy();
    });

    it("hashes are stable across calls", () => {
      expect(fnv1a32("stormsale")).toBe(fnv1a32("stormsale"));
      expect(fnv1a32("stormsale")).not.toBe(fnv1a32("stormsale-2"));
    });

    it("splits traffic close to the configured 50/50 ratio", () => {
      let a = 0;
      let b = 0;
      for (let i = 0; i < 4000; i++) {
        const routed = routeLandingVariant(101, `visitor-${i}`, variants);
        if (routed?.id === "variant_a") a++;
        else b++;
      }
      const shareA = (a / (a + b)) * 100;
      expect(shareA).toBeGreaterThan(45);
      expect(shareA).toBeLessThan(55);
    });

    it("honours uneven split ratios from the weight sliders", () => {
      const skewed: LandingVariant[] = [
        { id: "variant_a", label: "A", url: "https://store.example.com/a", weight: 70 },
        { id: "variant_b", label: "B", url: "https://store.example.com/b", weight: 30 },
      ];
      let a = 0;
      const total = 3000;
      for (let i = 0; i < total; i++) {
        if (routeLandingVariant(202, `ref-${i}`, skewed)?.id === "variant_a") a++;
      }
      const shareA = (a / total) * 100;
      expect(shareA).toBeGreaterThan(63);
      expect(shareA).toBeLessThan(77);
    });

    it("ignores variants with zero weight or invalid urls and returns null when none can route", () => {
      const broken: LandingVariant[] = [
        { id: "v1", label: "Zero", url: "https://store.example.com/x", weight: 0 },
        { id: "v2", label: "Bad", url: "not-a-url", weight: 50 },
      ];
      expect(routeLandingVariant(1, "visitor", broken)).toBeNull();
      expect(activeVariants(variants).length).toBe(2);
    });
  });

  describe("Variant configuration validation", () => {
    it("accepts http(s) urls and rejects everything else", () => {
      expect(isValidVariantUrl("https://store.example.com/a")).toBe(true);
      expect(isValidVariantUrl("http://localhost:3000/promo")).toBe(true);
      expect(isValidVariantUrl("javascript:alert(1)")).toBe(false);
      expect(isValidVariantUrl("store.example.com")).toBe(false);
      expect(isValidVariantUrl("")).toBe(false);
    });

    it("requires two routable variants and positive total weight when enabled", () => {
      expect(validateLandingSplit({ enabled: false, variants: [] }).valid).toBe(true);
      expect(validateLandingSplit({ enabled: true, variants: [variants[0]] }).valid).toBe(false);
      expect(
        validateLandingSplit({
          enabled: true,
          variants: [{ ...variants[0], url: "" }, variants[1]],
        }).valid,
      ).toBe(false);
      expect(
        validateLandingSplit({
          enabled: true,
          variants: [
            { ...variants[0], weight: 0 },
            { ...variants[1], weight: 0 },
          ],
        }).valid,
      ).toBe(false);
      expect(validateLandingSplit({ enabled: true, variants }).valid).toBe(true);
    });

    it("defaults to a disabled 50/50 two-variant split", () => {
      expect(DEFAULT_LANDING_SPLIT.enabled).toBe(false);
      expect(DEFAULT_LANDING_SPLIT.variants.map((v) => v.weight)).toEqual([50, 50]);
    });
  });

  describe("Per-variant performance tracking", () => {
    const events: VariantEvent[] = [
      ...Array.from({ length: 10 }, (_, i) => ({
        variantId: "variant_a",
        type: "page_view" as const,
        timestamp: BASE + i,
      })),
      ...Array.from({ length: 2 }, (_, i) => ({
        variantId: "variant_a",
        type: "bounce" as const,
        timestamp: BASE + i,
      })),
      { variantId: "variant_a", type: "conversion", basketValueXlm: 100, timestamp: BASE + DAY },
      ...Array.from({ length: 10 }, (_, i) => ({
        variantId: "variant_b",
        type: "page_view" as const,
        timestamp: BASE + i,
      })),
      ...Array.from({ length: 4 }, (_, i) => ({
        variantId: "variant_b",
        type: "bounce" as const,
        timestamp: BASE + i,
      })),
      { variantId: "variant_b", type: "conversion", basketValueXlm: 60, timestamp: BASE + DAY },
      { variantId: "variant_b", type: "conversion", basketValueXlm: 40, timestamp: BASE + DAY },
    ];

    it("computes CVR, bounce rate, avg basket value, and traffic share per variant", () => {
      const perf = computeVariantPerformance(variants, events);
      const a = perf.find((p) => p.variantId === "variant_a")!;
      const b = perf.find((p) => p.variantId === "variant_b")!;

      expect(a.trafficSharePercent).toBe(50);
      expect(a.cvrPercent).toBe(10);
      expect(a.bounceRatePercent).toBe(20);
      expect(a.avgBasketValueXlm).toBe(100);
      expect(a.totalRevenueXlm).toBe(100);

      expect(b.cvrPercent).toBe(20);
      expect(b.bounceRatePercent).toBe(40);
      expect(b.avgBasketValueXlm).toBe(50);
      expect(b.totalRevenueXlm).toBe(100);
    });

    it("picks the higher-CVR variant and reports lift over the runner-up", () => {
      const perf = computeVariantPerformance(variants, events);
      const winner = determineWinningVariant(perf);
      expect(winner).not.toBeNull();
      expect(winner!.winnerId).toBe("variant_b");
      expect(winner!.runnerUpId).toBe("variant_a");
      expect(winner!.cvrLiftPercent).toBe(100); // 20% vs 10%
    });

    it("returns no winner when fewer than two variants recorded views", () => {
      const single = computeVariantPerformance(variants, [
        { variantId: "variant_a", type: "page_view", timestamp: BASE },
      ]);
      expect(determineWinningVariant(single)).toBeNull();
    });

    it("avoids division-by-zero metrics for variants without traffic", () => {
      const empty = computeVariantPerformance(variants, []);
      for (const p of empty) {
        expect(p.cvrPercent).toBe(0);
        expect(p.bounceRatePercent).toBe(0);
        expect(p.avgBasketValueXlm).toBe(0);
        expect(p.trafficSharePercent).toBe(0);
      }
    });

    it("builds referral links carrying campaign and affiliate routing hints", () => {
      const link = buildVariantReferralLink(
        "https://store.example.com/a",
        101,
        "GAFFILIATE7TEST7CLICK7TRACKING7ABC7DEF7GHI7JKL7MN",
      );
      expect(link).toContain("campaign=101");
      expect(link).toContain("aff=GAFFILIATE7TEST7CLICK7TRACKING7ABC7DEF7GHI7JKL7MN");
    });
  });
});
