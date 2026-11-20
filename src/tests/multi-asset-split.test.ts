import { describe, it, expect, vi } from "vitest";
import {
  BPS_TOTAL,
  validatePaymentSplit,
  splitSalePayment,
  fetchMultiAssetQuote,
  quoteAndSplitSalePayment,
  type PaymentSplitBps,
  type QuoteProvider,
} from "../lib/multiAssetSplit";

function split(creatorBps: number, platformBps: number, affiliatePoolBps: number): PaymentSplitBps {
  return { creatorBps, platformBps, affiliatePoolBps };
}

const STANDARD = split(7000, 1000, 2000);
const EVEN = split(3333, 3334, 3333);

function total(allocations: {
  creator: bigint;
  platformFee: bigint;
  affiliatePool: bigint;
}): bigint {
  return allocations.creator + allocations.platformFee + allocations.affiliatePool;
}

describe("Multi-asset batch sale payment splits (#466)", () => {
  describe("basis point allocations", () => {
    it("accepts splits whose allocations sum to exactly 10,000 bps (100%)", () => {
      const cases = [
        STANDARD,
        split(8000, 500, 1500),
        split(0, 10_000, 0),
        split(5000, 0, 5000),
        EVEN,
      ];

      for (const candidate of cases) {
        const result = validatePaymentSplit(candidate);
        expect(result.valid).toBe(true);
        expect(result.errors).toEqual([]);
        expect(result.totalBps).toBe(BPS_TOTAL);
        expect(candidate.creatorBps + candidate.platformBps + candidate.affiliatePoolBps).toBe(
          10_000,
        );
      }
    });

    it("rejects splits that sum to 9,999 or 10,001 bps", () => {
      const under = validatePaymentSplit(split(6999, 1000, 2000));
      expect(under.valid).toBe(false);
      expect(under.totalBps).toBe(9999);
      expect(under.errors.join(" ")).toMatch(/sum to exactly 10000 bps/);

      const over = validatePaymentSplit(split(7000, 1000, 2001));
      expect(over.valid).toBe(false);
      expect(over.totalBps).toBe(10_001);
      expect(over.errors.join(" ")).toMatch(/sum to exactly 10000 bps/);
    });

    it("rejects fractional, negative and out-of-range bps values", () => {
      expect(validatePaymentSplit(split(7000.5, 1000, 1999.5)).valid).toBe(false);
      expect(validatePaymentSplit(split(-1, 1001, 10_000)).valid).toBe(false);
      expect(validatePaymentSplit(split(10_001, 0, -1)).valid).toBe(false);
      expect(validatePaymentSplit(split(NaN, 5000, 5000)).valid).toBe(false);
    });

    it("refuses to allocate an invalid split", () => {
      expect(() => splitSalePayment(1000n, split(7000, 1000, 2000))).not.toThrow();
      expect(() => splitSalePayment(1000n, split(7000, 1000, 2001))).toThrow(
        /Invalid payment split/,
      );
      expect(() => splitSalePayment(-1n, STANDARD)).toThrow(/must not be negative/);
    });
  });

  describe("dust and remainder handling", () => {
    it("gives the indivisible stroop remainder to the platform fee without loss", () => {
      const amount = 1n;
      const allocations = splitSalePayment(amount, EVEN);

      expect(allocations.creator).toBe(0n);
      expect(allocations.affiliatePool).toBe(0n);
      expect(allocations.platformFee).toBe(1n);
      expect(total(allocations)).toBe(amount);
    });

    it("assigns every leftover cent to the platform fee for awkward amounts", () => {
      const amount = 999n;
      const allocations = splitSalePayment(amount, split(3333, 3333, 3334));

      const flooredCreator = (amount * 3333n) / 10_000n;
      const flooredAffiliate = (amount * 3334n) / 10_000n;
      const flooredPlatform = (amount * 3333n) / 10_000n;
      expect(allocations.creator).toBe(flooredCreator);
      expect(allocations.affiliatePool).toBe(flooredAffiliate);
      expect(allocations.platformFee).toBe(flooredPlatform + 2n);
      expect(total(allocations)).toBe(amount);
    });

    it("keeps creator and affiliate shares at exact floored values while the platform absorbs dust", () => {
      const amount = 1_000_000_001n;
      const allocations = splitSalePayment(amount, STANDARD);

      expect(allocations.creator).toBe(700_000_000n);
      expect(allocations.affiliatePool).toBe(200_000_000n);
      expect(allocations.platformFee).toBe(100_000_001n);
      expect(total(allocations)).toBe(amount);
    });

    it("never loses or mints base units across a wide range of amounts and splits", () => {
      const splits = [STANDARD, EVEN, split(1, 9998, 1), split(4999, 1, 5000), split(0, 0, 10_000)];

      for (const candidate of splits) {
        const expectedPlatform = (amount: bigint) =>
          (amount * BigInt(candidate.platformBps)) / 10_000n;
        for (let value = 1; value <= 75; value++) {
          const amount = BigInt(value);
          const allocations = splitSalePayment(amount, candidate);

          expect(total(allocations)).toBe(amount);
          expect(allocations.creator).toBe((amount * BigInt(candidate.creatorBps)) / 10_000n);
          expect(allocations.affiliatePool).toBe(
            (amount * BigInt(candidate.affiliatePoolBps)) / 10_000n,
          );
          expect(allocations.platformFee).toBeGreaterThanOrEqual(expectedPlatform(amount));
          expect(allocations.platformFee).toBeLessThanOrEqual(expectedPlatform(amount) + 2n);
        }
      }
    });

    it("returns all-zero allocations for a zero sale", () => {
      expect(splitSalePayment(0n, STANDARD)).toEqual({
        creator: 0n,
        platformFee: 0n,
        affiliatePool: 0n,
      });
    });
  });

  describe("dynamic multi-asset quote fetching", () => {
    const provider: QuoteProvider = vi.fn(async (from, to, amount) => {
      const rates: Record<string, bigint> = {
        "USDC>XLM": 12_500_000n,
        "XLM>EURC": 920_000n,
        "EURC>USDC": 1_050_000n,
      };
      return (amount * rates[`${from}>${to}`]) / 10_000_000n;
    });

    it("fetches a fresh quote through the injected provider for each asset pair", async () => {
      const fetch = vi.fn(provider);
      const usdc = 100_000_000n;

      const xlmQuote = await fetchMultiAssetQuote("USDC", "XLM", usdc, fetch);
      expect(xlmQuote.expectedOut).toBe(125_000_000n);
      expect(xlmQuote.fromAsset).toBe("USDC");
      expect(xlmQuote.toAsset).toBe("XLM");
      expect(xlmQuote.amountIn).toBe(usdc);
      expect(xlmQuote.fetchedAt).toEqual(expect.any(Number));
      expect(fetch).toHaveBeenCalledWith("USDC", "XLM", usdc);

      const eurcQuote = await fetchMultiAssetQuote("XLM", "EURC", xlmQuote.expectedOut, fetch);
      expect(eurcQuote.expectedOut).toBe(11_500_000n);
      expect(fetch).toHaveBeenCalledTimes(2);
    });

    it("short-circuits same-asset quotes without calling the provider", async () => {
      const fetch = vi.fn(provider);
      const quote = await fetchMultiAssetQuote("USDC", "USDC", 500n, fetch);

      expect(quote.expectedOut).toBe(500n);
      expect(fetch).not.toHaveBeenCalled();
    });

    it("rejects bad quote inputs and non-positive provider output", async () => {
      await expect(fetchMultiAssetQuote("", "XLM", 1n, provider)).rejects.toThrow(
        /Both source and destination assets/,
      );
      await expect(fetchMultiAssetQuote("USDC", "XLM", 0n, provider)).rejects.toThrow(
        /greater than zero/,
      );
      await expect(
        fetchMultiAssetQuote(
          "USDC",
          "XLM",
          100n,
          vi.fn(async () => 0n),
        ),
      ).rejects.toThrow(/non-positive output/);
    });

    it("splits the dynamically quoted output across creator, platform and affiliate pool", async () => {
      const { quote, allocations } = await quoteAndSplitSalePayment(
        "USDC",
        "XLM",
        100_000_000n,
        STANDARD,
        provider,
      );

      expect(quote.expectedOut).toBe(125_000_000n);
      expect(allocations.creator).toBe(87_500_000n);
      expect(allocations.affiliatePool).toBe(25_000_000n);
      expect(allocations.platformFee).toBe(12_500_000n);
      expect(total(allocations)).toBe(quote.expectedOut);
    });

    it("routes quote-conversion dust to the platform fee for every asset pair", async () => {
      const pairs = [
        ["USDC", "XLM", 3n],
        ["XLM", "EURC", 100n],
        ["EURC", "USDC", 11n],
      ] as const;

      for (const [from, to, amount] of pairs) {
        const { quote, allocations } = await quoteAndSplitSalePayment(
          from,
          to,
          amount,
          EVEN,
          provider,
        );

        expect(quote.expectedOut).toBeGreaterThan(0n);
        expect(total(allocations)).toBe(quote.expectedOut);
        const flooredPlatform = (quote.expectedOut * 3334n) / 10_000n;
        expect(allocations.platformFee).toBeGreaterThanOrEqual(flooredPlatform);
        expect(allocations.platformFee).toBeLessThanOrEqual(flooredPlatform + 2n);
        expect(quote.expectedOut - allocations.creator - allocations.affiliatePool).toBe(
          allocations.platformFee,
        );
      }
    });

    it("uses the latest fetched rate instead of a cached one", async () => {
      const fresh = vi
        .fn(provider)
        .mockResolvedValueOnce(1_000_000n)
        .mockResolvedValueOnce(2_000_000n);

      const first = await quoteAndSplitSalePayment("USDC", "XLM", 1n, STANDARD, fresh);
      const second = await quoteAndSplitSalePayment("USDC", "XLM", 1n, STANDARD, fresh);

      expect(first.quote.expectedOut).toBe(1_000_000n);
      expect(second.quote.expectedOut).toBe(2_000_000n);
      expect(total(second.allocations)).toBe(2_000_000n);
      expect(fresh).toHaveBeenCalledTimes(2);
    });
  });
});
