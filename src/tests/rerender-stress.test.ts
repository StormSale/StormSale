// @vitest-environment jsdom
/**
 * Re-render stress tests for the Soroban event stream (Issue #498).
 *
 * During high-volume sales contract events arrive at 50+ per second. These
 * tests drive the event provider and `useSorobanEvents` at that rate and count
 * renders to check that:
 *   - components that do not read the stream (static navigation, memoised
 *     charts, action-only consumers) do not re-render;
 *   - each event produces one render, because React batches the several state
 *     updates it causes (automatic batching), and a burst in one tick produces
 *     a single render;
 *   - the stream engine is created once, however often callers re-render.
 *
 * The engine is replaced by a fake that the tests drive directly, so no
 * network or real timers are involved. Written with `createElement` so the
 * file can keep the `.ts` name the issue's verification command uses.
 */
import {
  createElement as h,
  memo,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SorobanEventEngineOptions, SorobanStreamEvent } from "../lib/sorobanEvents";
import {
  SorobanEventsProvider,
  useSorobanEventsActions,
  useSorobanEventsContext,
} from "../context/SorobanEventsContext";
import { useSorobanEvents } from "../hooks/useSorobanEvents";

interface FakeEngineRecord {
  options: SorobanEventEngineOptions;
  stopped: boolean;
}

const engines = vi.hoisted(() => ({ created: [] as FakeEngineRecord[] }));

vi.mock("../lib/sorobanEvents", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/sorobanEvents")>();
  class FakeEngine {
    private record: FakeEngineRecord;
    constructor(options: SorobanEventEngineOptions) {
      this.record = { options, stopped: false };
      engines.created.push(this.record);
    }
    start() {}
    stop() {
      this.record.stopped = true;
    }
    reconnect() {}
    async poll() {}
  }
  return { ...actual, SorobanEventStreamEngine: FakeEngine };
});

// A fresh `showNotification` and a fresh endpoint object on every call: the
// provider must not restart its engine when these identities change.
vi.mock("../context/NotificationContext", () => ({
  useNotification: () => ({
    showNotification: () => "",
    notifications: [],
    dismissNotification: () => {},
    notifyLowEscrowBalance: () => "",
    checkEscrowBalances: () => {},
    clearAllNotifications: () => {},
  }),
}));
vi.mock("../context/Web3Context", () => ({
  useWeb3: () => ({ activeRpcEndpoint: { url: "https://rpc.test" } }),
}));

const EVENTS_PER_SECOND = 50;
const TICK_MS = 1000 / EVENTS_PER_SECOND;

let sequence = 0;
function makeEvent(topicName = "log_sale"): SorobanStreamEvent {
  sequence += 1;
  return {
    id: `evt-${sequence}`,
    type: "contract",
    ledger: 1000 + sequence,
    ledgerClosedAt: new Date(sequence * TICK_MS).toISOString(),
    contractId: "CTESTCONTRACT",
    topic: [topicName],
    value: { amount: sequence },
    topicName,
  };
}

function latestEngine(): FakeEngineRecord {
  const engine = engines.created[engines.created.length - 1];
  if (!engine) throw new Error("no stream engine was created");
  return engine;
}

/**
 * Emit `EVENTS_PER_SECOND` events per second for `seconds`, one per timer tick.
 * Each tick is its own task, as real RPC callbacks are, so React commits once
 * per tick.
 */
function streamEvents(seconds: number, topicName?: string) {
  const timer = setInterval(() => latestEngine().options.onEvent?.(makeEvent(topicName)), TICK_MS);
  for (let tick = 0; tick < seconds * EVENTS_PER_SECOND; tick += 1) {
    act(() => {
      vi.advanceTimersByTime(TICK_MS);
    });
  }
  clearInterval(timer);
}

/** Emit `count` events within a single task. */
function burst(count: number) {
  act(() => {
    for (let i = 0; i < count; i += 1) latestEngine().options.onEvent?.(makeEvent());
  });
}

const renders: Record<string, number> = {};
function countRender(name: string) {
  renders[name] = (renders[name] ?? 0) + 1;
}

/** Values captured during render, read back by the assertions. */
const captured: Record<string, unknown[]> = {};
function capture(name: string, value: unknown) {
  (captured[name] ??= []).push(value);
}
function lastCaptured<T>(name: string): T {
  const values = captured[name] ?? [];
  return values[values.length - 1] as T;
}

