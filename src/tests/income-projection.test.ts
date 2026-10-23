import { describe, it, expect } from "vitest";
import {
  calculateIncomeProjection,
  formatCurrency,
  formatCompactNumber,
  PROJECTION_PRESETS,
  SLIDER_CONFIGS,
} from "../lib/incomeProjection";

describe("[Affiliate] Dynamic Income Projection & ROI Engine (#54)", () => {
  describe("Core Mathematical Model", () => {
    it("computes accurate revenue, net profit, and ROI for baseline parameters", () => {
      const result = calculateIncomeProjection({
        monthlyClicks: 5000,
        conversionRate: 3.5,
        averageOrderValue: 120,
        commissionRate: 15,
        promotionalCost: 150,
      });

      // Conversions: 5000 * 3.5% = 175
      expect(result.estimatedConversions).toBe(175);
      // GMV: 175 * 120 = 21,000
      expect(result.grossMerchandiseVolume).toBe(21000);
      // Monthly Commission: 21000 * 15% = 3,150
      expect(result.projectedMonthlyRevenue).toBe(3150);
      // Net Profit: 3150 - 150 = 3,000
      expect(result.projectedMonthlyNetProfit).toBe(3000);
      // Annual projections
      expect(result.projectedAnnualRevenue).toBe(37800);
      expect(result.projectedAnnualNetProfit).toBe(36000);
      // ROI: ((3150 - 150) / 150) * 100 = 2000%
      expect(result.roiPercent).toBe(2000);
      // EPC: 3150 / 5000 = 0.63
      expect(result.earningsPerClick).toBe(0.63);
    });

    it("handles zero promotional cost (100% organic yield)", () => {
      const result = calculateIncomeProjection({
        monthlyClicks: 2000,
        conversionRate: 2.5,
        averageOrderValue: 80,
        commissionRate: 10,
        promotionalCost: 0,
      });

      expect(result.estimatedConversions).toBe(50);
      expect(result.grossMerchandiseVolume).toBe(4000);
      expect(result.projectedMonthlyRevenue).toBe(400);
      expect(result.projectedMonthlyNetProfit).toBe(400);
      expect(result.roiPercent).toBe(100);
    });

    it("handles zero traffic / clicks gracefully without division by zero", () => {
      const result = calculateIncomeProjection({
        monthlyClicks: 0,
        conversionRate: 4.0,
        averageOrderValue: 100,
        commissionRate: 10,
        promotionalCost: 100,
      });

      expect(result.estimatedConversions).toBe(0);
      expect(result.grossMerchandiseVolume).toBe(0);
      expect(result.projectedMonthlyRevenue).toBe(0);
      expect(result.projectedMonthlyNetProfit).toBe(-100);
      expect(result.roiPercent).toBe(-100);
      expect(result.earningsPerClick).toBe(0);
    });

    it("clamps negative input values to zero", () => {
      const result = calculateIncomeProjection({
        monthlyClicks: -100,
        conversionRate: -5,
        averageOrderValue: -50,
        commissionRate: -10,
        promotionalCost: -20,
      });

      expect(result.monthlyClicks).toBe(0);
      expect(result.conversionRate).toBe(0);
      expect(result.averageOrderValue).toBe(0);
      expect(result.commissionRate).toBe(0);
      expect(result.promotionalCost).toBe(0);
      expect(result.projectedMonthlyRevenue).toBe(0);
      expect(result.roiPercent).toBe(0);
    });
  });

  describe("6-Month Trajectory & Cumulative Scaling", () => {
    it("generates exactly 6 monthly trajectory projection points with increasing cumulative metrics", () => {
      const result = calculateIncomeProjection({
        monthlyClicks: 6000,
        conversionRate: 3.0,
        averageOrderValue: 150,
        commissionRate: 20,
        promotionalCost: 300,
      });

      expect(result.monthlyTrajectory).toHaveLength(6);

      let prevCumulativeRev = 0;
      let prevCumulativeProfit = 0;

      for (let i = 0; i < result.monthlyTrajectory.length; i++) {
        const point = result.monthlyTrajectory[i];
        expect(point.month).toBe(i + 1);
        expect(point.label).toBe(`Month ${i + 1}`);
        expect(point.revenue).toBeGreaterThan(0);
        expect(point.cumulativeRevenue).toBeGreaterThan(prevCumulativeRev);
        expect(point.cumulativeNetProfit).toBeGreaterThan(prevCumulativeProfit);

        prevCumulativeRev = point.cumulativeRevenue;
        prevCumulativeProfit = point.cumulativeNetProfit;
      }
    });
  });

  describe("Volume Sensitivity Tiers", () => {
    it("generates 4 sensitivity tiers (50%, 100%, 150%, 200%) with monotonic volume scaling", () => {
      const result = calculateIncomeProjection({
        monthlyClicks: 10000,
        conversionRate: 4.0,
        averageOrderValue: 100,
        commissionRate: 15,
        promotionalCost: 500,
      });

      expect(result.volumeTiers).toHaveLength(4);

      const [conservative, baseline, accelerated, scale] = result.volumeTiers;

      expect(conservative.multiplier).toBe(0.5);
      expect(conservative.monthlyClicks).toBe(5000);

      expect(baseline.multiplier).toBe(1.0);
      expect(baseline.monthlyClicks).toBe(10000);

      expect(accelerated.multiplier).toBe(1.5);
      expect(accelerated.monthlyClicks).toBe(15000);

      expect(scale.multiplier).toBe(2.0);
      expect(scale.monthlyClicks).toBe(20000);

      expect(conservative.projectedRevenue).toBeLessThan(baseline.projectedRevenue);
      expect(baseline.projectedRevenue).toBeLessThan(accelerated.projectedRevenue);
      expect(accelerated.projectedRevenue).toBeLessThan(scale.projectedRevenue);
    });
  });

  describe("Presets and Slider Configurations", () => {
    it("ensures all preset profiles calculate valid projections with positive yields", () => {
      expect(PROJECTION_PRESETS.length).toBeGreaterThanOrEqual(4);

      for (const preset of PROJECTION_PRESETS) {
        const result = calculateIncomeProjection(preset.params);
        expect(result.projectedMonthlyRevenue).toBeGreaterThan(0);
        expect(result.projectedMonthlyNetProfit).toBeGreaterThan(0);
        expect(result.roiPercent).toBeGreaterThan(0);
        expect(result.estimatedConversions).toBeGreaterThan(0);
      }
    });

    it("verifies slider bounds and default values conform to sensible business logic", () => {
      expect(SLIDER_CONFIGS.monthlyClicks.min).toBeGreaterThanOrEqual(100);
      expect(SLIDER_CONFIGS.monthlyClicks.max).toBeGreaterThanOrEqual(50000);
      expect(SLIDER_CONFIGS.conversionRate.min).toBeGreaterThan(0);
      expect(SLIDER_CONFIGS.conversionRate.max).toBeLessThanOrEqual(25);
      expect(SLIDER_CONFIGS.commissionRate.min).toBeGreaterThanOrEqual(1);
      expect(SLIDER_CONFIGS.commissionRate.max).toBeLessThanOrEqual(50);
      expect(SLIDER_CONFIGS.promotionalCost.min).toBe(0);
    });
  });

  describe("Formatting Utilities", () => {
    it("formats USD currency with correct symbols and decimal precision", () => {
      expect(formatCurrency(1234.56, "USD")).toBe("$1,234.56");
      expect(formatCurrency(0, "USD")).toBe("$0.00");
    });

    it("formats XLM currency with native token suffix", () => {
      expect(formatCurrency(4500.5, "XLM")).toBe("4,500.50 XLM");
    });

    it("formats compact numbers accurately for UI badges and axis labels", () => {
      expect(formatCompactNumber(850)).toBe("850");
      expect(formatCompactNumber(1500)).toBe("1.5k");
      expect(formatCompactNumber(25000)).toBe("25.0k");
      expect(formatCompactNumber(1500000)).toBe("1.5M");
    });
  });
});
