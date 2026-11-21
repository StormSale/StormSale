// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import {
  useEscrowBalance,
  useEscrow,
  fetchContractEscrowBalances,
  fetchSingleTokenBalance,
  formatUnitsFromBigInt,
  formatEscrowDisplay,
  resolveTokenConfigs,
  setMockEscrowBalance,
} from "../hooks/useEscrow";
import { rpcFallbackManager } from "../lib/rpcFallback";
import { SUPPORTED_ESCROW_ASSETS } from "../config/stellar";
import { nativeToScVal, Asset, Networks } from "@stellar/stellar-sdk";

describe("useEscrow & useEscrowBalance Hook (#71)", () => {
  const TEST_CONTRACT = "CA7QW5KXGPTR4N2K9J2L77XLMESCROW9999STORMTESTNET1";
  const TEST_ACCOUNT = "GASTORMSALE7TESTNET7AFFILIATE7MERCHANT7ESCROW7XLM77777";

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe("Utility & Formatting Helpers", () => {
    it("formats BigInt stroops into accurate decimal strings", () => {
      expect(formatUnitsFromBigInt(10000000n, 7)).toBe("1.00");
      expect(formatUnitsFromBigInt(12505000000n, 7)).toBe("1250.50");
      expect(formatUnitsFromBigInt(1234567n, 7)).toBe("0.1234");
      expect(formatUnitsFromBigInt(0n, 7)).toBe("0.00");
      expect(formatUnitsFromBigInt(-50000000n, 7)).toBe("-5.00");
    });

    it("formats escrow display amounts with currency symbol and localization", () => {
      expect(formatEscrowDisplay("1250.50", "XLM")).toBe("1,250.50 XLM");
      expect(formatEscrowDisplay("0", "USDC")).toBe("0.00 USDC");
      expect(formatEscrowDisplay("not-a-number", "EURC")).toBe("0.00 EURC");
    });

    it("resolves default token configs with XLM, USDC, and EURC", () => {
      const configs = resolveTokenConfigs();
      expect(configs).toHaveLength(3);
      expect(configs.map((c) => c.code)).toEqual(["XLM", "USDC", "EURC"]);
      expect(configs.find((c) => c.code === "XLM")?.decimals).toBe(7);
      expect(configs.find((c) => c.code === "USDC")?.decimals).toBe(7);
    });

    it("resolves custom token configurations and strings", () => {
      const custom = resolveTokenConfigs([
        "XLM",
        {
          code: "TEST",
          name: "Test Token",
          contractAddress: "CTEST12345",
          decimals: 6,
        },
      ]);
      expect(custom).toHaveLength(2);
      expect(custom[0].code).toBe("XLM");
      expect(custom[1].code).toBe("TEST");
      expect(custom[1].decimals).toBe(6);
    });
  });

  describe("fetchSingleTokenBalance & fetchContractEscrowBalances", () => {
    it("returns mock balance when stored in mock store", async () => {
      setMockEscrowBalance(TEST_CONTRACT, "XLM", "4500.50");
      const tokenConfig = {
        code: "XLM",
        contractAddress: SUPPORTED_ESCROW_ASSETS.XLM.contractAddress,
        decimals: 7,
      };

      const result = await fetchSingleTokenBalance(TEST_CONTRACT, tokenConfig);
      expect(result.code).toBe("XLM");
      expect(result.balance).toBe("4500.50");
      expect(result.rawBalance).toBe(45005000000n);
      expect(result.formatted).toBe("4,500.50 XLM");
    });

    it("simulates balance on Soroban RPC when executed", async () => {
      const mockSimulate = vi.fn().mockResolvedValue({
        result: {
          retval: nativeToScVal(9800000000n, { type: "i128" }),
        },
      });

      vi.spyOn(rpcFallbackManager, "executeWithFallback").mockImplementation(
        async (callback: any) => {
          return callback(
            {
              simulateTransaction: mockSimulate,
            },
            {} as any,
          );
        },
      );

      const tokenConfig = {
        code: "USDC",
        name: "USD Coin",
        contractAddress: SUPPORTED_ESCROW_ASSETS.USDC.contractAddress,
        decimals: 7,
      };

      const validTargetContract = Asset.native().contractId(Networks.TESTNET);
      const result = await fetchSingleTokenBalance(validTargetContract, tokenConfig);
      expect(result.code).toBe("USDC");
      expect(result.balance).toBe("980.00");
      expect(result.rawBalance).toBe(9800000000n);
      expect(mockSimulate).toHaveBeenCalled();
    });

    it("falls back to Horizon account balances for G... addresses when Soroban simulation fails", async () => {
      vi.spyOn(rpcFallbackManager, "executeWithFallback").mockRejectedValue(
        new Error("Soroban RPC down"),
      );

      const fakeFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          balances: [
            { asset_type: "native", balance: "750.2500" },
            {
              asset_code: "USDC",
              balance: "320.00",
              asset_issuer: SUPPORTED_ESCROW_ASSETS.USDC.issuer,
            },
          ],
        }),
      });
      vi.stubGlobal("fetch", fakeFetch);

      const balances = await fetchContractEscrowBalances(TEST_ACCOUNT, {
        tokens: ["XLM", "USDC"],
      });

      expect(balances.XLM).toBeDefined();
      expect(balances.XLM.balance).toBe("750.25");
      expect(balances.USDC).toBeDefined();
      expect(balances.USDC.balance).toBe("320.00");
    });

    it("returns zero balance and captures error when all endpoints fail", async () => {
      vi.spyOn(rpcFallbackManager, "executeWithFallback").mockRejectedValue(
        new Error("Network connection failed"),
      );

      const result = await fetchSingleTokenBalance("CUNKNOWN99999", {
        code: "UNKNOWN",
        contractAddress: "CUNKNOWN99999",
        decimals: 7,
      });

      expect(result.balance).toBe("0.00");
      expect(result.rawBalance).toBe(0n);
      expect(result.error).toContain("Failed to fetch contract token balance");
    });

    it("returns empty object if target contract address is empty", async () => {
      const balances = await fetchContractEscrowBalances("");
      expect(balances).toEqual({});
    });
  });

  describe("useEscrowBalance Hook Lifecycle & Polling", () => {
    it("synchronizes multi-token balances on initial mount", async () => {
      setMockEscrowBalance(TEST_CONTRACT, "XLM", "5000");
      setMockEscrowBalance(TEST_CONTRACT, "USDC", "2500");
      setMockEscrowBalance(TEST_CONTRACT, "EURC", "1000");

      const { result } = renderHook(() =>
        useEscrowBalance({
          contractAddress: TEST_CONTRACT,
          pollingIntervalMs: 0, // No background interval
        }),
      );

      expect(result.current.isLoading).toBe(true);

      // Wait for initial sync
      await act(async () => {
        await Promise.resolve();
      });

      expect(result.current.isLoading).toBe(false);
      expect(result.current.isReady).toBe(true);
      expect(result.current.balances.XLM?.balance).toBe("5000.00");
      expect(result.current.balances.USDC?.balance).toBe("2500.00");
      expect(result.current.balances.EURC?.balance).toBe("1000.00");
      expect(result.current.formattedBalances.XLM).toBe("5000.00");
      expect(result.current.balanceList).toHaveLength(3);
    });

    it("polls periodically and updates balances on timer tick", async () => {
      vi.useFakeTimers();

      setMockEscrowBalance(TEST_CONTRACT, "XLM", "1000");
      setMockEscrowBalance(TEST_CONTRACT, "USDC", "500");

      const updateCallback = vi.fn();

      const { result } = renderHook(() =>
        useEscrowBalance({
          contractAddress: TEST_CONTRACT,
          tokens: ["XLM", "USDC"],
          pollingIntervalMs: 3000,
          onBalanceUpdate: updateCallback,
        }),
      );

      await act(async () => {
        await Promise.resolve();
      });

      expect(result.current.balances.XLM?.balance).toBe("1000.00");
      expect(result.current.isPolling).toBe(true);
      expect(updateCallback).toHaveBeenCalledTimes(1);

      // Update mock value to simulate on-chain balance change
      setMockEscrowBalance(TEST_CONTRACT, "XLM", "1500");

      // Advance by polling interval (3000ms)
      await act(async () => {
        vi.advanceTimersByTime(3000);
        await Promise.resolve();
      });

      expect(result.current.balances.XLM?.balance).toBe("1500.00");
      expect(updateCallback).toHaveBeenCalledTimes(2);
    });

    it("supports pause and resume of polling synchronization", async () => {
      vi.useFakeTimers();

      setMockEscrowBalance(TEST_CONTRACT, "XLM", "1000");

      const { result } = renderHook(() =>
        useEscrowBalance({
          contractAddress: TEST_CONTRACT,
          pollingIntervalMs: 2000,
        }),
      );

      await act(async () => {
        await Promise.resolve();
      });
      expect(result.current.isPolling).toBe(true);

      // Pause polling
      act(() => {
        result.current.pause();
      });
      expect(result.current.isPolling).toBe(false);

      // Update mock balance
      setMockEscrowBalance(TEST_CONTRACT, "XLM", "2000");

      // Advance time while paused
      await act(async () => {
        vi.advanceTimersByTime(4000);
        await Promise.resolve();
      });
      // Should not have updated while paused
      expect(result.current.balances.XLM?.balance).toBe("1000.00");

      // Resume polling
      act(() => {
        result.current.resume();
      });
      expect(result.current.isPolling).toBe(true);

      // Advance time after resume
      await act(async () => {
        vi.advanceTimersByTime(2000);
        await Promise.resolve();
      });
      expect(result.current.balances.XLM?.balance).toBe("2000.00");
    });

    it("allows manual trigger via refetch / refresh", async () => {
      setMockEscrowBalance(TEST_CONTRACT, "XLM", "100");

      const { result } = renderHook(() =>
        useEscrowBalance(TEST_CONTRACT, { pollingIntervalMs: 0 }),
      );

      await act(async () => {
        await Promise.resolve();
      });
      expect(result.current.balances.XLM?.balance).toBe("100.00");

      // Update balance
      setMockEscrowBalance(TEST_CONTRACT, "XLM", "350");

      await act(async () => {
        await result.current.refetch();
      });

      expect(result.current.balances.XLM?.balance).toBe("350.00");
    });

    it("cleans up polling interval on unmount", async () => {
      vi.useFakeTimers();
      const clearIntervalSpy = vi.spyOn(globalThis, "clearInterval");

      const { unmount } = renderHook(() =>
        useEscrowBalance({
          contractAddress: TEST_CONTRACT,
          pollingIntervalMs: 5000,
        }),
      );

      await act(async () => {
        await Promise.resolve();
      });

      unmount();
      expect(clearIntervalSpy).toHaveBeenCalled();
    });

    it("works with useEscrow alias", async () => {
      setMockEscrowBalance(TEST_CONTRACT, "XLM", "777");

      const { result } = renderHook(() => useEscrow(TEST_CONTRACT));

      await act(async () => {
        await Promise.resolve();
      });

      expect(result.current.balances.XLM?.balance).toBe("777.00");
    });
  });
});
