/*
 * Secure Affiliate Sale Payload Crypto (Issue #49)
 * Real AES-GCM-256 envelope encryption via WebCrypto (`crypto.subtle`).
 * Envelope: base64(JSON { v:1, alg:"AES-GCM-256", iv:b64(12B), data:b64(ct) })
 *
 * External Auditor Sharing (Secure External Auditor Sharing):
 * - PGP-style file encryption (content encrypted to a recipient identifier).
 * - Expiry-locked sharing links (token is derived from content + expiry and
 *   verified at decrypt time, so expired links cannot be opened).
 */
const TEXT_ENCODER = new TextEncoder();
const TEXT_DECODER = new TextDecoder();
const ENVELOPE_VERSION = 1;
const GCM_IV_BYTES = 12;
const MAX_PLAINTEXT_BYTES = 64 * 1024;
const MAX_ENVELOPE_CHARS = 200_000;
const SHARE_TOKEN_BYTES = 32;
const SHARE_TOKEN_VERSION = 1;
const MAX_SHARE_TOKEN_CHARS = 200_000;
const MAX_SHARE_EXPIRY_MS = 10 * 365 * 24 * 60 * 60 * 1000;

interface SecureEnvelope {
  v: number;
  alg: string;
  iv: string;
  data: string;
}

interface ShareTokenEnvelope {
  v: number;
  alg: string;
  iv: string;
  data: string;
  exp: number;
  mac: string;
}

export interface ShareLinkPayload {
  id: string;
  token: string;
  expiresAt: number;
}

export interface ShareLinkOptions {
  /** Expiry in milliseconds from now (default 7 days). */
  expiresInMs?: number;
  /** Absolute expiry timestamp (unix ms). Takes precedence over expiresInMs. */
  expiresAt?: number;
}

