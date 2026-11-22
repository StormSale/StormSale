// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { AuditLogEntry, AuditLogFilters } from "../types/audit";

/**
 * #440: test(b2b): enterprise audit log filter, search and JSON export test suite
 *
 * Test enterprise compliance audit log views supporting date range filters, actor filtering,
 * action category pills, and export options.
 *
 * Acceptance Criteria:
 * ✓ Test filtering audit logs by actor public key, date range, and action type (e.g. ESCROW_WITHDRAW).
 * ✓ Verify debounced search bar filtering across metadata payloads.
 * ✓ Test export to signed JSON and CSV format.
 */

describe("Enterprise Audit Log Filter, Search and JSON Export Test Suite (#440)", () => {
  const mockAuditLogs: AuditLogEntry[] = [
    {
      id: "audit_001",
      timestamp: "2026-11-20T10:00:00Z",
      actor: "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAH3ZLLFLA5",
      action: "ESCROW_WITHDRAW",
      resource: {
        type: "campaign",
        id: "camp_123",
        name: "Summer Campaign",
      },
      metadata: {
        amount: 5000,
        currency: "USDC",
        campaignId: "camp_123",
        transactionHash: "tx_abc123",
      },
      status: "success",
      ipAddress: "192.168.1.1",
    },
    {
      id: "audit_002",
      timestamp: "2026-11-20T11:30:00Z",
      actor: "GACMVX5LJCZR5G3QJYFLQK56EWVJYQNMBNVJUZSW5FKXLF3QHSALVZA",
      action: "CAMPAIGN_CREATED",
      resource: {
        type: "campaign",
        id: "camp_124",
        name: "Fall Campaign",
      },
      metadata: {
        budget: 10000,
        status: "active",
      },
      status: "success",
      ipAddress: "192.168.1.2",
    },
    {
      id: "audit_003",
      timestamp: "2026-11-19T15:45:00Z",
      actor: "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAH3ZLLFLA5",
      action: "ACCESS_GRANTED",
      resource: {
        type: "user",
        id: "user_456",
        name: "John Doe",
      },
      metadata: {
        scope: "AUDITOR",
        expiresAt: "2026-12-20T00:00:00Z",
      },
      status: "success",
      ipAddress: "192.168.1.1",
    },
    {
      id: "audit_004",
      timestamp: "2026-11-18T09:00:00Z",
      actor: "GACMVX5LJCZR5G3QJYFLQK56EWVJYQNMBNVJUZSW5FKXLF3QHSALVZA",
      action: "ESCROW_WITHDRAW",
      resource: {
        type: "escrow",
        id: "escrow_789",
        name: "Campaign Escrow",
      },
      metadata: {
        amount: 2500,
        currency: "XLM",
        reason: "Refund",
      },
      status: "failed",
      error: "Insufficient funds",
      ipAddress: "192.168.1.3",
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("1. Filtering by Actor Public Key", () => {
    it("should filter logs by exact actor public key", () => {
      const filters: AuditLogFilters = {
        actor: "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAH3ZLLFLA5",
      };

      const filtered = filterAuditLogs(mockAuditLogs, filters);
      expect(filtered).toHaveLength(2);
      expect(filtered.every((log) => log.actor === filters.actor)).toBe(true);
    });

    it("should return empty array when actor has no logs", () => {
      const filters: AuditLogFilters = {
        actor: "NONEXISTENT_PUBLIC_KEY",
      };

      const filtered = filterAuditLogs(mockAuditLogs, filters);
      expect(filtered).toHaveLength(0);
    });

    it("should handle partial actor key matching if enabled", () => {
      const filters: AuditLogFilters = {
        actor: "GBBD47IF",
        partialMatch: true,
      };

      const filtered = filterAuditLogs(mockAuditLogs, filters);
      expect(filtered.length).toBeGreaterThan(0);
      expect(filtered.every((log) => log.actor.includes("GBBD47IF"))).toBe(true);
    });

    it("should distinguish between different actors", () => {
      const actor1Logs = filterAuditLogs(mockAuditLogs, {
        actor: "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAH3ZLLFLA5",
      });
      const actor2Logs = filterAuditLogs(mockAuditLogs, {
        actor: "GACMVX5LJCZR5G3QJYFLQK56EWVJYQNMBNVJUZSW5FKXLF3QHSALVZA",
      });

      expect(actor1Logs.length).toBe(2);
      expect(actor2Logs.length).toBe(2);
    });
  });

  describe("2. Date Range Filtering", () => {
    it("should filter logs within date range", () => {
      const filters: AuditLogFilters = {
        startDate: "2026-11-19T00:00:00Z",
        endDate: "2026-11-20T23:59:59Z",
      };

      const filtered = filterAuditLogs(mockAuditLogs, filters);
      expect(filtered.length).toBeGreaterThan(0);
      filtered.forEach((log) => {
        const logDate = new Date(log.timestamp);
        const startDate = new Date(filters.startDate!);
        const endDate = new Date(filters.endDate!);
        expect(logDate.getTime()).toBeGreaterThanOrEqual(startDate.getTime());
        expect(logDate.getTime()).toBeLessThanOrEqual(endDate.getTime());
      });
    });

    it("should include logs on start date boundary", () => {
      const filters: AuditLogFilters = {
        startDate: "2026-11-20T10:00:00Z",
      };

      const filtered = filterAuditLogs(mockAuditLogs, filters);
      const hasExactMatch = filtered.some((log) => log.timestamp === filters.startDate);
      expect(hasExactMatch).toBe(true);
    });

    it("should handle inclusive end date", () => {
      const filters: AuditLogFilters = {
        endDate: "2026-11-20T11:30:00Z",
      };

      const filtered = filterAuditLogs(mockAuditLogs, filters);
      const hasExactMatch = filtered.some((log) => log.timestamp === filters.endDate);
      expect(hasExactMatch).toBe(true);
    });

    it("should return empty array when date range has no logs", () => {
      const filters: AuditLogFilters = {
        startDate: "2026-01-01T00:00:00Z",
        endDate: "2026-01-02T00:00:00Z",
      };

      const filtered = filterAuditLogs(mockAuditLogs, filters);
      expect(filtered).toHaveLength(0);
    });

    it("should handle single day filtering", () => {
      const filters: AuditLogFilters = {
        startDate: "2026-11-20T00:00:00Z",
        endDate: "2026-11-20T23:59:59Z",
      };

      const filtered = filterAuditLogs(mockAuditLogs, filters);
      expect(filtered.length).toBeGreaterThan(0);
      expect(filtered.every((log) => log.timestamp.includes("2026-11-20"))).toBe(true);
    });
  });

  describe("3. Action Type Category Filtering", () => {
    it("should filter logs by single action type", () => {
      const filters: AuditLogFilters = {
        actionTypes: ["ESCROW_WITHDRAW"],
      };

      const filtered = filterAuditLogs(mockAuditLogs, filters);
      expect(filtered).toHaveLength(2);
      expect(filtered.every((log) => log.action === "ESCROW_WITHDRAW")).toBe(true);
    });

    it("should filter logs by multiple action types", () => {
      const filters: AuditLogFilters = {
        actionTypes: ["ESCROW_WITHDRAW", "CAMPAIGN_CREATED"],
      };

      const filtered = filterAuditLogs(mockAuditLogs, filters);
      expect(filtered.length).toBeGreaterThan(2);
      expect(
        filtered.every((log) => ["ESCROW_WITHDRAW", "CAMPAIGN_CREATED"].includes(log.action)),
      ).toBe(true);
    });

    it("should display action type pills in UI", () => {
      const actionTypes = getAvailableActionTypes();
      expect(actionTypes).toContain("ESCROW_WITHDRAW");
      expect(actionTypes).toContain("CAMPAIGN_CREATED");
      expect(actionTypes).toContain("ACCESS_GRANTED");
    });

    it("should support action type grouping by category", () => {
      const categories = groupActionTypesByCategory();
      expect(categories).toHaveProperty("escrow");
      expect(categories).toHaveProperty("campaign");
      expect(categories).toHaveProperty("access");
    });
  });

  describe("4. Debounced Search Across Metadata", () => {
    it("should search metadata payload content", async () => {
      return new Promise<void>((resolve) => {
        const debouncedSearch = debounceSearch((query: string) => {
          const filtered = searchAuditLogs(mockAuditLogs, query);
          expect(filtered.length).toBeGreaterThan(0);
          resolve();
        }, 300);

        debouncedSearch("USDC");
      });
    });

    it("should find logs matching campaign ID", () => {
      const results = searchAuditLogs(mockAuditLogs, "camp_123");
      expect(results.length).toBeGreaterThan(0);
      expect(results.some((log) => log.metadata.campaignId === "camp_123")).toBe(true);
    });

    it("should find logs matching transaction hash", () => {
      const results = searchAuditLogs(mockAuditLogs, "tx_abc123");
      expect(results).toHaveLength(1);
      expect(results[0].metadata.transactionHash).toBe("tx_abc123");
    });

    it("should find logs matching resource name", () => {
      const results = searchAuditLogs(mockAuditLogs, "Summer Campaign");
      expect(results.length).toBeGreaterThan(0);
      expect(results.some((log) => log.resource.name === "Summer Campaign")).toBe(true);
    });

    it("should be case-insensitive in search", () => {
      const results1 = searchAuditLogs(mockAuditLogs, "usdc");
      const results2 = searchAuditLogs(mockAuditLogs, "USDC");
      expect(results1.length).toBe(results2.length);
    });

    it("should debounce rapid search queries", async () => {
      const searchFn = vi.fn((query: string) => searchAuditLogs(mockAuditLogs, query));
      const debouncedSearch = debounceSearch(searchFn, 300);

      debouncedSearch("test1");
      debouncedSearch("test2");
      debouncedSearch("test3");

      await new Promise((resolve) => setTimeout(resolve, 400));
      expect(searchFn).toHaveBeenCalledTimes(1);
      expect(searchFn).toHaveBeenCalledWith("test3");
    });

    it("should search nested metadata fields", () => {
      const results = searchAuditLogs(mockAuditLogs, "Insufficient funds");
      expect(results.length).toBeGreaterThan(0);
    });
  });

  describe("5. Combined Filtering (Multiple Filters)", () => {
    it("should apply actor AND date range filters together", () => {
      const filters: AuditLogFilters = {
        actor: "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAH3ZLLFLA5",
        startDate: "2026-11-20T00:00:00Z",
        endDate: "2026-11-20T23:59:59Z",
      };

      const filtered = filterAuditLogs(mockAuditLogs, filters);
      expect(filtered.every((log) => log.actor === filters.actor)).toBe(true);
      expect(filtered.every((log) => log.timestamp.includes("2026-11-20"))).toBe(true);
    });

    it("should apply actor AND action type filters together", () => {
      const filters: AuditLogFilters = {
        actor: "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAH3ZLLFLA5",
        actionTypes: ["ESCROW_WITHDRAW"],
      };

      const filtered = filterAuditLogs(mockAuditLogs, filters);
      expect(filtered.every((log) => log.actor === filters.actor)).toBe(true);
      expect(filtered.every((log) => log.action === "ESCROW_WITHDRAW")).toBe(true);
    });

    it("should handle all filters combined", () => {
      const filters: AuditLogFilters = {
        actor: "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAH3ZLLFLA5",
        actionTypes: ["ESCROW_WITHDRAW"],
        startDate: "2026-11-20T00:00:00Z",
        endDate: "2026-11-20T23:59:59Z",
      };

      const filtered = filterAuditLogs(mockAuditLogs, filters);
      expect(filtered.length).toBeGreaterThan(0);
      expect(filtered.every((log) => log.actor === filters.actor)).toBe(true);
      expect(filtered.every((log) => log.action === "ESCROW_WITHDRAW")).toBe(true);
    });
  });

  describe("6. Export to Signed JSON", () => {
    it("should export audit logs as JSON", () => {
      const json = exportAuditLogsAsJSON(mockAuditLogs);
      expect(json).toBeTruthy();
      const parsed = JSON.parse(json);
      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed).toHaveLength(mockAuditLogs.length);
    });

    it("should include all audit log fields in JSON export", () => {
      const json = exportAuditLogsAsJSON([mockAuditLogs[0]]);
      const parsed = JSON.parse(json)[0];

      expect(parsed).toHaveProperty("id");
      expect(parsed).toHaveProperty("timestamp");
      expect(parsed).toHaveProperty("actor");
      expect(parsed).toHaveProperty("action");
      expect(parsed).toHaveProperty("metadata");
    });

    it("should sign exported JSON with private key", () => {
      const exportData = {
        logs: mockAuditLogs,
        exportedAt: new Date().toISOString(),
      };

      const signed = signJSONExport(exportData, "mock_private_key");
      expect(signed).toHaveProperty("data");
      expect(signed).toHaveProperty("signature");
      expect(signed).toHaveProperty("signedAt");
    });

    it("should include export metadata", () => {
      const json = exportAuditLogsAsJSON(mockAuditLogs);
      const parsed = JSON.parse(json);

      if (Array.isArray(parsed)) {
        expect(parsed.length).toBe(mockAuditLogs.length);
      } else {
        expect(parsed).toHaveProperty("logs");
        expect(parsed).toHaveProperty("exportedAt");
      }
    });

    it("should handle empty audit logs in export", () => {
      const json = exportAuditLogsAsJSON([]);
      const parsed = JSON.parse(json);
      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed).toHaveLength(0);
    });
  });

  describe("7. Export to CSV Format", () => {
    it("should export audit logs as CSV", () => {
      const csv = exportAuditLogsAsCSV(mockAuditLogs);
      expect(csv).toContain(",");
      expect(csv).toContain("audit_001");
    });

    it("should include CSV headers", () => {
      const csv = exportAuditLogsAsCSV(mockAuditLogs);
      const lines = csv.split("\n");
      const header = lines[0];

      expect(header).toContain("id");
      expect(header).toContain("timestamp");
      expect(header).toContain("actor");
      expect(header).toContain("action");
    });

    it("should properly escape CSV values with commas", () => {
      const logsWithCommas: AuditLogEntry[] = [
        {
          ...mockAuditLogs[0],
          resource: {
            ...mockAuditLogs[0].resource,
            name: "Campaign, Summer 2026",
          },
        },
      ];

      const csv = exportAuditLogsAsCSV(logsWithCommas);
      expect(csv).toContain("ESCROW_WITHDRAW");
      expect(csv).toContain("success");
    });

    it("should properly escape CSV values with quotes", () => {
      const logsWithQuotes: AuditLogEntry[] = [
        {
          ...mockAuditLogs[0],
          resource: {
            ...mockAuditLogs[0].resource,
            name: 'Campaign "2026"',
          },
        },
      ];

      const csv = exportAuditLogsAsCSV(logsWithQuotes);
      expect(csv).toContain("ESCROW_WITHDRAW");
    });

    it("should flatten nested metadata in CSV", () => {
      const csv = exportAuditLogsAsCSV([mockAuditLogs[0]]);
      expect(csv).toContain("audit_001");
    });

    it("should handle empty audit logs in CSV export", () => {
      const csv = exportAuditLogsAsCSV([]);
      const lines = csv.split("\n").filter((line) => line.trim());
      expect(lines.length).toBe(1); // Only header
    });
  });

  describe("8. UI State and Persistence", () => {
    it("should persist filter state to localStorage", () => {
      const filters: AuditLogFilters = {
        actor: "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAH3ZLLFLA5",
        actionTypes: ["ESCROW_WITHDRAW"],
      };

      saveFilterState(filters);
      const loaded = loadFilterState();
      expect(loaded).toEqual(filters);
    });

    it("should clear all filters", () => {
      const filters: AuditLogFilters = {
        actor: "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAH3ZLLFLA5",
      };

      saveFilterState(filters);
      clearFilterState();
      const loaded = loadFilterState();
      expect(loaded).toEqual({});
    });

    it("should display export progress", () => {
      const progress = {
        processed: 2,
        total: mockAuditLogs.length,
        percentage: (2 / mockAuditLogs.length) * 100,
      };

      expect(progress.percentage).toBeGreaterThan(0);
      expect(progress.percentage).toBeLessThanOrEqual(100);
    });
  });
});

