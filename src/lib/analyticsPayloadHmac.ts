/**
 * StormSale Anti-Tamper Client Analytics Telemetry HMAC Signature Protocol (#475)
 *
 * Provides:
 * 1. Monotonically increasing nonce and timestamp injection for click/impression telemetry.
 * 2. Ephemeral HMAC-SHA256 cryptographic signing of the canonical payload body before transit.
 * 3. Backend rejection simulation enforcing max 30-second timestamp freshness skew and replay protection.
 */

export interface AnalyticsEventData {
  eventType: "click" | "impression" | "conversion" | string;
  campaignId?: string;
  referralId?: string;
  targetUrl?: string;
  countryIso?: string;
  metadata?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface AnalyticsPayload {
  nonce: number;
  timestamp: number;
  body: AnalyticsEventData;
}

export interface SignedAnalyticsPayload extends AnalyticsPayload {
  signature: string;
}

export interface VerificationResult {
  valid: boolean;
  reason?: string;
}

export interface VerificationOptions {
  /** Maximum acceptable clock skew in seconds (default: 30) */
  maxSkewSeconds?: number;
  /** Current time in ms (for testing clock skews) */
  now?: number;
  /** Minimum required nonce or last seen nonce */
  minNonce?: number;
  /** Set of previously seen nonces for replay rejection */
  seenNonces?: Set<number>;
}

/**
 * Monotonically increasing nonce generator ensuring each generated nonce
 * is strictly greater than the previous one, even within the same millisecond.
 */
export class MonotonicNonceGenerator {
  private lastNonce: number;

  constructor(initialNonce = 0) {
    this.lastNonce = initialNonce;
  }

  getNextNonce(): number {
    const timestampCounter = Date.now() * 1000;
    if (timestampCounter > this.lastNonce) {
      this.lastNonce = timestampCounter;
    } else {
      this.lastNonce += 1;
    }
    return this.lastNonce;
  }

  getCurrentNonce(): number {
    return this.lastNonce;
  }

  reset(initialNonce = 0): void {
    this.lastNonce = initialNonce;
  }
}

export const defaultNonceGenerator = new MonotonicNonceGenerator();

/**
 * Deterministic JSON serialization sorting keys alphabetically to guarantee
 * consistent HMAC signatures regardless of property insertion order.
 */
export function canonicalizeJson(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return "[" + value.map(canonicalizeJson).join(",") + "]";
  }
  const obj = value as Record<string, unknown>;
  const sortedKeys = Object.keys(obj).sort();
  const pairs = sortedKeys.map((k) => `${JSON.stringify(k)}:${canonicalizeJson(obj[k])}`);
  return "{" + pairs.join(",") + "}";
}

/**
 * Helper to convert Uint8Array or ArrayBuffer to lowercase hex string.
 */
