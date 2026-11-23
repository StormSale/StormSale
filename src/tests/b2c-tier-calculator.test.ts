// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it } from "vitest";
import {
  AFFILIATE_TIERS,
  calculateCommissionEstimate,
  getTierForVolume,
  getTierProgress,
} from "../lib/affiliateTiers";
import { TierCommissionCalculator } from "../components/affiliate/TierCommissionCalculator";

const RATES = { USD: 0.125, EUR: 0.115, USDC: 0.125 };

const testId = (id: string) => screen.getByTestId(id);
const textOf = (id: string) => screen.getByTestId(id).textContent ?? "";
const field = (id: string) => screen.getByTestId(id) as HTMLInputElement;

afterEach(cleanup);

describe("b2c tier boundaries by lifetime referred volume", () => {
  it("defines the four commission tiers and their rates", () => {
    expect(AFFILIATE_TIERS.map((tier) => tier.name)).toEqual([
      "Bronze",
      "Silver",
      "Gold",
      "Platinum",
    ]);
    expect(AFFILIATE_TIERS.map((tier) => tier.commissionRate)).toEqual([0.05, 0.08, 0.12, 0.15]);
  });

  const boundaries: Array<[number, string]> = [
    [0, "Bronze"],
    [9_999.99, "Bronze"],
    [10_000, "Silver"],
    [49_999.99, "Silver"],
    [50_000, "Gold"],
    [249_999.99, "Gold"],
    [250_000, "Platinum"],
    [1_000_000, "Platinum"],
  ];

  it.each(boundaries)("maps %s lifetime volume to %s", (volume, tierName) => {
    expect(getTierForVolume(volume).name).toBe(tierName);
  });

  it("falls back to Bronze for negative, NaN and infinite volume", () => {
    expect(getTierForVolume(-100).name).toBe("Bronze");
    expect(getTierForVolume(Number.NaN).name).toBe("Bronze");
    expect(getTierForVolume(Number.POSITIVE_INFINITY).name).toBe("Bronze");
  });
});

describe("b2c tier progress toward the next threshold", () => {
  const cases: Array<[number, string, number, number]> = [
    [0, "Silver", 0, 10_000],
    [5_000, "Silver", 50, 5_000],
    [9_999.99, "Silver", 100, 0.01],
    [10_000, "Gold", 0, 40_000],
    [30_000, "Gold", 50, 20_000],
    [50_000, "Platinum", 0, 200_000],
    [150_000, "Platinum", 50, 100_000],
  ];

  it.each(cases)(
    "reports %s%% progress towards %s with %s remaining",
    (volume, nextTierName, percentage, remaining) => {
      const progress = getTierProgress(volume);
      expect(progress.nextTier?.name).toBe(nextTierName);
      expect(progress.progressPercentage).toBe(percentage);
      expect(progress.remainingVolumeUsd).toBeCloseTo(remaining, 2);
    },
  );

  it("reports 100% progress with no next tier at Platinum", () => {
    const progress = getTierProgress(250_000);
    expect(progress.tier.name).toBe("Platinum");
    expect(progress.nextTier).toBeNull();
    expect(progress.progressPercentage).toBe(100);
    expect(progress.remainingVolumeUsd).toBe(0);
  });
});

describe("b2c commission estimate", () => {
  const cases: Array<[number, number]> = [
    [0, 50],
    [10_000, 80],
    [50_000, 120],
    [250_000, 150],
  ];

  it.each(cases)("applies the tier rate at %s lifetime volume", (lifetimeVolume, expectedUsd) => {
    const estimate = calculateCommissionEstimate(1_000, lifetimeVolume, RATES);
    expect(estimate.usd).toBe(expectedUsd);
    expect(estimate.ratePercent).toBe(expectedUsd / 10);
  });

  it("converts the USD commission to XLM, USDC and local fiat", () => {
    const estimate = calculateCommissionEstimate(1_000, 0, RATES);
    expect(estimate.usd).toBe(50);
    expect(estimate.xlm).toBe(400);
    expect(estimate.usdc).toBe(50);
    expect(estimate.eur).toBe(46);
  });

  it("returns a zero estimate for invalid projected volume", () => {
    const estimate = calculateCommissionEstimate(Number.NaN, 10_000, RATES);
    expect(estimate.tier.name).toBe("Silver");
    expect(estimate.usd).toBe(0);
    expect(estimate.xlm).toBe(0);
    expect(estimate.usdc).toBe(0);
    expect(estimate.eur).toBe(0);
  });
});

