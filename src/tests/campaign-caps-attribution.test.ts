import { describe, it, expect } from "vitest";
import { getCreateCampaignSchema } from "../lib/validation";

describe("Campaign validation with daily cap and attribution (#156, #151)", () => {
  const schema = getCreateCampaignSchema(7);

  const validBase = {
    campaignName: "Test Pro Campaign",
    commissionRate: "10",
    budget: "1000",
    clearingPeriod: "86400",
  };

  it("accepts valid optional daily payout cap", () => {
    const valid = {
      ...validBase,
      dailyPayoutCap: "1000",
    };
    const res = schema.safeParse(valid);
    expect(res.success).toBe(true);
  });

  it("rejects non-numeric or non-positive daily payout cap", () => {
    const invalidNonNumeric = {
      ...validBase,
      dailyPayoutCap: "abc",
    };
    expect(schema.safeParse(invalidNonNumeric).success).toBe(false);

    const invalidZero = {
      ...validBase,
      dailyPayoutCap: "0",
    };
    expect(schema.safeParse(invalidZero).success).toBe(false);

    const invalidNegative = {
      ...validBase,
      dailyPayoutCap: "-50",
    };
    expect(schema.safeParse(invalidNegative).success).toBe(false);
  });

  it("accepts valid attribution models ('last_click', 'first_click')", () => {
    expect(schema.safeParse({ ...validBase, attributionModel: "last_click" }).success).toBe(true);
    expect(schema.safeParse({ ...validBase, attributionModel: "first_click" }).success).toBe(true);
    expect(schema.safeParse({ ...validBase, attributionModel: "invalid_model" }).success).toBe(
      false,
    );
  });

  it("accepts valid attribution windows ('1', '7', '30', '60')", () => {
    for (const days of ["1", "7", "30", "60"] as const) {
      expect(schema.safeParse({ ...validBase, attributionWindowDays: days }).success).toBe(true);
    }
    expect(schema.safeParse({ ...validBase, attributionWindowDays: "45" }).success).toBe(false);
  });
});
