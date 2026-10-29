// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import PlatformVolumeWidget, { type VolumePoint } from "../components/auditor/PlatformVolumeWidget";

const series: VolumePoint[] = [
  { timestamp: "2026-10-01T00:00:00Z", escrowVolume: 1000, payoutVolume: 800 },
  { timestamp: "2026-10-02T00:00:00Z", escrowVolume: 1500, payoutVolume: 600 },
];

const mockFetch = (impl: () => Promise<unknown>) => {
  const fn = vi.fn(impl);
  vi.stubGlobal("fetch", fn);
  return fn;
};

describe("PlatformVolumeWidget (#61)", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("renders totals, growth and trend chart from provided data", () => {
    render(<PlatformVolumeWidget data={series} />);
    expect(screen.getByText("Platform Financial Volume")).toBeTruthy();
    expect(screen.getByText("$2.5K")).toBeTruthy();
    expect(screen.getByText("$1.4K")).toBeTruthy();
    expect(screen.getByText("$3,900.00")).toBeTruthy();
    expect(screen.getByText(/50\.0%/)).toBeTruthy();
    expect(screen.getByText(/25\.0%/)).toBeTruthy();
    expect(screen.getByText("2 points in window")).toBeTruthy();
    const chart = screen.getByRole("img", { name: "Volume growth trend chart" });
    expect(chart.querySelectorAll("polyline").length).toBe(2);
    expect(screen.getByText(/Updated/)).toBeTruthy();
  });

  it("shows no-data growth and hides the chart in compact mode", () => {
    render(<PlatformVolumeWidget data={[series[0]]} compact />);
    expect(screen.getAllByText("no data").length).toBe(2);
    expect(screen.getByText("1 point in window")).toBeTruthy();
    expect(screen.queryByRole("img")).toBeNull();
  });

  it("handles a zero starting value and an empty series", () => {
    const { rerender } = render(
      <PlatformVolumeWidget
        data={[
          { timestamp: "a", escrowVolume: 0, payoutVolume: 0 },
          { timestamp: "b", escrowVolume: 10, payoutVolume: 0 },
        ]}
      />,
    );
    expect(screen.getByText(/100\.0%/)).toBeTruthy();
    expect(screen.getByText("no data")).toBeTruthy();
    rerender(<PlatformVolumeWidget data={[]} />);
    expect(screen.getByText("0 points in window")).toBeTruthy();
  });

  it("respects historyLimit", () => {
    render(<PlatformVolumeWidget data={series} historyLimit={1} />);
    expect(screen.getByText("1 point in window")).toBeTruthy();
  });

  it("fetches the series from the endpoint and filters invalid points", async () => {
    const fetchFn = mockFetch(async () => ({
      ok: true,
      json: async () => ({ series: [...series, { timestamp: 1 }, null] }),
    }));
    render(<PlatformVolumeWidget endpoint="/volume" />);
    expect(screen.getByText("Syncing…")).toBeTruthy();
    await waitFor(() => expect(screen.getByText("2 points in window")).toBeTruthy());
    expect(fetchFn).toHaveBeenCalledWith(
      "/volume",
      expect.objectContaining({ credentials: "include" }),
    );
  });

  it("accepts a bare array payload and ignores unknown shapes", async () => {
    mockFetch(async () => ({ ok: true, json: async () => series }));
    const { unmount } = render(<PlatformVolumeWidget />);
    await waitFor(() => expect(screen.getByText("2 points in window")).toBeTruthy());
    unmount();

    mockFetch(async () => ({ ok: true, json: async () => "nope" }));
    render(<PlatformVolumeWidget />);
    await waitFor(() => expect(screen.getByText("0 points in window")).toBeTruthy());
  });

  it("shows an alert when the endpoint fails", async () => {
    mockFetch(async () => ({ ok: false, status: 503, json: async () => ({}) }));
    render(<PlatformVolumeWidget />);
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Failed to load platform volume (503)");
  });

  it("shows a generic message for non-Error rejections", async () => {
    mockFetch(() => Promise.reject("boom"));
    render(<PlatformVolumeWidget />);
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Unknown error");
  });

  it("polls the endpoint on the refresh interval", async () => {
    vi.useFakeTimers();
    const fetchFn = mockFetch(async () => ({ ok: true, json: async () => series }));
    render(<PlatformVolumeWidget refreshIntervalMs={1000} />);
    await vi.advanceTimersByTimeAsync(2100);
    expect(fetchFn.mock.calls.length).toBeGreaterThanOrEqual(3);
    vi.useRealTimers();
  });
});
