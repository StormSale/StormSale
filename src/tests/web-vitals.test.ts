import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Metric } from "web-vitals";

const vitals = vi.hoisted(() => ({
  onCLS: vi.fn(),
  onINP: vi.fn(),
  onLCP: vi.fn(),
}));

vi.mock("web-vitals", () => vitals);

const metric = (overrides: Partial<Metric> = {}): Metric => ({
  name: "LCP",
  value: 2500,
  rating: "good",
  delta: 2500,
  id: "metric-id",
  entries: [],
  navigationType: "navigate",
  navigationId: 1,
  ...overrides,
});

function setNavigatorProperty(name: string, value: unknown): void {
  Object.defineProperty(navigator, name, { configurable: true, value });
}

function setViewportWidth(width: number): void {
  Object.defineProperty(window, "innerWidth", { configurable: true, value: width });
}

async function readBlob(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(blob);
  });
}

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  localStorage.clear();
  setViewportWidth(1280);
  setNavigatorProperty("doNotTrack", undefined);
  setNavigatorProperty("msDoNotTrack", undefined);
  setNavigatorProperty("globalPrivacyControl", undefined);
});

afterEach(() => {
  vi.unstubAllGlobals();
  for (const property of ["doNotTrack", "msDoNotTrack", "globalPrivacyControl", "sendBeacon"]) {
    Reflect.deleteProperty(navigator, property);
  }
});

describe("anonymous Web Vitals telemetry", () => {
  it("builds an allowlisted payload without URLs, identifiers, or attribution", async () => {
    const { buildWebVitalsPayload } = await import("../lib/webVitals");
    const payload = buildWebVitalsPayload(
      metric({
        name: "CLS",
        value: 0.123456,
        rating: "needs-improvement",
        id: "GABC123456789",
        navigationURL: "https://example.com/wallet/GABC123456789",
      }),
    );

    expect(payload).toEqual({
      name: "CLS",
      value: 0.1235,
      rating: "needs-improvement",
      deviceType: "desktop",
      viewportCategory: "wide",
    });
    expect(Object.keys(payload).sort()).toEqual([
      "deviceType",
      "name",
      "rating",
      "value",
      "viewportCategory",
    ]);
  });

  it.each([
    [767, "mobile", "compact"],
    [768, "tablet", "medium"],
    [1024, "desktop", "medium"],
    [1279, "desktop", "medium"],
    [1280, "desktop", "wide"],
  ])("categorizes a %ipx viewport", async (width, deviceType, viewportCategory) => {
    setViewportWidth(width);
    const { buildWebVitalsPayload } = await import("../lib/webVitals");
    expect(buildWebVitalsPayload(metric())).toMatchObject({ deviceType, viewportCategory });
  });

  it.each([
    ["doNotTrack", "1"],
    ["doNotTrack", "yes"],
    ["msDoNotTrack", "1"],
    ["globalPrivacyControl", true],
  ])("honors browser privacy signal %s=%s", async (name, value) => {
    setNavigatorProperty(name, value);
    const { initWebVitals, reportWebVital } = await import("../lib/webVitals");
    initWebVitals();
    expect(reportWebVital(metric())).toBe(false);
  });

  it("honors a persisted opt-out and can re-enable reporting", async () => {
    const { initWebVitals, isWebVitalsEnabled, reportWebVital, setWebVitalsEnabled } =
      await import("../lib/webVitals");
    setWebVitalsEnabled(false);
    initWebVitals();
    expect(isWebVitalsEnabled()).toBe(false);
    expect(reportWebVital(metric())).toBe(false);

    setWebVitalsEnabled(true);
    expect(isWebVitalsEnabled()).toBe(true);
  });

  it("registers LCP, CLS, and INP once and sends only the anonymous beacon", async () => {
    const sendBeacon = vi.fn(() => true);
    setNavigatorProperty("sendBeacon", sendBeacon);
    const { initWebVitals, WEB_VITALS_ENDPOINT } = await import("../lib/webVitals");

    initWebVitals();
    initWebVitals();

    expect(vitals.onLCP).toHaveBeenCalledTimes(1);
    expect(vitals.onCLS).toHaveBeenCalledTimes(1);
    expect(vitals.onINP).toHaveBeenCalledTimes(1);

    const callback = vitals.onLCP.mock.calls[0][0] as (value: Metric) => void;
    callback(metric({ value: 2500.6 }));
    expect(sendBeacon).toHaveBeenCalledTimes(1);
    const [endpoint, body] = sendBeacon.mock.calls[0] as unknown as [string, Blob];
    expect(endpoint).toBe(WEB_VITALS_ENDPOINT);
    expect(body.type).toBe("application/json");
    expect(JSON.parse(await readBlob(body))).toEqual({
      name: "LCP",
      value: 2501,
      rating: "good",
      deviceType: "desktop",
      viewportCategory: "wide",
    });
  });

  it("does not report before initialization or for non-finite values", async () => {
    const sendBeacon = vi.fn(() => true);
    setNavigatorProperty("sendBeacon", sendBeacon);
    const { initWebVitals, reportWebVital } = await import("../lib/webVitals");
    expect(reportWebVital(metric())).toBe(false);

    initWebVitals();
    expect(reportWebVital(metric({ value: Number.NaN }))).toBe(false);
    expect(reportWebVital(metric({ value: Number.POSITIVE_INFINITY }))).toBe(false);
    expect(sendBeacon).not.toHaveBeenCalled();
  });

  it("falls back to keepalive fetch when a beacon cannot be queued", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);
    setNavigatorProperty(
      "sendBeacon",
      vi.fn(() => false),
    );
    const { initWebVitals, reportWebVital, WEB_VITALS_ENDPOINT } = await import("../lib/webVitals");
    initWebVitals();

    expect(reportWebVital(metric())).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      WEB_VITALS_ENDPOINT,
      expect.objectContaining({ method: "POST", keepalive: true }),
    );
  });

  it("disables telemetry when storage is unavailable", async () => {
    const getItem = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("Storage blocked");
    });
    const { isWebVitalsEnabled } = await import("../lib/webVitals");
    expect(isWebVitalsEnabled()).toBe(false);
    getItem.mockRestore();
  });
});
