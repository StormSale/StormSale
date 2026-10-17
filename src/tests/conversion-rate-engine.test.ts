import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import {
  getLiveOracleRates,
  convertFiatToXlm,
  lockConversionRate,
  clearRateCache,
  formatFreshness,
  PYTH_XLM_USD_FEED_ID,
  type OracleRateData,
} from "../lib/oracleEngine";
import { triggerConversionPostback, resetWebhookEngineStore } from "../lib/webhookEngine";

describe("Multi-Currency Conversion Rate Engine Suite", () => {
  beforeEach(() => {
    clearRateCache();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    clearRateCache();
  });

  it("fetches and caches live CoinGecko rates on primary success", async () => {
    const mockResponse = {
      stellar: {
        usd: 0.145,
        eur: 0.133,
        usdc: 0.145,
      },
    };

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
    } as Response);

    const result = await getLiveOracleRates(true);

    expect(result.source).toBe("CoinGecko");
    expect(result.isStale).toBe(false);
    expect(result.rates.USD).toBe(0.145);
    expect(result.rates.EUR).toBe(0.133);
    expect(result.rates.USDC).toBe(0.145);
  });

  it("reuses cached rates within 60-second TTL without making new network calls", async () => {
    const mockResponse = {
      stellar: { usd: 0.15, eur: 0.14, usdc: 0.15 },
    };

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => mockResponse,
    } as Response);

    // Initial fetch
    const firstCall = await getLiveOracleRates();
    expect(firstCall.rates.USD).toBe(0.15);
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    // Second call within 60s TTL
    const secondCall = await getLiveOracleRates();
    expect(secondCall.rates.USD).toBe(0.15);
    expect(fetchSpy).toHaveBeenCalledTimes(1); // Cached, no second fetch
  });

  it("deduplicates concurrent in-flight requests into a single network call", async () => {
    const mockResponse = {
      stellar: { usd: 0.16, eur: 0.15, usdc: 0.16 },
    };

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      await new Promise((res) => setTimeout(res, 20));
      return {
        ok: true,
        json: async () => mockResponse,
      } as Response;
    });

    const [first, second, third] = await Promise.all([
      getLiveOracleRates(true),
      getLiveOracleRates(false),
      getLiveOracleRates(false),
    ]);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(first.rates.USD).toBe(0.16);
    expect(second.rates.USD).toBe(0.16);
    expect(third.rates.USD).toBe(0.16);
  });

  it("falls back to Pyth Network when CoinGecko fails and verifies the exact XLM/USD feed ID", async () => {
    // 1st fetch: CoinGecko fails
    // 2nd fetch: Pyth succeeds
    const pythResponse = {
      parsed: [
        {
          price: {
            price: "13500000",
            expo: -8, // 13500000 * 10^-8 = 0.135
          },
        },
      ],
    };

    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValueOnce(new Error("CoinGecko Network Rate Limited"))
      .mockResolvedValueOnce({
        ok: true,
        json: async () => pythResponse,
      } as Response);

    const result = await getLiveOracleRates(true);

    expect(result.source).toBe("Pyth Network");
    expect(result.isStale).toBe(false);
    expect(result.rates.USD).toBe(0.135);
    expect(fetchSpy).toHaveBeenCalledTimes(2);

    // Verify the requested fallback URL contains the official Pyth XLM/USD feed ID
    const pythUrl = fetchSpy.mock.calls[1][0] as string;
    expect(pythUrl).toContain(PYTH_XLM_USD_FEED_ID);
  });

  it("validates and rejects non-positive or NaN Pyth prices", async () => {
    const invalidPyth = {
      parsed: [{ price: { price: "-100", expo: -2 } }],
    };
    vi.spyOn(globalThis, "fetch")
      .mockRejectedValueOnce(new Error("CoinGecko failed"))
      .mockResolvedValueOnce({
        ok: true,
        json: async () => invalidPyth,
      } as Response);

    const result = await getLiveOracleRates(true);
    expect(result.source).toBe("Unavailable");
    expect(result.isStale).toBe(true);
  });

  it("returns explicit unavailable state when all oracles fail and no cache exists", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Offline"));

    const result = await getLiveOracleRates(true);

    expect(result.isStale).toBe(true);
    expect(result.source).toBe("Unavailable");
    expect(result.rates.USD).toBe(0);
    expect(result.timestamp).toBe(0);
  });

  it("accurately converts USD to XLM based on oracle exchange rate", () => {
    const oracleData: OracleRateData = {
      rates: { USD: 0.125, EUR: 0.115, USDC: 0.125 },
      timestamp: Date.now(),
      source: "CoinGecko",
      isStale: false,
    };

    // $100 USD / 0.125 = 800 XLM
    const conversion = convertFiatToXlm(100, "USD", oracleData);

    expect(conversion.fiatAmount).toBe(100);
    expect(conversion.fiatCurrency).toBe("USD");
    expect(conversion.rateUsed).toBe(0.125);
    expect(conversion.xlmAmount).toBe(800);
    expect(conversion.isStale).toBe(false);
  });

  it("accurately converts EUR to XLM", () => {
    const oracleData: OracleRateData = {
      rates: { USD: 0.125, EUR: 0.1, USDC: 0.125 },
      timestamp: Date.now(),
      source: "CoinGecko",
      isStale: false,
    };

    // €50 EUR / 0.10 = 500 XLM
    const conversion = convertFiatToXlm(50, "EUR", oracleData);

    expect(conversion.fiatAmount).toBe(50);
    expect(conversion.xlmAmount).toBe(500);
    expect(conversion.rateUsed).toBe(0.1);
  });

  it("handles native XLM conversion without rate division", () => {
    const oracleData: OracleRateData = {
      rates: { USD: 0.125, EUR: 0.115, USDC: 0.125 },
      timestamp: Date.now(),
      source: "CoinGecko",
      isStale: false,
    };

    const conversion = convertFiatToXlm(250, "XLM", oracleData);

    expect(conversion.xlmAmount).toBe(250);
    expect(conversion.rateUsed).toBe(1);
    expect(conversion.fiatCurrency).toBe("XLM");
  });

  it("throws when converting with unavailable exchange rate", () => {
    const unavailableData: OracleRateData = {
      rates: { USD: 0 },
      timestamp: 0,
      source: "Unavailable",
      isStale: true,
    };

    expect(() => convertFiatToXlm(100, "USD", unavailableData)).toThrow(
      "Exchange rate for USD is currently unavailable",
    );
  });

  it("locks conversion rate metadata with exact exchange rate and oracle timestamp", () => {
    const fixedTime = Date.now();
    const oracleData: OracleRateData = {
      rates: { USD: 0.14, EUR: 0.128, USDC: 0.14 },
      timestamp: fixedTime,
      source: "Pyth Network",
      isStale: false,
    };

    const locked = lockConversionRate(70, "USD", oracleData);

    // 70 / 0.14 = 500 XLM
    expect(locked.originalAmount).toBe(70);
    expect(locked.originalCurrency).toBe("USD");
    expect(locked.convertedXlmAmount).toBe("500.0000");
    expect(locked.exchangeRate).toBe(0.14);
    expect(locked.oracleProvider).toBe("Pyth Network");
    expect(locked.isStaleAtLock).toBe(false);
    expect(locked.rateTimestamp).toBe(new Date(fixedTime).toISOString());
  });

  it("formats freshness timestamps accurately", () => {
    const now = Date.now();
    expect(formatFreshness(now - 2000)).toBe("Updated just now");
    expect(formatFreshness(now - 25000)).toBe("Updated 25s ago");
    expect(formatFreshness(now - 120000)).toBe("Updated 2m ago");
    expect(formatFreshness(0)).toBe("Rates unavailable");
  });

  it("includes metadata in outgoing conversion postback webhook payload", async () => {
    resetWebhookEngineStore();

    const deliveries = await triggerConversionPostback({
      saleId: "SALE_WITH_METADATA_1",
      campaignAddress: "CCAMPAIGN_ADDR_TEST",
      affiliateAddress: "GAFFILIATE_ADDR_TEST",
      advertiserAddress: "GADVERTISER_ADDR_TEST",
      saleAmount: "500.0000",
      currency: "XLM",
      stellarTxHash: "0x123abc456def",
      ledgerTimestamp: new Date().toISOString(),
      customerRef: "REF_VIP_999",
      status: "CONFIRMED_ON_LEDGER",
      metadata: {
        fiatAmount: 70,
        fiatCurrency: "USD",
        oracleRateUsed: 0.14,
        oracleProvider: "Pyth Network",
      },
    });

    expect(deliveries.length).toBeGreaterThan(0);
    const postback = deliveries[0];
    const data = postback.payload.data as any;
    expect(data.metadata).toBeDefined();
    expect(data.metadata.fiatAmount).toBe(70);
    expect(data.metadata.fiatCurrency).toBe("USD");
    expect(data.metadata.oracleRateUsed).toBe(0.14);
    expect(data.metadata.oracleProvider).toBe("Pyth Network");
  });
});
