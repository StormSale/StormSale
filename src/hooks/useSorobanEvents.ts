import { useState, useEffect, useCallback, useRef } from 'react';
import { Server, xdr } from '@stellar/stellar-sdk';

export type SorobanConnectionStatus = 'connected' | 'polling' | 'reconnecting';

export interface SorobanEventParams {
  rpcUrl?: string;
  contractId?: string;
  startLedger?: number;
  pollingIntervalMs?: number;
  topics?: string[];
  onEvents?: (events: any[]) => void;
}

const DEFAULT_TOPICS = ['create_campaign', 'log_sale', 'claim_payout'];
const MAX_BACKOFF_MS = 30_000;
const MIN_BACKOFF_MS = 1_000;

function encodeSymbolTopic(symbol: string): string {
  return xdr.ScVal.scvSymbol(symbol).toXDR('base64');
}

export function useSorobanEvents({
  rpcUrl = 'https://soroban-testnet.stellar.org',
  contractId,
  startLedger = 0,
  pollingIntervalMs = 5000,
  topics = DEFAULT_TOPICS,
  onEvents,
}: SorobanEventParams) {
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<SorobanConnectionStatus>('polling');

  const cursorRef = useRef<string | null>(null);
  const lastLedgerRef = useRef<number>(startLedger);
  const backoffRef = useRef<number>(pollingIntervalMs);
  const failuresRef = useRef<number>(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const blurredRef = useRef<boolean>(false);
  const stoppedRef = useRef<boolean>(false);
  const inRequestRef = useRef<boolean>(false);
  const onEventsRef = useRef(onEvents);

  useEffect(() => {
    onEventsRef.current = onEvents;
  }, [onEvents]);

  const computeNextDelay = useCallback(() => {
    if (blurredRef.current) {
      return MAX_BACKOFF_MS;
    }
    const base = Math.max(MIN_BACKOFF_MS, pollingIntervalMs);
    return Math.min(MAX_BACKOFF_MS, base * Math.pow(2, failuresRef.current));
  }, [pollingIntervalMs]);

  const fetchEvents = useCallback(async () => {
    if (inRequestRef.current || stoppedRef.current) return;
    inRequestRef.current = true;
    try {
      setLoading(true);
      const server = new Server(
        rpcUrl,
        { allowHttp: true } as any,
      );

      const filters: any[] = [];
      if (contractId) {
        const topicFilters = topics.map((t) => [encodeSymbolTopic(t)]);
        filters.push({
          type: 'contract',
          contractIds: [contractId],
          topics: topicFilters,
        });
      } else {
        filters.push({
          type: 'contract',
          topics: topics.map((t) => [encodeSymbolTopic(t)]),
        });
      }

      const requestParams: any = {
        filters,
        pagination: { limit: 50 },
      };
      if (cursorRef.current) {
        requestParams.cursor = cursorRef.current;
      } else {
        requestParams.startLedger = lastLedgerRef.current || startLedger;
      }

      const result = await server.getEvents(requestParams);
      const incoming = result.events || [];

      if (result.cursor) {
        cursorRef.current = result.cursor;
      }
      if (result.latestLedger) {
        lastLedgerRef.current = result.latestLedger;
      }

      if (incoming.length > 0) {
        setEvents((prev) => {
          const seen = new Set(prev.map((e) => e.id));
          const merged = [...prev];
          for (const ev of incoming) {
            if (!seen.has(ev.id)) {
              merged.push(ev);
              seen.add(ev.id);
            }
          }
          return merged.slice(-200);
        });
        onEventsRef.current?.(incoming);
      }

      failuresRef.current = 0;
      backoffRef.current = Math.max(MIN_BACKOFF_MS, pollingIntervalMs);
      setError(null);
      setStatus('connected');
    } catch (err: any) {
      failuresRef.current += 1;
      const next = computeNextDelay();
      backoffRef.current = next;
      setError(err.message || 'Unknown error fetching events');
      setStatus('reconnecting');
    } finally {
      setLoading(false);
      inRequestRef.current = false;
    }
  }, [rpcUrl, contractId, startLedger, pollingIntervalMs, topics, computeNextDelay]);

  const scheduleNext = useCallback(() => {
    if (stoppedRef.current) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    const delay = blurredRef.current
      ? MAX_BACKOFF_MS
      : Math.min(MAX_BACKOFF_MS, backoffRef.current || pollingIntervalMs);
    timerRef.current = setTimeout(async () => {
      await fetchEvents();
      scheduleNext();
    }, delay);
  }, [fetchEvents, pollingIntervalMs]);

  useEffect(() => {
    stoppedRef.current = false;
    failuresRef.current = 0;
    backoffRef.current = Math.max(MIN_BACKOFF_MS, pollingIntervalMs);
    setStatus('polling');

    const run = async () => {
      await fetchEvents();
      scheduleNext();
    };
    void run();

    const handleVisibility = () => {
      const hidden = document.visibilityState === 'hidden';
      blurredRef.current = hidden;
      if (!hidden) {
        failuresRef.current = 0;
        backoffRef.current = Math.max(MIN_BACKOFF_MS, pollingIntervalMs);
        scheduleNext();
      } else {
        scheduleNext();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      stoppedRef.current = true;
      if (timerRef.current) clearTimeout(timerRef.current);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [fetchEvents, scheduleNext, pollingIntervalMs]);

  const refetch = useCallback(async () => {
    failuresRef.current = 0;
    backoffRef.current = Math.max(MIN_BACKOFF_MS, pollingIntervalMs);
    await fetchEvents();
  }, [fetchEvents, pollingIntervalMs]);

  return { events, loading, error, status, refetch };
}
