/*
 * Encrypted Local Cache Layer for StormSale
 *
 * Implements AES-GCM 256-bit encryption for all sensitive key-value pairs stored
 * in LocalStorage with:
 * 1. Obfuscated / encrypted storage keys (SHA-256 hashed with salt to prevent key enumeration).
 * 2. AES-256-GCM encrypted values with randomized 96-bit initialization vectors.
 * 3. Automatic purge on security logout to eliminate post-session credential and state residue.
 * 4. PGP-style asymmetric sharing of sensitive reports via expiry-locked links.
 */

export const STORAGE_PREFIX = "stormsale_enc_";
const KDF_SALT = "stormsale_secure_cache_salt_v1";

interface EncryptedPayload {
  v: number;
  iv: number[];
  data: number[];
}

function getCrypto(): Crypto {
  if (typeof window !== "undefined" && window.crypto) {
    return window.crypto;
  }
  if (typeof globalThis !== "undefined" && globalThis.crypto) {
    return globalThis.crypto;
  }
  throw new Error("WebCrypto API is not available in the current environment.");
}

function getSubtle(): SubtleCrypto {
  const c = getCrypto();
  if (!c.subtle) {
    throw new Error("SubtleCrypto API is not available.");
  }
  return c.subtle;
}

let cachedEncryptionKey: CryptoKey | null = null;

/**
 * Derives a deterministic AES-256-GCM encryption key from device / application seed.
 */
export async function getStorageKey(): Promise<CryptoKey> {
  if (cachedEncryptionKey) {
    return cachedEncryptionKey;
  }

  const subtle = getSubtle();
  const enc = new TextEncoder();
  const rawSeed = enc.encode("stormsale_master_local_vault_key_seed");

  const keyMaterial = await subtle.importKey("raw", rawSeed, { name: "PBKDF2" }, false, [
    "deriveKey",
  ]);

  const derived = await subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: enc.encode(KDF_SALT),
      iterations: 100_000,
      hash: "SHA-256",
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );

  cachedEncryptionKey = derived;
  return derived;
}

/**
 * Hashes a plaintext key into an opaque, encrypted storage key to prevent key enumeration.
 */
export async function hashStorageKey(key: string): Promise<string> {
  const subtle = getSubtle();
  const enc = new TextEncoder();
  const digest = await subtle.digest("SHA-256", enc.encode(`${KDF_SALT}:${key}`));
  const hashHex = Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 32);
  return `${STORAGE_PREFIX}${hashHex}`;
}

class MemoryStorage implements Storage {
  private store = new Map<string, string>();
  get length(): number {
    return this.store.size;
  }
  clear(): void {
    this.store.clear();
  }
  getItem(key: string): string | null {
    return this.store.get(key) ?? null;
  }
  key(index: number): string | null {
    return Array.from(this.store.keys())[index] ?? null;
  }
  removeItem(key: string): void {
    this.store.delete(key);
  }
  setItem(key: string, value: string): void {
    this.store.set(key, String(value));
  }
}

let globalMemoryStorage: MemoryStorage | null = null;

export function getLocalStorage(): Storage {
  if (typeof window !== "undefined" && window.localStorage) {
    return window.localStorage;
  }
  if (
    typeof globalThis !== "undefined" &&
    (globalThis as unknown as { localStorage?: Storage }).localStorage
  ) {
    return (globalThis as unknown as { localStorage: Storage }).localStorage;
  }
  if (!globalMemoryStorage) {
    globalMemoryStorage = new MemoryStorage();
  }
  return globalMemoryStorage;
}

/**
 * Encrypts and stores an item in localStorage under a hashed key.
 */
export async function setEncryptedItem<T>(key: string, value: T): Promise<void> {
  const storage = getLocalStorage();
  const subtle = getSubtle();
  const crypto = getCrypto();
  const storageKey = await getStorageKey();
  const hashedKey = await hashStorageKey(key);

  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plaintext = new TextEncoder().encode(JSON.stringify(value));

  const ciphertext = await subtle.encrypt({ name: "AES-GCM", iv }, storageKey, plaintext);

  const payload: EncryptedPayload = {
    v: 1,
    iv: Array.from(iv),
    data: Array.from(new Uint8Array(ciphertext)),
  };

  storage.setItem(hashedKey, JSON.stringify(payload));
}

/**
 * Retrieves and decrypts an item from localStorage by its plaintext key.
 */
