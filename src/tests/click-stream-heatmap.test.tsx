// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ClickStreamHeatmap } from "../components/affiliate/ClickStreamHeatmap";
import type { ClickStreamEvent } from "../lib/clickStreamAggregation";

const NOW = Date.parse("2026-10-20T00:00:00Z");
const daysAgo = (d: number) => new Date(NOW - d * 86_400_000).toISOString();

const clicks = (iso: string, n: number, age: number, link = "link-a"): ClickStreamEvent[] =>
  Array.from({ length: n }, () => ({
    countryIso: iso,
    type: "click" as const,
    timestamp: daysAgo(age),
    campaignLinkId: link,
  }));
const conversion = (iso: string, age: number, link = "link-a"): ClickStreamEvent => ({
  countryIso: iso,
  type: "conversion",
  timestamp: daysAgo(age),
  campaignLinkId: link,
});

const EVENTS: ClickStreamEvent[] = [
  ...clicks("US", 20, 2),
  conversion("US", 2),
  conversion("US", 2),
  ...clicks("NG", 10, 3, "link-b"),
  conversion("NG", 3, "link-b"),
  ...clicks("DE", 8, 4),
  ...clicks("IN", 6, 5),
  ...clicks("BR", 4, 6),
  ...clicks("JP", 2, 6),
  ...clicks("GB", 30, 60),
];

const renderMap = (events = EVENTS) =>
  render(<ClickStreamHeatmap events={events} now={() => NOW} initialRange="7d" />);

describe("ClickStreamHeatmap", () => {
  afterEach(cleanup);

  it("renders an SVG world map with one cluster per country in range", () => {
    renderMap();
    const map = screen.getByTestId("click-heatmap-map");
    expect(map.tagName.toLowerCase()).toBe("svg");
    expect(screen.getAllByTestId(/^click-cluster-/)).toHaveLength(6);
    expect(screen.queryByTestId("click-cluster-GB")).toBeNull();
  });

  it("shows a click volume tooltip on hover and on keyboard focus", () => {
    renderMap();
    fireEvent.mouseEnter(screen.getByTestId("click-cluster-US"));
    const tooltip = screen.getByRole("tooltip");
    expect(within(tooltip).getByText("United States")).toBeTruthy();
    expect(within(tooltip).getByText("20 clicks")).toBeTruthy();
    fireEvent.mouseLeave(screen.getByTestId("click-cluster-US"));
    expect(screen.queryByRole("tooltip")).toBeNull();
    fireEvent.focus(screen.getByTestId("click-cluster-NG"));
    expect(within(screen.getByRole("tooltip")).getByText("Nigeria")).toBeTruthy();
  });

  it("ranks the top 5 countries with conversion percentages", () => {
    renderMap();
    const list = screen.getByRole("list", { name: "Top 5 countries by clicks" });
    const items = within(list).getAllByRole("listitem");
    expect(items).toHaveLength(5);
    expect(items[0].textContent).toContain("United States");
    expect(items[0].textContent).toContain("10.00%");
    expect(items[1].textContent).toContain("Nigeria");
    expect(items[1].textContent).toContain("10.00%");
    expect(screen.queryByTestId("top-country-JP")).toBeNull();
  });

  it("updates clusters when the date range changes", () => {
    renderMap();
    fireEvent.change(screen.getByLabelText("Filter heatmap by date range"), {
      target: { value: "90d" },
    });
    expect(screen.getByTestId("click-cluster-GB")).toBeTruthy();
    expect(screen.getByTestId("top-country-GB")).toBeTruthy();
  });

  it("filters by campaign link", async () => {
    renderMap();
    fireEvent.change(screen.getByLabelText("Filter heatmap by campaign link"), {
      target: { value: "link-b" },
    });
    expect(screen.getByTestId("click-cluster-NG")).toBeTruthy();
    expect(screen.queryByTestId("top-country-US")).toBeNull();
    await waitFor(() => expect(screen.queryByTestId("click-cluster-US")).toBeNull());
  });

  it("loads events through the loader when none are supplied", async () => {
    const loadEvents = vi.fn().mockResolvedValue(clicks("NG", 3, 1));
    render(<ClickStreamHeatmap loadEvents={loadEvents} now={() => NOW} />);
    expect(screen.getByRole("status")).toBeTruthy();
    await waitFor(() => expect(screen.getByTestId("click-cluster-NG")).toBeTruthy());
    expect(loadEvents).toHaveBeenCalledTimes(1);
  });

  it("shows an error when loading fails", async () => {
    const loadEvents = vi.fn().mockRejectedValue(new Error("boom"));
    render(<ClickStreamHeatmap loadEvents={loadEvents} now={() => NOW} />);
    await waitFor(() => expect(screen.getByRole("alert").textContent).toBe("boom"));
  });

  it("shows an empty state when no clicks are in range", () => {
    renderMap([]);
    expect(screen.getByText("No clicks in this range.")).toBeTruthy();
  });

  it("shows an error alert and no clusters if the loader rejects with a non-Error value", async () => {
    const loadEvents = vi.fn().mockRejectedValue("network down");
    render(<ClickStreamHeatmap loadEvents={loadEvents} now={() => NOW} />);
    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
    expect(screen.queryAllByTestId(/^click-cluster-/)).toHaveLength(0);
  });
});
