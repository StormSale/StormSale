// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  fetchLiveOracleRates,
  convertFiatToXlm,
  convertXlmToFiat,
  formatOracleFreshness,
  clearOracleCache,
  FALLBACK_RATES,
} from "../lib/priceOracle";

describe("priceOracle (#145)", () => {
  beforeEach(() => {
    clearOracleCache();
    vi.restoreAllMocks();
  });

  it("converts USD and EUR fiat amounts to exact XLM equivalents", () => {
    const mockRates = {
      USD: 0.125, // $0.125 / XLM => $100 = 800 XLM
      EUR: 0.1, // €0.10 / XLM => €50 = 500 XLM
      USDC: 0.125,
    };

    expect(convertFiatToXlm(100, "USD", mockRates)).toBe(800);
    expect(convertFiatToXlm(50, "EUR", mockRates)).toBe(500);
    expect(convertFiatToXlm(0, "USD", mockRates)).toBe(0);
    expect(convertFiatToXlm(-10, "USD", mockRates)).toBe(0);
  });

  it("converts XLM amounts to estimated fiat amounts", () => {
    const mockRates = {
      USD: 0.125,
      EUR: 0.115,
      USDC: 0.125,
    };

    expect(convertXlmToFiat(800, "USD", mockRates)).toBe(100);
    expect(convertXlmToFiat(1000, "EUR", mockRates)).toBe(115);
  });

  it("caches live oracle rates for 60 seconds", async () => {
    const mockCgResponse = {
      stellar: {
        usd: 0.15,
        eur: 0.138,
        usdc: 0.15,
      },
    };

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify(mockCgResponse), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const firstCall = await fetchLiveOracleRates(true);
    expect(firstCall.rates.USD).toBe(0.15);
    expect(firstCall.source).toBe("CoinGecko");
    expect(firstCall.isStale).toBe(false);
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    // Second call within TTL should return from cache without re-fetching
    const secondCall = await fetchLiveOracleRates(false);
    expect(secondCall.rates.USD).toBe(0.15);
    expect(secondCall.cached).toBe(true);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("falls back to Pyth feed if CoinGecko request fails", async () => {
    // 1st fetch (CoinGecko) fails
    // 2nd fetch (Pyth) succeeds
    const mockPythResponse = {
      parsed: [
        {
          price: {
            price: "14250000",
            expo: -8, // 14250000 * 10^-8 = 0.1425
          },
        },
      ],
    };

    vi.spyOn(globalThis, "fetch")
      .mockRejectedValueOnce(new Error("CoinGecko API rate limit 429"))
      .mockResolvedValueOnce(
        new Response(JSON.stringify(mockPythResponse), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );

    const res = await fetchLiveOracleRates(true);
    expect(res.rates.USD).toBe(0.1425);
    expect(res.source).toBe("Pyth");
    expect(res.isStale).toBe(false);
  });

  it("uses authoritative fallback rates when network is offline", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Network offline"));

    const res = await fetchLiveOracleRates(true);
    expect(res.rates).toEqual(FALLBACK_RATES);
    expect(res.source).toBe("Authoritative Fallback");
    expect(res.isStale).toBe(true);
  });

  it("formats relative freshness time accurately", () => {
    const now = Date.now();
    expect(formatOracleFreshness(now - 2000, now)).toBe("Just now");
    expect(formatOracleFreshness(now - 25000, now)).toBe("25s ago");
    expect(formatOracleFreshness(now - 180000, now)).toBe("3m ago");
  });
});
