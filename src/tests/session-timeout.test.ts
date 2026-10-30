import { describe, it, expect } from "vitest";
import {
  DEFAULT_IDLE_TIMEOUT_MS,
  DEFAULT_WARNING_DURATION_MS,
  DEFAULT_STORAGE_KEY,
  calculateIdleSessionState,
  formatRemainingTime,
  isValidActivityTimestamp,
} from "../lib/sessionTimeout";

describe("Session Timeout & Idle Disconnect (#83)", () => {
  describe("Default Configuration Constants", () => {
    it("should enforce a 30-minute idle threshold", () => {
      expect(DEFAULT_IDLE_TIMEOUT_MS).toBe(30 * 60 * 1000);
      expect(DEFAULT_IDLE_TIMEOUT_MS).toBe(1_800_000);
    });

    it("should provide a 2-minute advance warning countdown window", () => {
      expect(DEFAULT_WARNING_DURATION_MS).toBe(2 * 60 * 1000);
      expect(DEFAULT_WARNING_DURATION_MS).toBe(120_000);
    });

    it("should use a dedicated storage key for cross-tab synchronization", () => {
      expect(DEFAULT_STORAGE_KEY).toBe("stormsale_last_active_timestamp");
    });
  });

  describe("Idle State Calculation & Progression", () => {
    const baseTime = 1_700_000_000_000;

    it("should report active session before warning threshold (e.g. 10 minutes elapsed)", () => {
      const tenMinutesLater = baseTime + 10 * 60 * 1000;
      const state = calculateIdleSessionState(baseTime, tenMinutesLater);

      expect(state.isIdleExpired).toBe(false);
      expect(state.isWarningActive).toBe(false);
      expect(state.elapsedMs).toBe(10 * 60 * 1000);
      expect(state.remainingMs).toBe(20 * 60 * 1000);
      expect(state.remainingSeconds).toBe(20 * 60);
    });

    it("should trigger advance warning at 28 minutes of inactivity", () => {
      // 28 minutes elapsed -> 2 minutes (120 seconds) remaining
      const twentyEightMinutesLater = baseTime + 28 * 60 * 1000;
      const state = calculateIdleSessionState(baseTime, twentyEightMinutesLater);

      expect(state.isIdleExpired).toBe(false);
      expect(state.isWarningActive).toBe(true);
      expect(state.remainingSeconds).toBe(120);
    });

    it("should accurately calculate remaining countdown during warning window", () => {
      // 29 minutes and 15 seconds elapsed -> 45 seconds remaining
      const elapsed = (29 * 60 + 15) * 1000;
      const state = calculateIdleSessionState(baseTime, baseTime + elapsed);

      expect(state.isIdleExpired).toBe(false);
      expect(state.isWarningActive).toBe(true);
      expect(state.remainingSeconds).toBe(45);
    });

    it("should trigger session expiration at exactly 30 minutes", () => {
      const thirtyMinutesLater = baseTime + 30 * 60 * 1000;
      const state = calculateIdleSessionState(baseTime, thirtyMinutesLater);

      expect(state.isIdleExpired).toBe(true);
      expect(state.isWarningActive).toBe(false);
      expect(state.remainingMs).toBe(0);
      expect(state.remainingSeconds).toBe(0);
    });

    it("should report expired if current time exceeds 30 minutes", () => {
      const thirtyFiveMinutesLater = baseTime + 35 * 60 * 1000;
      const state = calculateIdleSessionState(baseTime, thirtyFiveMinutesLater);

      expect(state.isIdleExpired).toBe(true);
      expect(state.remainingSeconds).toBe(0);
    });

    it("should support custom timeout and warning thresholds", () => {
      const customTimeout = 10 * 60 * 1000; // 10 minutes
      const customWarning = 1 * 60 * 1000; // 1 minute
      const nineMinutesLater = baseTime + 9 * 60 * 1000;

      const state = calculateIdleSessionState(
        baseTime,
        nineMinutesLater,
        customTimeout,
        customWarning,
      );

      expect(state.isIdleExpired).toBe(false);
      expect(state.isWarningActive).toBe(true);
      expect(state.remainingSeconds).toBe(60);
    });
  });

  describe("Time Formatter (mm:ss)", () => {
    it("should format remaining seconds into standard mm:ss string", () => {
      expect(formatRemainingTime(120)).toBe("02:00");
      expect(formatRemainingTime(90)).toBe("01:30");
      expect(formatRemainingTime(65)).toBe("01:05");
      expect(formatRemainingTime(9)).toBe("00:09");
      expect(formatRemainingTime(0)).toBe("00:00");
    });

    it("should handle negative input safely by returning 00:00", () => {
      expect(formatRemainingTime(-5)).toBe("00:00");
      expect(formatRemainingTime(-120)).toBe("00:00");
    });
  });

  describe("Activity Timestamp Validation", () => {
    it("should accept valid recent timestamps", () => {
      const now = 1_700_000_000_000;
      expect(isValidActivityTimestamp(now - 10000, now)).toBe(true);
      expect(isValidActivityTimestamp(now, now)).toBe(true);
    });

    it("should reject non-numeric or invalid timestamps", () => {
      expect(isValidActivityTimestamp(NaN)).toBe(false);
      expect(isValidActivityTimestamp(0)).toBe(false);
      expect(isValidActivityTimestamp(-100)).toBe(false);
    });

    it("should reject timestamps far in the future", () => {
      const now = 1_700_000_000_000;
      const farFuture = now + 60_000;
      expect(isValidActivityTimestamp(farFuture, now)).toBe(false);
    });
  });
});
