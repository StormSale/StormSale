/**
 * Encrypted Local Cache Layer for StormSale
 *
 * Implements AES-GCM 256-bit encryption for all sensitive key-value pairs stored
 * in LocalStorage with:
 * 1. Obfuscated / encrypted storage keys (SHA-256 hashed with salt to prevent key enumeration).
 * 2. AES-256-GCM encrypted values with randomized 96-bit initialization vectors.
 * 3. Automatic purge on security logout to eliminate post-session credential and state residue.
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