export async function getEncryptedItem<T>(key: string): Promise<T | null> {
  const storage = getLocalStorage();
  const hashedKey = await hashStorageKey(key);
  const raw = storage.getItem(hashedKey);
  if (!raw) {
    return null;
  }

  try {
    const payload: EncryptedPayload = JSON.parse(raw);
    if (!payload || !payload.iv || !payload.data) {
      return null;
    }

    const subtle = getSubtle();
    const storageKey = await getStorageKey();

    const iv = new Uint8Array(payload.iv);
    const data = new Uint8Array(payload.data);

    const decrypted = await subtle.decrypt({ name: "AES-GCM", iv }, storageKey, data);

    const text = new TextDecoder().decode(decrypted);
    return JSON.parse(text) as T;
  } catch (err) {
    console.warn(`[EncryptedStorage] Failed to decrypt cache key "${key}":`, err);
    return null;
  }
}

/**
 * Removes an encrypted item from localStorage by its plaintext key.
 */
export async function removeEncryptedItem(key: string): Promise<void> {
  const storage = getLocalStorage();
  const hashedKey = await hashStorageKey(key);
  storage.removeItem(hashedKey);
}

type PurgeListener = () => void;
const purgeListeners = new Set<PurgeListener>();

/**
 * Registers a callback invoked whenever a security logout purge occurs.
 * Returns an unsubscription function.
 */
export function onStoragePurged(listener: PurgeListener): () => void {
  purgeListeners.add(listener);
  return () => {
    purgeListeners.delete(listener);
  };
}

/**
 * Automatic purge on security logout.
 * Cleans all encrypted cache items from localStorage and wipes in-memory keys.
 */
export async function purgeOnLogout(): Promise<void> {
  const storage = getLocalStorage();
  const keysToRemove: string[] = [];
  for (let i = 0; i < storage.length; i++) {
    const k = storage.key(i);
    if (k && k.startsWith(STORAGE_PREFIX)) {
      keysToRemove.push(k);
    }
  }
  for (const k of keysToRemove) {
    storage.removeItem(k);
  }

  cachedEncryptionKey = null;

  for (const listener of purgeListeners) {
    try {
      listener();
    } catch (err) {
      console.warn("[EncryptedStorage] Purge listener error:", err);
    }
  }

  if (typeof window !== "undefined" && typeof window.dispatchEvent === "function") {
    window.dispatchEvent(new CustomEvent("stormsale:security-logout-purged"));
  }
}

/* ----------------------------------------------------------------------------
 * External Auditor Sharing: PGP-style asymmetric encryption for sensitive
 * reports shared via expiry-locked links.
 *
 * The sharing flow uses a hybrid scheme:
 *   1. A fresh AES-256-GCM content key encrypts the report body.
 *   2. The content key is wrapped (encrypted) with the recipient's RSA-OAEP-256
 *      public key ("PGP-style" public-key encryption).
   3. The resulting envelope is bound to an expiry timestamp and a
      cryptographic share id (SH-256 of the envelope), producing an
      expiry-locked sharing link.
 *   4. Expiry is enforced at open time; expired envelopes are rejected
      and purged from the cache.
 * --------------------------------------------------------------------------- */

export const SHARE_LINK_PREFIX = "stormsale_share_";
export const SHARE_MIN_EXPIRY_MS = 60_000; // 1 minute
export const SHARE_MAX_EXPIRY_MS = 7 * 24 * 60 * 60_000; // 7 days

export interface ShareRecipient {
  /** Human-readable label for the external auditor. */
  label: string;
  /** RSA-OAEP-256 public key in SPKI (base64) format. */
  publicKeySpkb: string;
}

export interface ShareEnvelope {
  v: number;
  /** Stormsale share identifier (SHA-256 of the canonical envelope body). */
  id: string;
  /** Recipient label for audit trailing. */
  recipient: string;
  /** Expiry timestamp (Unix epoch milliseconds). */
  expiresAt: number;
  /** Creation timestamp (Unix epoch milliseconds). */
  createdAt: number;
  /** AES-GCM IV for the report body. */
  iv: number[];
  /** AES-GCM ciphertext of the report body. */
  ciphertext: number[];
  /** RSA-OAEP wrapped AES content key. */
  wrappedKey: number[];
  /** SPK public key of the sharer (auditor can verify origin). */
  sharerPublicKeySpkb: string;
}

export interface ShareLink {
  /** Opaque share id. */
  id: string;
  /** Full expiry-locked URL to open the report. */
  url: string;
  /** Expiry timestamp (Unix epoch milliseconds). */
  expiresAt: number;
}

export interface OpenedShare {
  id: string;
  recipient: string;
  expiresAt: number;
  createdAt: number;
  payload: unknown;
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  if (typeof btoa === "function") {
    return btoa(binary);
  }
  // Node / non-browser fallback.
  const BufferImpl = (globalThis as unknown as { Buffer?: typeof import("buffer").Buffer }).Buffer;
  if (BufferImpl) {
    return BufferImpl.from(bytes).toString("base64");
  }
  throw new Error("No base64 encoder available.");
}

