import { useState, useEffect, useRef, useCallback } from "react";
import {
  DEFAULT_IDLE_TIMEOUT_MS,
  DEFAULT_WARNING_DURATION_MS,
  DEFAULT_STORAGE_KEY,
  calculateIdleSessionState,
} from "../lib/sessionTimeout";

export { DEFAULT_IDLE_TIMEOUT_MS, DEFAULT_WARNING_DURATION_MS, DEFAULT_STORAGE_KEY };

declare global {
  interface Window {
    __triggerIdleWarningTest?: () => void;
  }
}

export interface UseIdleDisconnectOptions {
  isConnected: boolean;
  timeoutMs?: number;
  warningMs?: number;
  storageKey?: string;
  onDisconnect?: () => void;
  onExtend?: () => void;
  onManualDisconnect?: () => void;
}

export interface UseIdleDisconnectReturn {
  isWarningOpen: boolean;
  remainingSeconds: number;
  extendSession: () => void;
  handleManualDisconnect: () => void;
  triggerWarningForTesting: () => void;
}

export function useIdleDisconnect({
  isConnected,
  timeoutMs = DEFAULT_IDLE_TIMEOUT_MS,
  warningMs = DEFAULT_WARNING_DURATION_MS,
  storageKey = DEFAULT_STORAGE_KEY,
  onDisconnect,
  onExtend,
  onManualDisconnect,
}: UseIdleDisconnectOptions): UseIdleDisconnectReturn {
  const [isWarningActive, setIsWarningActive] = useState(false);
  const [remainingSeconds, setRemainingSeconds] = useState(Math.round(warningMs / 1000));

  const lastActivityRef = useRef<number>(0);
  const lastThrottleRef = useRef<number>(0);
  const hasDisconnectedRef = useRef<boolean>(false);
  const onDisconnectRef = useRef(onDisconnect);
  const onExtendRef = useRef(onExtend);
  const onManualDisconnectRef = useRef(onManualDisconnect);

  // Keep callback refs updated to prevent stale closures
  useEffect(() => {
    onDisconnectRef.current = onDisconnect;
    onExtendRef.current = onExtend;
    onManualDisconnectRef.current = onManualDisconnect;
  }, [onDisconnect, onExtend, onManualDisconnect]);

  // Read the shared activity timestamp. Returns 0 when it is missing, invalid or
  // storage is blocked, so the caller falls back to its in-memory timestamp
  // instead of treating the session as freshly active.
  const getStoredActivity = useCallback((): number => {
    if (typeof window === "undefined") return 0;
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored) {
        const parsed = parseInt(stored, 10);
        if (!isNaN(parsed) && parsed > 0) return parsed;
      }
    } catch {
      // Ignore localStorage access restrictions
    }
    return 0;
  }, [storageKey]);

  const updateStoredActivity = useCallback(
    (timestamp: number) => {
      lastActivityRef.current = timestamp;
      if (typeof window === "undefined") return;
      try {
        localStorage.setItem(storageKey, timestamp.toString());
      } catch {
        // Ignore localStorage quota or private browsing errors
      }
    },
    [storageKey],
  );

  // Extend session (explicit button click or interaction)
  const extendSession = useCallback(() => {
    const now = Date.now();
    hasDisconnectedRef.current = false;
    updateStoredActivity(now);
    setIsWarningActive(false);
    setRemainingSeconds(Math.round(warningMs / 1000));
    if (onExtendRef.current) {
      onExtendRef.current();
    }
  }, [updateStoredActivity, warningMs]);

  // Manual disconnect from warning modal
  const handleManualDisconnect = useCallback(() => {
    hasDisconnectedRef.current = true;
    setIsWarningActive(false);
    if (onManualDisconnectRef.current) {
      onManualDisconnectRef.current();
    } else if (onDisconnectRef.current) {
      onDisconnectRef.current();
    }
  }, []);

  // For testing or previewing the modal immediately
  const triggerWarningForTesting = useCallback(() => {
    const artificialActivity = Date.now() - (timeoutMs - warningMs);
    updateStoredActivity(artificialActivity);
    setIsWarningActive(true);
    setRemainingSeconds(Math.round(warningMs / 1000));
  }, [timeoutMs, warningMs, updateStoredActivity]);

  // Mirror isWarningActive into a ref so the activity listeners can read it
  // without re-subscribing (and re-running the connect reset) when it changes.
  const isWarningActiveRef = useRef(isWarningActive);
  useEffect(() => {
    isWarningActiveRef.current = isWarningActive;
  }, [isWarningActive]);

  // Reset the idle timer only on the connect transition, never when the
  // warning opens, so the warning cannot reset its own countdown.
  useEffect(() => {
    hasDisconnectedRef.current = false;
    if (!isConnected) return;
    updateStoredActivity(Date.now());
  }, [isConnected, updateStoredActivity]);

  // Track user activity across DOM events with 1s throttling
  useEffect(() => {
    if (!isConnected) return;

    const handleUserActivity = () => {
      // If warning modal is open, require explicit "Stay Connected" or button click
      if (isWarningActiveRef.current) return;

      const currentTime = Date.now();
      // Throttle activity updates to once every 1000ms
      if (currentTime - lastThrottleRef.current > 1000) {
        lastThrottleRef.current = currentTime;
        updateStoredActivity(currentTime);
      }
    };

    const activityEvents = [
      "mousedown",
      "mousemove",
      "keydown",
      "scroll",
      "touchstart",
      "wheel",
      "pointerdown",
    ];

    activityEvents.forEach((event) => {
      window.addEventListener(event, handleUserActivity, { passive: true });
    });

    // Cross-tab synchronization via storage event. Only move the timer
    // forward, so a stale value from another tab cannot rewind it.
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === storageKey && e.newValue) {
        const updatedTime = parseInt(e.newValue, 10);
        if (!isNaN(updatedTime) && updatedTime > lastActivityRef.current) {
          lastActivityRef.current = updatedTime;
          const state = calculateIdleSessionState(updatedTime, Date.now(), timeoutMs, warningMs);
          if (!state.isWarningActive) {
            setIsWarningActive(false);
          }
        }
      }
    };

    window.addEventListener("storage", handleStorageChange);

    return () => {
      activityEvents.forEach((event) => {
        window.removeEventListener(event, handleUserActivity);
      });
      window.removeEventListener("storage", handleStorageChange);
    };
  }, [isConnected, storageKey, timeoutMs, warningMs, updateStoredActivity]);

  // Polling interval to check idle expiration & update countdown
  useEffect(() => {
    if (!isConnected) return;

    const checkInterval = setInterval(() => {
      if (hasDisconnectedRef.current) return;

      const now = Date.now();
      const currentStored = getStoredActivity();
      const lastActive = Math.max(lastActivityRef.current, currentStored);
      if (lastActive <= 0) {
        // No baseline at all (should not happen after connect); start one now
        // rather than reporting an expired or perpetually fresh session.
        updateStoredActivity(now);
        return;
      }
      const state = calculateIdleSessionState(lastActive, now, timeoutMs, warningMs);

      if (state.isIdleExpired) {
        // 30-minute threshold reached - trigger disconnect
        hasDisconnectedRef.current = true;
        setIsWarningActive(false);
        setRemainingSeconds(0);
        if (onDisconnectRef.current) {
          onDisconnectRef.current();
        }
      } else if (state.isWarningActive) {
        // Within the warning countdown window
        setIsWarningActive(true);
        setRemainingSeconds(state.remainingSeconds);
      } else {
        // Active and outside warning window
        setIsWarningActive((prev) => (prev ? false : prev));
      }
    }, 1000);

    return () => clearInterval(checkInterval);
  }, [isConnected, timeoutMs, warningMs, getStoredActivity, updateStoredActivity]);

  // Expose test helper on window for local development only. In a production
  // build any script on the page could call it to force a disconnect.
  useEffect(() => {
    if (!import.meta.env.DEV || typeof window === "undefined") return;
    window.__triggerIdleWarningTest = triggerWarningForTesting;
    return () => {
      delete window.__triggerIdleWarningTest;
    };
  }, [triggerWarningForTesting]);

  return {
    isWarningOpen: isConnected && isWarningActive,
    remainingSeconds,
    extendSession,
    handleManualDisconnect,
    triggerWarningForTesting,
  };
}
