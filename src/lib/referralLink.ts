/**
 * Affiliate encrypted referral link builder (#46).
 *
 * Tracking URL shape:
 *   {origin}/c/{campaignId}?ref={affiliateAddress}&tag={base64url-envelope}
 *
 * The `tag` envelope is a base64url JSON blob with encrypted affiliate
 * metadata ({ v, aff, cid, ts, iv?, ct }). With an AES-GCM key it is sealed;
 * otherwise it falls back to an opaque plaintext encoding.
 */

export interface ReferralMetadata {
  /** Envelope schema version. */
  v: number;
  /** Affiliate wallet address (Stellar G...). Absent on sealed envelopes until decrypted. */
  aff?: string;
  /** Campaign identifier. Absent on sealed envelopes until decrypted. */
  cid?: string;
  /** Issued-at timestamp (ms since epoch). */
  ts: number;
  /** Base64url AES-GCM IV (present when encrypted). */
  iv?: string;
  /** Base64url AES-GCM ciphertext (present when encrypted). */
  ct?: string;
}

export interface BuildReferralLinkParams {
  /** Campaign identifier (path segment after /c/). */
  campaignId: string;
  /** Affiliate wallet address used for the ?ref= param. */
  affiliateAddress: string;
  /** Base URL origin; defaults to window.location.origin, falls back to https://stormsale.xyz. */
  origin?: string;
  /** Optional AES-GCM CryptoKey to seal the tag envelope. */
  encryptionKey?: CryptoKey;
}

export const REFERRAL_ENVELOPE_VERSION = 1;
export const REFERRAL_FALLBACK_ORIGIN = "https://stormsale.xyz";

export function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  const base64 = btoa(binary);
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export function base64UrlDecodeToBytes(input: string): Uint8Array {
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function textToBytes(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

function bytesToText(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes);
}

function buildEnvelopePayload(params: {
  affiliateAddress: string;
  campaignId: string;
  issuedAt: number;
}): Pick<ReferralMetadata, "v" | "aff" | "cid" | "ts"> {
  return {
    v: REFERRAL_ENVELOPE_VERSION,
    aff: params.affiliateAddress,
    cid: params.campaignId,
    ts: params.issuedAt,
  };
}

/**
 * Seal referral metadata with AES-GCM when a key is provided.
 *
 * Sealed envelope shape: { v, ts, iv, ct } — the plaintext affiliate
 * address and campaign id live ONLY inside the ciphertext. The URL's
 * plaintext `ref` param preserves attribution for verifiers without
 * the key, while the tag itself reveals nothing.
 *
 * Without a key (or on any WebCrypto failure) falls back to an opaque
 * plaintext envelope { v, aff, cid, ts } so links stay shareable.
 */
export async function encodeReferralTag(
  affiliateAddress: string,
  campaignId: string,
  encryptionKey?: CryptoKey,
  issuedAt: number = Date.now(),
): Promise<string> {
  const payload = buildEnvelopePayload({ affiliateAddress, campaignId, issuedAt });

  if (encryptionKey && typeof crypto !== "undefined" && crypto.subtle) {
    try {
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const plaintext = textToBytes(JSON.stringify(payload));
      const ciphertext = new Uint8Array(
        await crypto.subtle.encrypt({ name: "AES-GCM", iv }, encryptionKey, plaintext),
      );
      const envelope: ReferralMetadata = {
        v: REFERRAL_ENVELOPE_VERSION,
        ts: payload.ts,
        iv: base64UrlEncode(iv),
        ct: base64UrlEncode(ciphertext),
      };
      return base64UrlEncode(textToBytes(JSON.stringify(envelope)));
    } catch {
      // Fall through to plaintext envelope on any WebCrypto failure.
    }
  }

  return base64UrlEncode(textToBytes(JSON.stringify(payload)));
}

export function resolveReferralOrigin(explicitOrigin?: string): string {
  if (explicitOrigin && explicitOrigin.trim().length > 0) {
    return explicitOrigin.replace(/\/+$/, "");
  }
  if (typeof window !== "undefined" && window.location?.origin) {
    return window.location.origin.replace(/\/+$/, "");
  }
  return REFERRAL_FALLBACK_ORIGIN;
}

/**
 * Generate a fresh AES-GCM 256-bit key for sealing a single referral tag.
 * Ephemeral by design: the key is used once for encodeReferralTag and is
 * never stored — the plaintext `ref` param preserves attribution.
 */
export async function generateReferralEncryptionKey(): Promise<CryptoKey> {
  if (typeof crypto === "undefined" || !crypto.subtle) {
    throw new Error("WebCrypto is unavailable in this environment.");
  }
  return crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, [
    "encrypt",
    "decrypt",
  ]);
}

