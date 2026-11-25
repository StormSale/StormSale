import { onCLS, onINP, onLCP, type Metric } from "web-vitals";

export const WEB_VITALS_ENDPOINT = "/api/telemetry/web-vitals";
export const WEB_VITALS_PREFERENCE_KEY = "stormsale.privacy.web-vitals";

export type DeviceType = "mobile" | "tablet" | "desktop";
export type ViewportCategory = "compact" | "medium" | "wide";
export type WebVitalName = Metric["name"];

export interface WebVitalsPayload {
  name: WebVitalName;
  value: number;
  rating: Metric["rating"];
  deviceType: DeviceType;
  viewportCategory: ViewportCategory;
}

let initialized = false;

function browserDoNotTrack(): boolean {
  if (typeof navigator === "undefined") return false;
  const nav = navigator as Navigator & {
    doNotTrack?: string | null;
    msDoNotTrack?: string | null;
    globalPrivacyControl?: boolean;
  };
  return (
    nav.doNotTrack === "1" ||
    nav.doNotTrack === "yes" ||
    nav.msDoNotTrack === "1" ||
    nav.globalPrivacyControl === true
  );
}

export function isWebVitalsEnabled(): boolean {
  if (browserDoNotTrack() || typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(WEB_VITALS_PREFERENCE_KEY) !== "off";
  } catch {
    return false;
  }
}

export function setWebVitalsEnabled(enabled: boolean): void {
  try {
    window.localStorage.setItem(WEB_VITALS_PREFERENCE_KEY, enabled ? "on" : "off");
  } catch {
    // Storage can be unavailable in private browsing; browser-level signals still apply.
  }
}

export function getDeviceType(width = window.innerWidth): DeviceType {
  if (width < 768) return "mobile";
  if (width < 1024) return "tablet";
  return "desktop";
}

export function getViewportCategory(width = window.innerWidth): ViewportCategory {
  if (width < 768) return "compact";
  if (width < 1280) return "medium";
  return "wide";
}

export function buildWebVitalsPayload(metric: Metric): WebVitalsPayload {
  const precision = metric.name === "CLS" ? 4 : 0;
  const factor = 10 ** precision;
  return {
    name: metric.name,
    value: Math.max(0, Math.round(metric.value * factor) / factor),
    rating: metric.rating,
    deviceType: getDeviceType(),
    viewportCategory: getViewportCategory(),
  };
}

export function reportWebVital(metric: Metric): boolean {
  if (!initialized || !isWebVitalsEnabled() || !Number.isFinite(metric.value)) return false;

  const payload = JSON.stringify(buildWebVitalsPayload(metric));
  try {
    if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
      const queued = navigator.sendBeacon(
        WEB_VITALS_ENDPOINT,
        new Blob([payload], { type: "application/json" }),
      );
      if (queued) return true;
    }
    void fetch(WEB_VITALS_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: payload,
      keepalive: true,
    }).catch(() => undefined);
    return true;
  } catch {
    return false;
  }
}

export function initWebVitals(): void {
  if (initialized || typeof window === "undefined") return;
  initialized = true;

  const report = (metric: Metric) => {
    reportWebVital(metric);
  };

  onLCP(report);
  onCLS(report);
  onINP(report);
}
