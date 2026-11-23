import { describe, it, expect } from "vitest";
import {
  computeReferralHashScore,
  normalizeVariantWeights,
  routeTrafficToVariant,
  calculateVariantPerformance,
  type LandingPageVariant,
} from "../utils/abTesting";

describe("A/B Testing Attribution Optimizer (#155)", () => {
  describe("Deterministic Hash Routing", () => {
    it("consistently computes the same score for the same referral seed", () => {
      const seed = "GAEM2CL7BEGW7MJ5IVJGL2GE6U7VOO7DZTOFYOUGKSINDM3IF4LLG7YS";
      const score1 = computeReferralHashScore(seed);
      const score2 = computeReferralHashScore(seed);
      expect(score1).toBe(score2);
      expect(score1).toBeGreaterThanOrEqual(0);
      expect(score1).toBeLessThan(100);
    });

    it("returns 0 for empty seed", () => {
      expect(computeReferralHashScore("")).toBe(0);
    });

    it("normalizes variant weights proportionally to total 100%", () => {
      const variants: LandingPageVariant[] = [
        { id: "1", name: "A", url: "https://a.com", weight: 30 },
        { id: "2", name: "B", url: "https://b.com", weight: 30 },
      ];
      const normalized = normalizeVariantWeights(variants);
      const sum = normalized.reduce((acc, v) => acc + v.weight, 0);
      expect(sum).toBe(100);
      expect(normalized[0].weight).toBe(50);
      expect(normalized[1].weight).toBe(50);
    });

    it("routes traffic deterministically across variants according to weights", () => {
      const variants: LandingPageVariant[] = [
        { id: "v1", name: "Variant 1", url: "https://shop.com/v1", weight: 70 },
        { id: "v2", name: "Variant 2", url: "https://shop.com/v2", weight: 30 },
      ];

      // Route 100 distinct seeds and verify distribution roughly matches 70/30
      let countV1 = 0;
      let countV2 = 0;

      for (let i = 0; i < 100; i++) {
        const seed = `affiliate_wallet_test_seed_${i}`;
        const selected = routeTrafficToVariant(variants, seed);
        if (selected?.id === "v1") countV1++;
        if (selected?.id === "v2") countV2++;
      }

      expect(countV1 + countV2).toBe(100);
      // Deterministic pseudo-random distribution should be in reasonable range of 70/30
      expect(countV1).toBeGreaterThanOrEqual(55);
      expect(countV2).toBeGreaterThanOrEqual(15);
    });
  });

  describe("Performance Metrics & Winner Determination", () => {
    it("computes CVR, bounce rate, and average basket value (AOV)", () => {
      const variants: LandingPageVariant[] = [
        { id: "a", name: "Variant A", url: "https://a.com", weight: 50 },
        { id: "b", name: "Variant B", url: "https://b.com", weight: 50 },
      ];

      const rawStats = [
        {
          variantId: "a",
          visitors: 1000,
          bounces: 400,
          conversions: 50,
          totalRevenue: 5000,
        },
        {
          variantId: "b",
          visitors: 1000,
          bounces: 300,
          conversions: 100,
          totalRevenue: 12000,
        },
      ];

      const metrics = calculateVariantPerformance(variants, rawStats);

      // Variant A:
      // CVR = 50 / 1000 * 100 = 5%
      // Bounce rate = 400 / 1000 * 100 = 40%
      // AOV = 5000 / 50 = $100
      expect(metrics[0].cvr).toBe(5);
      expect(metrics[0].bounceRate).toBe(40);
      expect(metrics[0].aov).toBe(100);
      expect(metrics[0].isWinner).toBeFalsy();

      // Variant B:
      // CVR = 100 / 1000 * 100 = 10%
      // Bounce rate = 300 / 1000 * 100 = 30%
      // AOV = 12000 / 100 = $120
      expect(metrics[1].cvr).toBe(10);
      expect(metrics[1].bounceRate).toBe(30);
      expect(metrics[1].aov).toBe(120);
      expect(metrics[1].isWinner).toBe(true);
    });
  });
});

