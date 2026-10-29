import { useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { idbCache, DASHBOARD_CACHE_KEYS } from "../lib/idb";

export interface DashboardMetrics {
  userRole: string | null;
  xlmBalance: string;
  network: string;
  isConnected: boolean;
  connectorType: string | null;
  lastSynced: number | null;
}

const DEFAULT_METRICS: DashboardMetrics = {
  userRole: null,
  xlmBalance: "0.00",
  network: "TESTNET",
  isConnected: false,
  connectorType: null,
  lastSynced: null,
};

export const dashboardQueryKey = ["dashboard", "metrics"] as const;

async function readDashboardCache(): Promise<DashboardMetrics> {
  const cached: Partial<DashboardMetrics> = {};
  const keys = Object.values(DASHBOARD_CACHE_KEYS);

  await Promise.all(
    keys.map(async (key) => {
      const value = await idbCache.get<any>(key);
      if (value !== null) {
        cached[key as keyof DashboardMetrics] = value;
      }
    }),
  );

  return {
    ...DEFAULT_METRICS,
    ...cached,
    lastSynced: cached.lastSynced ?? Date.now(),
  };
}

async function writeDashboardCache(next: DashboardMetrics): Promise<void> {
  await Promise.all([
    idbCache.set(DASHBOARD_CACHE_KEYS.userRole, next.userRole),
    idbCache.set(DASHBOARD_CACHE_KEYS.xlmBalance, next.xlmBalance),
    idbCache.set(DASHBOARD_CACHE_KEYS.network, next.network),
    idbCache.set(DASHBOARD_CACHE_KEYS.isConnected, next.isConnected),
    idbCache.set(DASHBOARD_CACHE_KEYS.connectorType, next.connectorType),
    idbCache.set(DASHBOARD_CACHE_KEYS.metrics, next),
  ]);
}

export function useDashboardCache() {
  const queryClient = useQueryClient();

  const query = useQuery<DashboardMetrics>({
    queryKey: dashboardQueryKey,
    queryFn: readDashboardCache,
    initialData: DEFAULT_METRICS,
    // Refetch on focus/reconnect is configured globally in queryClient.
  });

  const persistMutation = useMutation({
    mutationFn: async (updates: Partial<DashboardMetrics>) => {
      const previous = queryClient.getQueryData<DashboardMetrics>(dashboardQueryKey) ?? DEFAULT_METRICS;
      const next = { ...previous, ...updates, lastSynced: Date.now() };
      await writeDashboardCache(next);
      return next;
    },
    onSuccess: (next) => {
      queryClient.setQueryData(dashboardQueryKey, next);
    },
  });

  const invalidateMutation = useMutation({
    mutationFn: async () => {
      await idbCache.clear();
    },
    onSuccess: () => {
      queryClient.setQueryData(dashboardQueryKey, DEFAULT_METRICS);
    },
  });

  const persistMetrics = useCallback(
    async (updates: Partial<DashboardMetrics>) => {
      await persistMutation.mutateAsync(updates);
    },
    [persistMutation],
  );

  const invalidateCache = useCallback(async () => {
    await invalidateMutation.mutateAsync();
  }, [invalidateMutation]);

  return {
    metrics: query.data ?? DEFAULT_METRICS,
    hydrated: !query.isLoading,
    persistMetrics,
    invalidateCache,
  };
}