describe("b2c TierCommissionCalculator component", () => {
  it("renders the current tier, rate and an accessible progress bar", () => {
    render(createElement(TierCommissionCalculator, { lifetimeVolumeUsd: 5_000, rates: RATES }));

    expect(textOf("tier-name")).toBe("Bronze");
    expect(textOf("tier-rate")).toContain("5%");
    const progressBar = screen.getByRole("progressbar", { name: "Progress to Silver" });
    expect(progressBar.getAttribute("aria-valuenow")).toBe("50");
    expect(progressBar.getAttribute("aria-valuemin")).toBe("0");
    expect(progressBar.getAttribute("aria-valuemax")).toBe("100");
    expect((testId("tier-progress-fill") as HTMLElement).style.width).toBe("50%");
    expect(textOf("remaining-volume")).toContain("5,000 USD to Silver");
  });

  it("recalculates projections when the simulator slider moves", () => {
    render(createElement(TierCommissionCalculator, { rates: RATES }));

    const slider = screen.getByRole("slider", {
      name: "Monthly referred volume simulator",
    }) as HTMLInputElement;
    fireEvent.change(slider, { target: { value: "1000" } });

    expect(field("custom-volume").value).toBe("1000");
    expect(textOf("commission-usd")).toBe("$50.00");
    fireEvent.change(slider, { target: { value: "2000" } });
    expect(textOf("commission-usd")).toBe("$100.00");
  });

  it("keeps the slider in sync with custom volume inputs", () => {
    render(createElement(TierCommissionCalculator, { rates: RATES }));

    fireEvent.change(field("custom-volume"), { target: { value: "2500" } });

    const slider = screen.getByRole("slider", {
      name: "Monthly referred volume simulator",
    }) as HTMLInputElement;
    expect(slider.value).toBe("2500");
    expect(textOf("commission-usd")).toBe("$125.00");
    expect(textOf("commission-xlm")).toBe("1,000.00 XLM");
  });

  it("promotes the tier and rate when lifetime volume crosses a threshold", () => {
    render(createElement(TierCommissionCalculator, { rates: RATES }));

    fireEvent.change(field("lifetime-volume-input"), { target: { value: "10000" } });

    expect(textOf("tier-name")).toBe("Silver");
    expect(textOf("tier-rate")).toContain("8%");
    expect(screen.getByRole("progressbar", { name: "Progress to Gold" })).toBeTruthy();
    expect(textOf("commission-usd")).toBe("$80.00");
  });

  it("renders XLM, USDC and EUR conversions from the supplied oracle rates", () => {
    render(createElement(TierCommissionCalculator, { rates: RATES }));

    expect(textOf("commission-usd")).toBe("$50.00");
    expect(textOf("commission-xlm")).toBe("400.00 XLM");
    expect(textOf("commission-usdc")).toBe("50.00 USDC");
    expect(textOf("commission-eur")).toBe("€46.00");
  });

  it("recalculates conversions when the oracle rates change", () => {
    const view = render(createElement(TierCommissionCalculator, { rates: RATES }));
    expect(textOf("commission-xlm")).toBe("400.00 XLM");

    view.rerender(
      createElement(TierCommissionCalculator, {
        rates: { USD: 0.25, EUR: 0.2, USDC: 0.25 },
      }),
    );

    expect(textOf("commission-xlm")).toBe("200.00 XLM");
    expect(textOf("commission-usdc")).toBe("50.00 USDC");
    expect(textOf("commission-eur")).toBe("€40.00");
  });
});
