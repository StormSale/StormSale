import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  AUDITOR_ORGANIZATIONS,
  clearTenantSessionKeys,
  getCachedDecryptionKeys,
  getOrganization,
  persistSelectedTenantId,
  provisionDemoDecryptionKey,
  loadSelectedTenantId,
  type AuditorOrganization,
} from "../lib/auditorTenancy";

interface AuditorTenancyContextValue {
  /** Organization every metric/trail surface is currently scoped to. */
  org: AuditorOrganization;
  organizations: AuditorOrganization[];
  /** In-memory session decryption keys cached for the current tenant. */
  cachedKeyIds: string[];
  switchTenant: (orgId: string) => void;
  provisionDemoKey: () => void;
  lockSessionKeys: () => void;
}

const AuditorTenancyContext =
  createContext<AuditorTenancyContextValue | null>(null);

export const AuditorTenancyProvider = ({
  children,
}: {
  children: ReactNode;
}) => {
  const [orgId, setOrgId] = useState<string>(() => loadSelectedTenantId());
  const [cachedKeyIds, setCachedKeyIds] = useState<string[]>(() =>
    getCachedDecryptionKeys(orgId),
  );

  const syncKeys = useCallback((nextOrgId: string) => {
    setCachedKeyIds(getCachedDecryptionKeys(nextOrgId));
  }, []);

  const switchTenant = useCallback(
    (nextOrgId: string) => {
      if (nextOrgId === orgId) return;
      if (!AUDITOR_ORGANIZATIONS.some((org) => org.id === nextOrgId)) return;
      // Hard security boundary: leaving a tenant wipes every cached
      // decryption key — for the tenant being left AND any stale cache on
      // the tenant being entered.
      clearTenantSessionKeys();
      persistSelectedTenantId(nextOrgId);
      setOrgId(nextOrgId);
      setCachedKeyIds([]);
    },
    [orgId],
  );

  const provisionDemoKey = useCallback(() => {
    setCachedKeyIds(provisionDemoDecryptionKey(orgId));
  }, [orgId]);

  const lockSessionKeys = useCallback(() => {
    clearTenantSessionKeys(orgId);
    setCachedKeyIds([]);
  }, [orgId]);

  // Keep the key list honest if cache mutated elsewhere (defensive sync).
  useEffect(() => {
    syncKeys(orgId);
  }, [orgId, syncKeys]);

  const value = useMemo(
    () => ({
      org: getOrganization(orgId),
      organizations: AUDITOR_ORGANIZATIONS,
      cachedKeyIds,
      switchTenant,
      provisionDemoKey,
      lockSessionKeys,
    }),
    [orgId, cachedKeyIds, switchTenant, provisionDemoKey, lockSessionKeys],
  );

  return (
    <AuditorTenancyContext.Provider value={value}>
      {children}
    </AuditorTenancyContext.Provider>
  );
};

export function useAuditorTenancy(): AuditorTenancyContextValue {
  const ctx = useContext(AuditorTenancyContext);
  if (!ctx) {
    throw new Error(
      "useAuditorTenancy must be used inside an AuditorTenancyProvider",
    );
  }
  return ctx;
}
