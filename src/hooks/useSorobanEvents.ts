/**
 * src/hooks/useSorobanEvents.ts
 *
 * Real-Time Soroban RPC Event Streaming hook with backoff engine (Issue #123).
 */
import { useState, useEffect, useCallback, useRef } from "react";
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

  const handleEvent = useCallback(
    (ev: SorobanStreamEvent) => {
      setEvents((prev) => [ev, ...prev].slice(0, 100));
      if (ev.ledger) setLastLedger(ev.ledger);
      onEvent?.(ev);
    },
    [onEvent],
  );

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
      topicFilters,
      onEvent: handleEvent,
      onStatusChange: handleStatusChange,
      onRevalidate,
    });

    engineRef.current = engine;
    engine.start();

    return () => {
      engine.stop();
      engineRef.current = null;
    };
  }, [
    rpcUrl,
    contractId,
    startLedger,
    pollingIntervalMs,
    topicFilters,
    handleEvent,
    handleStatusChange,
    onRevalidate,
  ]);

  const reconnect = useCallback(() => {
    engineRef.current?.reconnect();
  }, []);

  const refetch = useCallback(async () => {
    await engineRef.current?.poll();
  }, []);

  return {
    events,
    status,
    loading,
    error,
    lastLedger,
    reconnect,
    refetch,
  };
}

export { useSorobanEventsContext, SorobanEventsProvider } from "../context/SorobanEventsContext";
