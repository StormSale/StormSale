// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AffiliateClickStreamHeatmap,
  ClickStreamHeatmap,
} from "../components/affiliate/ClickStreamHeatmap";
import type { ClickStreamEvent } from "../lib/clickStreamAggregation";

const web3 = vi.hoisted(() => ({ userAddress: null as string | null }));
vi.mock("../hooks/useWeb3", () => ({
  useWeb3: () => ({ userAddress: web3.userAddress }),
}));

const WALLET = "GBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFSHONUCEOASW7QC7OX2H";

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
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    web3.userAddress = null;
  });

  it("renders an SVG world map with one cluster per country in range", () => {
    renderMap();
    const map = screen.getByTestId("click-heatmap-map");
    expect(map.tagName.toLowerCase()).toBe("svg");
    expect(screen.getAllByTestId(/^click-cluster-/)).toHaveLength(6);
    expect(screen.queryByTestId("click-cluster-GB")).toBeNull();
  });

  it("draws land geometry behind the clusters", () => {
    renderMap();
    const land = screen.getByTestId("click-heatmap-land");
    expect(land.querySelectorAll("path").length).toBeGreaterThan(10);
    const map = screen.getByTestId("click-heatmap-map");
    const children = Array.from(map.children);
    const firstCluster = screen.getByTestId("click-cluster-US");
    expect(children.indexOf(land)).toBeLessThan(
      children.findIndex((child) => child.contains(firstCluster)),
    );
  });

  it("ranks by conversion percentage rather than click volume", () => {
    renderMap([
      ...clicks("US", 20, 2),
      conversion("US", 2),
      ...clicks("KE", 2, 2),
      conversion("KE", 2),
    ]);
    const list = screen.getByRole("list", { name: "Top 5 countries by conversion rate" });
    const items = within(list).getAllByRole("listitem");
    expect(items[0].textContent).toContain("Kenya");
    expect(items[0].textContent).toContain("50.00%");
    expect(items[1].textContent).toContain("United States");
  });

  it("keeps countries without a map centroid in the ranking", () => {
    renderMap([...clicks("ZW", 3, 1), conversion("ZW", 1)]);
    expect(screen.getByTestId("top-country-ZW").textContent).toContain("ZW");
    expect(screen.queryByTestId("click-cluster-ZW")).toBeNull();
    expect(screen.queryByText("No clicks in this range.")).toBeNull();
  });

  it("scales cluster density against the all-time peak so date changes resize clusters", () => {
    renderMap([...clicks("US", 10, 2), ...clicks("US", 30, 60)]);
    expect(screen.getByTestId("click-cluster-US").getAttribute("data-density")).toBe("0.250");
    fireEvent.change(screen.getByLabelText("Filter heatmap by date range"), {
      target: { value: "90d" },
    });
    expect(screen.getByTestId("click-cluster-US").getAttribute("data-density")).toBe("1.000");
  });

  it("uses at least 16px filter text on mobile", () => {
    renderMap();
    for (const label of ["Filter heatmap by date range", "Filter heatmap by campaign link"]) {
      expect(screen.getByLabelText(label).className).toContain("text-base");
    }
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
    const list = screen.getByRole("list", { name: "Top 5 countries by conversion rate" });
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

  it("asks for a wallet instead of loading when none is connected", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    render(<ClickStreamHeatmap now={() => NOW} />);
    expect(screen.getByRole("status").textContent).toContain("Connect your affiliate wallet");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("loads the connected wallet's click stream from the API", async () => {
    web3.userAddress = WALLET;
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        events: [
          { countryIso: "KE", type: "click", timestamp: daysAgo(1), campaignLinkId: "promo" },
          { countryIso: "KE", type: "conversion", timestamp: daysAgo(1), campaignLinkId: "promo" },
        ],
      }),
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<AffiliateClickStreamHeatmap />);
    expect(screen.getByRole("status").textContent).toContain("Loading click stream");
    await waitFor(() => expect(screen.getByTestId("click-cluster-KE")).toBeTruthy());
    expect(fetchMock).toHaveBeenCalledWith(`/api/affiliate/click-stream?wallet=${WALLET}`);
    expect(screen.getByTestId("top-country-KE").textContent).toContain("100.00%");
    expect(screen.getByRole("option", { name: "promo" })).toBeTruthy();
  });

  it("shows the API error when the click stream request fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => ({ error: "Failed to load click stream." }),
      }),
    );
    render(<ClickStreamHeatmap walletAddress={WALLET} now={() => NOW} />);
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toBe(
        "Failed to load click stream (500): Failed to load click stream.",
      ),
    );
  });
});