export function bufferToHex(buffer: ArrayBuffer | Uint8Array): string {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Calculates HMAC-SHA256 signature using Web Crypto API or Node fallback.
 */
export async function calculateHmacSha256(
  secret: string | Uint8Array,
  message: string,
): Promise<string> {
  const encoder = new TextEncoder();
  const keyBytes = typeof secret === "string" ? encoder.encode(secret) : secret;
  const msgBytes = encoder.encode(message);

  if (typeof globalThis.crypto !== "undefined" && globalThis.crypto.subtle) {
    const key = await globalThis.crypto.subtle.importKey(
      "raw",
      keyBytes as unknown as BufferSource,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const signatureBuffer = await globalThis.crypto.subtle.sign(
      "HMAC",
      key,
      msgBytes as unknown as BufferSource,
    );
    return bufferToHex(signatureBuffer);
  }

  // Fallback for Node.js environments without crypto.subtle
  const nodeCrypto = await import("crypto");
  const hmac = nodeCrypto.createHmac("sha256", keyBytes);
  hmac.update(msgBytes);
  return hmac.digest("hex");
}

/**
 * Creates an unsigned analytics payload with monotonically increasing nonce and timestamp.
 */
export function createAnalyticsPayload(
  body: AnalyticsEventData,
  options?: {
    nonce?: number;
    timestamp?: number;
    nonceGenerator?: MonotonicNonceGenerator;
  },
): AnalyticsPayload {
  const generator = options?.nonceGenerator ?? defaultNonceGenerator;
  const nonce = options?.nonce !== undefined ? options.nonce : generator.getNextNonce();
  const timestamp = options?.timestamp !== undefined ? options.timestamp : Date.now();

  return {
    nonce,
    timestamp,
    body,
  };
}

/**
 * Ephemerally signs the canonical representation of the payload body with the secret key.
 */
export async function signAnalyticsPayload(
  payload: AnalyticsPayload,
  secret: string | Uint8Array,
): Promise<SignedAnalyticsPayload> {
  const canonicalBody = canonicalizeJson(payload.body);
  const signingString = `${payload.timestamp}.${payload.nonce}.${canonicalBody}`;
  const signature = await calculateHmacSha256(secret, signingString);

  return {
    ...payload,
    signature,
  };
}

/**
 * Formats standard HTTP headers for transmitting signed telemetry payloads.
 */
export function createAnalyticsSignatureHeaders(signedPayload: SignedAnalyticsPayload): {
  "X-Analytics-Signature": string;
  "X-Analytics-Timestamp": string;
  "X-Analytics-Nonce": string;
} {
  return {
    "X-Analytics-Signature": signedPayload.signature,
    "X-Analytics-Timestamp": String(signedPayload.timestamp),
    "X-Analytics-Nonce": String(signedPayload.nonce),
  };
}

/**
 * Simulates backend validation and anti-tamper verification.
 * Enforces:
 * 1. Monotonic nonce / replay check.
 * 2. Timestamp freshness tolerance (rejects skew > 30 seconds).
 * 3. Authenticity verification via HMAC-SHA256 signature match.
 */
export async function verifyAnalyticsPayload(
  signedPayload: SignedAnalyticsPayload,
  secret: string | Uint8Array,
  options: VerificationOptions = {},
): Promise<VerificationResult> {
  const maxSkewSeconds = options.maxSkewSeconds ?? 30;
  const now = options.now ?? Date.now();

  // 1. Timestamp Freshness Check: skew must not exceed 30 seconds
  const timestampDiff = Math.abs(now - signedPayload.timestamp);
  const maxSkewMs = maxSkewSeconds * 1000;

  if (timestampDiff > maxSkewMs) {
    const direction = signedPayload.timestamp < now ? "past (stale)" : "future (clock drift)";
    return {
      valid: false,
      reason: `Payload timestamp skewed by >${maxSkewSeconds} seconds (${Math.round(timestampDiff / 1000)}s in the ${direction})`,
    };
  }

  // 2. Monotonic Nonce & Replay Protection
  if (options.minNonce !== undefined && signedPayload.nonce <= options.minNonce) {
    return {
      valid: false,
      reason: `Nonce ${signedPayload.nonce} is not monotonically increasing (expected > ${options.minNonce})`,
    };
  }

  if (options.seenNonces && options.seenNonces.has(signedPayload.nonce)) {
    return {
      valid: false,
      reason: `Replay detected: Nonce ${signedPayload.nonce} has already been processed`,
    };
  }

  // 3. Ephemeral HMAC-SHA256 Signature Verification
  const canonicalBody = canonicalizeJson(signedPayload.body);
  const expectedSigningString = `${signedPayload.timestamp}.${signedPayload.nonce}.${canonicalBody}`;
  const expectedSignature = await calculateHmacSha256(secret, expectedSigningString);

  if (signedPayload.signature !== expectedSignature) {
    return {
      valid: false,
      reason: "HMAC signature mismatch: payload tampered or unauthorized secret",
    };
  }

  return { valid: true };
}
