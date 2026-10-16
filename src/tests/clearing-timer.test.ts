import { describe, it, expect } from "vitest";
import { calculateClearing } from "../components/affiliate/SalesList";

describe("Clearing Period Timer & Progress Suite", () => {
  const baseTimestamp = 1700000000;
  const clearingPeriod = 604800; // 7 days

  it("calculates active clearing countdown and progress accurately", () => {
    // 3.5 days elapsed (50% progress)
    const now = baseTimestamp + 302400;
    const result = calculateClearing({ timestamp: baseTimestamp, clearingPeriod }, now);

    expect(result.isUnlocked).toBe(false);
    expect(result.remainingSeconds).toBe(302400);
    expect(result.elapsedSeconds).toBe(302400);
    expect(result.progressPercent).toBe(50);
    expect(result.countdownText).toBe("3d 12h 0m 0s");
    expect(result.unlockUtc).toContain("UTC");
  });

  it("identifies matured / unlocked sale when clearing period has elapsed", () => {
    // Exactly at or past 7 days
    const now = baseTimestamp + clearingPeriod + 50;
    const result = calculateClearing({ timestamp: baseTimestamp, clearingPeriod }, now);

    expect(result.isUnlocked).toBe(true);
    expect(result.remainingSeconds).toBe(0);
    expect(result.progressPercent).toBe(100);
    expect(result.countdownText).toBe("0s");
  });

  it("handles newly created sales with 0% progress", () => {
    const now = baseTimestamp;
    const result = calculateClearing({ timestamp: baseTimestamp, clearingPeriod }, now);

    expect(result.isUnlocked).toBe(false);
    expect(result.remainingSeconds).toBe(clearingPeriod);
    expect(result.elapsedSeconds).toBe(0);
    expect(result.progressPercent).toBe(0);
    expect(result.countdownText).toBe("7d 0h 0m 0s");
  });

  it("clamps progress between 0 and 100 percent", () => {
    // Future timestamp edge case
    const pastNow = baseTimestamp - 1000;
    const pastResult = calculateClearing({ timestamp: baseTimestamp, clearingPeriod }, pastNow);
    expect(pastResult.progressPercent).toBe(0);

    // Far future edge case
    const futureNow = baseTimestamp + clearingPeriod * 5;
    const futureResult = calculateClearing({ timestamp: baseTimestamp, clearingPeriod }, futureNow);
    expect(futureResult.progressPercent).toBe(100);
  });

  it("never displays 100% while countdown is still active (caps at 99%)", () => {
    // 1 second before clearing completes
    const now = baseTimestamp + clearingPeriod - 1;
    const result = calculateClearing({ timestamp: baseTimestamp, clearingPeriod }, now);

    expect(result.isUnlocked).toBe(false);
    expect(result.remainingSeconds).toBe(1);
    expect(result.progressPercent).toBe(99);
    expect(result.countdownText).toBe("1s");
  });

  it("falls back to DEFAULT_CLEARING_PERIOD for zero or negative clearing periods", () => {
    // Zero clearing period
    const zeroResult = calculateClearing(
      { timestamp: baseTimestamp, clearingPeriod: 0 },
      baseTimestamp + 302400,
    );
    expect(zeroResult.period).toBe(604800);
    expect(zeroResult.unlockTimestamp).toBe(baseTimestamp + 604800);
    expect(zeroResult.progressPercent).toBe(50);

    // Negative clearing period
    const negResult = calculateClearing(
      { timestamp: baseTimestamp, clearingPeriod: -500 },
      baseTimestamp + 302400,
    );
    expect(negResult.period).toBe(604800);
    expect(negResult.unlockTimestamp).toBe(baseTimestamp + 604800);
    expect(negResult.progressPercent).toBe(50);
  });
});
