/**
 * PWA Service Worker Registration & Lifecycle Management
 */
import { registerSW } from "virtual:pwa-register";

export function initPwaServiceWorker() {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
    return;
  }

  try {
    const updateSW = registerSW({
      onNeedRefresh() {
        console.log("StormSale PWA update available.");
      },
      onOfflineReady() {
        console.log("StormSale PWA offline shell ready.");
      },
      onRegisterError(error: unknown) {
        console.warn("StormSale PWA service worker registration failed:", error);
      },
    });

    return updateSW;
  } catch (err) {
    console.warn("Could not initialize Service Worker:", err);
  }
}