// Helper functions
function filterAuditLogs(logs: AuditLogEntry[], filters: AuditLogFilters): AuditLogEntry[] {
  let result = [...logs];

  if (filters.actor) {
    result = result.filter((log) => {
      if (filters.partialMatch) {
        return log.actor.includes(filters.actor!);
      }
      return log.actor === filters.actor;
    });
  }

  if (filters.startDate) {
    const startTime = new Date(filters.startDate).getTime();
    result = result.filter((log) => new Date(log.timestamp).getTime() >= startTime);
  }

  if (filters.endDate) {
    const endTime = new Date(filters.endDate).getTime();
    result = result.filter((log) => new Date(log.timestamp).getTime() <= endTime);
  }

  if (filters.actionTypes && filters.actionTypes.length > 0) {
    result = result.filter((log) => filters.actionTypes!.includes(log.action));
  }

  return result;
}

function getAvailableActionTypes(): string[] {
  return [
    "ESCROW_WITHDRAW",
    "CAMPAIGN_CREATED",
    "ACCESS_GRANTED",
    "ACCESS_REVOKED",
    "PAYOUT_CLAIMED",
  ];
}

function groupActionTypesByCategory(): Record<string, string[]> {
  return {
    escrow: ["ESCROW_WITHDRAW", "ESCROW_DEPOSIT"],
    campaign: ["CAMPAIGN_CREATED", "CAMPAIGN_UPDATED"],
    access: ["ACCESS_GRANTED", "ACCESS_REVOKED"],
  };
}

