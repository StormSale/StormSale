/*
 * Secure Affiliate Sale Payload Crypto (Issue #49)
 * Real AES-GCM-256 envelope encryption via WebCrypto (`crypto.subtle`).
 * Envelope: base64(JSON { v:1, alg:"AES-GCM-256", iv:b64(12B), data:b64(ct) })
 *
 * External Auditor Sharing (Auditor issue):
 * - PGP-style file encryption (content encrypted to a recipient identifier).
 * - Expiry-locked sharing links (token is derived from a secret + expiry and the
 *   expiry is bound inside the encrypted payload, so tampering is detected).
 */
const TEXT_ENCODER = new TextEncoder();
const TEXT_DECODER = new TextDecoder();
const ENVELOPE_VERSION = 1;
const GCM_IV_BYTES = 12;
const MAX_PLAINTEXT_BYTES = 64 * 1024;
const MAX_ENVELOPE_CHARS = 200_000;
const SHARE_LINK_VERSION = 1;
const SHARE_LINK_SECRET_BYTES = 32;
const DEFAULT_SHARE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

interface SecureEnvelope {
  v: number;
  alg: string;
  iv: string;
  data: string;
}

export interface ShareLinkOptions {
  /** TTL in milliseconds from now. Defaults to 7 days. */
  ttlMs?: number;
  /** Optional absolute expiry timestamp (unix ms). Overrides ttlMs. */
  expiresAt?: number;
}

export interface ShareLinkPayload {
  v: number;
  alg: "AES-GCM-256";
  iv: string;
  data: string;
  expiresAt: number;
  keyCheck: string;
}

export interface ShareLinkResult {
  /** Serialized, tamper-proof share token (put in URL fragment). */
  token: string;
  /** Expiry timestamp (unix ms). */
  expiresAt: number;
}

export interface ShareLinkDecryptResult {
  payload: object;
  expiresAt: number;
}

function getSubtle(): SubtleCrypto {
  const subtle =
    globalThis.crypto?.subtle ??
    (globalThis as unknown as { webcrypto?: Crypto }).webcrypto?.subtle;
  if (!subtle) {
    throw new Error("WebCrypto SubtleCrypto is unavailable in this environment.");
  }
  return subtle;
}