function fromBase64(base64: string): Uint8Array {
  if (typeof atob === "function") {
    const binary = atob(base64);
    const out = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      out[i] = binary.charCodeAt(i);
    }
    return out;
  }
  const BufferImpl = (globalThis as unknown as { Buffer?: typeof import("buffer").Buffer }).Buffer;
  if (BufferImpl) {
    const buf = BufferImpl.from(base64, "base64");
    return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
  }
  throw new Error("No base64 decoder available.");
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function sha256Hex(input: string): Promise<string> {
  const subtle = getSubtle();
  const digest = await subtle.digest("SHA-256", new TextEncoder().encode(input));
  return bytesToHex(new Uint8Array(digest));
}

/**
 * Generates a fresh RSA-OAEP-256 keypair for the auditor (sharer).
 * The private key is exported as PKCS8 and the public key as SPKI, both base64.
 */
export async function generateAuditorSharingKeyPair(): Promise<{
  publicKeySpki: string;
  privateKeyPkcs8: string;
}> {
  const subtle = getSubtle();
  const pair = await subtle.generateKey(
    {
      name: "RSA-OAEP",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1,]),
      hash: "SHA-256",
    },
    true,
    ["encrypt", "decrypt"],
  );

  const spki = await subtle.exportKey("spki", pair.publicKey);
  const pkcs8 = await subtle.exportKey("pkcs8", pair.privateKey);

  return {
    publicKeySpki: toBase64(new Uint8Array(spki)),
    privateKeyPkcs8: toBase64(new Uint8Array(pkcs8)),
  };
}

async function importRemotePublicKey(spkiBase64: string): Promise<CryptoKey> {
  const subtle = getSubtle();
  return subtle.importKey(
    "spki",
    fromBase64(spkiBase64),
    { name: "RSA-OAEP", hash: "SHA-256" },
    false,
    ["encrypt"],
  );
}

async function importPrivateKey(pkcs8Base64: string): Promise<CryptoKey> {
  const subtle = getSubtle();
  return subtle.importKey(
    "pkcs8",
    fromBase64(pkcs8Base64),
    { name: "RSA-OAEP", hash: "SHA-256" },
    false,
    ["decrypt"],
  );
}

function canonicalEnvelopeBody(envelope: Omit<ShareEnvelope, "id">): string {
  return JSON.stringify({
    v: envelope.v,
    recipient: envelope.recipient,
    expiresAt: envelope.expiresAt,
    createdAt: envelope.createdAt,
    iv: envelope.iv,
    ciphertext: envelope.ciphertext,
    wrappedKey: envelope.wrappedKey,
    sharerPublicKeySpkb: envelope.sharerPublicKeySpkb,
  });
}

function assertExpiryWindow(expiresAt: number, now: number): void {
  if (!Number.isFinite(expiresAt)) {
    throw new Error("Share expiry must be a finite timestamp.");
  }
  const ttl = expiresAt - now;
  if (ttl < SHARE_MIN_EXPIRY_MS) {
    throw new Error("Share expiry must be at least 1 minute in the future.");
  }
  if (ttl > SHARE_MAX_EXPIRY_MS) {
    throw new Error("Share expiry cannot exceed 7 days.");
  }
}

/**
 * Creates an expiry-locked, PGP-style encrypted share of a sensitive report.
 *
 * The report body is encrypted with a fresh AES-256-GCM content key; that key is
 * wrapped with the recipient's RSA-OAEP-256 public key. The resulting envelope
 * is stored in the encrypted cache and returned as an expiry-locked link.
 */
export async function createExternalShare(
  report: unknown,
  recipient: ShareRecipient,
  expiresAt: number,
  options?: { sharerPublicKeySpki?: string; baseUrl?: string },
): Promise<ShareLink> {
  const now = Date.now();
  assertExpiryWindow(expiresAt, now);

  if (!recipient.label || !recipient.publicKeySpki) {
    throw new Error("Share recipient must include a label and RSA public key.");
  }

  const subtle = getSubtle();
  const crypto = getCrypto();

  const recipientKey = await importRemotePublicKey(recipient.publicKeySpki);

  // Fresh AES-256-GCM content key for this share.
  const contentKey = await subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"],
  );

  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plaintext = new TextEncoder().encode(JSON.stringify(report));
  const ciphertext = await subtle.encrypt({ name: "AES-GCM", iv }, contentKey, plaintext);

  const rawContentKey = new Uint8Array(await subtle.exportKey("raw", contentKey));
  const wrappedKey = await subtle.encrypt(
    { name: "RSA-OAEP" },
    recipientKey,
    rawContentKey,
  );

  const baseEnvelope: Omit<ShareEnvelope, "id"> = {
    v: 1,
    recipient: recipient.label,
    expiresAt,
    createdAt: now,
    iv: Array.from(iv),
    ciphertext: Array.from(new Uint8Array(ciphertext)),
    wrappedKey: Array.from(new Uint8Array(wrappedKey)),
    sharerPublicKeySpkb: options?.sharerPublicKeySpkb ?? "",
  };

  const id = await sha256Hex(canonicalEnvelopeBody(baseEnvelope));
  const envelope: ShareEnvelope = { id, ...baseEnvelope };

  await setEncryptedItem(`${SHARE_LINK_PREFIX}${id}`, envelope);
  await registerShareInIndex(id);

  const baseUrl = options?.baseUrl ?? "/auditor/share";
  const url = `${baseUrl}?id=${encodeURIComponent(id)}&expiresAt=${expiresAt}`;

  return { id, url, expiresAt };
}

