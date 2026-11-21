/**
 * Versioned, schema-safe localStorage cache for dashboard UI state.
 *
 * Tabs and navigation already persist through `usePreference`. This module
 * extends that idea to structured filter state (search queries, status
 * filters, time ranges) where a loose JSON blob is not safe enough:
 *
 *   stormsale.ui.<key> = { v, updatedAt, value }
 *
 * Every read validates the envelope *and* the value against a zod schema.
 * Entries with an unknown version, a corrupt payload, a shape that no longer
 * matches the schema, or an expired TTL are evicted instead of rendered.
 * Storage access is wrapped so private-mode or SSR environments never throw.
 */
import { z, type ZodType } from "zod";

/** Bump when the envelope or any shared filter shape changes. */
export const UI_STATE_VERSION = 1;
export const UI_STATE_PREFIX = "stormsale.ui.";
/** Filters older than this are considered stale and dropped at boot. */
export const UI_STATE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

const envelopeSchema = z.object({
  v: z.number().int(),
  updatedAt: z.number().int().nonnegative(),
  value: z.unknown(),
});

export interface UIStateOptions {
  /** Overrides `UI_STATE_TTL_MS` for this cache entry. */
  ttlMs?: number;
}

export interface UIStateCacheInitResult {
  scanned: number;
  purged: number;
}

export interface UIStateCache<T> {
  key: string;
  read: () => T;
  write: (value: T) => boolean;
  clear: () => void;
}

function getStorage(): Storage | null {
  try {
    if (typeof window !== "undefined" && window.localStorage) {
      return window.localStorage;
    }
    if (typeof localStorage !== "undefined") {
      return localStorage;
    }
  } catch {
    // Access can throw when storage is disabled by the browser.
  }
  return null;
}

export function uiStateStorageKey(key: string): string {
  return key.startsWith(UI_STATE_PREFIX) ? key : `${UI_STATE_PREFIX}${key}`;
}

function isExpired(updatedAt: number, ttlMs: number): boolean {
  if (!Number.isFinite(ttlMs) || ttlMs <= 0) return false;
  return Date.now() - updatedAt > ttlMs;
}

function removeKey(storage: Storage, storageKey: string): void {
  try {
    storage.removeItem(storageKey);
  } catch {
    // Storage removal error - ignore.
  }
}

/**
 * Reads a value only when the envelope version and zod schema both match.
 * Invalid entries are evicted and the caller's default is returned.
 */
export function readUIState<T>(
  key: string,
  schema: ZodType<T>,
  defaultValue: T,
  options: UIStateOptions = {},
): T {
  const storage = getStorage();
  if (!storage) return defaultValue;

  const storageKey = uiStateStorageKey(key);

  try {
    const raw = storage.getItem(storageKey);
    if (!raw) return defaultValue;

    const envelope = envelopeSchema.safeParse(JSON.parse(raw));
    if (!envelope.success || envelope.data.v !== UI_STATE_VERSION) {
      removeKey(storage, storageKey);
      return defaultValue;
    }

    const ttlMs = options.ttlMs ?? UI_STATE_TTL_MS;
    if (isExpired(envelope.data.updatedAt, ttlMs)) {
      removeKey(storage, storageKey);
      return defaultValue;
    }

    const value = schema.safeParse(envelope.data.value);
    if (!value.success) {
      removeKey(storage, storageKey);
      return defaultValue;
    }

    return value.data;
  } catch {
    // Corrupt JSON or inaccessible storage.
    removeKey(storage, storageKey);
    return defaultValue;
  }
}

/**
 * Validates before writing so a bad filter value can never poison storage.
 * Returns false when storage is unavailable or the value is off-schema.
 */
export function writeUIState<T>(key: string, schema: ZodType<T>, value: T): boolean {
  const storage = getStorage();
  if (!storage) return false;

  const parsed = schema.safeParse(value);
  if (!parsed.success) return false;

  try {
    storage.setItem(
      uiStateStorageKey(key),
      JSON.stringify({
        v: UI_STATE_VERSION,
        updatedAt: Date.now(),
        value: parsed.data,
      }),
    );
    return true;
  } catch {
    // Quota exceeded or blocked storage — fail silently.
    return false;
  }
}

export function clearUIState(key: string): void {
  const storage = getStorage();
  if (!storage) return;
  removeKey(storage, uiStateStorageKey(key));
}

/**
 * Boot-time hygiene: drops malformed, legacy-versioned, or expired cache
 * entries before the first render. Safe to call on every start-up.
 */
export function initUIStateCache(options: UIStateOptions = {}): UIStateCacheInitResult {
  const storage = getStorage();
  if (!storage) return { scanned: 0, purged: 0 };

  const ttlMs = options.ttlMs ?? UI_STATE_TTL_MS;
  const keysToCheck: string[] = [];

  try {
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i);
      if (key?.startsWith(UI_STATE_PREFIX)) keysToCheck.push(key);
    }
  } catch {
    return { scanned: 0, purged: 0 };
  }

  let purged = 0;
  for (const storageKey of keysToCheck) {
    try {
      const raw = storage.getItem(storageKey);
      const envelope = raw ? envelopeSchema.safeParse(JSON.parse(raw)) : null;
      if (
        !envelope ||
        !envelope.success ||
        envelope.data.v !== UI_STATE_VERSION ||
        isExpired(envelope.data.updatedAt, ttlMs)
      ) {
        removeKey(storage, storageKey);
        purged += 1;
      }
    } catch {
      removeKey(storage, storageKey);
      purged += 1;
    }
  }

  return { scanned: keysToCheck.length, purged };
}

/**
 * Binds a storage key, schema, and fallback together for use by the hook and
 * by imperative callers such as logout handlers.
 */
export function defineUIStateCache<T>(
  key: string,
  schema: ZodType<T>,
  defaultValue: T,
  options: UIStateOptions = {},
): UIStateCache<T> {
  return {
    key,
    read: () => readUIState(key, schema, defaultValue, options),
    write: (value: T) => writeUIState(key, schema, value),
    clear: () => clearUIState(key),
  };
}
