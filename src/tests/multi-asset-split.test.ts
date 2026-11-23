import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  validateSplitBps,
  calculatePaymentSplit,
  calculateMultiAssetBatchSaleSplit,
  fetchDynamicAssetQuote,
  convertAssetAmount,
  formatBaseUnits,
  parseToBaseUnits,
  TOTAL_BPS,
  type PaymentSplitConfig,
  type BatchSalePaymentItem,
} from "../lib/multiAssetSplit";
import * as priceOracle from "../lib/priceOracle";
import type { OracleRates } from "../lib/priceOracle";

describe("Multi-Asset Batch Sale Payment Split Calculations (#466)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe("1. Basis Point (bps) Fee Split Validation (Sum == 10,000 bps)", () => {
    it("accepts valid fee splits summing to exactly 10,000 bps (100%)", () => {
      const validConfigs: PaymentSplitConfig[] = [
        { creatorBps: 8000, platformFeeBps: 500, affiliatePoolBps: 1500 }, // 80% / 5% / 15%
        { creatorBps: 7000, platformFeeBps: 1000, affiliatePoolBps: 2000 }, // 70% / 10% / 20%
        { creatorBps: 9500, platformFeeBps: 500, affiliatePoolBps: 0 }, // 95% / 5% / 0%
        { creatorBps: 0, platformFeeBps: 10000, affiliatePoolBps: 0 }, // 0% / 100% / 0%
        { creatorBps: 3333, platformFeeBps: 3334, affiliatePoolBps: 3333 }, // 33.33% / 33.34% / 33.33%
      ];

      for (const config of validConfigs) {
        const result = validateSplitBps(config);
        expect(result.valid).toBe(true);
        expect(result.totalBps).toBe(TOTAL_BPS);
        expect(result.errors).toHaveLength(0);
      }
    });

    it("rejects fee splits summing to less than 10,000 bps", () => {
      const underConfigs: PaymentSplitConfig[] = [
        { creatorBps: 8000, platformFeeBps: 500, affiliatePoolBps: 1499 }, // 9,999 bps
        { creatorBps: 7000, platformFeeBps: 500, affiliatePoolBps: 1000 }, // 8,500 bps
        { creatorBps: 0, platformFeeBps: 0, affiliatePoolBps: 0 }, // 0 bps
      ];

      for (const config of underConfigs) {
        const result = validateSplitBps(config);
        expect(result.valid).toBe(false);
        expect(result.errors.length).toBeGreaterThan(0);
        expect(result.errors[0]).toContain("must equal exactly 10,000 bps");
      }
    });

    it("rejects fee splits summing to more than 10,000 bps", () => {
      const overConfigs: PaymentSplitConfig[] = [
        { creatorBps: 8000, platformFeeBps: 500, affiliatePoolBps: 1501 }, // 10,001 bps
        { creatorBps: 9000, platformFeeBps: 1000, affiliatePoolBps: 500 }, // 10,500 bps
      ];

      for (const config of overConfigs) {
        const result = validateSplitBps(config);
        expect(result.valid).toBe(false);
        expect(result.errors.length).toBeGreaterThan(0);
        expect(result.errors[0]).toContain("must equal exactly 10,000 bps");
      }
    });

    it("rejects negative or NaN fee split basis points", () => {
      const invalidConfigs: PaymentSplitConfig[] = [
        { creatorBps: -500, platformFeeBps: 500, affiliatePoolBps: 10000 },
        { creatorBps: 8000, platformFeeBps: -100, affiliatePoolBps: 2100 },
        { creatorBps: NaN, platformFeeBps: 500, affiliatePoolBps: 9500 },
      ];

      for (const config of invalidConfigs) {
        const result = validateSplitBps(config);
        expect(result.valid).toBe(false);
        expect(result.errors.length).toBeGreaterThan(0);
      }
    });

    it("rejects fractional fee allocations even if their sum equals 10,000 bps", () => {
      const fractionalConfig: PaymentSplitConfig = {
        creatorBps: 7000.5,
        platformFeeBps: 2000.5,
        affiliatePoolBps: 999, // sum = 10,000
      };
      const result = validateSplitBps(fractionalConfig);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors.some((e) => e.includes("non-negative integer"))).toBe(true);
    });

    it("throws an explicit error when attempting calculation with invalid bps config", () => {
      const invalidConfig: PaymentSplitConfig = {
        creatorBps: 8000,
        platformFeeBps: 500,
        affiliatePoolBps: 1000, // Sum = 9,500 bps
      };

      expect(() => {
        calculatePaymentSplit(10_000_000n, "XLM", invalidConfig);
      }).toThrow(/Invalid fee split configuration/);
    });
  });

  describe("2. Dust Handling & Rounding Safety (Remainder Allocated to Platform Fee)", () => {
    const standardConfig: PaymentSplitConfig = {
      creatorBps: 8000, // 80%
      platformFeeBps: 500, // 5%
      affiliatePoolBps: 1500, // 15%
    };

    it("allocates remainder Stroops to platform fee when splitting indivisible amounts in XLM", () => {
      // 103 Stroops:
      // Creator (80%): 103 * 8000 / 10000 = 82.4 -> 82 Stroops
      // Affiliate (15%): 103 * 1500 / 10000 = 15.45 -> 15 Stroops
      // Platform base (5%): 103 * 500 / 10000 = 5.15 -> 5 Stroops
      // Subtotal = 82 + 15 + 5 = 102 Stroops
      // Dust = 103 - 102 = 1 Stroop
      // Platform final = 5 + 1 = 6 Stroops
      const amount = 103n;
      const split = calculatePaymentSplit(amount, "XLM", standardConfig);

      expect(split.creatorAmount).toBe(82n);
      expect(split.affiliatePoolAmount).toBe(15n);
      expect(split.dustAllocatedToPlatform).toBe(1n);
      expect(split.platformFeeAmount).toBe(6n);

      // Invariant: Zero dust loss
      expect(split.creatorAmount + split.platformFeeAmount + split.affiliatePoolAmount).toBe(
        amount,
      );
    });

    it("preserves exact conservation across USDC and EURC payments", () => {
      // USDC test with 10_000_007 micro-units (approx 1.0000007 USDC)
      const usdcAmount = 10_000_007n;
      const usdcSplit = calculatePaymentSplit(usdcAmount, "USDC", standardConfig);

      expect(
        usdcSplit.creatorAmount + usdcSplit.platformFeeAmount + usdcSplit.affiliatePoolAmount,
      ).toBe(usdcAmount);
      expect(usdcSplit.dustAllocatedToPlatform).toBeGreaterThanOrEqual(0n);

      // EURC test with 999_999 micro-units
      const eurcAmount = 999_999n;
      const eurcSplit = calculatePaymentSplit(eurcAmount, "EURC", standardConfig);

      expect(
        eurcSplit.creatorAmount + eurcSplit.platformFeeAmount + eurcSplit.affiliatePoolAmount,
      ).toBe(eurcAmount);
      expect(eurcSplit.dustAllocatedToPlatform).toBeGreaterThanOrEqual(0n);
    });

    it("handles minimal 1 Stroop / 1 Cent amount without arithmetic overflow", () => {
      const amount = 1n;
      // 1 * 8000 / 10000 = 0
      // 1 * 1500 / 10000 = 0
      // 1 * 500 / 10000 = 0
      // Dust = 1
      // Platform receives the entire 1 Stroop dust
      const split = calculatePaymentSplit(amount, "XLM", standardConfig);

      expect(split.creatorAmount).toBe(0n);
      expect(split.affiliatePoolAmount).toBe(0n);
      expect(split.dustAllocatedToPlatform).toBe(1n);
      expect(split.platformFeeAmount).toBe(1n);
      expect(split.creatorAmount + split.platformFeeAmount + split.affiliatePoolAmount).toBe(
        amount,
      );
    });

    it("handles zero total amount gracefully", () => {
      const split = calculatePaymentSplit(0n, "XLM", standardConfig);

      expect(split.totalAmount).toBe(0n);
      expect(split.creatorAmount).toBe(0n);
      expect(split.platformFeeAmount).toBe(0n);
      expect(split.affiliatePoolAmount).toBe(0n);
      expect(split.dustAllocatedToPlatform).toBe(0n);
      expect(split.totalFormatted).toBe("0.0000000");
    });

    it("rejects negative payment amounts", () => {
      expect(() => {
        calculatePaymentSplit(-100n, "XLM", standardConfig);
      }).toThrow(/cannot be negative/);
    });

    it("handles prime numbers and multi-digit fractions across 1,000 iterations without single-stroop drift", () => {
      const primes = [3n, 7n, 11n, 13n, 17n, 19n, 23n, 29n, 31n, 97n, 997n, 65537n, 1_000_003n];
      const threeWayEqualConfig: PaymentSplitConfig = {
        creatorBps: 3333,
        platformFeeBps: 3334,
        affiliatePoolBps: 3333,
      };

      for (const prime of primes) {
        const split = calculatePaymentSplit(prime, "XLM", threeWayEqualConfig);
        const sum = split.creatorAmount + split.platformFeeAmount + split.affiliatePoolAmount;
        expect(sum).toBe(prime);
      }
    });
  });

  describe("3. Dynamic Quote Fetching & Multi-Asset Conversion", () => {
    const mockOracleRates: OracleRates = {
      USD: 0.125, // 1 XLM = $0.125 USD (8 XLM per USD)
      EUR: 0.115, // 1 XLM = €0.115 EUR
      USDC: 0.125, // 1 XLM = 0.125 USDC
    };

    it("returns direct 1.0 rate for identical asset quotes", async () => {
      const quoteXlm = await fetchDynamicAssetQuote("XLM", "XLM", mockOracleRates);
      expect(quoteXlm.rate).toBe(1.0);
      expect(quoteXlm.source).toBe("direct");

      const quoteUsdc = await fetchDynamicAssetQuote("USDC", "USDC", mockOracleRates);
      expect(quoteUsdc.rate).toBe(1.0);
      expect(quoteUsdc.source).toBe("direct");
    });

    it("fetches dynamic quotes for XLM -> USDC and USDC -> XLM conversions", async () => {
      // XLM -> USDC: 1 XLM = 0.125 USDC
      const xlmToUsdc = await fetchDynamicAssetQuote("XLM", "USDC", mockOracleRates);
      expect(xlmToUsdc.rate).toBe(0.125);

      // USDC -> XLM: 1 USDC = 8.0 XLM (1 / 0.125)
      const usdcToXlm = await fetchDynamicAssetQuote("USDC", "XLM", mockOracleRates);
      expect(usdcToXlm.rate).toBe(8.0);
    });

    it("fetches dynamic quotes for cross-fiat EURC and USDC conversions", async () => {
      // USDC -> EURC: EUR rate / USDC rate = 0.115 / 0.125 = 0.92
      const usdcToEurc = await fetchDynamicAssetQuote("USDC", "EURC", mockOracleRates);
      expect(Math.round(usdcToEurc.rate * 1000) / 1000).toBe(0.92);

      // EURC -> USDC: 0.125 / 0.115 = 1.0869...
      const eurcToUsdc = await fetchDynamicAssetQuote("EURC", "USDC", mockOracleRates);
      expect(eurcToUsdc.rate).toBeGreaterThan(1.08);
    });

    it("converts payment amounts using dynamic quotes with integer precision", async () => {
      const quote = await fetchDynamicAssetQuote("USDC", "XLM", mockOracleRates);
      // 100 USDC (100 * 10^7 base units) at rate 8.0 = 800 XLM (800 * 10^7 base units)
      const usdcAmount = 100n * 10_000_000n;
      const convertedXlm = convertAssetAmount(usdcAmount, quote);

      expect(convertedXlm).toBe(800n * 10_000_000n);
      expect(formatBaseUnits(convertedXlm)).toBe("800.0000000");
    });

    it("converts small fractional amounts without negative results or precision loss", async () => {
      const quote = await fetchDynamicAssetQuote("XLM", "USDC", mockOracleRates);
      // 10 XLM = 1.25 USDC
      const xlmAmount = 10n * 10_000_000n;
      const convertedUsdc = convertAssetAmount(xlmAmount, quote);

      expect(convertedUsdc).toBe(12_500_000n);
      expect(formatBaseUnits(convertedUsdc)).toBe("1.2500000");
    });

    it("fetches live rates from oracle module when customRates is omitted and propagates source", async () => {
      const fetchSpy = vi.spyOn(priceOracle, "fetchLiveOracleRates").mockResolvedValueOnce({
        rates: {
          USD: 0.2,
          EUR: 0.18,
          USDC: 0.2,
        },
        source: "CoinGecko",
        updatedAt: Date.now(),
        isStale: false,
        cached: false,
      });

      // Call without third argument (customRates omitted)
      const quote = await fetchDynamicAssetQuote("XLM", "USDC");
      expect(fetchSpy).toHaveBeenCalled();
      expect(quote.rate).toBe(0.2);
      expect(quote.source).toBe("oracle");

      // Verify converted amount with this quote rate
      const xlmAmount = 100n * 10_000_000n; // 100 XLM
      expect(convertAssetAmount(xlmAmount, quote)).toBe(20n * 10_000_000n); // 20 USDC

      // Change the mocked rate and verify the converted amount changes
      fetchSpy.mockResolvedValueOnce({
        rates: {
          USD: 0.5,
          EUR: 0.45,
          USDC: 0.5,
        },
        source: "Pyth",
        updatedAt: Date.now(),
        isStale: false,
        cached: false,
      });

      const updatedQuote = await fetchDynamicAssetQuote("XLM", "USDC");
      expect(updatedQuote.rate).toBe(0.5);
      expect(updatedQuote.source).toBe("oracle");
      expect(convertAssetAmount(xlmAmount, updatedQuote)).toBe(50n * 10_000_000n); // 50 USDC
    });

    it("marks quote source as fallback when oracle fails or returns authoritative fallback", async () => {
      vi.spyOn(priceOracle, "fetchLiveOracleRates").mockResolvedValueOnce({
        rates: priceOracle.FALLBACK_RATES,
        source: "Authoritative Fallback",
        updatedAt: Date.now(),
        isStale: true,
        cached: false,
      });

      const quote = await fetchDynamicAssetQuote("XLM", "USDC");
      expect(quote.source).toBe("fallback");
      expect(quote.rate).toBe(priceOracle.FALLBACK_RATES.USDC || priceOracle.FALLBACK_RATES.USD);

      // And when fetchLiveOracleRates rejects
      vi.spyOn(priceOracle, "fetchLiveOracleRates").mockRejectedValueOnce(
        new Error("Network offline"),
      );
      const fallbackQuote = await fetchDynamicAssetQuote("XLM", "EURC");
      expect(fallbackQuote.source).toBe("fallback");
      expect(fallbackQuote.rate).toBe(priceOracle.FALLBACK_RATES.EUR);
    });

    it("retains full decimal precision for rates with more than seven decimal places", () => {
      // 12-decimal precision rate
      const highPrecisionQuote = {
        fromAsset: "XLM" as const,
        toAsset: "USDC" as const,
        rate: 0.123456789123,
        quotedAt: Date.now(),
        source: "oracle" as const,
      };

      const inputAmount = 100_000_000_000n; // 10,000 XLM in base units
      const converted = convertAssetAmount(inputAmount, highPrecisionQuote);
      // 100_000_000_000 * 0.123456789123 = 12_345_678_912.3 -> rounds to 12_345_678_912n
      expect(converted).toBe(12_345_678_912n);

      // Existing 0.125 and 8.0 cases remain exact
      const quoteEighth = {
        fromAsset: "XLM" as const,
        toAsset: "USDC" as const,
        rate: 0.125,
        quotedAt: Date.now(),
        source: "oracle" as const,
      };
      expect(convertAssetAmount(10_000_000n, quoteEighth)).toBe(1_250_000n);

      const quoteEight = {
        fromAsset: "USDC" as const,
        toAsset: "XLM" as const,
        rate: 8.0,
        quotedAt: Date.now(),
        source: "oracle" as const,
      };
      expect(convertAssetAmount(1_250_000n, quoteEight)).toBe(10_000_000n);
    });

    it("rejects non-finite or non-positive exchange rates with an explicit error", async () => {
      const invalidOracleRates: OracleRates = {
        USD: 0,
        EUR: -1.05,
        USDC: NaN,
      };

      await expect(fetchDynamicAssetQuote("XLM", "USDC", invalidOracleRates)).rejects.toThrow(
        /Rate must be finite and greater than zero/,
      );

      expect(() => {
        convertAssetAmount(100n, {
          fromAsset: "XLM",
          toAsset: "USDC",
          rate: 0,
          quotedAt: Date.now(),
          source: "oracle",
        });
      }).toThrow(/Rate must be finite and greater than zero/);

      expect(() => {
        convertAssetAmount(100n, {
          fromAsset: "XLM",
          toAsset: "USDC",
          rate: -0.5,
          quotedAt: Date.now(),
          source: "oracle",
        });
      }).toThrow(/Rate must be finite and greater than zero/);

      expect(() => {
        convertAssetAmount(100n, {
          fromAsset: "XLM",
          toAsset: "USDC",
          rate: Infinity,
          quotedAt: Date.now(),
          source: "oracle",
        });
      }).toThrow(/Rate must be finite and greater than zero/);
    });
  });

  describe("4. Multi-Asset Batch Sale Aggregation", () => {
    const config: PaymentSplitConfig = {
      creatorBps: 8500, // 85%
      platformFeeBps: 300, // 3%
      affiliatePoolBps: 1200, // 12%
    };

    it("correctly aggregates splits across a batch with mixed USDC, XLM, and EURC sales", () => {
      const batchItems: BatchSalePaymentItem[] = [
        {
          id: "sale-1",
          orderId: "ORD-XLM-01",
          asset: "XLM",
          amount: parseToBaseUnits("150.0000000"),
        },
        {
          id: "sale-2",
          orderId: "ORD-USDC-02",
          asset: "USDC",
          amount: parseToBaseUnits("45.5000000"),
        },
        {
          id: "sale-3",
          orderId: "ORD-EURC-03",
          asset: "EURC",
          amount: parseToBaseUnits("32.2500000"),
        },
        {
          id: "sale-4",
          orderId: "ORD-XLM-04",
          asset: "XLM",
          amount: 103n, // small odd amount to force dust
        },
      ];

      const summary = calculateMultiAssetBatchSaleSplit(batchItems, config);

      expect(summary.itemAllocations).toHaveLength(4);

      // Verify known totals by asset
      expect(summary.totalByAsset.XLM).toBe(1_500_000_103n);
      expect(summary.totalByAsset.USDC).toBe(455_000_000n);
      expect(summary.totalByAsset.EURC).toBe(322_500_000n);

      // Verify exact expected role allocations for XLM
      expect(summary.creatorTotalByAsset.XLM).toBe(1_275_000_087n);
      expect(summary.platformFeeTotalByAsset.XLM).toBe(45_000_004n);
      expect(summary.affiliatePoolTotalByAsset.XLM).toBe(180_000_012n);
      const totalXlm = summary.totalByAsset.XLM;
      const sumXlm =
        summary.creatorTotalByAsset.XLM +
        summary.platformFeeTotalByAsset.XLM +
        summary.affiliatePoolTotalByAsset.XLM;
      expect(sumXlm).toBe(totalXlm);

      // Verify exact expected role allocations for USDC
      expect(summary.creatorTotalByAsset.USDC).toBe(386_750_000n);
      expect(summary.platformFeeTotalByAsset.USDC).toBe(13_650_000n);
      expect(summary.affiliatePoolTotalByAsset.USDC).toBe(54_600_000n);
      const totalUsdc = summary.totalByAsset.USDC;
      const sumUsdc =
        summary.creatorTotalByAsset.USDC +
        summary.platformFeeTotalByAsset.USDC +
        summary.affiliatePoolTotalByAsset.USDC;
      expect(sumUsdc).toBe(totalUsdc);

      // Verify exact expected role allocations for EURC
      expect(summary.creatorTotalByAsset.EURC).toBe(274_125_000n);
      expect(summary.platformFeeTotalByAsset.EURC).toBe(9_675_000n);
      expect(summary.affiliatePoolTotalByAsset.EURC).toBe(38_700_000n);
      const totalEurc = summary.totalByAsset.EURC;
      const sumEurc =
        summary.creatorTotalByAsset.EURC +
        summary.platformFeeTotalByAsset.EURC +
        summary.affiliatePoolTotalByAsset.EURC;
      expect(sumEurc).toBe(totalEurc);

      // Platform dust was collected
      expect(summary.totalDustByAsset.XLM).toBeGreaterThanOrEqual(1n);
    });

    it("parses and formats base units accurately", () => {
      const parsed = parseToBaseUnits("123.4567890");
      expect(parsed).toBe(1_234_567_890n);
      expect(formatBaseUnits(parsed)).toBe("123.4567890");

      const zero = parseToBaseUnits("0");
      expect(zero).toBe(0n);
      expect(formatBaseUnits(zero)).toBe("0.0000000");
    });

    it("handles numeric inputs in scientific exponent notation consistently with string representation", () => {
      // 1e-7 in base units is 1n
      expect(parseToBaseUnits(1e-7)).toBe(1n);
      expect(parseToBaseUnits("0.0000001")).toBe(1n);
      expect(parseToBaseUnits(1e-7)).toBe(parseToBaseUnits("0.0000001"));

      // 1e-5 in base units is 100n
      expect(parseToBaseUnits(1e-5)).toBe(100n);
      expect(parseToBaseUnits("0.00001")).toBe(100n);

      // Large exponent 1e3
      expect(parseToBaseUnits(1e3)).toBe(1_000n * 10_000_000n);
      expect(parseToBaseUnits("1000")).toBe(1_000n * 10_000_000n);
    });

    it("preserves exact base units when parsing exponent strings without precision loss", () => {
      const expStr = "1.0000005e1";
      const positionalStr = "10.000005";
      expect(parseToBaseUnits(expStr)).toBe(parseToBaseUnits(positionalStr));
      expect(parseToBaseUnits(expStr)).toBe(100_000_050n);
    });
  });
});
