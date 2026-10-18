import type { WebhookSignatureVerificationResult } from "../types/webhook";

/**
 * Generate a cryptographically secure random hex string
 */
export function generateRandomHex(byteCount = 24): string {
  const cryptoObj =
    typeof crypto !== "undefined" ? crypto : (globalThis as unknown as { crypto?: Crypto }).crypto;

  if (!cryptoObj || typeof cryptoObj.getRandomValues !== "function") {
    throw new Error(
      "Cryptographically secure PRNG (crypto.getRandomValues) is required for key/nonce generation.",
    );
  }

  const bytes = new Uint8Array(byteCount);
  cryptoObj.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Generate a new HMAC secret key formatted with the standard whsec_ prefix
 */
export function generateWebhookSecret(): string {
  return `whsec_${generateRandomHex(24)}`;
}

/**
 * Convert string or object payload to a deterministic normalized JSON string
 */
export function normalizePayload(payload: unknown): string {
  if (typeof payload === "string") {
    return payload;
  }
  return JSON.stringify(payload);
}

/**
 * Calculate HMAC-SHA256 signature using Web Crypto API
 */
export async function calculateHmacSha256(secret: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const keyData = enc.encode(secret);
  const msgData = enc.encode(message);

  const cryptoSubtle =
    typeof crypto !== "undefined" && crypto.subtle
      ? crypto.subtle
      : (globalThis as unknown as { crypto?: { subtle?: SubtleCrypto } }).crypto?.subtle;

  if (!cryptoSubtle) {
    throw new Error("Web Crypto API (crypto.subtle) is not available in this environment.");
  }

  const key = await cryptoSubtle.importKey(
    "raw",
    keyData,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );

  const signatureBuffer = await cryptoSubtle.sign("HMAC", key, msgData);
  const hashArray = Array.from(new Uint8Array(signatureBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

export interface SignWebhookOptions {
  payload: unknown;
  secret: string;
  timestamp?: number;
  nonce?: string;
}

export interface WebhookSignatureOutput {
  signature: string;
  signatureHeader: string;
  timestamp: number;
  nonce: string;
}

/**
 * Sign a webhook payload using HMAC-SHA256 and format the X-StormSale-Signature header
 * Header structure: t={timestamp},v1={hmac_sha256_hex},nonce={nonce}
 */
export async function generateWebhookSignature(
  options: SignWebhookOptions,
): Promise<WebhookSignatureOutput> {
  const { payload, secret } = options;
  const timestamp = options.timestamp ?? Math.floor(Date.now() / 1000);
  const nonce = options.nonce ?? generateRandomHex(12);

  const payloadString = normalizePayload(payload);
  const signedData = `${timestamp}.${nonce}.${payloadString}`;
  const signature = await calculateHmacSha256(secret, signedData);

  const signatureHeader = `t=${timestamp},v1=${signature},nonce=${nonce}`;

  return {
    signature,
    signatureHeader,
    timestamp,
    nonce,
  };
}

/**
 * Constant-time string comparison to mitigate timing attacks
 */
export function constantTimeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

// In-memory nonce store for replay attack protection (persisted during session)
const seenNonces = new Map<string, number>();

/**
 * Clear seen nonces older than the tolerance window relative to a reference timestamp
 */
export function pruneExpiredNonces(
  referenceTimestamp = Math.floor(Date.now() / 1000),
  maxAgeSeconds = 300,
): void {
  const cutoff = referenceTimestamp - maxAgeSeconds;
  for (const [nonce, timestamp] of seenNonces.entries()) {
    if (timestamp < cutoff) {
      seenNonces.delete(nonce);
    }
  }
}

/**
 * Reset nonce cache (primarily for unit testing)
 */
export function resetNonceCache(): void {
  seenNonces.clear();
}

export interface VerifyWebhookOptions {
  payload: unknown;
  signatureHeader: string;
  secret: string;
  toleranceSeconds?: number;
  currentTimestamp?: number;
  disableNonceCheck?: boolean;
}

/**
 * Verify a webhook payload authenticity and check for replay attacks
 */
export async function verifyWebhookSignature(
  options: VerifyWebhookOptions,
): Promise<WebhookSignatureVerificationResult> {
  const {
    payload,
    signatureHeader,
    secret,
    toleranceSeconds = 300,
    currentTimestamp = Math.floor(Date.now() / 1000),
    disableNonceCheck = false,
  } = options;

  if (!signatureHeader || !secret) {
    return { isValid: false, reason: "Missing signature header or secret key" };
  }

  // Parse header: t=1234567890,v1=abc123...,nonce=def456...
  const parts = signatureHeader.split(",");
  let timestamp: number | undefined;
  let signature: string | undefined;
  let nonce: string | undefined;

  for (const part of parts) {
    const [key, value] = part.trim().split("=");
    if (key === "t" && value) {
      timestamp = parseInt(value, 10);
    } else if (key === "v1" && value) {
      signature = value;
    } else if (key === "nonce" && value) {
      nonce = value;
    }
  }

  if (!timestamp || isNaN(timestamp) || !signature) {
    return {
      isValid: false,
      reason: "Malformed X-StormSale-Signature header (missing t or v1 component)",
    };
  }

  // 1. Replay attack prevention: Timestamp freshness tolerance
  const ageSeconds = currentTimestamp - timestamp;
  if (Math.abs(ageSeconds) > toleranceSeconds) {
    return {
      isValid: false,
      reason: `Timestamp out of tolerance window (age: ${ageSeconds}s, max tolerance: ${toleranceSeconds}s). Replay attack prevented.`,
      timestamp,
      nonce,
      ageSeconds,
    };
  }

  // 2. Nonce presence requirement when replay protection is enabled
  if (!disableNonceCheck && !nonce) {
    return {
      isValid: false,
      reason:
        "Missing nonce parameter in signature header. Replay attack protection requires a nonce.",
      timestamp,
      ageSeconds,
    };
  }

  // 3. Authenticity verification: Calculate expected HMAC-SHA256
  const payloadString = normalizePayload(payload);
  const signedData = nonce
    ? `${timestamp}.${nonce}.${payloadString}`
    : `${timestamp}.${payloadString}`;

  const expectedSignature = await calculateHmacSha256(secret, signedData);
  const isSignatureValid = constantTimeCompare(signature, expectedSignature);

  if (!isSignatureValid) {
    return {
      isValid: false,
      reason: "HMAC-SHA256 signature mismatch: payload tampered or incorrect secret key",
      timestamp,
      nonce,
      ageSeconds,
    };
  }

  // 4. Replay attack prevention: Nonce deduplication AFTER signature validation
  // Only valid signatures are permitted to consume/reserve nonces
  if (!disableNonceCheck && nonce) {
    pruneExpiredNonces(currentTimestamp, toleranceSeconds);
    if (seenNonces.has(nonce)) {
      return {
        isValid: false,
        reason: `Duplicate nonce '${nonce}' detected within tolerance window. Replay attack prevented.`,
        timestamp,
        nonce,
        ageSeconds,
      };
    }
    seenNonces.set(nonce, timestamp);
  }

  return {
    isValid: true,
    timestamp,
    nonce,
    ageSeconds,
  };
}
