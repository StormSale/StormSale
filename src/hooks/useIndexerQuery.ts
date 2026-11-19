import { useState, useEffect, useCallback } from "react";
import {
  executeGraphQLQuery,
  type IndexerQueryResult,
  type GraphQLRequestOptions,
} from "../lib/indexer/goldskyIndexer";

export interface UseIndexerQueryResult<T> {
  data: T | null;
  loading: boolean;
  error: Error | null;
  latencyMs: number;
  source: "indexer" | "rpc_fallback" | null;
  isFallback: boolean;
  refetch: () => Promise<void>;
}

/**
 * React hook for high-performance Subgraph / Goldsky GraphQL queries with Soroban RPC fallback.
 */
export function useIndexerQuery<T>(
  query: string,
  variables: Record<string, unknown> = {},
  options: GraphQLRequestOptions = {},
): UseIndexerQueryResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);
  const [latencyMs, setLatencyMs] = useState<number>(0);
  const [source, setSource] = useState<"indexer" | "rpc_fallback" | null>(null);
  const [isFallback, setIsFallback] = useState<boolean>(false);

  const serializedVars = JSON.stringify(variables);
  const endpoint = options.endpoint;
  const forceRpcFallback = options.forceRpcFallback;
  const timeoutMs = options.timeoutMs;

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const parsedVars = JSON.parse(serializedVars);
      const res: IndexerQueryResult<T> = await executeGraphQLQuery<T>(query, parsedVars, {
        endpoint,
        forceRpcFallback,
        timeoutMs,
      });
      setData(res.data);
      setLatencyMs(res.latencyMs);
      setSource(res.source);
      setIsFallback(res.isFallback);
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setLoading(false);
    }
  }, [query, serializedVars, endpoint, forceRpcFallback, timeoutMs]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return {
    data,
    loading,
    error,
    latencyMs,
    source,
    isFallback,
    refetch: fetchData,
  };
}
