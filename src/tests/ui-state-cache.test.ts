// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import React from "react";
import { render, screen, fireEvent, cleanup, act } from "@testing-library/react";
import { z } from "zod";
import {
  UI_STATE_PREFIX,
  UI_STATE_VERSION,
  clearUIState,
  defineUIStateCache,
  initUIStateCache,
  readUIState,
  uiStateStorageKey,
  writeUIState,
} from "../lib/uiStateCache";
import { useFilterState } from "../hooks/useFilterState";
import { usePreference } from "../hooks/usePreference";

const filtersSchema = z.object({
  status: z.enum(["all", "active", "paused"]),
  search: z.string().max(50),
});
type Filters = z.infer<typeof filtersSchema>;

const DEFAULT_FILTERS: Filters = { status: "all", search: "" };

function storedEnvelope(key: string): { v: number; updatedAt: number; value: unknown } {
  return JSON.parse(localStorage.getItem(uiStateStorageKey(key)) ?? "null");
}

describe("Persistent UI & Filter State Cache (#73)", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  describe("versioned, schema-safe persistence", () => {
    it("writes a versioned enveloped under the UI namespace", () => {
      expect(writeUIState("affiliate.leaderboard.filters", filtersSchema, DEFAULT_FILTERS)).toBe(
        true,
      );

      const envelope = storedEnvelope("affiliate.leaderboard.filters");
      expect(envelope.v).toBe(UI_STATE_VERSION);
      expect(typeof envelope.updatedAt).toBe("number");
      expect(envelope.value).toEqual(DEFAULT_FILTERS);
      expect(localStorage.getItem(uiStateStorageKey("affiliate.leaderboard.filters"))).toBeTruthy();
    });

    it("hydrates a matching version and schema", () => {
      writeUIState("test.filters", filtersSchema, { status: "paused", search: "acme" });

      expect(readUIState("test.filters", filtersSchema, DEFAULT_FILTERS)).toEqual({
        status: "paused",
        search: "acme",
      });
    });

    it("evicts entries written under a stale schema version", () => {
      const storageKey = uiStateStorageKey("test.filters");
      localStorage.setItem(
        storageKey,
        JSON.stringify({ v: UI_STATE_VERSION + 1, updatedAt: Date.now(), value: DEFAULT_FILTERS }),
      );

      expect(readUIState("test.filters", filtersSchema, DEFAULT_FILTERS)).toEqual(DEFAULT_FILTERS);
      expect(localStorage.getItem(storageKey)).toBeNull();
    });

    it("evicts corrupt JSON instead of throwing", () => {
      const storageKey = uiStateStorageKey("test.filters");
      localStorage.setItem(storageKey, "{not-json");

      expect(readUIState("test.filters", filtersSchema, DEFAULT_FILTERS)).toEqual(DEFAULT_FILTERS);
      expect(localStorage.getItem(storageKey)).toBeNull();
    });

    it("evicts values that no longer satisfy the schema", () => {
      const storageKey = uiStateStorageKey("test.filters");
      localStorage.setItem(
        storageKey,
        JSON.stringify({
          v: UI_STATE_VERSION,
          updatedAt: Date.now(),
          value: { status: "unknown-status", search: "x" },
        }),
      );

      expect(readUIState("test.filters", filtersSchema, DEFAULT_FILTERS)).toEqual(DEFAULT_FILTERS);
      expect(localStorage.getItem(storageKey)).toBeNull();
    });

    it("rejects off-schema writes so bad values never reach storage", () => {
      const result = writeUIState("test.filters", filtersSchema, {
        status: "invalid",
        search: "x",
      } as unknown as Filters);

      expect(result).toBe(false);
      expect(localStorage.getItem(uiStateStorageKey("test.filters"))).toBeNull();
    });

    it("expires stale entries using the configured TTL", () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
      writeUIState("test.filters", filtersSchema, { status: "active", search: "old" });

      vi.setSystemTime(new Date("2026-02-15T00:00:00Z"));
      expect(
        readUIState("test.filters", filtersSchema, DEFAULT_FILTERS, {
          ttlMs: 30 * 24 * 60 * 60 * 1000,
        }),
      ).toEqual(DEFAULT_FILTERS);
      expect(localStorage.getItem(uiStateStorageKey("test.filters"))).toBeNull();
    });

    it("clearUIState removes only the requested entry", () => {
      writeUIState("test.one", filtersSchema, DEFAULT_FILTERS);
      writeUIState("test.two", filtersSchema, DEFAULT_FILTERS);

      clearUIState("test.one");

      expect(localStorage.getItem(uiStateStorageKey("test.one"))).toBeNull();
      expect(localStorage.getItem(uiStateStorageKey("test.two"))).toBeTruthy();
    });

    it("defineUIStateCache exposes bound read/write/clear helpers", () => {
      const cache = defineUIStateCache("test.bound", filtersSchema, DEFAULT_FILTERS);

      expect(cache.write({ status: "active", search: "bound" })).toBe(true);
      expect(cache.read()).toEqual({ status: "active", search: "bound" });
      cache.clear();
      expect(cache.read()).toEqual(DEFAULT_FILTERS);
    });

    it("does not double-prefix an already namespaced key", () => {
      expect(uiStateStorageKey(`${UI_STATE_PREFIX}test.filters`)).toBe(
        `${UI_STATE_PREFIX}test.filters`,
      );
    });
  });

  describe("boot-time cache hygiene", () => {
    it("purges corrupt, stale-version, and expired UI entries only", () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-05-01T00:00:00Z"));

      const validKey = uiStateStorageKey("test.valid");
      const corruptKey = uiStateStorageKey("test.corrupt");
      const oldVersionKey = uiStateStorageKey("test.old-version");
      const expiredKey = uiStateStorageKey("test.expired");
      const futureKey = uiStateStorageKey("test.future");
      const legacyPreferenceKey = "stormsale.advertiser.tab";
      const unrelatedKey = "stormsale.profile.displayName.GABC";

      localStorage.setItem(
        validKey,
        JSON.stringify({ v: UI_STATE_VERSION, updatedAt: Date.now(), value: DEFAULT_FILTERS }),
      );
      localStorage.setItem(corruptKey, "not-json");
      localStorage.setItem(
        oldVersionKey,
        JSON.stringify({ v: UI_STATE_VERSION - 1, updatedAt: Date.now(), value: DEFAULT_FILTERS }),
      );
      localStorage.setItem(
        expiredKey,
        JSON.stringify({
          v: UI_STATE_VERSION,
          updatedAt: Date.now() - 31 * 24 * 60 * 60 * 1000,
          value: DEFAULT_FILTERS,
        }),
      );
      localStorage.setItem(
        futureKey,
        JSON.stringify({
          v: UI_STATE_VERSION,
          updatedAt: Date.now() + 60 * 60 * 1000,
          value: DEFAULT_FILTERS,
        }),
      );
      localStorage.setItem(legacyPreferenceKey, JSON.stringify({ v: 1, value: "advertiser" }));
      localStorage.setItem(unrelatedKey, "Morgan");

      const result = initUIStateCache();

      expect(result).toEqual({ scanned: 7, purged: 4, migrated: 1 });
      expect(localStorage.getItem(validKey)).toBeTruthy();
      expect(localStorage.getItem(corruptKey)).toBeNull();
      expect(localStorage.getItem(oldVersionKey)).toBeNull();
      expect(localStorage.getItem(expiredKey)).toBeNull();
      expect(localStorage.getItem(futureKey)).toBeNull();
      expect(JSON.parse(localStorage.getItem(legacyPreferenceKey) ?? "null")).toMatchObject({
        v: UI_STATE_VERSION,
        value: "advertiser",
      });
      expect(JSON.parse(localStorage.getItem(legacyPreferenceKey) ?? "null").updatedAt).toEqual(
        expect.any(Number),
      );
      expect(localStorage.getItem(unrelatedKey)).toBe("Morgan");
    });

    it("preserves a legacy preference when migration cannot be written", () => {
      const legacyPreferenceKey = "stormsale.advertiser.tab";
      const raw = JSON.stringify({ v: UI_STATE_VERSION, value: "advertiser" });
      localStorage.setItem(legacyPreferenceKey, raw);
      const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
        throw new Error("quota exceeded");
      });

      try {
        expect(initUIStateCache()).toEqual({ scanned: 1, purged: 0, migrated: 0 });
        expect(localStorage.getItem(legacyPreferenceKey)).toBe(raw);
      } finally {
        setItem.mockRestore();
      }
    });

    it("honours per-key TTL overrides during boot", () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-05-01T00:00:00Z"));
      const storageKey = uiStateStorageKey("test.custom-ttl");
      localStorage.setItem(
        storageKey,
        JSON.stringify({
          v: UI_STATE_VERSION,
          updatedAt: Date.now() - 40 * 24 * 60 * 60 * 1000,
          value: DEFAULT_FILTERS,
        }),
      );

      expect(
        initUIStateCache({
          ttlMsByKey: { [storageKey]: 60 * 24 * 60 * 60 * 1000 },
        }),
      ).toEqual({ scanned: 1, purged: 0, migrated: 0 });
      expect(localStorage.getItem(storageKey)).toBeTruthy();

      expect(initUIStateCache()).toEqual({ scanned: 1, purged: 1, migrated: 0 });
    });

    it("evicts future-dated entries on read as well as at boot", () => {
      const storageKey = uiStateStorageKey("test.future-read");
      localStorage.setItem(
        storageKey,
        JSON.stringify({
          v: UI_STATE_VERSION,
          updatedAt: Date.now() + 60 * 60 * 1000,
          value: { status: "active", search: "future" },
        }),
      );

      expect(readUIState("test.future-read", filtersSchema, DEFAULT_FILTERS)).toEqual(
        DEFAULT_FILTERS,
      );
      expect(localStorage.getItem(storageKey)).toBeNull();
    });
  });

  describe("useFilterState reload behaviour", () => {
    function FilterHarness() {
      const [filters, setFilters] = useFilterState<Filters>(
        "test.reload.filters",
        filtersSchema,
        DEFAULT_FILTERS,
      );

      return React.createElement(
        "div",
        null,
        React.createElement(
          "label",
          null,
          "status",
          React.createElement("span", { "data-testid": "status" }, filters.status),
        ),
        React.createElement("input", {
          "aria-label": "search",
          value: filters.search,
          onChange: (event: React.ChangeEvent<HTMLInputElement>) =>
            setFilters((previous) => ({ ...previous, search: event.target.value })),
        }),
        React.createElement(
          "button",
          {
            type: "button",
            onClick: () => setFilters((previous) => ({ ...previous, status: "paused" })),
          },
          "pause",
        ),
      );
    }

    it("restores filter changes after an unmount/remount (simulated reload)", () => {
      const first = render(React.createElement(FilterHarness));

      fireEvent.change(screen.getByLabelText("search"), { target: { value: "acme" } });
      fireEvent.click(screen.getByText("pause"));
      expect(screen.getByTestId("status").textContent).toBe("paused");

      first.unmount();

      render(React.createElement(FilterHarness));
      expect((screen.getByLabelText("search") as HTMLInputElement).value).toBe("acme");
      expect(screen.getByTestId("status").textContent).toBe("paused");
    });

    it("falls back to defaults and evicts mismatched schema on reload", () => {
      const storageKey = uiStateStorageKey("test.reload.filters");
      localStorage.setItem(
        storageKey,
        JSON.stringify({
          v: UI_STATE_VERSION,
          updatedAt: Date.now(),
          value: { status: "deleted-role", search: "x" },
        }),
      );

      render(React.createElement(FilterHarness));

      expect((screen.getByLabelText("search") as HTMLInputElement).value).toBe("");
      expect(screen.getByTestId("status").textContent).toBe("all");
      expect(storedEnvelope("test.reload.filters")).toMatchObject({
        v: UI_STATE_VERSION,
        value: DEFAULT_FILTERS,
      });
    });
  });

  describe("cross-tab synchronisation", () => {
    function writeFromAnotherTab(key: string, value: unknown) {
      const storageKey = uiStateStorageKey(key);
      const newValue = JSON.stringify({ v: UI_STATE_VERSION, updatedAt: Date.now(), value });
      localStorage.setItem(storageKey, newValue);
      act(() => {
        window.dispatchEvent(new StorageEvent("storage", { key: storageKey, newValue }));
      });
    }

    it("applies filter changes written by another tab", () => {
      function FilterHarness() {
        const [filters] = useFilterState<Filters>(
          "test.sync.filters",
          filtersSchema,
          DEFAULT_FILTERS,
        );
        return React.createElement(
          "div",
          null,
          React.createElement("span", { "data-testid": "status" }, filters.status),
          React.createElement("span", { "data-testid": "search" }, filters.search),
        );
      }

      render(React.createElement(FilterHarness));
      expect(screen.getByTestId("status").textContent).toBe("all");

      writeFromAnotherTab("test.sync.filters", { status: "paused", search: "other-tab" });

      expect(screen.getByTestId("status").textContent).toBe("paused");
      expect(screen.getByTestId("search").textContent).toBe("other-tab");
    });

    it("falls back to defaults when another tab writes an off-schema value", () => {
      function FilterHarness() {
        const [filters] = useFilterState<Filters>(
          "test.sync.invalid",
          filtersSchema,
          DEFAULT_FILTERS,
        );
        return React.createElement("span", { "data-testid": "status" }, filters.status);
      }

      render(React.createElement(FilterHarness));

      writeFromAnotherTab("test.sync.invalid", { status: "deleted-role", search: "x" });

      expect(screen.getByTestId("status").textContent).toBe("all");
    });

    it("ignores storage events originating from sessionStorage", () => {
      function FilterHarness() {
        const [filters] = useFilterState<Filters>(
          "test.sync.session-storage",
          filtersSchema,
          DEFAULT_FILTERS,
        );
        return React.createElement("span", { "data-testid": "status" }, filters.status);
      }

      render(React.createElement(FilterHarness));
      const storageKey = uiStateStorageKey("test.sync.session-storage");
      const newValue = JSON.stringify({
        v: UI_STATE_VERSION,
        updatedAt: Date.now(),
        value: { status: "paused", search: "wrong-area" },
      });
      localStorage.setItem(storageKey, newValue);

      act(() => {
        window.dispatchEvent(
          new StorageEvent("storage", {
            key: storageKey,
            newValue,
            storageArea: window.sessionStorage,
          }),
        );
      });

      expect(screen.getByTestId("status").textContent).toBe("all");
    });

    it("synchronises usePreference values across tabs", () => {
      const allowed = ["overview", "analytics"];

      function PreferenceHarness() {
        const [tab] = usePreference<string>("stormsale.sync.tab", "overview", (value) =>
          allowed.includes(value),
        );
        return React.createElement("span", { "data-testid": "tab" }, tab);
      }

      render(React.createElement(PreferenceHarness));
      expect(screen.getByTestId("tab").textContent).toBe("overview");

      const storageKey = "stormsale.sync.tab";
      const newValue = JSON.stringify({
        v: UI_STATE_VERSION,
        updatedAt: Date.now(),
        value: "analytics",
      });
      localStorage.setItem(storageKey, newValue);
      act(() => {
        window.dispatchEvent(new StorageEvent("storage", { key: storageKey, newValue }));
      });

      expect(screen.getByTestId("tab").textContent).toBe("analytics");

      // An invalid value from another tab is evicted, not rendered.
      const invalidValue = JSON.stringify({
        v: UI_STATE_VERSION,
        updatedAt: Date.now(),
        value: "disallowed-tab",
      });
      localStorage.setItem(storageKey, invalidValue);
      act(() => {
        window.dispatchEvent(
          new StorageEvent("storage", { key: storageKey, newValue: invalidValue }),
        );
      });

      expect(screen.getByTestId("tab").textContent).toBe("overview");
      expect(localStorage.getItem(storageKey)).toBeNull();
    });
  });
});