// ── test components ─────────────────────────────────────────────────────────

/** Static navigation: rendered inside the provider but never reads the stream. */
function StaticNav() {
  countRender("nav");
  return h("nav", { "aria-label": "Main" }, "Dashboard · Campaigns · Payouts");
}

interface ChartProps {
  series: number[];
  onSelect: (point: number) => void;
}

/** A memoised chart whose props come from `useMemo` / `useCallback`. */
const RevenueChart = memo(function RevenueChart({ series }: ChartProps) {
  countRender("chart");
  return h("figure", null, series.join(","));
});

/** The same chart without memoisation, to show the counters catch re-renders. */
function UnmemoisedChart({ series }: ChartProps) {
  countRender("unmemoisedChart");
  return h("figure", null, series.join(","));
}

/** A dashboard panel that reads the live stream. */
function LiveSalesPanel() {
  countRender("dashboard");
  const { events, lastLedger } = useSorobanEventsContext();
  const series = useMemo(() => [12, 18, 9, 22], []);
  const onSelect = useCallback(() => {}, []);
  return h(
    "section",
    null,
    h("output", { "aria-label": "Event count" }, String(events.length)),
    h("output", { "aria-label": "Last ledger" }, String(lastLedger)),
    h(RevenueChart, { series, onSelect }),
  );
}

/** Only subscribes to a topic; must not re-render per event. */
function SaleCounter({ onSale }: { onSale: (event: SorobanStreamEvent) => void }) {
  countRender("actionsOnly");
  const { subscribeToTopic } = useSorobanEventsActions();
  useEffect(() => subscribeToTopic("log_sale", onSale), [subscribeToTopic, onSale]);
  return h("span", null, "sales");
}

function renderDashboard(extra: ReactNode = null) {
  return render(
    h(
      SorobanEventsProvider,
      { contractIdOverride: "CTESTCONTRACT" },
      h(StaticNav),
      h(LiveSalesPanel),
      extra,
    ),
  );
}