/**
 * Build the full shareable tracking URL for a campaign + affiliate pair.
 */
export async function buildReferralLink(params: BuildReferralLinkParams): Promise<string> {
  const campaignId = params.campaignId.trim();
  const affiliateAddress = params.affiliateAddress.trim();
  if (!campaignId) {
    throw new Error("Campaign ID is required to build a referral link.");
  }
  if (!affiliateAddress) {
    throw new Error("Affiliate address is required to build a referral link.");
  }
  const tag = await encodeReferralTag(affiliateAddress, campaignId, params.encryptionKey);
  const origin = resolveReferralOrigin(params.origin);
  const url = new URL(`${origin}/c/${encodeURIComponent(campaignId)}`);
  url.searchParams.set("ref", affiliateAddress);
  url.searchParams.set("tag", tag);
  return url.toString();
}

/**
 * Decode a tag envelope produced by {@link encodeReferralTag}.
 *
 * Sealed envelopes ({ v, ts, iv, ct }) return WITHOUT aff/cid — pass a
 * `decryptionKey` to recover the sealed metadata. Plaintext envelopes
 * ({ v, aff, cid, ts }) return the metadata directly. Throws on any
 * malformed envelope, version mismatch, or failed authentication.
 */
export async function decodeReferralTag(tag: string, decryptionKey?: CryptoKey): Promise<ReferralMetadata> {
  let parsed: ReferralMetadata;
  try {
    const json = bytesToText(base64UrlDecodeToBytes(tag));
    parsed = JSON.parse(json) as ReferralMetadata;
  } catch {
    throw new Error("Invalid referral tag envelope.");
  }
  if (typeof parsed !== "object" || parsed === null || parsed.v !== REFERRAL_ENVELOPE_VERSION) {
    throw new Error("Invalid referral tag envelope.");
  }

  const isSealed = typeof parsed.iv === "string" && typeof parsed.ct === "string";
  if (isSealed) {
    if (!decryptionKey || typeof crypto === "undefined" || !crypto.subtle) {
      // Sealed: metadata stays hidden without the key.
      return { v: parsed.v, ts: parsed.ts, iv: parsed.iv, ct: parsed.ct };
    }
    try {
      const iv = base64UrlDecodeToBytes(parsed.iv as string);
      const ct = base64UrlDecodeToBytes(parsed.ct as string);
      const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, decryptionKey, ct);
      const inner = JSON.parse(bytesToText(new Uint8Array(plaintext))) as Pick<
        ReferralMetadata,
        "aff" | "cid" | "ts"
      >;
      if (typeof inner.aff !== "string" || typeof inner.cid !== "string") {
        throw new Error("Invalid referral tag envelope.");
      }
      return {
        v: parsed.v,
        aff: inner.aff,
        cid: inner.cid,
        ts: typeof inner.ts === "number" ? inner.ts : parsed.ts,
        iv: parsed.iv,
        ct: parsed.ct,
      };
    } catch (error) {
      if (error instanceof Error && error.message === "Invalid referral tag envelope.") throw error;
      throw new Error("Invalid referral tag envelope.");
    }
  }

  if (typeof parsed.aff !== "string" || typeof parsed.cid !== "string" || typeof parsed.ts !== "number") {
    throw new Error("Invalid referral tag envelope.");
  }
  return parsed;
}

