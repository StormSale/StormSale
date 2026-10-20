import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";
import { SCHEMA_VERSION, readRaw, writeRaw, usePreference } from "../hooks/usePreference";

describe("Persistent UI & Filter State Cache (#73)", () => {
  let mockStorage: Record<string, string> = {};

  beforeEach(() => {
    mockStorage = {};
    const storageImpl = {
      getItem: (key: string) => mockStorage[key] ?? null,
      setItem: (key: string, val: string) => {
        mockStorage[key] = String(val);
      },
      removeItem: (key: string) => {
        delete mockStorage[key];
      },
      clear: () => {
        mockStorage = {};
      },
      length: 0,
      key: () => null,
    };
    vi.stubGlobal("window", { localStorage: storageImpl });
    vi.stubGlobal("localStorage", storageImpl);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("Low-level Storage Format & Versioning", () => {
    it("stores preferences wrapped with SCHEMA_VERSION = 1", () => {
      const key = "stormsale.test.tab";
      writeRaw(key, "analytics");

      const raw = mockStorage[key];
      expect(raw).toBeDefined();
      const parsed = JSON.parse(raw);
      expect(parsed.v).toBe(SCHEMA_VERSION);
      expect(parsed.value).toBe("analytics");
    });

    it("restores valid versioned preference", () => {
      const key = "stormsale.test.saved";
      mockStorage[key] = JSON.stringify({ v: SCHEMA_VERSION, value: "custom-value" });

      const retrieved = readRaw(key, "default-value");
      expect(retrieved).toBe("custom-value");
    });

    it("evicts stale schema version and falls back to default value", () => {
      const key = "stormsale.test.stale";
      mockStorage[key] = JSON.stringify({ v: 999, value: "old-shape" });

      const retrieved = readRaw(key, "default-fallback");
      expect(retrieved).toBe("default-fallback");
      // Stale entry should be evicted
      expect(mockStorage[key]).toBeUndefined();
    });

    it("handles corrupted non-JSON storage gracefully", () => {
      const key = "stormsale.test.corrupt";
      mockStorage[key] = "{invalid-json";

      const retrieved = readRaw(key, "safe-default");
      expect(retrieved).toBe("safe-default");
    });

    it("handles non-object parsed JSON entries safely", () => {
      const key = "stormsale.test.primitive";
      mockStorage[key] = JSON.stringify("plain-string-without-version");

      const retrieved = readRaw(key, "fallback");
      expect(retrieved).toBe("fallback");
    });

    it("preserves boolean false value correctly", () => {
      const key = "stormsale.test.bool";
      mockStorage[key] = JSON.stringify({ v: SCHEMA_VERSION, value: false });

      const retrieved = readRaw(key, true);
      expect(retrieved).toBe(false);
    });
  });

  describe("usePreference React Hook Integration", () => {
    function TestComponent({
      prefKey,
      defaultValue,
      validate,
    }: {
      prefKey: string;
      defaultValue: string;
      validate?: (v: string) => boolean;
    }) {
      const [value] = usePreference(prefKey, defaultValue, validate);
      return React.createElement("div", { id: "test-val" }, value);
    }

    it("renders default value when storage is empty", () => {
      const html = renderToString(
        React.createElement(TestComponent, {
          prefKey: "stormsale.render.empty",
          defaultValue: "initial-val",
        }),
      );
      expect(html).toContain("initial-val");
    });

    it("renders stored value when valid version exists", () => {
      const key = "stormsale.render.valid";
      mockStorage[key] = JSON.stringify({ v: SCHEMA_VERSION, value: "hydrated-val" });

      const html = renderToString(
        React.createElement(TestComponent, {
          prefKey: key,
          defaultValue: "fallback",
        }),
      );
      expect(html).toContain("hydrated-val");
    });

    it("falls back to default and evicts entry when validate returns false", () => {
      const key = "stormsale.render.invalid";
      mockStorage[key] = JSON.stringify({ v: SCHEMA_VERSION, value: "disallowed-tab" });

      const allowed = ["allowed-1", "allowed-2"];
      const html = renderToString(
        React.createElement(TestComponent, {
          prefKey: key,
          defaultValue: "allowed-1",
          validate: (v) => allowed.includes(v),
        }),
      );
      expect(html).toContain("allowed-1");
      expect(mockStorage[key]).toBeUndefined();
    });
  });
});