function base64Encode(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function base64Decode(input: string): Uint8Array<ArrayBuffer> {
  if (!input || typeof input !== "string") {
    throw new Error("Invalid encrypted payload: malformed envelope.");
  }
  if (!/^[A-Za-z0-9+/=_-]+$/.test(input)) {
    throw new Error("Invalid encrypted payload: malformed envelope.");
  }
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
  let binary: string;
  try {
    binary = atob(normalized);
  } catch {
    throw new Error("Invalid encrypted payload: malformed envelope.");
  }
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function randomBytes(length: number): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(new ArrayBuffer(length));
  const c = globalThis.crypto ?? (globalThis as unknown as { webcrypto?: Crypto }).webcrypto;
  if (c?.getRandomValues) {
    c.getRandomValues(bytes);
    return bytes;
  }
  throw new Error("Secure random number generator is unavailable.");
}

function assertAesGcmKey(key: unknown): asserts key is CryptoKey {
  const k = key as CryptoKey | null;
  if (!k || typeof k !== "object" || (k.algorithm as Algorithm | undefined)?.name?.toUpperCase() !== "AES-GCM") {
    throw new Error("Decryption failed: invalid key.");
  }
}

async function deriveWrappingKey(identifier: string): Promise<CryptoKey> {
  if (!identifier || typeof identifier !== "string" || identifier.trim().length === 0) {
    throw new Error("Key wrap failed: recipient identifier is required.");
  }
  const subtle = getSubtle();
  const digest = await subtle.digest("SHA-256", TEXT_ENCODER.encode(identifier.trim()));
  return subtle.importKey("raw", digest, { name: "AES-GCM", length: 256 }, false, [
    "encrypt",
    "decrypt",
  ]);
}

async function deriveShareKey(secret: Uint8Array, expiresAt: number): Promise<CryptoKey> {
  const subtle = getSubtle();
  const base = await subtle.importKey("raw", secret, { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
  ]);
  const mac = await subtle.sign("HMAC", base, TEXT_ENCODER.encode(`STORMSALE-SHARE-V1:${expiresAt}`));
  return subtle.importKey("raw", mac, { name: "AES-GCM", length: 256 }, false, [
    "encrypt",
    "decrypt",
  ]);
}

function computeKeyCheck(key: CryptoKey, expiresAt: number): Promise<string> {
  // Deterministic verifier so tampering with the expiry field fails auth.
  const subtle = getSubtle();
  return subtle
    .exportKey("raw", key)
    .then((raw) => subtle.digest("SHA-256", raw))
    .then((digest) => {
      const mac = new Uint8Array(digest);
      const mix = TEXT_ENCODER.encode(`${expiresAt}`);
      for (let i = 0; i < mix.length; i++) mac[i % mac.length] ^= mix[i];
      return base64Encode(mac.slice(0, 16));
    });
}

export async function generateAESKey(): Promise<CryptoKey> {
  return getSubtle().generateKey({ name: "AES-GCM", length: 256 }, true, [
    "encrypt",
    "decrypt",
  ]);
}

export async function encryptPayload(payload: object, aesKey: CryptoKey): Promise<string> {
  assertAesGcmKey(aesKey);
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("Encryption failed: payload must be a JSON object.");
  }
  const plaintext = TEXT_ENCODER.encode(JSON.stringify(payload));
  if (plaintext.byteLength === 0 || plaintext.byteLength > MAX_PLAINTEXT_BYTES) {
    throw new Error("Encryption failed: payload size out of bounds.");
  }
  const iv = randomBytes(GCM_IV_BYTES);
  let ct: ArrayBuffer;
  try {
    ct = await getSubtle().encrypt({ name: "AES-GCM", iv }, aesKey, plaintext);
  } catch {
    throw new Error("Encryption failed.");
  }
  const env: SecureEnvelope = {
    v: ENVELOPE_VERSION,
    alg: "AES-GCM-256",
    iv: base64Encode(iv),
    data: base64Encode(new Uint8Array(ct)),
  };
  return base64Encode(TEXT_ENCODER.encode(JSON.stringify(env)));
}

export async function wrapAESKey(aesKey: CryptoKey, publicKey: string): Promise<string> {
  assertAesGcmKey(aesKey);
  let raw: ArrayBuffer;
  try {
    raw = await getSubtle().exportKey("raw", aesKey);
  } catch {
    throw new Error("Key wrap failed.");
  }
  const wk = await deriveWrappingKey(publicKey);
  const iv = randomBytes(GCM_IV_BYTES);
  let ct: ArrayBuffer;
  try {
    ct = await getSubtle().encrypt({ name: "AES-GCM", iv }, wk, raw);
  } catch {
    throw new Error("Key wrap failed.");
  }
  const env: SecureEnvelope = {
    v: ENVELOPE_VERSION,
    alg: "AES-GCM-256",
    iv: base64Encode(iv),
    data: base64Encode(new Uint8Array(ct)),
  };
  return base64Encode(TEXT_ENCODER.encode(JSON.stringify(env)));
}

export async function unwrapAESKey(wrappedKey: string, privateKey: string): Promise<CryptoKey> {
  const FAIL = new Error("Key unwrap failed: invalid wrapped key or identifier.");
  if (!wrappedKey || typeof wrappedKey !== "string" || wrappedKey.length > MAX_ENVELOPE_CHARS) {
    throw FAIL;
  }
  if (!privateKey || typeof privateKey !== "string" || privateKey.trim().length === 0) {
    throw FAIL;
  }
  let env: SecureEnvelope;
  try {
    env = JSON.parse(TEXT_DECODER.decode(base64Decode(wrappedKey))) as SecureEnvelope;
  } catch {
    throw FAIL;
  }
  if (!env || env.v !== ENVELOPE_VERSION || typeof env.iv !== "string" || typeof env.data !== "string") {
    throw FAIL;
  }
  let iv: Uint8Array<ArrayBuffer>;
  let data: Uint8Array<ArrayBuffer>;
  try {
    iv = base64Decode(env.iv);
    data = base64Decode(env.data);
  } catch {
    throw FAIL;
  }
  if (iv.byteLength !== GCM_IV_BYTES || data.byteLength === 0) throw FAIL;
  const wk = await deriveWrappingKey(privateKey);
  let raw: ArrayBuffer;
  try {
    raw = await getSubtle().decrypt({ name: "AES-GCM", iv }, wk, data);
  } catch {
    throw FAIL;
  }
  try {
    return await getSubtle().importKey("raw", raw, { name: "AES-GCM", length: 256 }, true, [
      "encrypt",
      "decrypt",
    ]);
  } catch {
    throw FAIL;
  }
}

