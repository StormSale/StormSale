import { afterEach, describe, expect, it, vi } from "vitest";
import {
  aggregateClickStreamByCountry,
  type ClickStreamEvent,
} from "../lib/clickStreamAggregation";
import { fetchClickStreamEvents, normalizeClickStreamEvent } from "../lib/clickStreamApi";
import { WORLD_LAND_PATHS, getCountryCentroid, projectToMap } from "../lib/geo";

const ev = (
  countryIso: string,
  type: "click" | "conversion",
  timestamp: string,
  campaignLinkId?: string,
): ClickStreamEvent => ({ countryIso, type, timestamp, campaignLinkId });

const EVENTS: ClickStreamEvent[] = [
  ...Array.from({ length: 10 }, () => ev("US", "click", "2026-10-10T00:00:00Z", "a")),
  ev("US", "conversion", "2026-10-10T00:00:00Z", "a"),
  ...Array.from({ length: 4 }, () => ev("ng", "click", "2026-10-12T00:00:00Z", "b")),
  ev("NG", "conversion", "2026-10-12T00:00:00Z", "b"),
  ...Array.from({ length: 2 }, () => ev("DE", "click", "2026-09-01T00:00:00Z", "a")),
  ev("??", "click", "2026-10-10T00:00:00Z"),
  ev("FR", "click", "not-a-date"),
];

describe("aggregateClickStreamByCountry", () => {
  it("aggregates by normalised ISO code and skips invalid codes and timestamps", () => {
    const result = aggregateClickStreamByCountry(EVENTS);
    expect(result.countries.map((c) => c.countryIso)).toEqual(["US", "NG", "DE"]);
    expect(result.totalClicks).toBe(16);
    expect(result.totalConversions).toBe(2);
  });

  it("computes conversion percentage and intensity", () => {
    const [us, ng] = aggregateClickStreamByCountry(EVENTS).countries;
    expect(us.conversionRate).toBe(10);
    expect(ng.conversionRate).toBe(25);
    expect(us.intensity).toBe(1);
    expect(ng.intensity).toBeCloseTo(0.4);
  });

  it("filters by half-open date range", () => {
    const result = aggregateClickStreamByCountry(EVENTS, {
      dateRange: { start: "2026-10-01T00:00:00Z", end: "2026-10-12T00:00:00Z" },
    });
    expect(result.countries.map((c) => c.countryIso)).toEqual(["US"]);
  });

  it("includes the whole day for a date-only end bound", () => {
    const result = aggregateClickStreamByCountry(
      [ev("US", "click", "2026-10-17T12:00:00Z"), ev("NG", "click", "2026-10-18T00:00:00Z")],
      { dateRange: { start: "2026-10-17", end: "2026-10-17" } },
    );
    expect(result.countries.map((c) => c.countryIso)).toEqual(["US"]);
  });

  it("keeps timestamp end bounds exclusive", () => {
    const result = aggregateClickStreamByCountry([ev("US", "click", "2026-10-17T12:00:00Z")], {
      dateRange: { end: "2026-10-17T12:00:00Z" },
    });
    expect(result.countries).toEqual([]);
  });

  it("ranks the top five by conversion percentage, then clicks", () => {
    const result = aggregateClickStreamByCountry(EVENTS);
    expect(result.topCountries.map((c) => c.countryIso)).toEqual(["NG", "US", "DE"]);
    expect(result.countries.map((c) => c.countryIso)).toEqual(["US", "NG", "DE"]);
  });

  it("keeps valid countries that have no map centroid", () => {
    const result = aggregateClickStreamByCountry([ev("ZW", "click", "2026-10-10T00:00:00Z")]);
    expect(getCountryCentroid("ZW")).toBeNull();
    expect(result.topCountries.map((c) => c.countryIso)).toEqual(["ZW"]);
  });

  it("filters by campaign link", () => {
    const result = aggregateClickStreamByCountry(EVENTS, { campaignLinkId: "b" });
    expect(result.countries.map((c) => c.countryIso)).toEqual(["NG"]);
  });

  it("caps the ranking at five countries", () => {
    const many = ["US", "NG", "DE", "FR", "GB", "JP", "IN"].map((iso) =>
      ev(iso, "click", "2026-10-10T00:00:00Z"),
    );
    expect(aggregateClickStreamByCountry(many).topCountries).toHaveLength(5);
  });

  it("keeps only country-level fields in the output", () => {
    const withExtra = [{ ...ev("US", "click", "2026-10-10T00:00:00Z"), ip: "1.2.3.4" }];
    const [country] = aggregateClickStreamByCountry(withExtra).countries;
    expect(Object.keys(country).sort()).toEqual(
      ["clicks", "conversionRate", "conversions", "countryIso", "intensity"].sort(),
    );
  });
});

