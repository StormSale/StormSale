import { useEffect, useState } from "react";

/**
 * Hook to track online/offline status of the browser.
 *
 * Returns true when the device is online AND no service-worker cached fallback
 * is active. Returns false when offline OR when a cached response is being
 * served (i.e. the app is operating in offline/cached mode even though
 * navigator.onLine may still report true during a brief transition).
 */
export const useOnlineStatus = (): boolean => {
  const [online, setOnline] = useState<boolean>(() => {
    return typeof navigator !== "undefined" && typeof navigator.onLine === "boolean"
      ? navigator.onLine
      : true;
  });

  useEffect(() => {
    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);

    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);

    // Listen for service-worker messages indicating a cached fallback response
    // was served, which means the app is effectively in offline/cached mode
    // even if navigator.onLine is still true.
    const handleSwMessage = (event: MessageEvent) => {
      if (event.data?.type === "SW_CACHED_FALLBACK") {
        setOnline(false);
      }
      if (event.data?.type === "SW_ONLINE_RESTORED") {
        setOnline(navigator.onLine);
      }
    };

    navigator.serviceWorker?.addEventListener("message", handleSwMessage);

    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
      navigator.serviceWorker?.removeEventListener("message", handleSwMessage);
    };
  }, []);

  return online;
};
