import { describe, expect, it } from "vitest";
import {
  constantProductOutput,
  computeSwapQuote,
  resolveSwapRoute,
  quoteSwap,
  simulateSwapFootprint,
  formatBaseUnits,
  toBaseUnits,
  toAutoSwapReceipt,
} from "../lib/sorobanDex";
import { executeBatchCommissionClaim, type ClaimableCampaignItem } from "../lib/batchClaim";

describe("Soroban DEX cross-asset swap engine (#127)", () => {
  it("prices a single constant-product hop with exact integer math", () => {
    // x*y=k, no fee: out = 10*1000/(1000+10) = 9 (floored)
    expect(constantProductOutput(10n, 1000n, 1000n, 0)).toBe(9n);
    // With a 30bps fee the effective input shrinks slightly, output still 9.
    expect(constantProductOutput(10n, 1000n, 1000n, 30)).toBe(9n);
    // Zero / negative inputs yield no output rather than throwing.
    expect(constantProductOutput(0n, 1000n, 1000n, 30)).toBe(0n);
  });

  it("resolves a direct route when a pool exists for the pair", () => {
    const route = resolveSwapRoute("XLM", "USDC");
    expect(route.hops).toHaveLength(1);
    expect(route.hops[0].from).toBe("XLM");
    expect(route.hops[0].to).toBe("USDC");
  });

  it("falls back to a multi-hop route through the XLM base asset", () => {
    // No direct USDC -> EURC pool exists, so routing goes USDC -> XLM -> EURC.
    const route = resolveSwapRoute("USDC", "EURC");
    expect(route.hops).toHaveLength(2);
    expect(route.hops.map((h) => h.to)).toEqual(["XLM", "EURC"]);
    expect(simulateSwapFootprint(route)).toHaveLength(2);
  });

  it("rejects swapping a token into itself", () => {
    expect(() => resolveSwapRoute("XLM", "XLM")).toThrow(/must differ/);
  });

  it("applies slippage tolerance to derive the on-chain minimum out", () => {
    const route = resolveSwapRoute("XLM", "USDC");
    const quote = computeSwapQuote(toBaseUnits(100, "XLM"), route, 100);
    // minimumOut is exactly 1% below expectedOut at 100 bps.
    expect(quote.minimumOut).toBe((quote.expectedOut * 9900n) / 10000n);
    expect(quote.minimumOut).toBeLessThan(quote.expectedOut);
    expect(quote.maxSlippageBps).toBe(100);
  });

  it("reports non-negative price impact that grows with trade size", () => {
    const route = resolveSwapRoute("XLM", "USDC");
    const small = computeSwapQuote(toBaseUnits(10, "XLM"), route, 100);
    const large = computeSwapQuote(toBaseUnits(500_000, "XLM"), route, 100);
    expect(small.priceImpactBps).toBeGreaterThanOrEqual(0);
    expect(large.priceImpactBps).toBeGreaterThan(small.priceImpactBps);
  });

  it("validates slippage bounds", () => {
    const route = resolveSwapRoute("XLM", "USDC");
    expect(() => computeSwapQuote(toBaseUnits(10, "XLM"), route, 20000)).toThrow(/basis points/);
    expect(() => computeSwapQuote(0n, route, 100)).toThrow(/greater than zero/);
  });

  it("round-trips base-unit formatting at 7 decimals", () => {
    expect(toBaseUnits(1.5, "XLM")).toBe(15_000_000n);
    expect(formatBaseUnits(15_000_000n, "XLM")).toBe("1.5000000");
    expect(formatBaseUnits(toBaseUnits(45.5, "USDC"), "USDC")).toBe("45.5000000");
  });

  it("quotes an end-to-end swap and serialises it to a claim receipt", () => {
    const quote = quoteSwap(toBaseUnits(155.75, "XLM"), "XLM", "USDC", 100);
    expect(quote.from).toBe("XLM");
    expect(quote.to).toBe("USDC");
    const receipt = toAutoSwapReceipt(quote);
    expect(receipt.tokenIn).toBe("XLM");
    expect(receipt.tokenOut).toBe("USDC");
    expect(receipt.hopCount).toBe(1);
    expect(receipt.expectedOut).toMatch(/^\d+\.\d{7}$/);
    expect(receipt.footprint.length).toBeGreaterThan(0);
    expect(receipt.routerName.length).toBeGreaterThan(0);
  });

  it("settles an atomic claim + auto-swap inside one mock transaction", async () => {
    const campaigns: ClaimableCampaignItem[] = [
      {
        campaignId: 1,
        campaignName: "Swap Test",
        advertiserAddress: "GA7QW5KXGPTR4N2K9J2M3N4P5Q6R7S8T9U0V1W2X3Y4Z5A6B7C8D",
        maturedSalesCount: 2,
        claimableXlm: 50,
        clearingPeriodDays: 7,
        lastSaleDate: "2026-10-01",
        status: "matured",
      },
    ];
    const receipt = await executeBatchCommissionClaim(
      "GASTORMSALE7TESTNET7AFFILIATE7MERCHANT7ESCROW7XLM77777",
      campaigns,
      "mock",
      null,
      { enabled: true, tokenIn: "XLM", targetToken: "USDC", maxSlippageBps: 100 },
    );
    expect(receipt.success).toBe(true);
    expect(receipt.autoSwap).toBeDefined();
    expect(receipt.autoSwap?.tokenOut).toBe("USDC");
    expect(receipt.autoSwap?.amountIn).toBe("50.0000000");
  });

  it("skips the swap when the target equals the native payout asset", async () => {
    const campaigns: ClaimableCampaignItem[] = [
      {
        campaignId: 2,
        campaignName: "No Swap Test",
        advertiserAddress: "GA7QW5KXGPTR4N2K9J2M3N4P5Q6R7S8T9U0V1W2X3Y4Z5A6B7C8D",
        maturedSalesCount: 1,
        claimableXlm: 10,
        clearingPeriodDays: 3,
        lastSaleDate: "2026-10-01",
        status: "matured",
      },
    ];
    const receipt = await executeBatchCommissionClaim(
      "GASTORMSALE7TESTNET7AFFILIATE7MERCHANT7ESCROW7XLM77777",
      campaigns,
      "mock",
      null,
      { enabled: true, tokenIn: "XLM", targetToken: "XLM", maxSlippageBps: 100 },
    );
    expect(receipt.autoSwap).toBeUndefined();
  });
});
