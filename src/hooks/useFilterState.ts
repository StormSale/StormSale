/**
 * useFilterState — persists structured dashboard filters (search, status,
 * timeframe, sort) across reloads using the versioned UI state cache.
 *
 * The schema is the single source of truth: stored values are validated on
 * read, and writes that do not match the schema are rejected.
 *
 * Preferences written by another tab are applied through the `storage` event.
 * The hook only writes when the serialized state actually changed, which
 * stops two open tabs from echoing the same value back and forth.
 */
import { useEffect, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { ZodType } from "zod";
import {
  readUIState,
  subscribeUIState,
  writeUIState,
  type UIStateOptions,
} from "../lib/uiStateCache";

export function useFilterState<T>(
  key: string,
  schema: ZodType<T>,
  defaultValue: T,
  options: UIStateOptions = {},
): [T, Dispatch<SetStateAction<T>>] {
  const [state, setState] = useState<T>(() => readUIState(key, schema, defaultValue, options));

  // Callers commonly pass object literals and inline schemas; reading these
  // through refs keeps the effects below keyed only by the storage key.
  const schemaRef = useRef(schema);
  const defaultValueRef = useRef(defaultValue);
  const optionsRef = useRef(options);
  const lastWritten = useRef<string | null>(null);

  // Synced after commit rather than during render, as React requires.
  useEffect(() => {
    schemaRef.current = schema;
    defaultValueRef.current = defaultValue;
    optionsRef.current = options;
  });

  // Persist after render rather than inside the state updater: updaters must
  // stay pure, and StrictMode may invoke them twice in development.
  useEffect(() => {
    const serialized = JSON.stringify(state);
    if (serialized === lastWritten.current) return;

    writeUIState(key, schemaRef.current, state);
    lastWritten.current = serialized;
  }, [key, state]);

  // Hydrate filter changes made in another tab through the storage event.
  useEffect(() => {
    return subscribeUIState(
      key,
      schemaRef.current,
      defaultValueRef.current,
      (value) => setState(value),
      optionsRef.current,
    );
  }, [key]);

  return [state, setState];
}
