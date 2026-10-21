import { useState, useEffect, useCallback } from "react";
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

export function useDashboardCache() {
  const [metrics, setMetrics] = useState<DashboardMetrics>(DEFAULT_METRICS);
  const [hydrated, setHydrated] = useState(false);

  // Hydrate from IndexedDB immediately on mount
  useEffect(() => {
    const hydrate = async () => {
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

      setMetrics((prev) => ({
        ...prev,
        ...cached,
        lastSynced: cached.lastSynced ?? Date.now(),
      }));
      setHydrated(true);
    };

    hydrate();
  }, []);

  // Persist metrics to IndexedDB whenever they change
  const persistMetrics = useCallback(async (updates: Partial<DashboardMetrics>) => {
    setMetrics((prev) => {
      const next = { ...prev, ...updates, lastSynced: Date.now() };
      void Promise.all([
        idbCache.set(DASHBOARD_CACHE_KEYS.userRole, next.userRole),
        idbCache.set(DASHBOARD_CACHE_KEYS.xlmBalance, next.xlmBalance),
        idbCache.set(DASHBOARD_CACHE_KEYS.network, next.network),
        idbCache.set(DASHBOARD_CACHE_KEYS.isConnected, next.isConnected),
        idbCache.set(DASHBOARD_CACHE_KEYS.connectorType, next.connectorType),
        idbCache.set(DASHBOARD_CACHE_KEYS.metrics, next),
      ]);
      return next;
    });
  }, []);

  const invalidateCache = useCallback(async () => {
    await idbCache.clear();
    setMetrics(DEFAULT_METRICS);
  }, []);

  return { metrics, hydrated, persistMetrics, invalidateCache };
}