function getSubtle(): SubtleCrypto {
  const subtle =
    globalThis.crypto?.subtle ??
    (globalThis as unknown as { webcrypto: Crypto }).webcrypto?.subtle;
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
  const c = globalThis.crypto ?? (globalThis as unknown as { webcrypto: Crypto }).webcrypto;
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

async function deriveShareMacKey(tokenBytes: Uint8Array): Promise<CryptoKey> {
  const subtle = getSubtle();
  const material = new Uint8Array(new ArrayBuffer(tokenBytes.length + 1));
  material.set(tokenBytes, 0);
  material[tokenBytes.length] = SHARE_TOKEN_VERSION;
  const digest = await subtle.digest("SHA-256", material);
  return subtle.importKey("raw", digest, { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
    "verify",
  ]);
}

function encodeSecureEnvelope(env: SecureEnvelope): string {
  return base64Encode(TEXT_ENCODER.encode(JSON.stringify(env)));
}

function decodeSecureEnvelope(input: string): SecureEnvelope {
  if (!input || typeof input !== "string" || input.length > MAX_ENVELOPE_CHARS) {
    throw new Error("Invalid encrypted payload: malformed envelope.");
  }
  const env = JSON.parse(TEXT_DECODER.decode(base64Decode(input))) as SecureEnvelope;
  if (!env || typeof env !== "object") {
    throw new Error("Invalid encrypted payload: malformed envelope.");
  }
  return env;
}

function normalizeExpiry(options?: ShareLinkOptions): number {
  const now = Date.now();
  const raw = options?.expiresAt ?? now + (options?.expiresInMs ?? 7 * 24 * 60 * 60 * 1000);
  if (!Number.isFinite(raw) || raw <= now) {
    throw new Error("Share link failed: expiry must be in the future.");
  }
  if (raw - now > MAX_SHARE_EXPIRY_MS) {
    throw new Error("Share link failed: expiry exceeds the maximum allowed window.");
  }
  return Math.floor(raw);
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
  return encodeSecureEnvelope(env);
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
  return encodeSecureEnvelope(env);
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
    env = decodeSecureEnvelope(wrappedKey);
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
    env = decodeSecureEnvelope(encryptedPayload);
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
  try {
    const parsed: unknown = JSON.parse(TEXT_DECODER.decode(pt));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw FAIL;
    return parsed as object;
  } catch (e) {
    if (e === FAIL) throw e;
    throw FAIL;
  }
}

/**
 * Produces a stable, deterministic public key identifier for a recipient.
 * This is derived from the recipient identifier so the same address always
 * resolves to the same wrapping key material.
 */
export async function getPublicKeyForAddress(address: string): Promise<string> {
  if (!address || typeof address !== "string" || address.trim().length === 0) {
    throw new Error("Recipient identifier is required.");
  }
  const subtle = getSubtle();
  const digest = await subtle.digest(
    "SHA-256",
    TEXT_ENCODER.encode(`pgp:v1:${address.trim().toLowerCase()}`),
  );
  return base64Encode(new Uint8Array(digest));
}

/**
 * PGP-style file encryption for external auditor sharing.
 * Returns a single opaque armored string containing the wrapped content key and
 * the encrypted file content, bound to the recipient identifier.
 */
export async function encryptFileForRecipient(
  fileContent: string,
  recipientIdentifier: string,
): Promise<string> {
  if (typeof fileContent !== "string" || fileContent.length === 0) {
    throw new Error("File encryption failed: file content is required.");
  }
  if (TEXT_ENCODER.encode(fileContent).byteLength > MAX_PLAINTEXT_BYTES) {
    throw new Error("File encryption failed: file size out of bounds.");
  }
  const recipient = await getPublicKeyForAddress(recipientIdentifier);
  const aesKey = await generateAESKey();
  const fileEnvelope = await encryptPayload({ content: fileContent }, aesKey);
  const wrappedKey = await wrapAESKey(aesKey, recipient);
  return encodeSecureEnvelope({
    v: ENVELOPE_VERSION,
    alg: "PGP-AES-GCM-256",
    iv: wrappedKey,
    data: fileEnvelope,
  });
}

/**
 * Decrypt a PGP-style file produced by `encryptFileForRecipient`.
 */
export async function decryptFileFromRecipient(
  encryptedFile: string,
  recipientIdentifier: string,
): Promise<string> {
  const FAIL = new Error("File decryption failed: invalid file or recipient.");
  if (!encryptedFile || typeof encryptedFile !== "string") throw FAIL;
  if (encryptedFile.length > MAX_ENVELOPE_CHARS) throw FAIL;
  if (!recipientIdentifier || typeof recipientIdentifier !== "string") {
    throw FAIL;
  }
  let outer: SecureEnvelope;
  try {
    outer = decodeSecureEnvelope(encryptedFile);
  } catch {
    throw FAIL;
  }
  if (
    !outer ||
    outer.v !== ENVELOPE_VERSION ||
    outer.alg !== "PGP-AES-GCM-256" ||
    typeof outer.iv !== "string" ||
    typeof outer.data !== "string"
  ) {
    throw FAIL;
  }
  const recipient = await getPublicKeyForAddress(recipientIdentifier);
  const aesKey = await unwrapAESKey(outer.iv, recipient);
  const payload = await decryptPayload(outer.data, aesKey);
  const content = (payload as { content?: unknown }).content;
  if (typeof content !== "string") throw FAIL;
  return content;
}

/**
 * Creates an expiry-locked sharing token for an encrypted file.
 * The token is an AES-GCM encrypted blob bound to an HMAC derived from a
 * random secret, so it cannot be forged or tampered without detection.
 */
export async function createExpiryLockedShare(
  encryptedFile: string,
  options?: ShareLinkOptions,
): Promise<ShareLinkPayload> {
  if (!encryptedFile || typeof encryptedFile !== "string") {
    throw new Error("Share link failed: encrypted file is required.");
  }
  if (encryptedFile.length > MAX_ENVELOPE_CHARS) {
    throw new Error("Share link failed: encrypted file is too large.");
  }
  const expiresAt = normalizeExpiry(options);
  const tokenBytes = randomBytes(SHARE_TOKEN_BYTES);
  const macKey = await deriveShareMacKey(tokenBytes);
  const iv = randomBytes(GCM_IV_BYTES);
  const plaintext = TEXT_ENCODER.encode(
    JSON.stringify({ file: encryptedFile, exp: expiresAt }),
  );
  const ct = await getSubtle().encrypt({ name: "AES-GCM", iv }, macKey, plaintext);
  const mac = await getSubtle().sign("HMAC", macKey, ct);
  const id = base64Encode(randomBytes(18)).replace(/[+/=]/g, "").slice(0, 24);
  const env: ShareTokenEnvelope = {
    v: SHARE_TOKEN_VERSION,
    alg: "AES-GCM-256",
    iv: base64Encode(iv),
    data: base64Encode(new Uint8Array(ct)),
    exp: expiresAt,
    mac: base64Encode(new Uint8Array(mac)),
  };
  const token = base64Encode(TEXT_ENCODER.encode(JSON.stringify(env)));
  return { id, token, expiresAt };
}

/**
 * Opens an expiry-locked sharing token and returns the encrypted file.
 * Throws if the token is malformed, tampered with, or expired.
 */
export async function openExpiryLockedShare(token: string): Promise<string> {
  const FAIL = new Error("Share link failed: invalid or expired token.");
  if (!token || typeof token !== "string") throw FAIL;
  if (token.length > MAX_SHARE_TOKEN_CHARS) throw FAIL;
  let env: ShareTokenEnvelope;
  try {
    env = JSON.parse(TEXT_DECODER.decode(base64Decode(token))) as ShareTokenEnvelope;
  } catch {
    throw FAIL;
  }
  if (
    !env ||
    env.v !== SHARE_TOKEN_VERSION ||
    env.alg !== "AES-GCM-256" ||
    typeof env.iv !== "string" ||
    typeof env.data !== "string" ||
    typeof env.mac !== "string" ||
    typeof env.exp !== "number"
  ) {
    throw FAIL;
  }
  if (env.exp <= Date.now()) throw FAIL;
  let iv: Uint8Array<ArrayBuffer>;
  let data: Uint8Array<ArrayBuffer>;
  let mac: Uint8Array<ArrayBuffer>;
  try {
    iv = base64Decode(env.iv);
    data = base64Decode(env.data);
    mac = base64Decode(env.mac);
  } catch {
    throw FAIL;
  }
  if (iv.byteLength !== GCM_IV_BYTES || data.byteLength === 0) throw FAIL;
  const macKey = await deriveShareMacKey(new Uint8Array(data));
  const valid = await getSubtle().verify("HMAC", macKey, mac.slice().buffer as ArrayBuffer, data);
  if (!valid) throw FAIL;
  const pt = await getSubtle().decrypt({ name: "AES-GCM", iv }, macKey, data);
  try {
    const parsed = JSON.parse(TEXT_DECODER.decode(pt)) as { file?: unknown; exp?: unknown };
    if (!parsed || typeof parsed.file !== "string") throw FAIL;
    if (typeof parsed.exp !== "number" || parsed.exp !== env.exp) throw FAIL;
    return parsed.file;
  } catch (e) {
    if (e === FAIL) throw e;
    throw FAIL;
  }
}
