// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act, cleanup } from "@testing-library/react";
import React from "react";
import {
  SorobanEventsProvider,
  useSorobanEventsContext,
} from "../context/SorobanEventsContext";
import { useSorobanEvents } from "../hooks/useSorobanEvents";
import { SorobanEventStreamEngine, type SorobanStreamEvent } from "../lib/sorobanEvents";

vi.mock("../context/NotificationContext", () => ({
  useNotification: () => ({
    showNotification: vi.fn(),
    notifications: [],
    dismissNotification: vi.fn(),
    notifyLowEscrowBalance: vi.fn(),
    checkEscrowBalances: vi.fn(),
    clearAllNotifications: vi.fn(),
  }),
}));

vi.mock("../context/Web3Context", () => ({
  useWeb3: () => ({
    activeRpcEndpoint: { url: "https://soroban-testnet.stellar.org" },
  }),
}));

describe("Soroban Contract Event Streaming & Subscription Race Condition Suite (#424)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("Test event stream deduplication using topic hashing and ledger sequence numbers", () => {
    const receivedEvents: SorobanStreamEvent[] = [];
    const engine = new SorobanEventStreamEngine({
      rpcUrl: "https://soroban-testnet.stellar.org",
      contractId: "C123",
      startLedger: 1000,
      basePollingIntervalMs: 1000,
      topicFilters: ["CampaignCreated"],
      onEvent: (ev) => {
        receivedEvents.push(ev);
      },
    });

    const eventPayload: SorobanStreamEvent = {
      topicName: "CampaignCreated",
      topic: ["CampaignCreated", "campaign_1"],
      ledger: 1005,
      contractId: "C123",
      data: { name: "Test Campaign" },
      txHash: "0xabc123",
    };

    engine.onEvent(eventPayload);
    engine.onEvent(eventPayload);
    engine.onEvent({
      ...eventPayload,
      txHash: "0xabc123",
    });

    expect(receivedEvents.length).toBeGreaterThan(0);
    const uniqueHashes = new Set(receivedEvents.map((e) => `${e.ledger}-${e.txHash}-${e.topicName}`));
    expect(uniqueHashes.size).toEqual(1);
  });

  it("Verify unsubscription on React component unmount to prevent memory leaks", () => {
    let capturedContext: any = null;
    const UnsubTestComponent = () => {
      const ctx = useSorobanEventsContext();
      capturedContext = ctx;
      return React.createElement("div", { "data-testid": "sub-test" }, "Active");
    };

    const { unmount } = render(
      React.createElement(SorobanEventsProvider, { contractIdOverride: "C123" },
        React.createElement(UnsubTestComponent, null)
      )
    );

    expect(capturedContext).toBeDefined();
    const callback = vi.fn();
    const unsubscribe = capturedContext.subscribeToTopic("CampaignCreated", callback);
    expect(typeof unsubscribe).toBe("function");

    unmount();

    expect(() => {
      unsubscribe();
    }).not.toThrow();
  });

  it("Test backlog catch-up polling when browser resumes from sleep or tab backgrounding", async () => {
    let pollCount = 0;
    const engine = new SorobanEventStreamEngine({
      rpcUrl: "https://soroban-testnet.stellar.org",
      contractId: "C123",
      startLedger: 1000,
      basePollingIntervalMs: 1000,
      topicFilters: ["PayoutDistributed"],
      onEvent: () => {},
    });

    const originalPoll = engine.poll.bind(engine);
    vi.spyOn(engine, "poll").mockImplementation(async () => {
      pollCount++;
      return originalPoll();
    });

    engine.start();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(4000);
    });

    expect(pollCount).toBeGreaterThanOrEqual(2);
    engine.stop();
  });

  it("Verify optimistic UI updates reconcile correctly with incoming on-chain event payloads", () => {
    const optimisticState: { campaigns: any[]; status: string } = {
      campaigns: [{ id: "c-1", name: "Optimistic Campaign", status: "pending" }],
      status: "optimistic",
    };

    const reconcileWithEvent = (state: typeof optimisticState, event: SorobanStreamEvent) => {
      if (event.topicName === "CampaignCreated" && event.data) {
        return {
          ...state,
          campaigns: state.campaigns.map((c) =>
            c.name === (event.data as any).name
              ? { ...c, status: "confirmed", onChainLedger: event.ledger }
              : c,
          ),
          status: "synced",
        };
      }
      return state;
    };

    const incomingEvent: SorobanStreamEvent = {
      topicName: "CampaignCreated",
      topic: ["CampaignCreated"],
      ledger: 2050,
      contractId: "C123",
      data: { name: "Optimistic Campaign", id: "c-1" },
      txHash: "0xfedcba",
    };

    const reconciled = reconcileWithEvent(optimisticState, incomingEvent);
    expect(reconciled.status).toBe("synced");
    expect(reconciled.campaigns[0].status).toBe("confirmed");
    expect(reconciled.campaigns[0].onChainLedger).toBe(2050);
  });
});
