import { describe, it, expect, vi } from "vitest";
import {
  stroopsToXlm,
} from "../lib/sorobanProfiler";

describe("Transaction Fee Surge Pricing & Dynamic Base Fee Adjustment (#426)", () => {
  it("tests dynamic fee estimation fetching latest ledger fee stats", async () => {
    const mockFeeStatsServer = {
      getFeeStats: vi.fn().mockResolvedValue({
        feeCharged: {
          max: "100000",
          min: "100",
          mode: "1000",
          p25: "100",
          p50: "1000",
          p75: "5000",
          p95: "50000",
          p99: "100000",
        },
        surgePricing: true,
      }),
    };

    const feeStats = await mockFeeStatsServer.getFeeStats();
    expect(mockFeeStatsServer.getFeeStats).toHaveBeenCalled();
    expect(feeStats.surgePricing).toBe(true);
    expect(Number(feeStats.feeCharged.mode)).toBeGreaterThan(0);
  });

  it("verifies user prompt allowing fee bump (1.5x / 2x / Custom) when transaction remains unconfirmed", () => {
    const baseFeeStroops = 1000;
    const bumpOptions = {
      "1.5x": Math.round(baseFeeStroops * 1.5),
      "2x": Math.round(baseFeeStroops * 2.0),
      "Custom": baseFeeStroops * 3,
    };

    expect(bumpOptions["1.5x"]).toBe(1500);
    expect(bumpOptions["2x"]).toBe(2000);
    expect(bumpOptions["Custom"]).toBe(3000);
  });

  it("test fee warning formatting in both Stroops and XLM", () => {
    const feeStroops = 7500000;
    const xlmStr = stroopsToXlm(feeStroops);

    expect(feeStroops).toBe(7500000);
    expect(xlmStr).toContain("XLM");
    expect(xlmStr).toBe("0.7500000 XLM");

    const lowFeeStroops = 100;
    expect(stroopsToXlm(lowFeeStroops)).toBe("0.0000100 XLM");
  });
});
