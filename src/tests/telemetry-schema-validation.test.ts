import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  TelemetryEventSchema,
  validateTelemetryEvent,
  TelemetryBatchQueue,
  type TelemetryEvent,
} from "../lib/telemetryEventSchema";

describe("Issue #482: Telemetry event schema validation and error reporting tests", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("Telemetry Event Schema Validation Using Zod", () => {
    it("successfully validates compliant telemetry events", () => {
      expect(TelemetryEventSchema).toBeDefined();
      const validEvent: TelemetryEvent = {
        id: "evt_123456",
        name: "fraud_anomaly_detected",
        category: "fraud",
        timestamp: "2026-11-21T20:00:00.000Z",
        properties: {
          riskScore: 85,
          factor: "BURST_VELOCITY_ANOMALY",
        },
        context: {
          sessionId: "sess_abc",
          userId: "GAA...123",
        },
        severity: "critical",
      };

      const result = validateTelemetryEvent(validEvent);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.name).toBe("fraud_anomaly_detected");
        expect(result.data.category).toBe("fraud");
        expect(result.data.severity).toBe("critical");
      }
    });

    it("rejects telemetry events missing required fields (id, name, category, timestamp)", () => {
      const missingFields = {
        category: "interaction",
        properties: { clickTarget: "submit_btn" },
      };

      const result = validateTelemetryEvent(missingFields);
      expect(result.success).toBe(false);
      if (!result.success) {
        const errorPaths = result.errors.map((e) => e.path.join("."));
        expect(errorPaths).toContain("id");
        expect(errorPaths).toContain("name");
        expect(errorPaths).toContain("timestamp");
      }
    });

    it("rejects events with invalid category enums", () => {
      const invalidCategory = {
        id: "evt_invalid_cat",
        name: "test_event",
        category: "UNKNOWN_CATEGORY",
        timestamp: Date.now(),
      };

      const result = validateTelemetryEvent(invalidCategory);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.message).toContain("category");
      }
    });

    it("prevents corrupted events from entering the analytics queue and invokes error reporter", () => {
      const onError = vi.fn();
      const queue = new TelemetryBatchQueue({ onError });

      const malformedEvent = {
        id: 12345, // invalid type: should be string
        name: "", // empty string
        category: "fraud",
      };

      const enqueued = queue.enqueue(malformedEvent);
      expect(enqueued).toBe(false);
      expect(queue.getQueueLength()).toBe(0);
      expect(onError).toHaveBeenCalledTimes(1);

      queue.destroy();
    });
  });

  describe("Batch Dispatch Queue Flushing Every 5s or Upon 20 Accumulated Events", () => {
    it("flushes automatically when 20 accumulated events threshold is reached", async () => {
      const onDispatch = vi.fn();
      const queue = new TelemetryBatchQueue({
        batchSize: 20,
        flushIntervalMs: 5000,
        onDispatch,
      });

      // Enqueue 19 events: should not flush yet
      for (let i = 1; i <= 19; i++) {
        queue.enqueue({
          id: `evt_${i}`,
          name: "button_click",
          category: "interaction",
          timestamp: Date.now(),
          properties: { index: i },
        });
      }

      expect(queue.getQueueLength()).toBe(19);
      expect(onDispatch).not.toHaveBeenCalled();

      // Enqueue 20th event: triggers immediate batch flush
      queue.enqueue({
        id: "evt_20",
        name: "button_click",
        category: "interaction",
        timestamp: Date.now(),
        properties: { index: 20 },
      });

      expect(queue.getQueueLength()).toBe(0);
      expect(onDispatch).toHaveBeenCalledTimes(1);

      const dispatchedBatch: TelemetryEvent[] = onDispatch.mock.calls[0][0];
      expect(dispatchedBatch.length).toBe(20);
      expect(dispatchedBatch[0].id).toBe("evt_1");
      expect(dispatchedBatch[19].id).toBe("evt_20");

      queue.destroy();
    });

    it("flushes automatically every 5 seconds when queue contains accumulated events", () => {
      vi.useFakeTimers();
      const onDispatch = vi.fn();

      const queue = new TelemetryBatchQueue({
        batchSize: 20,
        flushIntervalMs: 5000,
        onDispatch,
      });

      // Enqueue 5 events (< 20)
      for (let i = 1; i <= 5; i++) {
        queue.enqueue({
          id: `evt_timed_${i}`,
          name: "page_view",
          category: "navigation",
          timestamp: Date.now(),
        });
      }

      expect(queue.getQueueLength()).toBe(5);
      expect(onDispatch).not.toHaveBeenCalled();

      // Advance time by 4.9 seconds: should not flush yet
      vi.advanceTimersByTime(4900);
      expect(onDispatch).not.toHaveBeenCalled();

      // Advance past 5000ms: flushes accumulated batch
      vi.advanceTimersByTime(200);
      expect(onDispatch).toHaveBeenCalledTimes(1);
      expect(queue.getQueueLength()).toBe(0);

      queue.destroy();
    });
  });

  describe("Beacon API (navigator.sendBeacon) Usage During Page Unload", () => {
    it("dispatches pending events via navigator.sendBeacon during page unload", () => {
      const sendBeaconMock = vi.fn().mockReturnValue(true);
      Object.defineProperty(navigator, "sendBeacon", {
        value: sendBeaconMock,
        writable: true,
        configurable: true,
      });

      const queue = new TelemetryBatchQueue({
        endpoint: "/api/telemetry/unload",
      });

      queue.enqueue({
        id: "evt_unload_1",
        name: "session_end",
        category: "navigation",
        timestamp: Date.now(),
      });

      expect(queue.getQueueLength()).toBe(1);

      // Simulate window beforeunload event
      window.dispatchEvent(new Event("beforeunload"));

      expect(sendBeaconMock).toHaveBeenCalledTimes(1);
      const [endpoint, payload] = sendBeaconMock.mock.calls[0];
      expect(endpoint).toBe("/api/telemetry/unload");

      const parsed = JSON.parse(payload as string);
      expect(parsed.events.length).toBe(1);
      expect(parsed.events[0].id).toBe("evt_unload_1");
      expect(queue.getQueueLength()).toBe(0);

      queue.destroy();
    });

    it("handles visibilitychange to hidden as page unload trigger", () => {
      const sendBeaconMock = vi.fn().mockReturnValue(true);
      Object.defineProperty(navigator, "sendBeacon", {
        value: sendBeaconMock,
        writable: true,
        configurable: true,
      });

      Object.defineProperty(document, "visibilityState", {
        value: "hidden",
        writable: true,
        configurable: true,
      });

      const queue = new TelemetryBatchQueue({
        endpoint: "/api/telemetry/visibility",
      });

      queue.enqueue({
        id: "evt_hidden_1",
        name: "tab_backgrounded",
        category: "interaction",
        timestamp: Date.now(),
      });

      document.dispatchEvent(new Event("visibilitychange"));

      expect(sendBeaconMock).toHaveBeenCalledTimes(1);
      expect(queue.getQueueLength()).toBe(0);

      queue.destroy();
    });
  });
});