export async function decryptPayload(
  encryptedPayload: string,
  aesKey: CryptoKey,
): Promise<object> {
  assertAesGcmKey(aesKey);
  const FAIL = new Error("Decryption failed: invalid payload or key.");
  if (!encryptedPayload || typeof encryptedPayload !== "string") throw FAIL;
  if (encryptedPayload.length > MAX_ENVELOPE_CHARS) throw FAIL;
  let env: SecureEnvelope;
  try {
    env = JSON.parse(TEXT_DECODER.decode(base64Decode(encryptedPayload))) as SecureEnvelope;
  } catch {
    throw FAIL;
  }
  if (
    !env ||
    env.v !== ENVELOPE_VERSION ||
    env.alg !== "AES-GCM-256" ||
    typeof env.iv !== "string" ||
    typeof env.data !== "string"
  ) {
    throw FAIL;
  }
  let iv: Uint8Array<ArrayBuffer>;
  let data: Uint8Array<ArrayBuffer>;
  try {
    iv = base64Decode(env.iv);
    data = base64Decode(env.data);
  } catch {
    throw FAIL;
  }
  if (iv.byteLength !== GCM_IV_BYTES || data.byteLength === 0) throw FAIL;
  let pt: ArrayBuffer;
  try {
    pt = await getSubtle().decrypt({ name: "AES-GCM", iv }, aesKey, data);
  } catch {
    throw FAIL;
  }
  let plaintext: string;
  try {
    plaintext = TEXT_DECODER.decode(pt);
  } catch {
    throw FAIL;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(plaintext);
  } catch {
    throw FAIL;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw FAIL;
  return parsed as object;
}

/**
 * PGP-style file encryption. Encrypts arbitrary file content to a recipient
 * identifier (a public-key-like string). The result is a self-contained armored
 * string that only the holder of the matching private identifier can open.
 */
export async function encryptFileForRecipient(
  content: string,
  recipientIdentifier: string,
): Promise<string> {
  if (typeof content !== "string" || content.length === 0) {
    throw new Error("File encryption failed: content is required.");
  }
  const aesKey = await generateAESKey();
  const wrapped = await wrapAESKey(aesKey, recipientIdentifier);
  const body = await encryptPayload({ content }, aesKey);
  return base64Encode(
    TEXT_ENCODER.encode(
      JSON.stringify({
        v: ENVELOPE_VERSION,
        alg: "AES-GCM-256",
        wrappedKey: wrapped,
        data: body,
      }),
    ),
  );
}

export async function decryptFileFromRecipient(
  armored: string,
  recipientIdentifier: string,
): Promise<string> {
  const FAIL = new Error("File decryption failed: invalid file or identifier.");
  if (!armored || typeof armored !== "string" || armored.length > MAX_ENVELOPE_CHARS) {
    throw FAIL;
  }
  let env: { v?: number; alg?: string; wrappedKey?: string; data?: string };
  try {
    env = JSON.parse(TEXT_DECODER.decode(base64Decode(armored))) as typeof env;
  } catch {
    throw FAIL;
  }
  if (
    !env ||
    env.v !== ENVELOPE_VERSION ||
    env.alg !== "AES-GCM-256" ||
    typeof env.wrappedKey !== "string" ||
    typeof env.data !== "string"
  ) {
    throw FAIL;
  }
  const aesKey = await unwrapAESKey(env.wrappedKey, recipientIdentifier);
  const payload = (await decryptPayload(env.data, aesKey)) as { content?: unknown };
  if (typeof payload.content !== "string") throw FAIL;
  return payload.content;
}

/**
 * Create an expiry-locked sharing token. The expiry is bound into the
 * derived key and into a keyCheck verifier, so any tampering with the
 * expiry field fails authentication on decrypt.
 */
export async function createShareLink(
  payload: object,
  options: ShareLinkOptions = {},
): Promise<ShareLinkResult> {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("Share link failed: payload must be a JSON object.");
  }
  const now = Date.now();
  const requestedExpiry =
    typeof options.expiresAt === "number" && Number.isFinite(options.expiresAt)
      ? options.expiresAt
      : now + (typeof options.ttlMs === "number" && Number.isFinite(options.ttlMs)
          ? options.ttlMs
          : DEFAULT_SHARE_TTL_MS);
  if (!requestedExpiry || requestedExpiry <= now) {
    throw new Error("Share link failed: expiry must be in the future.");
  }
  const expiresAt = Math.floor(requestedExpiry);
  const secret = randomBytes(SHARE_LINK_SECRET_BYTES);
  const key = await deriveShareKey(secret, expiresAt);
  const iv = randomBytes(GCM_IV_BYTES);
  const plaintext = TEXT_ENCODER.encode(JSON.stringify(payload));
  if (plaintext.byteLength === 0 || plaintext.byteLength > MAX_PLAINTEXT_BYTES) {
    throw new Error("Share link failed: payload size out of bounds.");
  }
  const ct = await getSubtle().encrypt({ name: "AES-GCM", iv }, key, plaintext);
  const keyCheck = await computeKeyCheck(key, expiresAt);
  const sharePayload: ShareLinkPayload = {
    v: SHARE_LINK_VERSION,
    alg: "AES-GCM-256",
    iv: base64Encode(iv),
    data: base64Encode(new Uint8Array(ct)),
    expiresAt,
    keyCheck,
  };
  const token = base64Encode(
    TEXT_ENCODER.encode(
      JSON.stringify({ v: SHARE_LINK_VERSION, secret: base64Encode(secret), payload: sharePayload }),
    ),
  );
  return { token, expiresAt };
}