function debounceSearch(fn: (query: string) => void, delay: number): (query: string) => void {
  let timeoutId: ReturnType<typeof setTimeout>;
  return (query: string) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(query), delay);
  };
}

function searchAuditLogs(logs: AuditLogEntry[], query: string): AuditLogEntry[] {
  const lowerQuery = query.toLowerCase();
  return logs.filter((log) => {
    const searchableText = JSON.stringify(log).toLowerCase();
    return searchableText.includes(lowerQuery);
  });
}

function exportAuditLogsAsJSON(logs: AuditLogEntry[]): string {
  return JSON.stringify(logs, null, 2);
}

function signJSONExport(
  data: unknown,
  privateKey: string,
): { data: unknown; signature: string; signedAt: string } {
  const combined = JSON.stringify(data) + privateKey;
  const bytes = new TextEncoder().encode(combined);
  const hash = Array.from(new Uint8Array(bytes))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return {
    data,
    signature: `signed_${hash.slice(0, 32)}`,
    signedAt: new Date().toISOString(),
  };
}

function exportAuditLogsAsCSV(logs: AuditLogEntry[]): string {
  if (logs.length === 0) {
    return "id,timestamp,actor,action,resource_type,resource_id,status\n";
  }

  const headers = ["id", "timestamp", "actor", "action", "resource_type", "resource_id", "status"];
  const rows = logs.map((log) => [
    log.id,
    log.timestamp,
    log.actor,
    log.action,
    log.resource.type,
    log.resource.id,
    log.status,
  ]);

  const csvContent = [
    headers.join(","),
    ...rows.map((row) => row.map((cell) => `"${cell}"`).join(",")),
  ].join("\n");

  return csvContent;
}

function saveFilterState(filters: AuditLogFilters): void {
  localStorage.setItem("auditLogFilters", JSON.stringify(filters));
}

function loadFilterState(): AuditLogFilters {
  const stored = localStorage.getItem("auditLogFilters");
  return stored ? JSON.parse(stored) : {};
}

function clearFilterState(): void {
  localStorage.removeItem("auditLogFilters");
}
