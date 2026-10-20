import { useState, useEffect, useCallback } from 'react';

interface SorobanEventParams {
  rpcUrl?: string;
  contractId?: string;
  startLedger?: number;
  pollingIntervalMs?: number;
}

export function useSorobanEvents({
  rpcUrl = 'https://soroban-testnet.stellar.org',
  contractId,
  startLedger = 0,
  pollingIntervalMs = 5000,
}: SorobanEventParams) {
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const fetchEvents = useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetch(rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'getEvents',
          params: [
            {
              startLedger,
              filters: contractId ? [{ type: 'contract', contractIds: [contractId] }] : [],
              pagination: { limit: 50 },
            },
          ],
        }),
      });

      const data = await response.json();
      if (data.error) {
        throw new Error(data.error.message || 'Failed to fetch Soroban events');
      }

      if (data.result?.events) {
        setEvents(data.result.events);
      }
      setError(null);
    } catch (err: any) {
      setError(err.message || 'Unknown error fetching events');
    } finally {
      setLoading(false);
    }
  }, [rpcUrl, contractId, startLedger]);

  useEffect(() => {
    fetchEvents();
    const interval = setInterval(fetchEvents, pollingIntervalMs);
    return () => clearInterval(interval);
  }, [fetchEvents, pollingIntervalMs]);

  return { events, loading, error, refetch: fetchEvents };
}
