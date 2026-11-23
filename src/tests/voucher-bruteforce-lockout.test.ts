import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import {
  recordFailedVoucherAttempt,
  validateVoucherCode,
  getVoucherLockoutState,
  clearVoucherLockout,
  MAX_FAILED_VOUCHER_ATTEMPTS,
  VOUCHER_LOCKOUT_DURATION_MS,
  resetVoucherMemoryStore,
} from "../lib/voucherLockout";
import { VoucherInput } from "../components/shared/VoucherInput";

describe("Issue #479: Rapid coupon enumeration and brute-force lockout tests", () => {
  const TEST_STORAGE_KEY = "test_voucher_lockout";

  beforeEach(() => {
    clearVoucherLockout(TEST_STORAGE_KEY);
    resetVoucherMemoryStore();
    try {
      sessionStorage.clear();
    } catch {
      // ignore
    }
    vi.useRealTimers();
  });

  afterEach(() => {
    clearVoucherLockout(TEST_STORAGE_KEY);
    resetVoucherMemoryStore();
    try {
      sessionStorage.clear();
    } catch {
      // ignore
    }
    vi.restoreAllMocks();
  });

  describe("Error Counter Increments on Failed Voucher Validation", () => {
    it("increments failure count with each invalid attempt", () => {
      expect(MAX_FAILED_VOUCHER_ATTEMPTS).toBe(5);
      expect(VOUCHER_LOCKOUT_DURATION_MS).toBe(60000);
      expect(getVoucherLockoutState(TEST_STORAGE_KEY).failedAttempts).toBe(0);

      const res1 = validateVoucherCode("INVALID1", ["VALID_PROMO"], TEST_STORAGE_KEY);
      expect(res1.valid).toBe(false);
      expect(res1.lockoutState.failedAttempts).toBe(1);
      expect(res1.lockoutState.isLocked).toBe(false);

      const res2 = validateVoucherCode("INVALID2", ["VALID_PROMO"], TEST_STORAGE_KEY);
      expect(res2.lockoutState.failedAttempts).toBe(2);
      expect(res2.lockoutState.isLocked).toBe(false);

      const res3 = validateVoucherCode("INVALID3", ["VALID_PROMO"], TEST_STORAGE_KEY);
      expect(res3.lockoutState.failedAttempts).toBe(3);

      const res4 = validateVoucherCode("INVALID4", ["VALID_PROMO"], TEST_STORAGE_KEY);
      expect(res4.lockoutState.failedAttempts).toBe(4);
      expect(res4.lockoutState.isLocked).toBe(false);
    });

    it("resets failure counter upon successful voucher redemption", () => {
      validateVoucherCode("WRONG_CODE", ["STORMSALE2025"], TEST_STORAGE_KEY);
      validateVoucherCode("ANOTHER_WRONG", ["STORMSALE2025"], TEST_STORAGE_KEY);
      expect(getVoucherLockoutState(TEST_STORAGE_KEY).failedAttempts).toBe(2);

      const successRes = validateVoucherCode("STORMSALE2025", ["STORMSALE2025"], TEST_STORAGE_KEY);
      expect(successRes.valid).toBe(true);
      expect(successRes.lockoutState.failedAttempts).toBe(0);
      expect(successRes.lockoutState.isLocked).toBe(false);
    });
  });

  describe("60-Second Cooldown Timer & Disabling Voucher Input after 5 Attempts", () => {
    it("locks out client after 5 consecutive failed attempts for 60 seconds", () => {
      for (let i = 1; i <= 4; i++) {
        recordFailedVoucherAttempt(TEST_STORAGE_KEY);
      }
      expect(getVoucherLockoutState(TEST_STORAGE_KEY).isLocked).toBe(false);

      // 5th failed attempt triggers lockout
      const fifthAttempt = recordFailedVoucherAttempt(TEST_STORAGE_KEY);
      expect(fifthAttempt.failedAttempts).toBe(5);
      expect(fifthAttempt.isLocked).toBe(true);
      expect(fifthAttempt.remainingCooldownSeconds).toBe(60);

      // Subsequent attempt while locked out is rejected immediately
      const lockedRes = validateVoucherCode("ANY_CODE", ["ANY_CODE"], TEST_STORAGE_KEY);
      expect(lockedRes.valid).toBe(false);
      expect(lockedRes.error).toContain("Too many failed attempts");
      expect(lockedRes.lockoutState.isLocked).toBe(true);
    });

    it("clears lockout automatically after 60-second cooldown expires", () => {
      vi.useFakeTimers();
      for (let i = 0; i < 5; i++) {
        recordFailedVoucherAttempt(TEST_STORAGE_KEY);
      }
      expect(getVoucherLockoutState(TEST_STORAGE_KEY).isLocked).toBe(true);

      // Fast-forward 59 seconds: still locked
      vi.advanceTimersByTime(59000);
      expect(getVoucherLockoutState(TEST_STORAGE_KEY).isLocked).toBe(true);

      // Advance past 60s
      vi.advanceTimersByTime(2000);
      const afterExpiry = getVoucherLockoutState(TEST_STORAGE_KEY);
      expect(afterExpiry.isLocked).toBe(false);
      expect(afterExpiry.failedAttempts).toBe(0);
    });
  });

  describe("Cooldown Persistence Across Tab Reloads via sessionStorage", () => {
    it("persists lockout state in sessionStorage across page reloads", () => {
      const now = Date.now();

      // Trigger 5 failures to engage lockout
      for (let i = 0; i < 5; i++) {
        recordFailedVoucherAttempt(TEST_STORAGE_KEY);
      }

      // Verify stored in sessionStorage
      const rawStored = sessionStorage.getItem(TEST_STORAGE_KEY);
      expect(rawStored).toBeTruthy();
      const stored = JSON.parse(rawStored!);
      expect(stored.isLocked).toBe(true);
      expect(stored.failedAttempts).toBe(5);
      expect(stored.lockedUntil).toBeGreaterThan(now);

      // Simulate a tab reload: reading freshly from sessionStorage
      const reloadedState = getVoucherLockoutState(TEST_STORAGE_KEY);
      expect(reloadedState.isLocked).toBe(true);
      expect(reloadedState.remainingCooldownSeconds).toBeGreaterThan(0);
    });
  });

  describe("VoucherInput Component Rendering & Disabled State", () => {
    it("disables input and button during lockout", () => {
      for (let i = 0; i < 5; i++) {
        recordFailedVoucherAttempt(TEST_STORAGE_KEY);
      }

      render(React.createElement(VoucherInput, { storageKey: TEST_STORAGE_KEY }));

      const input = screen.getByLabelText("Voucher Code Input") as HTMLInputElement;
      const button = screen.getByRole("button", { name: /Apply/i }) as HTMLButtonElement;

      expect(input.disabled).toBe(true);
      expect(button.disabled).toBe(true);
      expect(screen.getByRole("alert").textContent).toContain("Input locked after 5 failed attempts");
    });

    it("increments error and disables field interactively after 5 UI submissions", () => {
      render(
        React.createElement(VoucherInput, {
          storageKey: TEST_STORAGE_KEY,
          validCodes: ["VALID123"],
        })
      );

      const input = screen.getByLabelText("Voucher Code Input") as HTMLInputElement;
      const button = screen.getByRole("button", { name: /Apply/i }) as HTMLButtonElement;

      // Enter invalid codes 5 times
      for (let i = 1; i <= 5; i++) {
        fireEvent.change(input, { target: { value: `BAD_CODE_${i}` } });
        fireEvent.click(button);
      }

      // Now the input should be locked and disabled
      expect(input.disabled).toBe(true);
      expect(button.disabled).toBe(true);
      expect(screen.getByText(/Brute-force protection: Input locked after 5 failed attempts/i)).toBeTruthy();
    });
  });
});
