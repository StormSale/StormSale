import { useSyncExternalStore } from "react";

let cachedFallbackActive = false;
const subscribers = new Set<() => void>();

let goOnline: (() => void) | null = null;
let goOffline: (() => void) | null = null;
let handleSwMessage: ((event: MessageEvent) => void) | null = null;

const notifyListeners = () => {
  subscribers.forEach((callback) => callback());
};

const getSnapshot = (): boolean => {
  if (
    typeof navigator !== "undefined" &&
    typeof navigator.onLine === "boolean" &&
    !navigator.onLine
  ) {
    return false;
  }
  return !cachedFallbackActive;
};

const subscribe = (callback: () => void) => {
  subscribers.add(callback);

  if (subscribers.size === 1) {
    goOnline = () => {
      if (cachedFallbackActive) {
        if (typeof fetch === "function") {
          fetch("/api/campaigns/", { method: "GET" }).catch(() => {});
        }
      } else {
        notifyListeners();
      }
    };

    goOffline = () => {
      notifyListeners();
    };

    handleSwMessage = (event: MessageEvent) => {
      if (event.data?.type === "SW_CACHED_FALLBACK") {
        cachedFallbackActive = true;
        notifyListeners();
      }
      if (event.data?.type === "SW_ONLINE_RESTORED") {
        cachedFallbackActive = false;
        notifyListeners();
      }
    };

    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    navigator.serviceWorker?.addEventListener("message", handleSwMessage);
  }

  return () => {
    subscribers.delete(callback);
    if (subscribers.size === 0) {
      if (goOnline) {
        window.removeEventListener("online", goOnline);
        goOnline = null;
      }
      if (goOffline) {
        window.removeEventListener("offline", goOffline);
        goOffline = null;
      }
      if (handleSwMessage) {
        navigator.serviceWorker?.removeEventListener("message", handleSwMessage);
        handleSwMessage = null;
      }
    }
  };
};

export const resetOnlineStatusStore = () => {
  cachedFallbackActive = false;
  notifyListeners();
};

/**
 * Hook to track online/offline status of the browser.
 *
 * Returns true when the device is online AND no service-worker cached fallback
 * is active. Returns false when offline OR when a cached response is being
 * served (i.e. the app is operating in offline/cached mode even though
 * navigator.onLine may still report true during a brief transition).
 */
export const useOnlineStatus = (): boolean => {
  return useSyncExternalStore(subscribe, getSnapshot, () => true);
};
