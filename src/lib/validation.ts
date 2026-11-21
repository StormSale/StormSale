
import {
  onCLS,
  onFID,
  onINP,
  onLCP,
  type Metric,
} from "web-vitals";

type WebVitalPayload = {
  name: string;
  value: number;
  rating: string;
  id: string;
  delta: number;
  navigationType: string;
  page: string;
  timestamp: string;
  userAgent: string;
};

const WEB_VITALS_ENDPOINT = import.meta.env.VITE_WEB_VITALS_ENDPOINT;

function sendMetric(metric: Metric): void {
  const payload: WebVitalPayload = {
    name: metric.name,
    value: metric.value,
    rating: metric.rating,
    id: metric.id,
    delta: metric.delta,
    navigationType: metric.navigationType,
    page: window.location.pathname,
    timestamp: new Date().toISOString(),
    userAgent: navigator.userAgent,
  };

  // Show metrics locally during development.
  if (import.meta.env.DEV) {
    console.info("[Web Vitals]", payload);
  }

  // Do not send telemetry without a configured endpoint.
  if (!WEB_VITALS_ENDPOINT) return;

  const body = JSON.stringify(payload);
  const blob = new Blob([body], {
    type: "application/json",
  });

  // sendBeacon is useful when the user navigates away.
  if (navigator.sendBeacon(WEB_VITALS_ENDPOINT, blob)) {
    return;
  }

  // Fallback if sendBeacon is unavailable or fails.
  void fetch(WEB_VITALS_ENDPOINT, {
    method: "POST",
    body,
    headers: {
      "Content-Type": "application/json",
    },
    keepalive: true,
  }).catch((error: unknown) => {
    console.error("[Web Vitals] Failed to send metric:", error);
  });
}

export function initWebVitals(): void {
  onLCP(sendMetric);
  onFID(sendMetric);
  onCLS(sendMetric);
  onINP(sendMetric);
}
