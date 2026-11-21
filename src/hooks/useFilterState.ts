/**
 * useFilterState — persists structured dashboard filters (search, status,
 * timeframe, sort) across reloads using the versioned UI state cache.
 *
 * The schema is the single source of truth: stored values are validated on
 * read, and writes that do not match the schema are rejected.
 */
import { useEffect, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { ZodType } from "zod";
import { readUIState, writeUIState, type UIStateOptions } from "../lib/uiStateCache";

export function useFilterState<T>(
  key: string,
  schema: ZodType<T>,
  defaultValue: T,
  options: UIStateOptions = {},
): [T, Dispatch<SetStateAction<T>>] {
  const [state, setState] = useState<T>(() => readUIState(key, schema, defaultValue, options));

  // Persist after render rather than inside the state updater: updaters must
  // stay pure, and StrictMode may invoke them twice in development.
  useEffect(() => {
    writeUIState(key, schema, state);
  }, [key, schema, state]);

  return [state, setState];
}
