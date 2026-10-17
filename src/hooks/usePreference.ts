/**
 * usePreference — versioned, schema-safe localStorage persistence.
 *
 * Each preference key is stored as:
 *   { v: SCHEMA_VERSION, value: T }
 *
 * If the stored version doesn't match (schema change or corrupted data),
 * the entry is silently evicted and the default value takes over.
 * All reads/writes are wrapped in try/catch so SSR or private-mode
 * environments that block localStorage never break the UI.
 */

/** Bump this when any stored shape changes in a breaking way. */
export const SCHEMA_VERSION = 1;

export type StoredEntry<T> = { v: number; value: T };

function readRaw<T>(key: string, defaultValue: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return defaultValue;

    const parsed: StoredEntry<T> = JSON.parse(raw);

    // Version mismatch → evict stale entry
    if (parsed.v !== SCHEMA_VERSION) {
      localStorage.removeItem(key);
      return defaultValue;
    }

    return parsed.value;
  } catch {
    // Corrupt JSON or inaccessible storage
    return defaultValue;
  }
}

function writeRaw<T>(key: string, value: T): void {
  try {
    const entry: StoredEntry<T> = { v: SCHEMA_VERSION, value };
    localStorage.setItem(key, JSON.stringify(entry));
  } catch {
    // Storage quota exceeded or blocked — fail silently
  }
}

/**
 * Drop-in replacement for useState that persists to localStorage.
 *
 * @param key       Storage key (namespaced by convention: "stormsale.<scope>.<name>")
 * @param defaultValue  Fallback when no valid entry exists
 * @param validate  Optional guard — if stored value fails this check, default is used
 *
 * @example
 *   const [activeTab, setActiveTab] = usePreference(
 *     "stormsale.advertiser.tab",
 *     "overview",
 *     (v) => VALID_TABS.includes(v),
 *   );
 */
import { useState, useCallback } from "react";

export function usePreference<T>(
  key: string,
  defaultValue: T,
  validate?: (v: T) => boolean,
): [T, (value: T) => void] {
  const [state, setState] = useState<T>(() => {
    const stored = readRaw<T>(key, defaultValue);
    if (validate && !validate(stored)) {
      localStorage.removeItem(key);
      return defaultValue;
    }
    return stored;
  });

  const set = useCallback(
    (value: T) => {
      setState(value);
      writeRaw(key, value);
    },
    [key],
  );

  return [state, set];
}
