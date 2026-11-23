// @vitest-environment jsdom
import { Buffer } from "buffer";
globalThis.Buffer = Buffer;

import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import {
  calculatePercentile,
  calculateLatencyMetrics,
  determineSlaStatusTier,
  calculate30DayUptime,
  generate30DayUptimeHistory,
  executeRpcPing,
  SlaMonitorManager,
  type DailyUptimeRecord,
} from "../lib/slaMonitoring";
import { EnterpriseSlaWidget } from "../components/b2b/EnterpriseSlaWidget";

describe("Enterprise SLA Monitoring Widget & RPC Latency Ping Tests (#441)", () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  // =========================================================================
  // ACCEPTANCE CRITERIA 1: Periodic Latency Ping Calculation (P50, P95)
  // =========================================================================
  describe("Acceptance Criteria 1: Periodic Latency Ping Calculation (P50, P95)", () => {
    it("accurately computes P50 (median) and P95 (95th percentile) latencies across diverse samples", () => {
      // 10 evenly spaced latencies: 50, 100, 150, 200, 250, 300, 350, 400, 450, 500 ms
      const latencies = [50, 100, 150, 200, 250, 300, 350, 400, 450, 500];

      const p50 = calculatePercentile(latencies, 50);
      const p95 = calculatePercentile(latencies, 95);

      // Median of 10 items (index 4.5 between 250 and 300) = 275ms
      expect(p50).toBe(275);
      // P95 (index 8.55 between 450 and 500) = 477.5ms
      expect(p95).toBe(477.5);

      const metrics = calculateLatencyMetrics(latencies);
      expect(metrics.count).toBe(10);
      expect(metrics.min).toBe(50);
      expect(metrics.max).toBe(500);
      expect(metrics.avg).toBe(275);
      expect(metrics.p50).toBe(275);
      expect(metrics.p95).toBe(477.5);
    });

    it("handles outlier latency spikes correctly in P50 vs P95 metrics", () => {
      // Steady low-latency connection (20 samples ~60ms) with 2 severe network spikes (950ms, 1200ms)
      const latencies = [
        60, 62, 59, 61, 63, 60, 58, 62, 61, 60,
        64, 60, 59, 62, 61, 60, 58, 63, 60, 61,
        950, 1200,
      ];

      const metrics = calculateLatencyMetrics(latencies);

      // P50 should remain resilient and close to 60ms
      expect(metrics.p50).toBeLessThan(70);
      expect(metrics.p50).toBeGreaterThanOrEqual(58);

      // P95 must reflect the tail latency spike (> 800ms)
      expect(metrics.p95).toBeGreaterThanOrEqual(800);
    });

    it("gracefully handles boundary and edge case sample sets (empty, single, duplicates)", () => {
      expect(calculatePercentile([], 50)).toBe(0);
      expect(calculatePercentile([150], 50)).toBe(150);
      expect(calculatePercentile([150], 95)).toBe(150);
      expect(calculatePercentile([200, 200, 200, 200], 50)).toBe(200);
      expect(calculatePercentile([200, 200, 200, 200], 95)).toBe(200);

      const emptyMetrics = calculateLatencyMetrics([]);
      expect(emptyMetrics.count).toBe(0);
      expect(emptyMetrics.p50).toBe(0);
      expect(emptyMetrics.p95).toBe(0);
    });

    it("measures latency and extracts block height from Soroban JSON-RPC getLatestLedger endpoint", async () => {
      const mockSorobanResponse = {
        jsonrpc: "2.0",
        id: "ping_test",
        result: {
          id: "ledger_hash_abc123",
          protocolVersion: 20,
          sequence: 1294820,
        },
      };

      const mockFetch = vi.fn().mockImplementation(async () => {
        // Simulate 45ms network transit delay
        await new Promise((r) => setTimeout(r, 45));
        return {
          ok: true,
          status: 200,
          statusText: "OK",
          json: async () => mockSorobanResponse,
        };
      });

      const pingResult = await executeRpcPing(
        "https://soroban-testnet.stellar.org",
        "soroban",
        mockFetch as unknown as typeof fetch,
      );

      expect(pingResult.success).toBe(true);
      expect(pingResult.latencyMs).toBeGreaterThanOrEqual(40);
      expect(pingResult.blockHeight).toBe(1294820);
      expect(mockFetch).toHaveBeenCalledWith(
        "https://soroban-testnet.stellar.org",
        expect.objectContaining({
          method: "POST",
          body: expect.stringContaining("getLatestLedger"),
        }),
      );
    });

    it("measures latency and extracts block height from Horizon /fee_stats endpoint", async () => {
      const mockHorizonResponse = {
        last_ledger: "5423199",
        last_ledger_base_fee: "100",
        ledger_capacity_usage: "0.15",
      };

      const mockFetch = vi.fn().mockImplementation(async () => {
        await new Promise((r) => setTimeout(r, 25));
        return {
          ok: true,
          status: 200,
          statusText: "OK",
          json: async () => mockHorizonResponse,
        };
      });

      const pingResult = await executeRpcPing(
        "https://horizon-testnet.stellar.org",
        "horizon",
        mockFetch as unknown as typeof fetch,
      );

      expect(pingResult.success).toBe(true);
      expect(pingResult.latencyMs).toBeGreaterThanOrEqual(20);
      expect(pingResult.blockHeight).toBe(5423199);
      expect(mockFetch).toHaveBeenCalledWith(
        "https://horizon-testnet.stellar.org/fee_stats",
        expect.objectContaining({ method: "GET" }),
      );
    });

    it("records ping errors and marks sample unsuccessful on HTTP or network failure", async () => {
      const mockFailingFetch = vi.fn().mockImplementation(async () => ({
        ok: false,
        status: 504,
        statusText: "Gateway Timeout",
        json: async () => ({}),
      }));

      const pingResult = await executeRpcPing(
        "https://rpc-failing.stellar.org",
        "soroban",
        mockFailingFetch as unknown as typeof fetch,
      );

      expect(pingResult.success).toBe(false);
      expect(pingResult.error).toContain("504 Gateway Timeout");
    });

    it("maintains a rolling sample buffer and recalculates P50/P95 dynamically in SlaMonitorManager", () => {
      const manager = new SlaMonitorManager({ maxSamples: 5, initialBlockHeight: 1000 });

      // Add 6 samples to test FIFO window rollover
      const samples = [100, 120, 140, 160, 180, 200];
      for (const lat of samples) {
        manager.recordSample({
          id: `sample_${lat}`,
          endpoint: "https://soroban-testnet.stellar.org",
          endpointType: "soroban",
          latencyMs: lat,
          timestamp: Date.now(),
          success: true,
          blockHeight: 1000 + lat,
        });
      }

      // Max samples is 5, so first sample (100) should have dropped out
      const stored = manager.getSamples();
      expect(stored.length).toBe(5);
      expect(stored.map((s) => s.latencyMs)).toEqual([120, 140, 160, 180, 200]);

      const state = manager.getState();
      expect(state.p50).toBe(160);
      expect(state.p95).toBe(196);
      expect(state.blockHeight).toBe(1200);
      expect(state.isOffline).toBe(false);
    });
  });

  // =========================================================================
  // ACCEPTANCE CRITERIA 2: SLA Status Pill Updates (Green, Amber, Red)
  // =========================================================================
  describe("Acceptance Criteria 2: SLA Status Pill Updates (Green, Amber, Red)", () => {
    it("classifies Green tier for sub-200ms latency (<200ms)", () => {
      const fast = determineSlaStatusTier(85);
      expect(fast.tier).toBe("green");
      expect(fast.label).toBe("Optimal");
      expect(fast.colorClass).toContain("emerald");
      expect(fast.dotClass).toContain("bg-emerald-500");

      const borderlineGreen = determineSlaStatusTier(199);
      expect(borderlineGreen.tier).toBe("green");
    });

    it("classifies Amber tier for warning latency window (200ms - 800ms)", () => {
      const lowerAmber = determineSlaStatusTier(200);
      expect(lowerAmber.tier).toBe("amber");
      expect(lowerAmber.label).toBe("Elevated Latency");
      expect(lowerAmber.colorClass).toContain("amber");
      expect(lowerAmber.dotClass).toContain("bg-amber-500");

      const midAmber = determineSlaStatusTier(550);
      expect(midAmber.tier).toBe("amber");

      const upperAmber = determineSlaStatusTier(800);
      expect(upperAmber.tier).toBe("amber");
    });

    it("classifies Red tier for critical latency (>800ms) or offline endpoint", () => {
      const highLatency = determineSlaStatusTier(801);
      expect(highLatency.tier).toBe("red");
      expect(highLatency.label).toBe("Critical Latency");
      expect(highLatency.colorClass).toContain("rose");
      expect(highLatency.dotClass).toContain("bg-rose-500");

      const extremeLatency = determineSlaStatusTier(2500);
      expect(extremeLatency.tier).toBe("red");

      // Offline flag triggers Red tier regardless of prior latency
      const offline = determineSlaStatusTier(50, true);
      expect(offline.tier).toBe("red");
      expect(offline.label).toBe("Offline");

      // Null latency represents dropped connection
      const nullLatency = determineSlaStatusTier(null);
      expect(nullLatency.tier).toBe("red");
    });

    it("renders Green status pill in EnterpriseSlaWidget for optimal response time", () => {
      render(
        React.createElement(EnterpriseSlaWidget, {
          initialState: {
            currentLatencyMs: 145,
            isOffline: false,
            blockHeight: 1284560,
          },
        }),
      );

      const pill = screen.getByTestId("sla-status-pill");
      expect(pill.getAttribute("data-tier")).toBe("green");
      expect(pill.getAttribute("aria-label")).toContain("Optimal");
      expect(screen.getByText("145ms")).toBeDefined();
      expect(screen.getByText("Optimal")).toBeDefined();
      expect(screen.getByTestId("sla-block-height").textContent).toContain("L#1284560");
    });

    it("renders Amber status pill in EnterpriseSlaWidget for degraded response time", () => {
      render(
        React.createElement(EnterpriseSlaWidget, {
          initialState: {
            currentLatencyMs: 420,
            isOffline: false,
            blockHeight: 1284561,
          },
        }),
      );

      const pill = screen.getByTestId("sla-status-pill");
      expect(pill.getAttribute("data-tier")).toBe("amber");
      expect(pill.getAttribute("aria-label")).toContain("Elevated Latency");
      expect(screen.getByText("420ms")).toBeDefined();
      expect(screen.getByText("Elevated Latency")).toBeDefined();
    });

    it("renders Red status pill in EnterpriseSlaWidget for critical latency and offline state", () => {
      const { rerender } = render(
        React.createElement(EnterpriseSlaWidget, {
          initialState: {
            currentLatencyMs: 920,
            isOffline: false,
            blockHeight: 1284562,
          },
        }),
      );

      let pill = screen.getByTestId("sla-status-pill");
      expect(pill.getAttribute("data-tier")).toBe("red");
      expect(screen.getByText("920ms")).toBeDefined();
      expect(screen.getByText("Critical Latency")).toBeDefined();

      // Rerender as offline
      rerender(
        React.createElement(EnterpriseSlaWidget, {
          initialState: {
            currentLatencyMs: null,
            isOffline: true,
            blockHeight: 1284562,
          },
        }),
      );

      pill = screen.getByTestId("sla-status-pill");
      expect(pill.getAttribute("data-tier")).toBe("red");
      expect(screen.getByText("RPC Offline")).toBeDefined();
      expect(screen.getByText("Offline")).toBeDefined();
    });
  });

  // =========================================================================
  // ACCEPTANCE CRITERIA 3: Tooltip Rendering Historical Uptime (Last 30 Days)
  // =========================================================================
  describe("Acceptance Criteria 3: Tooltip Rendering Historical Uptime (Last 30 Days)", () => {
    it("calculates 30-day aggregate uptime percentage correctly from daily history", () => {
      // 28 days of 100% and 2 days with minor degradation (99.0%)
      const records: DailyUptimeRecord[] = Array.from({ length: 30 }, (_, i) => ({
        date: `2026-11-${String(i + 1).padStart(2, "0")}`,
        uptimePercent: i === 10 || i === 20 ? 99.0 : 100.0,
        totalChecks: 1440,
        successfulChecks: i === 10 || i === 20 ? 1426 : 1440,
        incidentCount: i === 10 || i === 20 ? 1 : 0,
      }));

      // (28 * 100 + 2 * 99) / 30 = 2998 / 30 = 99.933%
      const uptime = calculate30DayUptime(records);
      expect(uptime).toBe(99.933);
    });

    it("generates exactly 30 chronological daily uptime records with ISO dates", () => {
      const history = generate30DayUptimeHistory(99.99, [5, 18]);
      expect(history).toHaveLength(30);

      // Verify date format YYYY-MM-DD
      for (const day of history) {
        expect(day.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(day.uptimePercent).toBeGreaterThanOrEqual(95);
        expect(day.uptimePercent).toBeLessThanOrEqual(100);
      }
    });

    it("renders the 30-day uptime tooltip containing 30 day bars and summary percentage", () => {
      const seededHistory = generate30DayUptimeHistory(99.98);

      render(
        React.createElement(EnterpriseSlaWidget, {
          defaultTooltipOpen: true,
          initialState: {
            currentLatencyMs: 120,
            p50: 115,
            p95: 160,
            blockHeight: 1284560,
            dailyUptimeHistory: seededHistory,
            uptime30DaysPercent: 99.98,
          },
        }),
      );

      // Tooltip element with role="tooltip"
      const tooltip = screen.getByRole("tooltip");
      expect(tooltip).toBeDefined();
      expect(tooltip.getAttribute("data-testid")).toBe("sla-uptime-tooltip");

      // Summary badge showing 30-day aggregate percentage
      const summary = screen.getByTestId("sla-30d-summary");
      expect(summary.textContent).toContain("99.980% 30d");

      // Breakdown metrics inside tooltip
      expect(screen.getByText("115ms")).toBeDefined(); // Current P50
      expect(screen.getByText("160ms")).toBeDefined(); // Tail P95
      expect(screen.getByText("#1284560")).toBeDefined(); // Block Height

      // 30 Timeline visualization bars
      const timeline = screen.getByTestId("sla-30d-timeline");
      expect(timeline).toBeDefined();

      for (let i = 0; i < 30; i++) {
        const bar = screen.getByTestId(`sla-day-bar-${i}`);
        expect(bar).toBeDefined();
        expect(bar.getAttribute("title")).toContain(seededHistory[i].date);
        expect(bar.getAttribute("title")).toContain("% uptime");
      }
    });

    it("toggles tooltip visibility upon user click interaction", () => {
      render(
        React.createElement(EnterpriseSlaWidget, {
          defaultTooltipOpen: false,
          showTooltipOnHover: false,
          initialState: {
            currentLatencyMs: 140,
            uptime30DaysPercent: 99.99,
          },
        }),
      );

      // Initially closed
      expect(screen.queryByRole("tooltip")).toBeNull();

      // Click to open
      const pill = screen.getByTestId("sla-status-pill");
      fireEvent.click(pill);

      expect(screen.getByRole("tooltip")).toBeDefined();
      expect(screen.getByTestId("sla-30d-summary")).toBeDefined();

      // Click again to close
      fireEvent.click(pill);
      expect(screen.queryByRole("tooltip")).toBeNull();
    });
  });
});
