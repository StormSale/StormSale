/**
 * Rapid Coupon Enumeration and Brute-Force Lockout Defense (#479)
 *
 * Implements client-side lockout and error tracking when a client attempts
 * rapid coupon enumeration / brute-forcing (>5 failed attempts in 60 seconds).
 *
 * Persists cooldown state across tab reloads via sessionStorage.
 */

export const MAX_FAILED_VOUCHER_ATTEMPTS = 5;
export const VOUCHER_LOCKOUT_DURATION_MS = 60 * 1000; // 60 seconds
export const DEFAULT_VOUCHER_STORAGE_KEY = "stormsale_voucher_lockout_state";

export interface VoucherLockoutState {
  failedAttempts: number;
  isLocked: boolean;
  lockedUntil: number | null;
  lastAttemptAt: number | null;
  remainingCooldownSeconds: number;
}

// In-memory fallback if sessionStorage is inaccessible
let memoryStore: Record<string, string> = {};

export function resetVoucherMemoryStore(): void {
  memoryStore = {};
}

function getStorageItem(key: string): string | null {
  try {
    if (typeof sessionStorage !== "undefined") {
      return sessionStorage.getItem(key);
    }
  } catch {
    // fallback to memory
  }
  return memoryStore[key] ?? null;
}

function setStorageItem(key: string, value: string): void {
  try {
    if (typeof sessionStorage !== "undefined") {
      sessionStorage.setItem(key, value);
      return;
    }
  } catch {
    // fallback to memory
  }
  memoryStore[key] = value;
}

function removeStorageItem(key: string): void {
  try {
    if (typeof sessionStorage !== "undefined") {
      sessionStorage.removeItem(key);
      return;
    }
  } catch {
    // fallback to memory
  }
  delete memoryStore[key];
}

/**
 * Retrieves the current voucher lockout state from persistent sessionStorage.
 * Clears lockout automatically if the 60-second cooldown period has elapsed.
 */
export function getVoucherLockoutState(storageKey = DEFAULT_VOUCHER_STORAGE_KEY): VoucherLockoutState {
  const raw = getStorageItem(storageKey);
  if (!raw) {
    return {
      failedAttempts: 0,
      isLocked: false,
      lockedUntil: null,
      lastAttemptAt: null,
      remainingCooldownSeconds: 0,
    };
  }

  try {
    const data = JSON.parse(raw);
    const now = Date.now();
    const lockedUntil = typeof data.lockedUntil === "number" ? data.lockedUntil : null;

    if (lockedUntil && now < lockedUntil) {
      const remainingSeconds = Math.max(1, Math.ceil((lockedUntil - now) / 1000));
      return {
        failedAttempts: data.failedAttempts || MAX_FAILED_VOUCHER_ATTEMPTS,
        isLocked: true,
        lockedUntil,
        lastAttemptAt: data.lastAttemptAt || null,
        remainingCooldownSeconds: remainingSeconds,
      };
    }

    // Cooldown expired
    if (lockedUntil && now >= lockedUntil) {
      clearVoucherLockout(storageKey);
      return {
        failedAttempts: 0,
        isLocked: false,
        lockedUntil: null,
        lastAttemptAt: null,
        remainingCooldownSeconds: 0,
      };
    }

    // Still within attempt window or normal state
    return {
      failedAttempts: Number(data.failedAttempts) || 0,
      isLocked: false,
      lockedUntil: null,
      lastAttemptAt: data.lastAttemptAt || null,
      remainingCooldownSeconds: 0,
    };
  } catch {
    clearVoucherLockout(storageKey);
    return {
      failedAttempts: 0,
      isLocked: false,
      lockedUntil: null,
      lastAttemptAt: null,
      remainingCooldownSeconds: 0,
    };
  }
}

/**
 * Records a failed voucher verification attempt.
 * If 5 failed attempts are reached within the rolling window, activates a 60-second lockout.
 */
export function recordFailedVoucherAttempt(storageKey = DEFAULT_VOUCHER_STORAGE_KEY): VoucherLockoutState {
  const current = getVoucherLockoutState(storageKey);
  const now = Date.now();

  const newCount = current.failedAttempts + 1;
  const isLocked = newCount >= MAX_FAILED_VOUCHER_ATTEMPTS;
  const lockedUntil = isLocked ? now + VOUCHER_LOCKOUT_DURATION_MS : null;
  const remainingSeconds = isLocked ? Math.ceil(VOUCHER_LOCKOUT_DURATION_MS / 1000) : 0;

  const payload = {
    failedAttempts: newCount,
    isLocked,
    lockedUntil,
    lastAttemptAt: now,
  };

  setStorageItem(storageKey, JSON.stringify(payload));

  return {
    failedAttempts: newCount,
    isLocked,
    lockedUntil,
    lastAttemptAt: now,
    remainingCooldownSeconds: remainingSeconds,
  };
}

/**
 * Records a successful voucher validation and resets the error counter.
 */
export function recordSuccessfulVoucherValidation(storageKey = DEFAULT_VOUCHER_STORAGE_KEY): void {
  clearVoucherLockout(storageKey);
}

/**
 * Clears persistent lockout state and error counters.
 */
export function clearVoucherLockout(storageKey = DEFAULT_VOUCHER_STORAGE_KEY): void {
  removeStorageItem(storageKey);
}

/**
 * Validates a voucher code against an allowed list or validation predicate.
 * Throws or returns an error immediately if the client is currently locked out.
 */
export function validateVoucherCode(
  code: string,
  validCodes: string[] = ["STORMSALE2025", "DISCOUNT10", "WELCOME"],
  storageKey = DEFAULT_VOUCHER_STORAGE_KEY
): { valid: boolean; error?: string; lockoutState: VoucherLockoutState } {
  const currentState = getVoucherLockoutState(storageKey);

  if (currentState.isLocked) {
    return {
      valid: false,
      error: `Too many failed attempts. Voucher input locked for ${currentState.remainingCooldownSeconds} seconds.`,
      lockoutState: currentState,
    };
  }

  const normalized = (code || "").trim().toUpperCase();
  const isValid = validCodes.includes(normalized);

  if (isValid) {
    recordSuccessfulVoucherValidation(storageKey);
    return {
      valid: true,
      lockoutState: getVoucherLockoutState(storageKey),
    };
  }

  const updatedState = recordFailedVoucherAttempt(storageKey);
  return {
    valid: false,
    error: updatedState.isLocked
      ? `Too many failed attempts. Voucher input locked for ${updatedState.remainingCooldownSeconds} seconds.`
      : `Invalid voucher code. Attempt ${updatedState.failedAttempts} of ${MAX_FAILED_VOUCHER_ATTEMPTS}.`,
    lockoutState: updatedState,
  };
}
