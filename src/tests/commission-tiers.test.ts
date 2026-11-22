import { describe, expect, it } from "vitest";
import {
  getCommissionRateForSales,
  validateCommissionTiers,
  type CommissionTier,
} from "../lib/commissionTiers";

const tiers: CommissionTier[] = [
  { id: "base", thresholdSales: 0, ratePercent: 10 },
  { id: "growth", thresholdSales: 100, ratePercent: 15 },
  { id: "elite", thresholdSales: 500, ratePercent: 20 },
];

describe("commission tiers", () => {
  it("selects the highest eligible rate regardless of input order", () => {
    expect(getCommissionRateForSales([tiers[2], tiers[0], tiers[1]], 499)).toBe(15);
    expect(getCommissionRateForSales(tiers, 500)).toBe(20);
  });

  it("requires a zero-sales base tier and increasing thresholds", () => {
    expect(validateCommissionTiers(tiers)).toBeNull();
    expect(validateCommissionTiers(tiers.slice(1))).toMatch(/first tier/i);
    expect(
      validateCommissionTiers([
        tiers[0],
        { id: "duplicate", thresholdSales: 100, ratePercent: 20 },
      ]),
    ).toMatch(/unique/i);
  });

  it("rejects rates outside the contract's supported range", () => {
    expect(
      validateCommissionTiers([{ id: "base", thresholdSales: 0, ratePercent: 51 }]),
    ).toMatch(/between 1% and 50%/i);
  });
});
