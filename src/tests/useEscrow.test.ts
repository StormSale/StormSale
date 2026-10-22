// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

// src/config/stellar.ts eagerly derives Soroban contract ids at import time, which
// crashes inside the jsdom realm (dual @stellar/stellar-sdk XDR instances). The hook
// only needs the Horizon URL, so the module is stubbed for this suite.
vi.mock("../config/stellar", () => ({
  STELLAR_CONFIG: {
    horizonUrl: "https://horizon-testnet.stellar.org",
  },
}));

import { useEscrowBalance, fetchAccountBalances } from "../hooks/useEscrow";

describe("useEscrowBalance Hook & Multi-Token Escrow (#71)", () => {
  const mockAddress = "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC";

  beforeEach(() => {
    vi.useFakeTimers();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it("fetchAccountBalances extracts multi-token balances accurately from Horizon response", async () => {
    const mockHorizonResponse = {
      balances: [
        { asset_type: "native", balance: "1500.5000000" },
        { asset_type: "credit_alphanum4", asset_code: "USDC", balance: "320.1234" },
        { asset_type: "credit_alphanum4", asset_code: "EURC", balance: "100.0000" },
      ],
    };

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockHorizonResponse,
    } as Response);

    const balances = await fetchAccountBalances(mockAddress, ["XLM", "USDC", "EURC"]);

    expect(balances.XLM).toBe("1500.5000");
    expect(balances.USDC).toBe("320.1234");
    expect(balances.EURC).toBe("100.0000");
  });

  it("fetchAccountBalances gracefully handles 404 (unfunded account)", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
    } as Response);

    const balances = await fetchAccountBalances(mockAddress, ["XLM", "USDC"]);
    expect(balances.XLM).toBe("0.0000");
    expect(balances.USDC).toBe("0.0000");
  });

  it("useEscrowBalance performs initial balance fetch on mount", async () => {
    const mockHorizonResponse = {
      balances: [
        { asset_type: "native", balance: "850.0000000" },
        { asset_type: "credit_alphanum4", asset_code: "USDC", balance: "45.0000" },
      ],
    };

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockHorizonResponse,
    } as Response);

    const { result } = renderHook(() =>
      useEscrowBalance({
        escrowAddress: mockAddress,
        tokens: ["XLM", "USDC"],
        pollIntervalMs: 5000,
      }),
    );

    // Initial state before resolution
    expect(result.current.isLoading).toBe(true);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(result.current.isLoading).toBe(false);
    expect(result.current.balances.XLM).toBe("850.0000");
    expect(result.current.balances.USDC).toBe("45.0000");
    expect(result.current.error).toBeNull();
    expect(result.current.lastUpdated).not.toBeNull();
  });

  it("polls contract balances on configured interval", async () => {
    let callCount = 0;
    globalThis.fetch = vi.fn().mockImplementation(() => {
      callCount++;
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({
          balances: [
            { asset_type: "native", balance: `${100 * callCount}.0000` },
            { asset_type: "credit_alphanum4", asset_code: "USDC", balance: `${50 * callCount}.0000` },
          ],
        }),
      } as Response);
    });

    const { result } = renderHook(() =>
      useEscrowBalance({
        escrowAddress: mockAddress,
        tokens: ["XLM", "USDC"],
        pollIntervalMs: 3000,
      }),
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(callCount).toBe(1);
    expect(result.current.balances.XLM).toBe("100.0000");

    // Advance by interval
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    expect(callCount).toBe(2);
    expect(result.current.balances.XLM).toBe("200.0000");

    // Advance again
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    expect(callCount).toBe(3);
    expect(result.current.balances.XLM).toBe("300.0000");
  });

  it("cleans up the interval timer on unmount to prevent leaks", async () => {
    const clearIntervalSpy = vi.spyOn(globalThis, "clearInterval");
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ balances: [{ asset_type: "native", balance: "10.0000" }] }),
    } as Response);

    const { unmount } = renderHook(() =>
      useEscrowBalance({
        escrowAddress: mockAddress,
        pollIntervalMs: 4000,
      }),
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    unmount();

    expect(clearIntervalSpy).toHaveBeenCalled();

    const fetchCallsBefore = vi.mocked(globalThis.fetch).mock.calls.length;

    // Advance timers after unmount — no more fetches should occur
    await act(async () => {
      await vi.advanceTimersByTimeAsync(12000);
    });

    expect(vi.mocked(globalThis.fetch).mock.calls.length).toBe(fetchCallsBefore);
  });

  it("handles network failure gracefully without crashing the hook", async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error("Network connection dropped"));

    const { result } = renderHook(() =>
      useEscrowBalance({
        escrowAddress: mockAddress,
        tokens: ["XLM"],
        pollIntervalMs: 5000,
      }),
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBeInstanceOf(Error);
    expect(result.current.error?.message).toContain("Network connection dropped");
  });
});
