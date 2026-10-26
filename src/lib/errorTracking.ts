/**
 * Client-side error tracking (Sentry) with privacy scrubbing.
 *
 * - Error tracking is completely optional: without a DSN nothing is initialised
 *   and no data ever leaves the browser.
 * - Every event is scrubbed in `beforeSend`, so private keys, seed phrases, IP
 *   addresses and e-mail addresses never reach Sentry.
 * - Production error events are sampled natively through Sentry's `sampleRate`
 *   option, which keeps the quota safe from noisy runtime errors.
 */

import * as Sentry from "@sentry/react";

/**
 * Share of production error events that is sent to Sentry. The rest is dropped
 * by the SDK before it leaves the browser.
 */
export const PRODUCTION_ERROR_SAMPLE_RATE = 0.1;

/** Placeholder written over a value that matched a sensitive key name. */
export const REDACTED_VALUE = "[REDACTED]";

/** Maximum object depth walked while scrubbing. */
const MAX_SCRUB_DEPTH = 12;

export interface RedactionPattern {
  name: string;
  regex: RegExp;
  replacement: string;
}

/**
 * Object property names whose value is replaced wholesale. Catches values such
 * as a seed phrase that are stored in a named field, without touching the
 * prose of an error message.
 */
export const SENSITIVE_KEY_PATTERN =
  /secret|mnemonic|seed|phrase|password|private[_]?key|api[_]?key|token|authorization|credential/i;

/**
 * Value patterns applied to every string in the event.
 */
export const REDACTION_PATTERNS: RedactionPattern[] = [
  {
    name: "stellar-secret-seed",
    // Stellar secret seeds are 56 characters: "S" followed by 55 base32
    // characters. Same shape the repository's secret scan workflow greps for.
    regex: /\bS[ABCD][A-Z2-7]{54}\b/g,
    replacement: "[REDACTED_STELLAR_SECRET]",
  },
  {
    name: "hex-private-key",
    regex: /\b[0-9a-fA-F]{64}\b/g,
    replacement: "[REDACTED_PRIVATE_KEY]",
  },
  {
    name: "ipv4-address",
    regex: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g,
    replacement: "[REDACTED_IP]",
  },
  {
    name: "ipv6-link-local",
    regex: /\bfe80:[0-9a-f:]{2,}\b/gi,
    replacement: "[REDACTED_IP]",
  },
  {
    name: "ipv6-unique-local",
    regex: /\b(?:fc|fd)[0-9a-f]{2}:[0-9a-f:]{2,}\b/gi,
    replacement: "[REDACTED_IP]",
  },
  {
    name: "email-address",
    regex: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,
    replacement: "[REDACTED_EMAIL]",
  },
];

/**
 * Applies every redaction pattern to a single string.
 */
export function scrubString(value: string): string {
  let output = value;
  for (const pattern of REDACTION_PATTERNS) {
    pattern.regex.lastIndex = 0;
    output = output.replace(pattern.regex, pattern.replacement);
  }
  return output;
}

/**
 * Recursively scrubs a value. Object properties with a sensitive name are
 * replaced wholesale, every other string is run through the value patterns.
 */
export function scrubValue(value: unknown, key?: string, depth = 0): unknown {
  if (depth > MAX_SCRUB_DEPTH) return "[TRUNCATED]";

  if (typeof value === "string") {
    if (key && SENSITIVE_KEY_PATTERN.test(key)) return REDACTED_VALUE;
    return scrubString(value);
  }

  if (Array.isArray(value)) {
    return value.map((entry) => scrubValue(entry, key, depth + 1));
  }

  if (value && typeof value === "object") {
    const output: Record<string, unknown> = {};
    for (const [entryKey, entryValue] of Object.entries(value as Record<string, unknown>)) {
      output[entryKey] = SENSITIVE_KEY_PATTERN.test(entryKey)
        ? REDACTED_VALUE
        : scrubValue(entryValue, entryKey, depth + 1);
    }
    return output;
  }

  return value;
}

/**
 * Scrubs a Sentry event before it is transmitted. The visitor IP Sentry
 * attaches automatically is redacted as well.
 */
export function scrubEvent<T extends object>(event: T): T {
  if (!event || typeof event !== "object") return event;

  const scrubbed = scrubValue(event) as T;
  const user = (scrubbed as { user?: { ip_address?: unknown } }).user;
  if (user && typeof user.ip_address === "string") {
    user.ip_address = "[REDACTED_IP]";
  }

  return scrubbed;
}

/**
 * `beforeSend` hook - only responsible for privacy scrubbing. Sampling is
 * handled natively by the SDK through the `sampleRate` option.
 */
export function beforeSend<T extends object>(event: T): T {
  return scrubEvent(event);
}

let initialized = false;

/**
 * Initialises Sentry when a DSN is configured.
 *
 * @returns true when error tracking is active, false when it stays disabled.
 */
export function initErrorTracking(): boolean {
  const dsn = (import.meta.env.VITE_SENTRY_DSN || "").trim();
  if (!dsn) {
    // No DSN configured - error tracking stays completely disabled.
    return false;
  }
  if (initialized) return true;

  Sentry.init({
    dsn,
    environment: import.meta.env.MODE,
    // Only a share of the production error events is sent so the quota is not
    // exhausted by noisy runtime errors. Development keeps every event.
    sampleRate: import.meta.env.PROD ? PRODUCTION_ERROR_SAMPLE_RATE : 1.0,
    // Every event is scrubbed before it leaves the browser.
    beforeSend,
    // Tracing is not used - the quota is reserved for error events.
    tracesSampleRate: 0,
  });

  initialized = true;
  return true;
}

/**
 * True when error tracking has been initialised.
 */
export function isErrorTrackingEnabled(): boolean {
  return initialized;
}

/**
 * Records a breadcrumb describing what the user was doing when an error
 * happened. Values are scrubbed with the same rules as the events.
 */
export function addErrorBreadcrumb(
  category: string,
  message: string,
  data?: Record<string, unknown>,
): void {
  if (!initialized) return;

  try {
    Sentry.addBreadcrumb({
      category,
      message: scrubString(message),
      level: "info",
      data: data ? (scrubValue(data) as Record<string, unknown>) : undefined,
    });
  } catch {
    // Breadcrumbs must never break the application.
  }
}
