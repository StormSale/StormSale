import { afterEach, describe, expect, it, vi } from "vitest";
import {
  aggregateClickStreamByCountry,
  type ClickStreamEvent,
} from "../lib/clickStreamAggregation";
import { fetchClickStreamEvents } from "../lib/clickStreamApi";
import { getCountryCentroid, projectToMap } from "../lib/geo";

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

  it("looks up centroids case-insensitively", () => {
    expect(getCountryCentroid("ng")?.name).toBe("Nigeria");
    expect(getCountryCentroid("XX")).toBeNull();
  });
});

describe("fetchClickStreamEvents", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("returns events from the API", async () => {
    const events = [{ countryIso: "NG", type: "click", timestamp: "2026-10-10T00:00:00Z" }];
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ events }) });
    vi.stubGlobal("fetch", fetchMock);
    await expect(fetchClickStreamEvents()).resolves.toEqual(events);
    expect(fetchMock.mock.calls[0][0]).toMatch(/\/affiliate\/click-stream$/);
  });

  it("returns an empty list when the payload has no events", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }));
    await expect(fetchClickStreamEvents()).resolves.toEqual([]);
  });

  it("throws on a non-OK response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 503 }));
    await expect(fetchClickStreamEvents()).rejects.toThrow("Failed to load click stream (503)");
  });
});
