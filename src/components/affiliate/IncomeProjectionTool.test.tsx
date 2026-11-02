// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { IncomeProjectionTool } from "./IncomeProjectionTool";
import { Slider } from "../ui/slider";

describe("IncomeProjectionTool", () => {
  beforeEach(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("renders projections and updates them from sliders, presets, and currency controls", () => {
    render(<IncomeProjectionTool />);

    expect(
      screen.getByRole("heading", { name: "Affiliate Income & ROI Projection Tool" }),
    ).toBeTruthy();
    expect(screen.getByText("Projected Monthly Revenue")).toBeTruthy();

    const clicksSlider = screen.getByRole("slider", { name: "Monthly Referral Traffic in Clicks" });
    fireEvent.change(clicksSlider, { target: { value: "10000" } });
    expect(clicksSlider.getAttribute("aria-valuenow")).toBe("10000");

    fireEvent.click(screen.getByRole("button", { name: "Display currency in Stellar Lumens" }));
    expect(screen.getByText("XLM", { selector: "button" })).toBeTruthy();
    expect(screen.getAllByText(/XLM/).length).toBeGreaterThan(1);

    fireEvent.click(screen.getByRole("button", { name: /Social Micro-Influencer/ }));
    expect(screen.getByRole("button", { name: "Reset sliders to default values" })).toBeTruthy();
    expect(clicksSlider.getAttribute("aria-valuenow")).toBe("2500");

    fireEvent.click(screen.getByRole("button", { name: "Reset sliders to default values" }));
    expect(clicksSlider.getAttribute("aria-valuenow")).toBe("5000");
  });

  it("switches chart views, handles chart hover, and copies the summary", async () => {
    const { container } = render(<IncomeProjectionTool />);

    fireEvent.click(screen.getByRole("button", { name: /Sensitivity Tiers/ }));
    expect(screen.getByText(/Target Baseline \(100%\) Tier Breakdown:/)).toBeTruthy();

    const chartPoints = container.querySelectorAll("svg g.cursor-pointer");
    expect(chartPoints.length).toBeGreaterThan(0);
    fireEvent.mouseEnter(chartPoints[0]);
    expect(screen.getByText(/Conservative \(50%\) Tier Breakdown:/)).toBeTruthy();
    fireEvent.mouseLeave(chartPoints[0]);
    expect(screen.getByText(/Target Baseline \(100%\) Tier Breakdown:/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /6-Month Growth/ }));
    expect(screen.getByText("M1")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Copy projection summary" }));
    await waitFor(() => expect(screen.getByText("Copied")).toBeTruthy());
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      expect.stringContaining("StormSale Affiliate Income Projection:"),
    );
  });

  it("renders the accessible slider primitive", () => {
    const html = renderToString(
      <Slider ariaLabel="Projection adjustment" value={[25]} max={100} />,
    );

    expect(html).toContain('aria-label="Projection adjustment"');
  });
});
