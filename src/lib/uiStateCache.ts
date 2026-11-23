/**
 * Versioned, schema-safe localStorage cache for dashboard UI state.
 *
 * Tabs, navigation, and theme preferences persist through `usePreference`.
 * Structured filter state (search queries, status filters, time ranges) uses
 * `useFilterState`, because a loose JSON blob is not safe enough there:
 *
 *   stormsale.ui.<key> = { v, updatedAt, value }
 *
 * Every read validates the envelope *and* the value against a zod schema.
 * Entries with an unknown version, a corrupt payload, a shape that no longer
 * matches the schema, or an expired TTL are evicted instead of rendered.
 * Storage access is wrapped so private-mode or SSR environments never throw.
 *
 * The low-level `readVersionedState`/`writeVersionedState` helpers also back
 * `usePreference`, so tabs, navigation, theme, filter keys, and dashboard tabs
 * share the same envelope, validation, and migration rules. Legacy entries
 * written as `{ v, value }` (or as a bare string by the old tab component) are
 * upgraded in place on first read or during the boot sweep.
 */
import { z, type ZodType } from "zod";

/** Bump when the envelope or any shared filter shape changes. */
export const UI_STATE_VERSION = 1;
export const UI_STATE_PREFIX = "stormsale.ui.";
/** Every app-owned cache key lives below this namespace. */
export const UI_STATE_APP_PREFIX = "stormsale.";
/** Filters older than this are considered stale and dropped at boot. */
export const UI_STATE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
/** Future timestamps beyond this skew are treated as corrupt cache entries. */
export const UI_STATE_CLOCK_SKEW_MS = 5 * 60 * 1000;

const envelopeSchema = z.object({
  v: z.number().int(),
  updatedAt: z.number().int().nonnegative(),
  value: z.unknown(),
});

/** Pre-#73 preference entries carried a version but no timestamp. */
const legacyEnvelopeSchema = z.object({
  v: z.number().int(),
  value: z.unknown(),
});

/**
 * Broad structural check used by the boot sweep. It intentionally ignores
 * non-cache `stormsale.*` keys (plain strings, arrays, and domain payloads)
 * and only recognises objects that look like a versioned state envelope.
 */
export function isCacheEnvelope(value: unknown): value is { v: number; value: unknown } {
  return (
    typeof value === "object" &&
    value !== null &&
    "v" in value &&
    Number.isInteger((value as { v: unknown }).v) &&
    "value" in value
  );
}

export interface UIStateOptions {
  /** Overrides `UI_STATE_TTL_MS` for this cache entry. */
  ttlMs?: number;
}

export interface VersionedReadOptions extends UIStateOptions {
  /** Accept `{ v, value }` entries and rewrite them with a timestamp. */
  migrateLegacy?: boolean;
}

export interface UIStateCacheInitOptions extends UIStateOptions {
  /** Per-storage-key TTL overrides, e.g. for long-lived filter views. */
  ttlMsByKey?: Record<string, number>;
}

export interface UIStateCacheInitResult {
  scanned: number;
  purged: number;
  migrated: number;
}

export interface UIStateCache<T> {
  key: string;
  read: () => T;
  write: (value: T) => boolean;
  clear: () => void;
}

/**
 * Returns localStorage when it is reachable, otherwise null. Access can throw
 * when storage is disabled by the browser or when running without a DOM.
 */
export function getSafeStorage(): Storage | null {
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
  const now = Date.now();
  if (updatedAt > now + UI_STATE_CLOCK_SKEW_MS) return true;
  if (!Number.isFinite(ttlMs) || ttlMs <= 0) return false;
  return now - updatedAt > ttlMs;
}

function removeKey(storage: Storage, storageKey: string): void {
  try {
    storage.removeItem(storageKey);
  } catch {
    // Storage removal error - ignore.
  }
}

/** Rewrites a legacy envelope with the current timestamp without touching its value. */
function migrateStoredEnvelope(storage: Storage, storageKey: string, value: unknown): boolean {
  try {
    storage.setItem(
      storageKey,
      JSON.stringify({ v: UI_STATE_VERSION, updatedAt: Date.now(), value }),
    );
    return true;
  } catch {
    return false;
  }
}

/**
 * Reads a value only when the envelope version and zod schema both match.
 * Invalid entries are evicted and the caller's default is returned. With
 * `migrateLegacy`, a legacy `{ v, value }` preference is upgraded to the
 * current envelope instead of being discarded.
 */
export function readVersionedState<T>(
  storageKey: string,
  schema: ZodType<T>,
  defaultValue: T,
  options: VersionedReadOptions = {},
): T {
  const storage = getSafeStorage();
  if (!storage) return defaultValue;

  try {
    const raw = storage.getItem(storageKey);
    if (!raw) return defaultValue;

    const parsed: unknown = JSON.parse(raw);

    let rawValue: unknown;
    let legacy = false;

    const envelope = envelopeSchema.safeParse(parsed);
    if (envelope.success && envelope.data.v === UI_STATE_VERSION) {
      const ttlMs = options.ttlMs ?? UI_STATE_TTL_MS;
      if (isExpired(envelope.data.updatedAt, ttlMs)) {
        removeKey(storage, storageKey);
        return defaultValue;
      }
      rawValue = envelope.data.value;
    } else if (
      options.migrateLegacy &&
      !(typeof parsed === "object" && parsed !== null && "updatedAt" in parsed)
    ) {
      const previous = legacyEnvelopeSchema.safeParse(parsed);
      if (!previous.success || previous.data.v !== UI_STATE_VERSION) {
        removeKey(storage, storageKey);
        return defaultValue;
      }
      rawValue = previous.data.value;
      legacy = true;
    } else {
      removeKey(storage, storageKey);
      return defaultValue;
    }

    const value = schema.safeParse(rawValue);
    if (!value.success) {
      removeKey(storage, storageKey);
      return defaultValue;
    }

    if (legacy) {
      // Best-effort rewrite: a failed upgrade still returns the valid value.
      writeVersionedState(storageKey, schema, value.data);
    }

    return value.data;
  } catch {
    // Corrupt JSON or inaccessible storage.
    removeKey(storage, storageKey);
    return defaultValue;
  }
}

