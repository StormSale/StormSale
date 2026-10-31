import { onCLS, onINP, onLCP, type Metric } from "web-vitals";

export interface WebVitalReport {
  id: string;
  name: "CLS" | "INP" | "LCP";
  value: number;
  rating: Metric["rating"];
  deviceType: "mobile" | "tablet" | "desktop";
  viewport: "small" | "medium" | "large";
  path: string;
}

function telemetryAllowed() {
  if (navigator.doNotTrack === "1") return false;
  try {
    return localStorage.getItem("stormsale.analytics.disabled") !== "true";
  } catch {
    return false;
  }
}

function classifyViewport(width: number): Pick<WebVitalReport, "deviceType" | "viewport"> {
  if (width < 768) return { deviceType: "mobile", viewport: "small" };
  if (width < 1024) return { deviceType: "tablet", viewport: "medium" };
  return { deviceType: "desktop", viewport: "large" };
}

function reportMetric(metric: Metric) {
  if (!telemetryAllowed()) return;
  const payload: WebVitalReport = {
    id: metric.id,
    name: metric.name as WebVitalReport["name"],
    value: metric.value,
    rating: metric.rating,
    ...classifyViewport(window.innerWidth),
    path: window.location.pathname,
  };
  const body = JSON.stringify(payload);
  if (navigator.sendBeacon?.("/api/analytics/web-vitals", body)) return;
  void fetch("/api/analytics/web-vitals", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
    keepalive: true,
    credentials: "omit",
  });
}

/** Starts privacy-aware Core Web Vitals collection for real user sessions. */
export function initWebVitals() {
  if (typeof window === "undefined" || !telemetryAllowed()) return;
  onCLS(reportMetric);
  onINP(reportMetric);
  onLCP(reportMetric);
}
