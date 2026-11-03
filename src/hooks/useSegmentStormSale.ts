import { useState, useEffect, useCallback } from "react";
import {
  mapCampaignViewed,
  mapOrderCompleted,
  validateNoPII,
  type CampaignViewedInput,
  type OrderCompletedInput,
} from "../utils/analyticsMapper";

export const ANALYTICS_CONSENT_STORAGE_KEY = "stormsale_analytics_consent";

/**
 * Global window augmentation for Segment and RudderStack analytics SDKs.
 */
declare global {
  interface Window {
    analytics?: {
      track: (
        event: string,
        properties?: Record<string, unknown>,
        options?: unknown,
        callback?: () => void,
      ) => void;
      page?: (name?: string, properties?: Record<string, unknown>) => void;
      identify?: (userId?: string, traits?: Record<string, unknown>) => void;
      load?: (writeKey: string, options?: unknown) => void;
      ready?: (callback: () => void) => void;
      [key: string]: unknown;
    };
    rudderanalytics?: {
      track: (
        event: string,
        properties?: Record<string, unknown>,
        options?: unknown,
        callback?: () => void,
      ) => void;
      page?: (name?: string, properties?: Record<string, unknown>) => void;
      identify?: (userId?: string, traits?: Record<string, unknown>) => void;
      load?: (writeKey: string, dataPlaneUrl: string, options?: unknown) => void;
      ready?: (callback: () => void) => void;
      [key: string]: unknown;
    };
  }
}

/**
 * Evaluates whether the user has granted analytics & telemetry tracking consent.
 * Stored in localStorage. Defaults to false if unassigned (opt-in privacy model).
 */