/**
 * Loads an expiry-locked share by share id and decrypts it with the
 * recipient's RSA private key. Expired envelopes are rejected and purged.
 */
export async function openExternalShare(
  id: string,
  recipientPrivateKeyPkcs8: string,
): Promise<OpenedShare> {
  if (!id) {
    throw new Error("Share id is required.");
  }

  const key = `${SHARE_LINK_PREFIX}${id}`;
  const envelope = await getEncryptedItem<ShareEnvelope>(key);
  if (!envelope) {
    throw new Error("Share not found or already revoked.");
  }

  if (Date.now() >= envelope.expiresAt) {
    await removeEncryptedItem(key);
    throw new Error("Share link has expired.");
  }

  const subtle = getSubtle();
  const privateKey = await importPrivateKey(recipientPrivateKeyPkcs8);

  const rawContentKey = new Uint8Array(
    await subtle.decrypt(
      { name: "RSA-OAEP" },
      privateKey,
      new Uint8Array(envelope.wrappedKey),
    ),
  );

  const contentKey = await subtle.importKey("raw", rawContentKey, { name: "AES-GCM" }, false, [
    "decrypt",
  ]);

  const decrypted = await subtle.decrypt(
    { name: "AES-GCM", iv: new Uint8Array(envelope.iv) },
    contentKey,
    new Uint8Array(envelope.ciphertext),
  );

  const payload = JSON.parse(new TextDecoder().decode(decrypted)) as unknown;

  return {
    id: envelope.id,
    recipient: envelope.recipient,
    expiresAt: envelope.expiresAt,
    createdAt: envelope.createdAt,
    payload,
  };
}

/**
 * Revokes an external share immediately, regardless of expiry.
 */
export async function revokeExternalShare(id: string): Promise<void> {
  if (!id) {
    throw new Error("Share id is required.");
  }
  await removeEncryptedItem(`${SHARE_LINK_PREFIX}${id}`);
}

/**
 * Purges all expired share envelopes from the encrypted cache.
 * Returns the number of revoked shares.
 */
export async function purgeExpiredShares(now: number = Date.now()): Promise<number> {
  const storage = getLocalStorage();
  void storage;
  const index = await getEncryptedItem<string[]>(SHARE_INDEX_KEY);
  if (!index || index.length === 0) {
    return 0;
  }

  let revoked = 0;
  const surviving: string[] = [];
  for (const id of index) {
    const envelope = await getEncryptedItem<ShareEnvelope>(`${SHARE_LINK_PREFIX}${id}`);
    if (!envelope) {
      continue;
    }
    if (now >= envelope.expiresAt) {
      await removeEncryptedItem(`${SHARE_LINK_PREFIX}${id}`);
      revoked += 1;
    } else {
      surviving.push(id);
    }
  }

  if (surviving.length !== index.length) {
    await setEncryptedItem(SHARE_INDEX_KEY, surviving);
  }

  return revoked;
}

const SHARE_INDEX_KEY = "stormsale_share_index";

export async function registerShareInIndex(id: string): Promise<void> {
  const index = (await getEncryptedItem<string[]>(SHARE_INDEX_KEY)) ?? [];
  if (!index.includes(id)) {
    index.push(id);
    await setEncryptedItem(SHARE_INDEX_KEY, index);
  }
}

/**
 * Exported unified secureStorage interface.
 */
export const encryptedStorage = {
  setItem: setEncryptedItem,
  getItem: getEncryptedItem,
  removeItem: removeEncryptedItem,
  purgeOnLogout,
  clear: purgeOnLogout,
  onStoragePurged,
  getLocalStorage,
};

/**
 * External auditor sharing interface (PGP-style encryption + expiry-locked links).
 */
export const externalSharing = {
  generateAuditorSharingKeyPair,
  createExternalShare,
  openExternalShare,
  revokeExternalShare,
  purgeExpiredShares,
};
