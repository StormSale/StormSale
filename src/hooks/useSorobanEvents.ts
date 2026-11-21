/**
 * src/hooks/useSorobanEvents.ts
 *
 * Real-Time Soroban RPC Event Streaming hook with backoff engine (Issue #123).
 *
 * Stays cheap under bursts of 50+ events/sec (Issue #498): the stream engine
 * is created once per connection setting, not once per render. Callers can
 * pass inline `onEvent` / `onRevalidate` callbacks or a fresh `topicFilters`
 * array without restarting it, because the callbacks are read through effect
 * events and the filters are compared by value.
 */
import { useState, useEffect, useCallback, useRef, useMemo, useEffectEvent } from "react";
import {
  SorobanEventStreamEngine,
  type SorobanStreamEvent,
  type StreamingStatus,
  DEFAULT_TOPIC_FILTERS,
} from "../lib/sorobanEvents";

export interface SorobanEventParams {
  rpcUrl?: string;
  contractId?: string;
  startLedger?: number;
  pollingIntervalMs?: number;
  topicFilters?: string[];
  onEvent?: (event: SorobanStreamEvent) => void;
  onRevalidate?: () => void;
}

/** Most recent events kept in memory; older ones are dropped. */
export const MAX_BUFFERED_EVENTS = 100;

export function useSorobanEvents({
  rpcUrl = "https://soroban-testnet.stellar.org",
  contractId,
  startLedger = 0,
  pollingIntervalMs = 5000,
  topicFilters = DEFAULT_TOPIC_FILTERS,
  onEvent,
  onRevalidate,
}: SorobanEventParams = {}) {
  const [events, setEvents] = useState<SorobanStreamEvent[]>([]);
  const [status, setStatus] = useState<StreamingStatus>("Connected");
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [lastLedger, setLastLedger] = useState<number>(startLedger);

  const engineRef = useRef<SorobanEventStreamEngine | null>(null);

  // Compared by value so `topicFilters={["log_sale"]}` does not restart the stream.
  const filtersKey = JSON.stringify(topicFilters);

  // Always call the latest caller callbacks without making the engine depend on them.
  const handleEvent = useEffectEvent((ev: SorobanStreamEvent) => {
    setEvents((prev) => [ev, ...prev].slice(0, MAX_BUFFERED_EVENTS));
    if (ev.ledger) setLastLedger(ev.ledger);
    onEvent?.(ev);
  });
  const handleRevalidate = useEffectEvent(() => {
    onRevalidate?.();
  });

  const handleStatusChange = useCallback((newStatus: StreamingStatus) => {
    setStatus(newStatus);
    setLoading(newStatus === "Polling");
    if (newStatus === "Reconnecting") {
      setError("Lost connection to Soroban RPC. Reconnecting with exponential backoff...");
    } else {
      setError(null);
    }
  }, []);

  useEffect(() => {
    const engine = new SorobanEventStreamEngine({
      rpcUrl,
      contractId,
      startLedger,
      basePollingIntervalMs: pollingIntervalMs,
      topicFilters: JSON.parse(filtersKey) as string[],
      onEvent: (ev) => handleEvent(ev),
      onStatusChange: handleStatusChange,
      onRevalidate: () => handleRevalidate(),
    });

    engineRef.current = engine;
    engine.start();

    return () => {
      engine.stop();
      engineRef.current = null;
    };
  }, [rpcUrl, contractId, startLedger, pollingIntervalMs, filtersKey, handleStatusChange]);

  const reconnect = useCallback(() => {
    engineRef.current?.reconnect();
  }, []);

  const refetch = useCallback(async () => {
    await engineRef.current?.poll();
  }, []);

  return useMemo(
    () => ({ events, status, loading, error, lastLedger, reconnect, refetch }),
    [events, status, loading, error, lastLedger, reconnect, refetch],
  );
}

export {
  useSorobanEventsContext,
  useSorobanEventsActions,
  SorobanEventsProvider,
} from "../context/SorobanEventsContext";
