/**
 * usePreference — versioned, schema-safe localStorage persistence.
 *
 * Each preference key is now stored with the same envelope as the filter
 * cache:
 *   { v: SCHEMA_VERSION, updatedAt, value: T }
 *
 * If the stored version doesn't match (schema change or corrupted data), or
 * the optional `validate` guard rejects the value, the entry is silently
 * evicted and the default value takes over. Entries written by older builds
 * as `{ v, value }` are migrated in place on first read.
 *
 * Reads and writes are shared with `uiStateCache`, so tabs, filter state, and
 * preferences all follow one persistence contract. All storage access is
 * wrapped so SSR or private-mode environments never break the UI.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { z, type ZodType } from "zod";
import {
  UI_STATE_VERSION,
  readVersionedState,
  subscribeToStorageKey,
  writeVersionedState,
} from "../lib/uiStateCache";

/** Bump this when any stored shape changes in a breaking way. */
export const SCHEMA_VERSION = UI_STATE_VERSION;

export type StoredEntry<T> = { v: number; updatedAt: number; value: T };

/**
 * Builds the runtime schema for a preference. The optional `validate` guard
 * is the caller's schema: values that fail it are rejected on both read and
 * write, exactly like a zod schema in `useFilterState`.
 */
function preferenceSchema<T>(validate?: (value: T) => boolean): ZodType<T> {
  return z.custom<T>((value) => value !== undefined && (!validate || validate(value)));
}

export function readRaw<T>(key: string, defaultValue: T, validate?: (value: T) => boolean): T {
  return readVersionedState(key, preferenceSchema(validate), defaultValue, {
    migrateLegacy: true,
    // Preferences are long-lived: only filters expire. A non-positive TTL
    // disables expiry in readVersionedState.
    ttlMs: 0,
  });
}

export function writeRaw<T>(key: string, value: T, validate?: (value: T) => boolean): boolean {
  return writeVersionedState(key, preferenceSchema(validate), value);
}

/**
 * Drop-in replacement for useState that persists to localStorage.
 *
 * Changes written by another tab are picked up through the `storage` event,
 * so navigation, theme, and filter preferences stay consistent across tabs.
 *
 * @param key           Storage key (namespaced by convention: "stormsale.<scope>.<name>")
 * @param defaultValue  Fallback when no valid entry exists
 * @param validate      Optional guard — if stored value fails this check, default is used
 *
 * @example
 *   const [activeTab, setActiveTab] = usePreference(
 *     "stormsale.advertiser.tab",
 *     "overview",
 *     (v) => VALID_TABS.includes(v),
 *   );
 */
export function usePreference<T>(
  key: string,
  defaultValue: T,
  validate?: (v: T) => boolean,
): [T, (value: T) => void] {
  const [state, setState] = useState<T>(() => readRaw<T>(key, defaultValue, validate));

  // Keep the latest default/validator available to the storage listener
  // without resubscribing when callers pass inline functions or objects.
  const latest = useRef({ defaultValue, validate });
  useEffect(() => {
    latest.current = { defaultValue, validate };
  });

  useEffect(() => {
    return subscribeToStorageKey(key, () => {
      setState(readRaw<T>(key, latest.current.defaultValue, latest.current.validate));
    });
  }, [key]);

  const set = useCallback(
    (value: T) => {
      setState(value);
      writeRaw(key, value, latest.current.validate);
    },
    [key],
  );

  return [state, set];
}
