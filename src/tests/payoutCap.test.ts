import { describe, it, expect, beforeEach } from "vitest";
import {
  checkDailyPayoutCap,
  recordAffiliateClaim,
  getRolling24HourClaimVolume,
  formatTimeUntilReset,
  type StorageBackend,
} from "../lib/payoutCap";

describe("payoutCap (#156)", () => {
  let memoryStore: Record<string, string>;
  let mockStorage: StorageBackend;

  beforeEach(() => {
    memoryStore = {};
    mockStorage = {
      getItem: (key) => memoryStore[key] ?? null,
      setItem: (key, val) => {
        memoryStore[key] = val;
      },
    };
  });

  const AFFILIATE = "GASTORMSALETESTAFFILIATE77777777777777777777777777777777";
  const CAMPAIGN = 101;

  it("allows unlimited claims if dailyPayoutCap is undefined or 0", () => {
    const result = checkDailyPayoutCap(
      AFFILIATE,
      5000,
      undefined,
      CAMPAIGN,
      Date.now(),
      mockStorage,
    );
    expect(result.allowed).toBe(true);
    expect(result.remainingQuota).toBe(Infinity);
  });

  it("tracks rolling 24-hour claim volume accurately", () => {
    const now = 1700000000000;
    // Claim 200 XLM 2 hours ago
    recordAffiliateClaim(AFFILIATE, CAMPAIGN, 200, now - 2 * 3600 * 1000, mockStorage);
    // Claim 300 XLM 10 hours ago
    recordAffiliateClaim(AFFILIATE, CAMPAIGN, 300, now - 10 * 3600 * 1000, mockStorage);
    // Claim 1000 XLM 25 hours ago (outside 24h window)
    recordAffiliateClaim(AFFILIATE, CAMPAIGN, 1000, now - 25 * 3600 * 1000, mockStorage);

    const volume = getRolling24HourClaimVolume(AFFILIATE, CAMPAIGN, now, mockStorage);
    expect(volume).toBe(500); // 200 + 300
  });

  it("enforces cap and informs affiliate when claim exceeds remaining daily quota", () => {
    const now = 1700000000000;
    const dailyCap = 1000; // 1,000 XLM per day

    // Affiliate already claimed 800 XLM within 24h
    recordAffiliateClaim(AFFILIATE, CAMPAIGN, 800, now - 5 * 3600 * 1000, mockStorage);

    // Requesting 150 XLM (within 200 remaining) should be allowed
    const validCheck = checkDailyPayoutCap(AFFILIATE, 150, dailyCap, CAMPAIGN, now, mockStorage);
    expect(validCheck.allowed).toBe(true);
    expect(validCheck.remainingQuota).toBe(200);

    // Requesting 250 XLM should exceed remaining quota
    const invalidCheck = checkDailyPayoutCap(AFFILIATE, 250, dailyCap, CAMPAIGN, now, mockStorage);
    expect(invalidCheck.allowed).toBe(false);
    expect(invalidCheck.remainingQuota).toBe(200);
    expect(invalidCheck.reason).toContain("exceeds your remaining daily quota of 200.00 XLM");
  });

  it("informs affiliate when daily claim cap is completely reached with countdown to reset", () => {
    const now = 1700000000000;
    const dailyCap = 1000;

    // Affiliate claimed exactly 1000 XLM 4 hours ago
    recordAffiliateClaim(AFFILIATE, CAMPAIGN, 1000, now - 4 * 3600 * 1000, mockStorage);

    const check = checkDailyPayoutCap(AFFILIATE, 50, dailyCap, CAMPAIGN, now, mockStorage);
    expect(check.allowed).toBe(false);
    expect(check.remainingQuota).toBe(0);
    expect(check.reason).toContain("Daily maximum payout cap of 1,000 XLM has been reached");
    expect(check.reason).toContain("Resets in 20h 0m");
  });

  it("formats countdown time until reset properly", () => {
    const now = 1700000000000;
    const resetIn3Hours = now + 3 * 3600 * 1000 + 15 * 60 * 1000;
    expect(formatTimeUntilReset(resetIn3Hours, now)).toBe("3h 15m");

    const resetIn45Mins = now + 45 * 60 * 1000 + 20 * 1000;
    expect(formatTimeUntilReset(resetIn45Mins, now)).toBe("45m 20s");
  });
});
