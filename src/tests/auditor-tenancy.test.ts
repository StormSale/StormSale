import { describe, expect, it } from "vitest";
import {
  AUDITOR_ORGANIZATIONS,
  DEFAULT_TENANT_ID,
  TENANT_STORAGE_KEY,
  clearTenantSessionKeys,
  getCachedDecryptionKeys,
  getOrganization,
  isSaleIdInOrg,
  loadSelectedTenantId,
  ORG_DASHBOARD_METRICS,
  persistSelectedTenantId,
  provisionDemoDecryptionKey,
  recordsScopedToOrg,
  registerDecryptionKey,
  type TenancyStorage,
} from "../lib/auditorTenancy";

const makeStorage = () => {
  const map = new Map<string, string>();
  const storage: TenancyStorage & { dump(): Record<string, string> } = {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => {
      map.set(key, value);
    },
    dump: () => Object.fromEntries(map),
  };
  return storage;
};

describe("Auditor organization roster (#189)", () => {
  it("defines distinct organizations with non-empty sale scopes", () => {
    expect(AUDITOR_ORGANIZATIONS.length).toBeGreaterThanOrEqual(2);
    const ids = AUDITOR_ORGANIZATIONS.map((org) => org.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const org of AUDITOR_ORGANIZATIONS) {
      expect(org.saleIds.length).toBeGreaterThan(0);
      expect(org.name.length).toBeGreaterThan(0);
    }
  });

  it("keeps tenant boundaries disjoint — no sale shared by two orgs", () => {
    const seen = new Set<string>();
    for (const org of AUDITOR_ORGANIZATIONS) {
      for (const saleId of org.saleIds) {
        expect(seen.has(saleId), `sale ${saleId} claimed twice`).toBe(false);
        seen.add(saleId);
      }
    }
  });

  it("has dashboard metrics for every organization", () => {
    for (const org of AUDITOR_ORGANIZATIONS) {
      expect(ORG_DASHBOARD_METRICS[org.id]).toBeDefined();
    }
  });

  it("falls back to the default organization for unknown ids", () => {
    expect(getOrganization("no-such-org").id).toBe(DEFAULT_TENANT_ID);
  });
});

describe("Tenant scoping filters (#189)", () => {
  const trailRecords = [
    { saleId: "1042", label: "northwind-a" },
    { saleId: "988", label: "helix-a" },
    { saleId: "776", label: "meridian-a" },
    { saleId: "654", label: "northwind-b" },
    { saleId: "512", label: "helix-b" },
    { saleId: "489", label: "meridian-b" },
  ];

  it("isSaleIdInOrg respects the boundary in both directions", () => {
    expect(isSaleIdInOrg("northwind-assurance", "1042")).toBe(true);
    expect(isSaleIdInOrg("helix-compliance", "1042")).toBe(false);
    expect(isSaleIdInOrg("meridian-trust", "776")).toBe(true);
    expect(isSaleIdInOrg("ghost-org", "1042")).toBe(false);
  });

  it("recordsScopedToOrg returns only the tenant's rows, order preserved", () => {
    const northwind = recordsScopedToOrg("northwind-assurance", trailRecords);
    expect(northwind.map((r) => r.saleId)).toEqual(["1042", "654"]);
    const helix = recordsScopedToOrg("helix-compliance", trailRecords);
    expect(helix.map((r) => r.saleId)).toEqual(["988", "512"]);
  });

  it("an organization never sees another tenant's records", () => {
    for (const org of AUDITOR_ORGANIZATIONS) {
      const scoped = recordsScopedToOrg(org.id, trailRecords);
      for (const record of scoped) {
        expect(org.saleIds).toContain(record.saleId);
      }
    }
  });
});

describe("Tenant selection persistence (#189)", () => {
  it("returns the default tenant when storage is empty", () => {
    expect(loadSelectedTenantId(makeStorage())).toBe(DEFAULT_TENANT_ID);
  });

  it("round-trips a persisted selection", () => {
    const storage = makeStorage();
    expect(persistSelectedTenantId("helix-compliance", storage)).toBe(true);
    expect(loadSelectedTenantId(storage)).toBe("helix-compliance");
    expect(storage.dump()[TENANT_STORAGE_KEY]).toBe(
      JSON.stringify("helix-compliance"),
    );
  });

  it("rejects persisting unknown organizations", () => {
    const storage = makeStorage();
    expect(persistSelectedTenantId("rogue-corp", storage)).toBe(false);
    expect(storage.dump()[TENANT_STORAGE_KEY]).toBeUndefined();
  });

  it("falls back to default when stored value is corrupt or stale", () => {
    const storage = makeStorage();
    storage.setItem(TENANT_STORAGE_KEY, "not-json");
    expect(loadSelectedTenantId(storage)).toBe(DEFAULT_TENANT_ID);
    storage.setItem(TENANT_STORAGE_KEY, JSON.stringify("deleted-org-v9"));
    expect(loadSelectedTenantId(storage)).toBe(DEFAULT_TENANT_ID);
  });
});

describe("Session decryption key cache (#189)", () => {
  it("registers and lists keys per organization", () => {
    clearTenantSessionKeys();
    registerDecryptionKey("northwind-assurance", "KEY-B");
    registerDecryptionKey("northwind-assurance", "KEY-A");
    registerDecryptionKey("helix-compliance", "KEY-C");
    expect(getCachedDecryptionKeys("northwind-assurance")).toEqual([
      "KEY-A",
      "KEY-B",
    ]);
    expect(getCachedDecryptionKeys("helix-compliance")).toEqual(["KEY-C"]);
  });

  it("switch wipe clears one tenant without touching another", () => {
    clearTenantSessionKeys("northwind-assurance");
    expect(getCachedDecryptionKeys("northwind-assurance")).toEqual([]);
    expect(getCachedDecryptionKeys("helix-compliance")).toEqual(["KEY-C"]);
    clearTenantSessionKeys();
    expect(getCachedDecryptionKeys("helix-compliance")).toEqual([]);
  });

  it("provisioned demo keys live in memory only, never in storage", () => {
    const storage = makeStorage();
    persistSelectedTenantId("meridian-trust", storage);
    const keys = provisionDemoDecryptionKey("meridian-trust");
    expect(keys).toHaveLength(1);
    expect(keys[0].startsWith("DECKEY-meridi")).toBe(true);
    // Only the tenant pointer is persisted — no key material leaves memory.
    expect(Object.keys(storage.dump())).toEqual([TENANT_STORAGE_KEY]);
    clearTenantSessionKeys();
  });
});
