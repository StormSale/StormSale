import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  computeExponentialBackoff,
  parseEventTopicName,
  filterMatchingEvents,
  SorobanEventStreamEngine,
  type SorobanStreamEvent,
} from "../lib/sorobanEvents";

describe("Soroban RPC Event Streaming with Reconnection & Backoff Engine (#123)", () => {
  describe("Exponential Backoff Computations", () => {
    it("returns initial backoff for 0 retries", () => {
      expect(computeExponentialBackoff(0, 1000, 30000)).toBe(1000);
    });

    it("doubles backoff interval exponentially with each retry", () => {
      expect(computeExponentialBackoff(1, 1000, 30000)).toBe(2000);
      expect(computeExponentialBackoff(2, 1000, 30000)).toBe(4000);
      expect(computeExponentialBackoff(3, 1000, 30000)).toBe(8000);
      expect(computeExponentialBackoff(4, 1000, 30000)).toBe(16000);
    });

    it("caps backoff at maxBackoffMs (30s)", () => {
      expect(computeExponentialBackoff(5, 1000, 30000)).toBe(30000);
      expect(computeExponentialBackoff(10, 1000, 30000)).toBe(30000);
    });
  });

  describe("Topic Parsing and Filtering", () => {
    it("identifies standard topics create_campaign, log_sale, claim_payout", () => {
      expect(parseEventTopicName(["contract_call", "create_campaign"])).toBe("create_campaign");
      expect(parseEventTopicName(["log_sale", "affiliate_001"])).toBe("log_sale");
      expect(parseEventTopicName(["claim_payout", "settled"])).toBe("claim_payout");
    });

    it("returns fallback topic if no standard filter matches", () => {
      expect(parseEventTopicName(["custom_admin_event"])).toBe("custom_admin_event");
      expect(parseEventTopicName([])).toBeUndefined();
    });

    it("filters matching events according to configured topics", () => {
      const mockEvents: SorobanStreamEvent[] = [
        {
          id: "1",
          type: "contract",
          ledger: 100,
          ledgerClosedAt: new Date().toISOString(),
          contractId: "C123",
          topic: ["create_campaign"],
          value: {},
          topicName: "create_campaign",
        },
        {
          id: "2",
          type: "contract",
          ledger: 101,
          ledgerClosedAt: new Date().toISOString(),
          contractId: "C123",
          topic: ["unrelated_topic"],
          value: {},
          topicName: "unrelated_topic",
        },
        {
          id: "3",
          type: "contract",
          ledger: 102,
          ledgerClosedAt: new Date().toISOString(),
          contractId: "C123",
          topic: ["claim_payout"],
          value: {},
          topicName: "claim_payout",
        },
      ];

      const filtered = filterMatchingEvents(mockEvents, ["create_campaign", "claim_payout"]);
      expect(filtered).toHaveLength(2);
      expect(filtered.map((e) => e.id)).toEqual(["1", "3"]);
    });
  });

  describe("SorobanEventStreamEngine Lifecycle", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
      vi.restoreAllMocks();
    });

    it("polls RPC, dispatches events and triggers re-validation on success", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          result: {
            events: [
              {
                id: "ev-100",
                ledger: 500,
                topic: ["create_campaign"],
                value: { campaignId: 1 },
              },
            ],
          },
        }),
      });

      const onEvent = vi.fn();
      const onStatusChange = vi.fn();
      const onRevalidate = vi.fn();

      const engine = new SorobanEventStreamEngine({
        rpcUrl: "https://mock-soroban.stellar.org",
        fetchFn: mockFetch as any,
        onEvent,
        onStatusChange,
        onRevalidate,
        basePollingIntervalMs: 2000,
      });

      engine.start();
      await vi.advanceTimersByTimeAsync(10);

      expect(mockFetch).toHaveBeenCalledWith(
        "https://mock-soroban.stellar.org",
        expect.objectContaining({
          method: "POST",
          body: expect.stringContaining("getEvents"),
        }),
      );

      expect(engine.getStatus()).toBe("Connected");
      expect(onEvent).toHaveBeenCalledTimes(1);
      expect(onRevalidate).toHaveBeenCalledTimes(1);

      engine.stop();
    });

    it("transitions to Reconnecting on network failure and applies exponential backoff", async () => {
      const mockFetch = vi.fn().mockRejectedValue(new Error("RPC Timeout"));

      const onStatusChange = vi.fn();

      const engine = new SorobanEventStreamEngine({
        rpcUrl: "https://failing-soroban.stellar.org",
        fetchFn: mockFetch as any,
        onStatusChange,
        initialBackoffMs: 1000,
        basePollingIntervalMs: 2000,
      });

      engine.start();
      await vi.advanceTimersByTimeAsync(10);

      expect(engine.getStatus()).toBe("Reconnecting");
      expect(engine.getRetryCount()).toBe(1);

      // Reconnect resets retry count and triggers immediate poll
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ result: { events: [] } }),
      });

      engine.reconnect();
      await vi.advanceTimersByTimeAsync(10);
      expect(engine.getStatus()).toBe("Connected");
      expect(engine.getRetryCount()).toBe(0);

      engine.stop();
    });
  });
});