export function hasAnalyticsConsent(): boolean {
  try {
    if (typeof window === "undefined" || !window.localStorage) {
      return false;
    }
    return window.localStorage.getItem(ANALYTICS_CONSENT_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

/**
 * Updates user consent for analytics telemetry.
 * If consent is revoked (false), SDK tracking calls will immediately halt.
 */
export function setAnalyticsConsent(granted: boolean): void {
  try {
    if (typeof window !== "undefined" && window.localStorage) {
      window.localStorage.setItem(ANALYTICS_CONSENT_STORAGE_KEY, granted ? "true" : "false");
      if (typeof window.dispatchEvent === "function") {
        window.dispatchEvent(new CustomEvent("stormsale_consent_changed", { detail: { granted } }));
      }
    }
  } catch (err) {
    console.warn("[Analytics] Could not persist consent preference to storage:", err);
  }
}

/**
 * Safely resolves an environment variable across Vite (import.meta.env)
 * and Node/Process (process.env) runtimes without crashing.
 */
export function getAnalyticsEnv(key: string): string | undefined {
  try {
    // 1. Check Vite standard import.meta.env
    if (
      typeof import.meta !== "undefined" &&
      import.meta.env &&
      typeof import.meta.env[key] === "string"
    ) {
      return import.meta.env[key];
    }
  } catch {
    // Ignore in non-ESM environments
  }

  try {
    // 2. Check Node / Next / build environment process.env
    const proc = (
      globalThis as unknown as { process?: { env?: Record<string, string | undefined> } }
    ).process;
    if (proc && proc.env && typeof proc.env[key] === "string") {
      return proc.env[key];
    }
  } catch {
    // Ignore if process is undefined
  }

  return undefined;
}

// Module-level session singleton trackers to ensure initialization only runs once per session
let isSegmentInitialized = false;
let isRudderStackInitialized = false;
let sessionInitAttempted = false;

/**
 * Resets the session singleton state (used exclusively for isolated unit tests).
 */
export function resetAnalyticsSessionForTesting(): void {
  isSegmentInitialized = false;
  isRudderStackInitialized = false;
  sessionInitAttempted = false;
}

/**
 * Conditionally loads and initializes Segment.io (analytics.js) and RudderStack SDKs.
 *
 * CONSENT POLICY:
 * If user consent has not been granted (hasAnalyticsConsent() === false), neither
 * SDK script will be fetched and no tracking network requests will be generated.
 */
export function initializeAnalyticsOnce(): { segment: boolean; rudderstack: boolean } {
  if (typeof window === "undefined") {
    return { segment: false, rudderstack: false };
  }

  // Strict Privacy: Never initialize SDKs without explicit consent
  if (!hasAnalyticsConsent()) {
    return { segment: false, rudderstack: false };
  }

  if (sessionInitAttempted) {
    return { segment: isSegmentInitialized, rudderstack: isRudderStackInitialized };
  }
  sessionInitAttempted = true;

  const segmentWriteKey = getAnalyticsEnv("NEXT_PUBLIC_SEGMENT_WRITE_KEY");
  const rudderWriteKey = getAnalyticsEnv("NEXT_PUBLIC_RUDDERSTACK_WRITE_KEY");
  const rudderDataPlaneUrl = getAnalyticsEnv("NEXT_PUBLIC_RUDDERSTACK_DATA_PLANE_URL");

  // 1. Initialize Segment.io if write key is present
  if (segmentWriteKey && segmentWriteKey.trim()) {
    try {
      if (!window.analytics) {
        // Initialize lightweight snippet buffer if not already present
        const analyticsBuffer: any = [];
        analyticsBuffer.invoked = true;
        analyticsBuffer.methods = ["track", "page", "identify", "reset", "group", "alias", "ready"];
        analyticsBuffer.factory = function (method: string) {
          return function (...args: unknown[]) {
            args.unshift(method);
            analyticsBuffer.push(args);
          };
        };
        for (const method of analyticsBuffer.methods) {
          analyticsBuffer[method] = analyticsBuffer.factory(method);
        }
        window.analytics = analyticsBuffer;

        // Asynchronously load official Segment analytics.js if DOM available
        if (typeof document !== "undefined" && document.head) {
          const script = document.createElement("script");
          script.type = "text/javascript";
          script.async = true;
          script.src = `https://cdn.segment.com/analytics.js/v1/${encodeURIComponent(segmentWriteKey.trim())}/analytics.min.js`;
          document.head.appendChild(script);
        }
      }

      const analytics = window.analytics;
      if (analytics && typeof analytics.load === "function") {
        analytics.load(segmentWriteKey.trim());
      }
      isSegmentInitialized = true;
    } catch (err) {
      console.warn("[Analytics] Failed to initialize Segment.io:", err);
    }
  }

  // 2. Initialize RudderStack if write key & data plane URL are present
  if (rudderWriteKey && rudderWriteKey.trim() && rudderDataPlaneUrl && rudderDataPlaneUrl.trim()) {
    try {
      if (!window.rudderanalytics) {
        // Initialize lightweight RudderStack snippet buffer
        const rudderBuffer: any = [];
        rudderBuffer.methods = ["track", "page", "identify", "reset", "alias", "group", "ready"];
        rudderBuffer.factory = function (method: string) {
          return function (...args: unknown[]) {
            args.unshift(method);
            rudderBuffer.push(args);
          };
        };
        for (const method of rudderBuffer.methods) {
          rudderBuffer[method] = rudderBuffer.factory(method);
        }
        window.rudderanalytics = rudderBuffer;

        // Asynchronously load official RudderStack JavaScript SDK if DOM available
        if (typeof document !== "undefined" && document.head) {
          const script = document.createElement("script");
          script.type = "text/javascript";
          script.async = true;
          script.src = "https://cdn.rudderlabs.com/v1.1/rudder-analytics.min.js";
          document.head.appendChild(script);
        }
      }

      const rudder = window.rudderanalytics;
      if (rudder && typeof rudder.load === "function") {
        rudder.load(rudderWriteKey.trim(), rudderDataPlaneUrl.trim());
      }
      isRudderStackInitialized = true;
    } catch (err) {
      console.warn("[Analytics] Failed to initialize RudderStack:", err);
    }
  }

  return { segment: isSegmentInitialized, rudderstack: isRudderStackInitialized };
}

/**
 * Core event dispatcher that validates PII and forwards identical analytics.track()
 * payloads to both Segment and RudderStack.
 */
export function dispatchCDPTrack(eventName: string, properties: Record<string, unknown>): boolean {
  // 1. Consent Gate: Abort immediately if consent is not granted
  if (!hasAnalyticsConsent()) {
    return false;
  }

  // 2. Privacy & PII Validation
  validateNoPII(properties);

  let dispatched = false;

  // 3. Dispatch to Segment
  if (
    typeof window !== "undefined" &&
    window.analytics &&
    typeof window.analytics.track === "function"
  ) {
    window.analytics.track(eventName, properties);
    dispatched = true;
  }

  // 4. Dispatch to RudderStack (Identical payload shape for destination parity)
  if (
    typeof window !== "undefined" &&
    window.rudderanalytics &&
    typeof window.rudderanalytics.track === "function"
  ) {
    window.rudderanalytics.track(eventName, properties);
    dispatched = true;
  }

  return dispatched;
}

/**
 * Tracks "Campaign Viewed" when a user views a campaign listing or branded marketplace.
 * Maps properties strictly according to Segment e-commerce spec without PII.
 */
export function trackCampaignViewedEvent(input: CampaignViewedInput): boolean {
  if (!hasAnalyticsConsent()) {
    return false;
  }
  const mapped = mapCampaignViewed(input);
  return dispatchCDPTrack(mapped.event, mapped.properties as unknown as Record<string, unknown>);
}

/**
 * Tracks "Order Completed" when an affiliate sale is confirmed on the Stellar ledger.
 * Hashes the affiliate wallet address with SHA-256 and records revenue in XLM.
 */
export function trackOrderCompletedEvent(input: OrderCompletedInput): boolean {
  if (!hasAnalyticsConsent()) {
    return false;
  }
  const mapped = mapOrderCompleted(input);
  return dispatchCDPTrack(mapped.event, mapped.properties as unknown as Record<string, unknown>);
}

export interface UseSegmentStormSaleReturn {
  isInitialized: boolean;
  isSegmentActive: boolean;
  isRudderStackActive: boolean;
  hasConsent: boolean;
  setConsent: (granted: boolean) => void;
  trackCampaignViewed: (input: CampaignViewedInput) => boolean;
  trackOrderCompleted: (input: OrderCompletedInput) => boolean;
  trackCustomEvent: (eventName: string, properties: Record<string, unknown>) => boolean;
}

/**
 * Primary React hook for client-side CDP event tracking in StormSale.
 *
 * Supports dual dispatching to Segment.io and RudderStack with identical event shapes
 * matching the Segment E-Commerce Spec.
 * Enforces zero-PII with SHA-256 wallet address hashing and strict consent gating.
 */
export function useSegmentStormSale(): UseSegmentStormSaleReturn {
  const [consentGranted, setConsentGranted] = useState<boolean>(() => hasAnalyticsConsent());
  const [status, setStatus] = useState<{ segment: boolean; rudderstack: boolean }>(() => {
    if (hasAnalyticsConsent()) {
      return initializeAnalyticsOnce();
    }
    return {
      segment: isSegmentInitialized,
      rudderstack: isRudderStackInitialized,
    };
  });

  // Synchronize dynamic consent changes (e.g. user toggles consent in banner or settings)
  useEffect(() => {
    const handleConsentEvent = (e: Event) => {
      const customEvent = e as CustomEvent<{ granted: boolean }>;
      const granted = customEvent.detail?.granted ?? hasAnalyticsConsent();
      setConsentGranted(granted);
      if (granted) {
        const initialized = initializeAnalyticsOnce();
        setStatus(initialized);
      }
    };

    if (typeof window !== "undefined" && typeof window.addEventListener === "function") {
      window.addEventListener("stormsale_consent_changed", handleConsentEvent);
      return () => {
        window.removeEventListener("stormsale_consent_changed", handleConsentEvent);
      };
    }
  }, []);

  const updateConsent = useCallback((granted: boolean) => {
    setAnalyticsConsent(granted);
    setConsentGranted(granted);
    if (granted) {
      const initialized = initializeAnalyticsOnce();
      setStatus(initialized);
    }
  }, []);

  const trackCampaignViewed = useCallback(
    (input: CampaignViewedInput): boolean => trackCampaignViewedEvent(input),
    [],
  );

  const trackOrderCompleted = useCallback(
    (input: OrderCompletedInput): boolean => trackOrderCompletedEvent(input),
    [],
  );

  const trackCustomEvent = useCallback(
    (eventName: string, properties: Record<string, unknown>): boolean =>
      dispatchCDPTrack(eventName, properties),
    [],
  );

  return {
    isInitialized: status.segment || status.rudderstack,
    isSegmentActive: status.segment,
    isRudderStackActive: status.rudderstack,
    hasConsent: consentGranted,
    setConsent: updateConsent,
    trackCampaignViewed,
    trackOrderCompleted,
    trackCustomEvent,
  };
}