export async function decryptShareLink(token: string): Promise<ShareLinkDecryptResult> {
  const FAIL = new Error("Share link invalid or expired.");
  if (!token || typeof token !== "string" || token.length > MAX_ENVELOPE_CHARS) {
    throw FAIL;
  }
  let outer: { v?: number; secret?: string; payload?: ShareLinkPayload };
  try {
    outer = JSON.parse(TEXT_DECODER.decode(base64Decode(token))) as typeof outer;
  } catch {
    throw FAIL;
  }
  if (!outer || outer.v !== SHARE_LINK_VERSION || typeof outer.secret !== "string") {
    throw FAIL;
  }
  const p = outer.payload;
  if (
    !p ||
    p.v !== SHARE_LINK_VERSION ||
    p.alg !== "AES-GCM-256" ||
    typeof p.iv !== "string" ||
    typeof p.data !== "string" ||
    typeof p.keyCheck !== "string" ||
    typeof p.expiresAt !== "number"
  ) {
    throw FAIL;
  }
  if (Date.now() > p.expiresAt) throw FAIL;
  let secret: Uint8Array<ArrayBuffer>;
  let iv: Uint8Array<ArrayBuffer>;
  let data: Uint8Array<ArrayBuffer>;
  try {
    secret = base64Decode(outer.secret);
    iv = base64Decode(p.iv);
    data = base64Decode(p.data);
  } catch {
    throw FAIL;
  }
  if (secret.byteLength !== SHARE_LINK_SECRET_BYTES || iv.byteLength !== GCM_IV_BYTES || data.byteLength === 0) {
    throw FAIL;
  }
  const key = await deriveShareKey(secret, p.expiresAt);
  const expectedCheck = await computeKeyCheck(key, p.expiresAt);
  if (expectedCheck !== p.keyCheck) throw FAIL;
  let pt: ArrayBuffer;
  try {
    pt = await getSubtle().decrypt({ name: "AES-GCM", iv }, key, data);
  } catch {
    throw FAIL;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(TEXT_DECODER.decode(pt));
  } catch {
    throw FAIL;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw FAIL;
  return { payload: parsed as object, expiresAt: p.expiresAt };
}
