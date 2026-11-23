// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, act, fireEvent } from "@testing-library/react";
import { EventStreamStatusPill } from "../components/shared/EventStreamStatusPill";
import {
  SorobanEventsProvider,
  useSorobanEventsContext,
} from "../context/SorobanEventsContext";
import { useSorobanEvents } from "../hooks/useSorobanEvents";

let capturedEngines: any[] = [];

vi.mock("../lib/sorobanEvents", async (importOriginal) => {
  const actual = await importOriginal<any>();
  class MockEngine extends actual.SorobanEventStreamEngine {
    constructor(options: any) {
      super(options);
      capturedEngines.push(options);
    }
  }
  return {
    ...actual,
    SorobanEventStreamEngine: MockEngine,
  };
});

const mockNotification = vi.fn();
vi.mock("../context/NotificationContext", () => ({
  useNotification: () => ({
    showNotification: mockNotification,
    notifications: [],
    dismissNotification: vi.fn(),
    notifyLowEscrowBalance: vi.fn(),
    checkEscrowBalances: vi.fn(),
    clearAllNotifications: vi.fn(),
  }),
}));

vi.mock("../context/Web3Context", () => ({
  useWeb3: () => ({
    activeRpcEndpoint: { url: "https://mock-rpc.stellar.org" },
  }),
}));

describe("Real-Time Soroban RPC Event Streaming UI & Context (#123)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    capturedEngines = [];
    mockNotification.mockReset();
  });

  it("renders EventStreamStatusPill standalone with graceful fallback", () => {
    render(<EventStreamStatusPill />);
    const pill = screen.getByTestId("event-stream-status-pill");
    expect(pill).toBeDefined();
    expect(screen.getByText("Connected")).toBeDefined();
  });

  it("renders inside SorobanEventsProvider and handles all event streams and revalidations", () => {
    let capturedCtx: any = null;
    const TestConsumer = () => {
      const ctx = useSorobanEventsContext();
      capturedCtx = ctx;
      return (
        <div>
          <span data-testid="status-val">{ctx.status}</span>
          <span data-testid="ledger-val">{ctx.lastLedger}</span>
          <span data-testid="events-count">{ctx.events.length}</span>
          <button onClick={() => ctx.reconnect()}>Reconnect</button>
        </div>
      );
    };

    render(
      <SorobanEventsProvider
        contractIdOverride="CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
        initialPollIntervalMs={1000}
      >
        <TestConsumer />
        <EventStreamStatusPill />
      </SorobanEventsProvider>,
    );

    expect(screen.getByTestId("status-val").textContent).toBe("Polling");

    const engine = capturedEngines[capturedEngines.length - 1];
    expect(engine).toBeDefined();

    // Register topic listener and revalidate listener
    const topicCallback = vi.fn();
    const unsubTopic = capturedCtx.subscribeToTopic("create_campaign", topicCallback);
    const revalCallback = vi.fn();
    const unsubReval = capturedCtx.registerRevalidateListener(revalCallback);

    // Dispatch events
    act(() => {
      engine.onEvent({
        topicName: "create_campaign",
        topic: ["create_campaign"],
        ledger: 100,
        contractId: "C1",
        data: {},
        txHash: "0x123",
      });
      engine.onEvent({
        topicName: "log_sale",
        topic: ["log_sale"],
        ledger: 101,
        contractId: "C1",
        data: {},
        txHash: "0x124",
      });
      engine.onEvent({
        topicName: "claim_payout",
        topic: ["claim_payout"],
        ledger: 102,
        contractId: "C1",
        data: {},
        txHash: "0x125",
      });
      engine.onEvent({
        topicName: "unknown_topic",
        topic: ["unknown_topic"],
        ledger: 103,
        contractId: "C1",
        data: {},
        txHash: "0x126",
      });
      engine.onStatusChange("Connected");
      engine.onRevalidate();
    });

    expect(topicCallback).toHaveBeenCalledTimes(1);
    expect(revalCallback).toHaveBeenCalledTimes(1);
    expect(mockNotification).toHaveBeenCalledTimes(4);
    expect(screen.getByTestId("events-count").textContent).toBe("4");
    expect(screen.getByTestId("ledger-val").textContent).toBe("103");

    // Click reconnect
    fireEvent.click(screen.getByText("Reconnect"));

    // Cleanup listeners
    unsubTopic();
    unsubReval();
  });

  it("useSorobanEvents hook handles events, status changes and reconnection", () => {
    let capturedHook: any = null;
    const onEventMock = vi.fn();
    const onRevalidateMock = vi.fn();

    const HookTester = () => {
      const hookData = useSorobanEvents({
        pollingIntervalMs: 1000,
        onEvent: onEventMock,
        onRevalidate: onRevalidateMock,
      });
      capturedHook = hookData;
      return (
        <div>
          <span data-testid="hook-status">{hookData.status}</span>
          <span data-testid="hook-events-count">{hookData.events.length}</span>
          <span data-testid="hook-ledger">{hookData.lastLedger}</span>
        </div>
      );
    };

    render(<HookTester />);
    const engine = capturedEngines[capturedEngines.length - 1];

    act(() => {
      engine.onEvent({
        topicName: "log_sale",
        topic: ["log_sale"],
        ledger: 500,
        contractId: "C1",
        data: {},
        txHash: "0x999",
      });
      engine.onStatusChange("Reconnecting");
    });

    expect(onEventMock).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("hook-status").textContent).toBe("Reconnecting");
    expect(screen.getByTestId("hook-events-count").textContent).toBe("1");
    expect(screen.getByTestId("hook-ledger").textContent).toBe("500");

    act(() => {
      capturedHook.reconnect();
      engine.onStatusChange("Connected");
    });

    expect(screen.getByTestId("hook-status").textContent).toBe("Connected");
  });
});