beforeEach(() => {
  vi.useFakeTimers();
  engines.created = [];
  sequence = 0;
  for (const key of Object.keys(renders)) delete renders[key];
  for (const key of Object.keys(captured)) delete captured[key];
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

// ── provider ────────────────────────────────────────────────────────────────

describe("SorobanEventsProvider at 50 events/sec", () => {
  it("re-renders only the components that read the stream", () => {
    renderDashboard();
    expect(renders).toEqual({ nav: 1, dashboard: 1, chart: 1 });

    streamEvents(1);

    expect(screen.getByLabelText("Event count").textContent).toBe("50");
    expect(screen.getByLabelText("Last ledger").textContent).toBe("1050");
    expect(renders.dashboard).toBe(1 + 50); // one render per event
    expect(renders.nav).toBe(1); // static navigation untouched
    expect(renders.chart).toBe(1); // memoised chart with stable props untouched
  });

  it("keeps a single stream engine while events and parent providers churn", () => {
    renderDashboard();
    streamEvents(2);

    expect(engines.created).toHaveLength(1);
    expect(latestEngine().stopped).toBe(false);
  });

  it("does not re-render action-only consumers, yet delivers every topic event", () => {
    const onSale = vi.fn();
    renderDashboard(h(SaleCounter, { onSale }));

    streamEvents(1);

    expect(onSale).toHaveBeenCalledTimes(50);
    expect(renders.actionsOnly).toBe(1);
  });

  it("would catch a child that is not memoised", () => {
    function PanelWithUnmemoisedChart() {
      const { events } = useSorobanEventsContext();
      return h(
        "div",
        null,
        String(events.length),
        h(UnmemoisedChart, { series: [1, 2, 3], onSelect: () => {} }),
      );
    }
    render(h(SorobanEventsProvider, null, h(PanelWithUnmemoisedChart)));

    streamEvents(1);

    expect(renders.unmemoisedChart).toBe(1 + 50);
  });

  it("does not re-render memoised consumers when only a parent re-renders", () => {
    const MemoPanel = memo(function MemoPanel() {
      countRender("memoPanel");
      const { status } = useSorobanEventsContext();
      return h("span", null, status);
    });
    function Shell() {
      const [, setTick] = useState(0);
      capture("bumpParent", () => setTick((t) => t + 1));
      countRender("shell");
      return h(SorobanEventsProvider, null, h(MemoPanel));
    }
    render(h(Shell));

    for (let i = 0; i < 10; i += 1) {
      act(() => lastCaptured<() => void>("bumpParent")());
    }

    expect(renders.shell).toBe(11);
    expect(renders.memoPanel).toBe(1); // the context value kept its identity
    expect(engines.created).toHaveLength(1);
  });
});

// ── automatic batching ──────────────────────────────────────────────────────

describe("automatic batching of stream updates", () => {
  it("commits each event's state updates together, never a half-applied event", () => {
    function Consistency() {
      const { events, lastLedger } = useSorobanEventsContext();
      countRender("consistency");
      capture("seen", `${events.length}:${lastLedger}`);
      return null;
    }
    render(h(SorobanEventsProvider, null, h(Consistency)));

    streamEvents(1);

    // `setEvents` and `setLastLedger` run separately for every event, yet each
    // tick commits once and the two values always move together.
    expect(renders.consistency).toBe(1 + 50);
    expect((captured.seen ?? []).slice(1)).toEqual(
      Array.from({ length: 50 }, (_, i) => `${i + 1}:${1001 + i}`),
    );
  });

  it("collapses a burst of 50 events in one task into a single render", () => {
    renderDashboard();

    burst(50);

    expect(renders.dashboard).toBe(2);
    expect(screen.getByLabelText("Event count").textContent).toBe("50");
    expect(screen.getByLabelText("Last ledger").textContent).toBe("1050");
  });
});

// ── useSorobanEvents hook ───────────────────────────────────────────────────

describe("useSorobanEvents at 50 events/sec", () => {
  it("keeps one engine with inline callbacks and filters, and calls the latest callback", () => {
    const received: string[] = [];
    function Feed({ label }: { label: string }) {
      countRender("feed");
      const { events } = useSorobanEvents({
        contractId: "CTESTCONTRACT",
        topicFilters: ["log_sale", "claim_payout"], // new array every render
        onEvent: (event) => received.push(`${label}:${event.id}`), // new function every render
      });
      return h("output", { "aria-label": "Feed count" }, String(events.length));
    }
    const { rerender } = render(h(Feed, { label: "first" }));

    streamEvents(1);
    rerender(h(Feed, { label: "second" }));
    burst(1);

    expect(engines.created).toHaveLength(1);
    expect(screen.getByLabelText("Feed count").textContent).toBe("51");
    expect(received).toHaveLength(51);
    expect(received[49]).toBe("first:evt-50");
    expect(received[50]).toBe("second:evt-51"); // the newest callback, no restart
  });

  it("restarts the engine when the topic filters really change", () => {
    function Feed({ topics }: { topics: string[] }) {
      useSorobanEvents({ topicFilters: topics });
      return null;
    }
    const { rerender } = render(h(Feed, { topics: ["log_sale"] }));
    rerender(h(Feed, { topics: ["log_sale"] }));
    expect(engines.created).toHaveLength(1);

    rerender(h(Feed, { topics: ["claim_payout"] }));
    expect(engines.created).toHaveLength(2);
    expect(engines.created[0].stopped).toBe(true);
    expect(engines.created[1].options.topicFilters).toEqual(["claim_payout"]);
  });

  it("keeps only the newest 100 events after sustained load", () => {
    function Feed() {
      capture("events", useSorobanEvents().events);
      return null;
    }
    render(h(Feed));

    streamEvents(3); // 150 events

    const latest = lastCaptured<SorobanStreamEvent[]>("events");
    expect(latest).toHaveLength(100);
    expect(latest[0].id).toBe("evt-150");
    expect(latest[99].id).toBe("evt-51");
  });

  it("returns a stable object between events so memoised children can skip work", () => {
    function Feed() {
      const [, setTick] = useState(0);
      capture("results", useSorobanEvents());
      return h("button", { type: "button", onClick: () => setTick((t) => t + 1) }, "re-render");
    }
    render(h(Feed));

    act(() => screen.getByRole("button").click());
    const results = captured.results ?? [];
    expect(results).toHaveLength(2);
    expect(results[1]).toBe(results[0]); // nothing changed, same object

    burst(1);
    expect(results[2]).not.toBe(results[1]); // a new event produces a new object
  });
});
