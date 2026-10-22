/**
 * Secure Affiliate Sale Payload Crypto (Issue #49)
 * Real AES-GCM-256 envelope encryption via WebCrypto (`crypto.subtle`).
 * Envelope: base64(JSON { v:1, alg:"AES-GCM-256", iv:b64(12B), data:b64(ct) })
 */
const TEXT_ENCODER = new TextEncoder();
const TEXT_DECODER = new TextDecoder();
const ENVELOPE_VERSION = 1;
const GCM_IV_BYTES = 12;
const MAX_PLAINTEXT_BYTES = 64 * 1024;
const MAX_ENVELOPE_CHARS = 200_000;

interface SecureEnvelope {
  v: number;
  alg: string;
  iv: string;
  data: string;
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

export async function generateAESKey(): Promise<CryptoKey> {
  return getSubtle().generateKey({ name: "AES-GCM", length: 256 }, true, [
    "encrypt",
    "decrypt",
  ]);
}

/**
 * In-memory registry of per-sale AES keys, so a sale's key stays stable for the
 * lifetime of the session (needed to wrap the same key for multiple auditors).
 */
const saleKeyStore = new Map<string, CryptoKey>();

/**
 * Retrieves or generates the AES encryption key for a given saleId.
 */
export async function getSaleEncryptionKey(saleId: string): Promise<CryptoKey> {
  const existing = saleKeyStore.get(saleId);
  if (existing) {
    return existing;
  }
  const newKey = await generateAESKey();
  saleKeyStore.set(saleId, newKey);
  return newKey;
}

export function storeSaleEncryptionKey(saleId: string, key: CryptoKey): void {
  saleKeyStore.set(saleId, key);
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
  try {
    const parsed: unknown = JSON.parse(TEXT_DECODER.decode(pt));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw FAIL;
    return parsed as object;
  } catch (e) {
    if (e === FAIL) throw e;
    throw FAIL;
  }
}

// Helper to get a "mock" public key from a wallet address
export async function getPublicKeyForAddress(address: string): Promise<string> {
  if (!address || typeof address !== "string" || address.trim().length === 0) {
    throw new Error("Unknown address: identifier is required.");
  }
  const t = address.trim();
  if (/^[GC][A-Z0-9]{55}$/.test(t)) return t;
  return `STORMSALE-PUBKEY:${t}`;
}