describe("geo helpers", () => {
  it("projects lat/lng into the map viewBox", () => {
    expect(projectToMap(0, 0)).toEqual({ x: 500, y: 250 });
    expect(projectToMap(90, -180)).toEqual({ x: 0, y: 0 });
  });

  it("provides projected land outlines inside the viewBox", () => {
    expect(WORLD_LAND_PATHS.length).toBeGreaterThan(10);
    for (const d of WORLD_LAND_PATHS) {
      expect(d).toMatch(/^M[\d.]+ [\d.]+(L[\d.]+ [\d.]+)+Z$/);
    }
  });

  it("looks up centroids case-insensitively", () => {
    expect(getCountryCentroid("ng")?.name).toBe("Nigeria");
    expect(getCountryCentroid("XX")).toBeNull();
  });
});

describe("fetchClickStreamEvents", () => {
  const WALLET = "GBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFSHONUCEOASW7QC7OX2H";
  afterEach(() => vi.unstubAllGlobals());

  it("returns events from the API", async () => {
    const events = [{ countryIso: "NG", type: "click", timestamp: "2026-10-10T00:00:00Z" }];
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ events }) });
    vi.stubGlobal("fetch", fetchMock);
    await expect(fetchClickStreamEvents(WALLET)).resolves.toEqual(events);
    expect(fetchMock.mock.calls[0][0]).toBe(`/api/affiliate/click-stream?wallet=${WALLET}`);
  });

  it("returns an empty list when the payload has no events", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }));
    await expect(fetchClickStreamEvents(WALLET)).resolves.toEqual([]);
  });

  it("drops malformed events and strips non-country fields", async () => {
    const events = [
      { countryIso: "NG", type: "click", timestamp: 1, campaignLinkId: "a", ip: "1.2.3.4" },
      { countryIso: "US", type: "view", timestamp: 1 },
      { type: "click", timestamp: 1 },
      { countryIso: "DE", type: "conversion" },
      null,
    ];
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ events }) }));
    await expect(fetchClickStreamEvents(WALLET)).resolves.toEqual([
      { countryIso: "NG", type: "click", timestamp: 1, campaignLinkId: "a" },
    ]);
  });

  it("normalizes a single event", () => {
    expect(
      normalizeClickStreamEvent({ countryIso: "GH", type: "conversion", timestamp: "x" }),
    ).toEqual({
      countryIso: "GH",
      type: "conversion",
      timestamp: "x",
    });
    expect(normalizeClickStreamEvent("nope")).toBeNull();
  });

  it("throws on a non-OK response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 503 }));
    await expect(fetchClickStreamEvents(WALLET)).rejects.toThrow(
      "Failed to load click stream (503)",
    );
  });

  it("surfaces the backend error message on a non-OK response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({ error: "Invalid wallet" }),
      }),
    );
    await expect(fetchClickStreamEvents(WALLET)).rejects.toThrow(
      "Failed to load click stream (400): Invalid wallet",
    );
  });

  it("rejects without calling the API when no wallet is given", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(fetchClickStreamEvents("  ")).rejects.toThrow("Connect a wallet");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
