/**
 * Multi-tenant auditor tenancy core (Issue #189).
 *
 * Auditors belong to one organization at a time; every dashboard surface
 * (metrics, transactions, audit trails) is scoped to the selected tenant and
 * operates in a strictly read-only capacity. Switching tenants must wipe the
 * in-memory cache of sensitive decryption keys so a key unlocked for one
 * organization can never be reused against another.
 */

export interface AuditorOrganization {
  id: string;
  name: string;
  shortName: string;
  /** Sale IDs owned by this organization — the tenancy boundary. */
  saleIds: string[];
}

export interface OrgDashboardMetrics {
  auditsCompleted: string;
  successRate: string;
  avgResponseTime: string;
  completedChange: string;
  successChange: string;
  responseChange: string;
}

/**
 * Organizations an auditor may be assigned to. `saleIds` is the authoritative
 * scope: anything not listed here is invisible to that tenant.
 */
export const AUDITOR_ORGANIZATIONS: AuditorOrganization[] = [
  {
    id: "northwind-assurance",
    name: "Northwind Assurance LLP",
    shortName: "Northwind",
    saleIds: ["1042", "654", "1100", "1075"],
  },
  {
    id: "helix-compliance",
    name: "Helix Compliance Group",
    shortName: "Helix",
    saleIds: ["988", "512", "1089"],
  },
  {
    id: "meridian-trust",
    name: "Meridian Trust Partners",
    shortName: "Meridian",
    saleIds: ["776", "489"],
  },
];

export const DEFAULT_TENANT_ID = AUDITOR_ORGANIZATIONS[0].id;

/** Mock per-tenant headline metrics shown on the overview cards. */
export const ORG_DASHBOARD_METRICS: Record<string, OrgDashboardMetrics> = {
  "northwind-assurance": {
    auditsCompleted: "23",
    successRate: "96%",
    avgResponseTime: "2.1h",
    completedChange: "+4 this quarter",
    successChange: "+0.8% vs last quarter",
    responseChange: "–0.3h improved",
  },
  "helix-compliance": {
    auditsCompleted: "14",
    successRate: "92%",
    avgResponseTime: "3.4h",
    completedChange: "+2 this quarter",
    successChange: "–1.1% vs last quarter",
    responseChange: "+0.2h slower",
  },
  "meridian-trust": {
    auditsCompleted: "10",
    successRate: "100%",
    avgResponseTime: "1.8h",
    completedChange: "+3 this quarter",
    successChange: "stable vs last quarter",
    responseChange: "–0.6h improved",
  },
};

export function getOrganization(orgId: string): AuditorOrganization {
  return (
    AUDITOR_ORGANIZATIONS.find((org) => org.id === orgId) ??
    AUDITOR_ORGANIZATIONS[0]
  );
}

export function isSaleIdInOrg(orgId: string, saleId: string): boolean {
  const org = AUDITOR_ORGANIZATIONS.find((o) => o.id === orgId);
  if (!org) return false;
  return org.saleIds.includes(saleId.trim());
}

interface SaleIdScoped {
  saleId: string;
}

/** Filters any sale-scoped collection down to the tenant's boundary. */
export function recordsScopedToOrg<T extends SaleIdScoped>(
  orgId: string,
  records: T[],
): T[] {
  return records.filter((record) => isSaleIdInOrg(orgId, record.saleId));
}

/* ------------------------------------------------------------------ */
/* Tenant selection persistence                                        */
/* ------------------------------------------------------------------ */

export const TENANT_STORAGE_KEY = "stormsale_auditor_tenant_v1";

export interface TenancyStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const memoryStore = new Map<string, string>();
const memoryFallback: TenancyStorage = {
  getItem: (key) => memoryStore.get(key) ?? null,
  setItem: (key, value) => {
    memoryStore.set(key, value);
  },
};

function resolveStorage(explicit?: TenancyStorage): TenancyStorage {
  if (explicit) return explicit;
  if (typeof localStorage !== "undefined") return localStorage;
  return memoryFallback;
}

/** Reads the persisted tenant selection; unknown values fall back to default. */
export function loadSelectedTenantId(storage?: TenancyStorage): string {
  try {
    const raw = resolveStorage(storage).getItem(TENANT_STORAGE_KEY);
    if (!raw) return DEFAULT_TENANT_ID;
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed !== "string") return DEFAULT_TENANT_ID;
    return AUDITOR_ORGANIZATIONS.some((org) => org.id === parsed)
      ? parsed
      : DEFAULT_TENANT_ID;
  } catch {
    return DEFAULT_TENANT_ID;
  }
}

export function persistSelectedTenantId(
  orgId: string,
  storage?: TenancyStorage,
): boolean {
  if (!AUDITOR_ORGANIZATIONS.some((org) => org.id === orgId)) return false;
  try {
    resolveStorage(storage).setItem(TENANT_STORAGE_KEY, JSON.stringify(orgId));
    return true;
  } catch {
    return false;
  }
}

/* ------------------------------------------------------------------ */
/* In-memory session decryption key cache                              */
/* ------------------------------------------------------------------ */

/**
 * Decryption keys are deliberately kept in memory only (never persisted).
 * The Map is keyed by organization so a key provisioned while scoped to one
 * tenant is unreachable from another, and `clearTenantSessionKeys` gives the
 * tenancy switch a hard wipe.
 */
const decryptionKeyCache = new Map<string, Set<string>>();

export function registerDecryptionKey(
  orgId: string,
  keyId: string,
): string[] {
  const bucket = decryptionKeyCache.get(orgId) ?? new Set<string>();
  bucket.add(keyId);
  decryptionKeyCache.set(orgId, bucket);
  return getCachedDecryptionKeys(orgId);
}

export function getCachedDecryptionKeys(orgId: string): string[] {
  return Array.from(decryptionKeyCache.get(orgId) ?? []).sort();
}

/** Wipes cached keys for one tenant — or every tenant when omitted. */
export function clearTenantSessionKeys(orgId?: string): void {
  if (orgId === undefined) {
    decryptionKeyCache.clear();
    return;
  }
  decryptionKeyCache.delete(orgId);
}

/** Mock key id generator so demo flows can "unlock" a key for the tenant. */
export function provisionDemoDecryptionKey(orgId: string): string[] {
  const suffix = Math.random().toString(16).slice(2, 10).toUpperCase();
  return registerDecryptionKey(orgId, `DECKEY-${orgId.slice(0, 6)}-${suffix}`);
}