/**
 * Validates before writing so a bad value can never poison storage.
 * Returns false when storage is unavailable or the value is off-schema.
 */
export function writeVersionedState<T>(storageKey: string, schema: ZodType<T>, value: T): boolean {
  const storage = getSafeStorage();
  if (!storage) return false;

  const parsed = schema.safeParse(value);
  if (!parsed.success) return false;

  try {
    storage.setItem(
      storageKey,
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

/**
 * Reads a namespaced filter entry from the versioned cache.
 */
export function readUIState<T>(
  key: string,
  schema: ZodType<T>,
  defaultValue: T,
  options: UIStateOptions = {},
): T {
  return readVersionedState(uiStateStorageKey(key), schema, defaultValue, options);
}

/**
 * Validates and writes a namespaced filter entry.
 */
export function writeUIState<T>(key: string, schema: ZodType<T>, value: T): boolean {
  return writeVersionedState(uiStateStorageKey(key), schema, value);
}

export function clearUIState(key: string): void {
  const storage = getSafeStorage();
  if (!storage) return;
  removeKey(storage, uiStateStorageKey(key));
}

/**
 * Subscribes to `storage` events for a single key. Fires when another tab
 * writes or removes the key. `event.key === null` means another tab cleared
 * storage, so every subscriber is notified.
 */
export function subscribeToStorageKey(storageKey: string, onChange: () => void): () => void {
  if (typeof window === "undefined" || typeof window.addEventListener !== "function") {
    return () => {};
  }

  const handler = (event: StorageEvent) => {
    if (event.storageArea && event.storageArea !== window.localStorage) return;
    if (event.key !== null && event.key !== storageKey) return;
    onChange();
  };

  window.addEventListener("storage", handler);
  return () => window.removeEventListener("storage", handler);
}

/**
 * Cross-tab subscription for a namespaced filter entry. Re-reads through the
 * schema so a malformed write from another tab can never reach the UI.
 */
export function subscribeUIState<T>(
  key: string,
  schema: ZodType<T>,
  defaultValue: T,
  onChange: (value: T) => void,
  options: UIStateOptions = {},
): () => void {
  return subscribeToStorageKey(uiStateStorageKey(key), () => {
    onChange(readUIState(key, schema, defaultValue, options));
  });
}

/**
 * Boot-time hygiene: drops malformed, wrong-version, expired, or future-dated
 * cache entries before the first render and upgrades legacy envelopes in
 * place. Only app-owned `stormsale.*` keys are inspected, and unrelated store
 * values (plain strings, arrays, domain payloads) are left untouched. Safe to
 * call on every start-up.
 */
export function initUIStateCache(options: UIStateCacheInitOptions = {}): UIStateCacheInitResult {
  const storage = getSafeStorage();
  const empty: UIStateCacheInitResult = { scanned: 0, purged: 0, migrated: 0 };
  if (!storage) return empty;

  const keysToCheck: string[] = [];
  try {
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i);
      if (key?.startsWith(UI_STATE_APP_PREFIX)) keysToCheck.push(key);
    }
  } catch {
    return empty;
  }

  let purged = 0;
  let migrated = 0;

  for (const storageKey of keysToCheck) {
    const isFilterKey = storageKey.startsWith(UI_STATE_PREFIX);
    const ttlMs =
      options.ttlMsByKey?.[storageKey] ?? (isFilterKey ? (options.ttlMs ?? UI_STATE_TTL_MS) : 0);

    let parsed: unknown;
    try {
      const raw = storage.getItem(storageKey);
      if (!raw) continue;
      parsed = JSON.parse(raw);
    } catch {
      if (isFilterKey) {
        removeKey(storage, storageKey);
        purged += 1;
      }
      continue;
    }

    if (!isCacheEnvelope(parsed)) {
      if (isFilterKey) {
        removeKey(storage, storageKey);
        purged += 1;
      }
      continue;
    }

    if (parsed.v !== UI_STATE_VERSION) {
      removeKey(storage, storageKey);
      purged += 1;
      continue;
    }

    if ("updatedAt" in parsed) {
      const envelope = envelopeSchema.safeParse(parsed);
      if (!envelope.success || isExpired(envelope.data.updatedAt, ttlMs)) {
        removeKey(storage, storageKey);
        purged += 1;
      }
      continue;
    }

    if (migrateStoredEnvelope(storage, storageKey, parsed.value)) {
      migrated += 1;
    }
  }

  return { scanned: keysToCheck.length, purged, migrated };
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
