/**
 * Session Inactivity & Idle Disconnect Engine (#83)
 * Provides constants, state calculators, and time formatters for 30-minute idle session tracking.
 */

export const DEFAULT_IDLE_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes (1,800,000 ms)
export const DEFAULT_WARNING_DURATION_MS = 2 * 60 * 1000; // 2 minutes (120,000 ms)
export const DEFAULT_STORAGE_KEY = "stormsale_last_active_timestamp";

export interface IdleSessionState {
  isIdleExpired: boolean;
  isWarningActive: boolean;
  elapsedMs: number;
  remainingMs: number;
  remainingSeconds: number;
}

/**
 * Calculates current idle expiration and warning status given the last active timestamp.
 */
export function calculateIdleSessionState(
  lastActiveTimestamp: number,
  currentTimestamp: number = Date.now(),
  timeoutMs: number = DEFAULT_IDLE_TIMEOUT_MS,
  warningMs: number = DEFAULT_WARNING_DURATION_MS,
): IdleSessionState {
  const elapsedMs = Math.max(0, currentTimestamp - lastActiveTimestamp);
  const remainingMs = Math.max(0, timeoutMs - elapsedMs);
  const isIdleExpired = remainingMs === 0;
  const isWarningActive = !isIdleExpired && elapsedMs >= timeoutMs - warningMs;
  const remainingSeconds = Math.max(0, Math.ceil(remainingMs / 1000));

  return {
    isIdleExpired,
    isWarningActive,
    elapsedMs,
    remainingMs,
    remainingSeconds,
  };
}

/**
 * Formats a remaining seconds count into a standard mm:ss timer string.
 */
export function formatRemainingTime(remainingSeconds: number): string {
  if (remainingSeconds < 0) return "00:00";
  const mins = Math.floor(remainingSeconds / 60);
  const secs = remainingSeconds % 60;
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

/**
 * Validates whether a given timestamp is valid and non-future (with 5s clock skew tolerance).
 */
export function isValidActivityTimestamp(
  timestamp: number,
  now: number = Date.now(),
  toleranceMs: number = 5000,
): boolean {
  if (typeof timestamp !== "number" || isNaN(timestamp) || timestamp <= 0) {
    return false;
  }
  return timestamp <= now + toleranceMs;
}
