// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";

const stellarMocks = vi.hoisted(() => ({
  fetchStellarAccountDetails: vi.fn(),
  calculateReserveBreakdown: vi.fn(),
}));

vi.mock("../lib/stellar", () => stellarMocks);

import { useAccountReserve, type AccountReserveState } from "../hooks/useAccountReserve";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const ADDRESS = "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF";

const breakdown = {
  balanceXlm: 20,
  reserveXlm: 2,
  spendableXlm: 18,
  subentries: 2,
  baseReserveXlm: 0.5,
  numSponsoring: 0,
  numSponsored: 0,
};

let latest: AccountReserveState;

const Harness = ({
  address,
  fallback = 0,
}: {
  address: string | null;
  fallback?: string | number;
}) => {
  const result = useAccountReserve(address, fallback);
  useEffect(() => {
    latest = result;
  });
  return <div>{result.isLoading ? "loading" : "ready"}</div>;
};

let container: HTMLDivElement;
let root: Root;

async function waitForEffects() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 10));
  });
}

async function render(address: string | null, fallback: string | number = 0) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(<Harness address={address} fallback={fallback} />);
  });
  await waitForEffects();
}

beforeEach(() => {
  vi.clearAllMocks();
  stellarMocks.calculateReserveBreakdown.mockReturnValue(breakdown);
  stellarMocks.fetchStellarAccountDetails.mockResolvedValue({
    address: ADDRESS,
    exists: true,
    balanceXlm: 20,
    subentries: 2,
    numSponsoring: 0,
    numSponsored: 0,
    trustlineCount: 1,
    sellingLiabilitiesXlm: 1.5,
    status: "active",
  });
});

afterEach(async () => {
  await act(async () => {
    root?.unmount();
  });
  container?.remove();
});

describe("useAccountReserve coverage", () => {
  it("does not query Horizon without an address and uses the fallback balance", async () => {
    await render(null, "50");

    expect(stellarMocks.fetchStellarAccountDetails).not.toHaveBeenCalled();
    expect(stellarMocks.calculateReserveBreakdown).toHaveBeenCalledWith(50, 0, {});
    expect(latest.isFallback).toBe(true);
    expect(latest.spendableXlm).toBe(18);
  });

  it("loads live details and exposes the reserve breakdown", async () => {
    await render(ADDRESS, "0");

    expect(stellarMocks.fetchStellarAccountDetails).toHaveBeenCalledWith(ADDRESS);
    expect(stellarMocks.calculateReserveBreakdown).toHaveBeenCalledWith(20, 2, {
      numSponsoring: 0,
      numSponsored: 0,
      sellingLiabilitiesXlm: 1.5,
    });
    expect(latest).toMatchObject({
      balanceXlm: 20,
      reserveXlm: 2,
      spendableXlm: 18,
      subentries: 2,
      trustlineCount: 1,
      exists: true,
      isFallback: false,
      isUnavailable: false,
      isLoading: false,
    });
  });

  it("flags unavailable Horizon data separately from an unfunded account", async () => {
    stellarMocks.fetchStellarAccountDetails.mockResolvedValue({
      address: ADDRESS,
      status: "unavailable",
      exists: false,
      balanceXlm: 0,
      subentries: 0,
    });

    await render(ADDRESS, "42.5");

    expect(latest.isFallback).toBe(true);
    expect(latest.isUnavailable).toBe(true);
  });

  it("falls back to the wallet balance when the account does not exist", async () => {
    stellarMocks.fetchStellarAccountDetails.mockResolvedValue({
      address: ADDRESS,
      exists: false,
      balanceXlm: 0,
      subentries: 0,
    });

    await render(ADDRESS, "42.5");

    expect(stellarMocks.calculateReserveBreakdown).toHaveBeenCalledWith(42.5, 0, {});
    expect(latest.isFallback).toBe(true);
    expect(latest.trustlineCount).toBe(0);
    expect(latest.exists).toBe(false);
    expect(latest.isUnavailable).toBe(false);
  });

  it("refreshes on demand and toggles the loading flag", async () => {
    await render(ADDRESS, "0");

    let resolveFetch: (value: unknown) => void = () => {};
    stellarMocks.fetchStellarAccountDetails.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveFetch = resolve;
        }),
    );

    let refreshPromise: Promise<void> = Promise.resolve();
    await act(async () => {
      refreshPromise = latest.refresh();
      await Promise.resolve();
    });
    expect(latest.isLoading).toBe(true);

    await act(async () => {
      resolveFetch({
        address: ADDRESS,
        exists: true,
        balanceXlm: 30,
        subentries: 1,
        numSponsoring: 0,
        numSponsored: 0,
        trustlineCount: 0,
      });
      await refreshPromise;
    });

    expect(stellarMocks.fetchStellarAccountDetails).toHaveBeenCalledTimes(2);
    expect(latest.isLoading).toBe(false);
  });
});
