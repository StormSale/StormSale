import { describe, it, expect } from "vitest";
import {
  BLOCK_PRESETS,
  clampBlockRange,
  describeBlockRange,
  filterByBlockRange,
  formatBlockNumber,
  getLatestBlockRange,
  isBlockInRange,
  normalizeBlockRange,
  parseBlockNumber,
  shiftBlockRange,
  type BlockRange,
} from "./blocks";

describe("Block Number Utilities", () => {
  describe("formatBlockNumber", () => {
    it("adds thousands separators for readability", () => {
      expect(formatBlockNumber(6120940)).toBe("6,120,940");
      expect(formatBlockNumber(0)).toBe("0");
    });

    it("renders a placeholder for non-finite values", () => {
      expect(formatBlockNumber(Number.NaN)).toBe("—");
      expect(formatBlockNumber(Number.POSITIVE_INFINITY)).toBe("—");
    });
  });

  describe("parseBlockNumber", () => {
    it("parses plain, separated and prefixed input", () => {
      expect(parseBlockNumber("6120940")).toBe(6120940);
      expect(parseBlockNumber(" 6,120,940 ")).toBe(6120940);
      expect(parseBlockNumber("#6_120_940")).toBe(6120940);
    });

    it("rejects empty, negative, fractional and non-numeric input", () => {
      expect(parseBlockNumber("")).toBeNull();
      expect(parseBlockNumber("   ")).toBeNull();
      expect(parseBlockNumber("-5")).toBeNull();
      expect(parseBlockNumber("6.5")).toBeNull();
      expect(parseBlockNumber("abc")).toBeNull();
      expect(parseBlockNumber("6,12a")).toBeNull();
    });
  });

  describe("normalizeBlockRange", () => {
    it("orders reversed endpoints", () => {
      expect(normalizeBlockRange(500, 100)).toEqual({ from: 100, to: 500 });
      expect(normalizeBlockRange(100, 500)).toEqual({ from: 100, to: 500 });
      expect(normalizeBlockRange(100, 100)).toEqual({ from: 100, to: 100 });
    });
  });

  describe("clampBlockRange", () => {
    const bounds: BlockRange = { from: 1000, to: 2000 };

    it("clamps ranges that overflow the bounds", () => {
      expect(clampBlockRange({ from: 0, to: 5000 }, bounds)).toEqual({ from: 1000, to: 2000 });
    });

    it("leaves in-bounds ranges untouched", () => {
      expect(clampBlockRange({ from: 1200, to: 1400 }, bounds)).toEqual({ from: 1200, to: 1400 });
    });
  });

  describe("isBlockInRange", () => {
    const range: BlockRange = { from: 100, to: 200 };

    it("includes both endpoints", () => {
      expect(isBlockInRange(100, range)).toBe(true);
      expect(isBlockInRange(200, range)).toBe(true);
      expect(isBlockInRange(150, range)).toBe(true);
    });

    it("excludes blocks outside the range", () => {
      expect(isBlockInRange(99, range)).toBe(false);
      expect(isBlockInRange(201, range)).toBe(false);
    });
  });

  describe("filterByBlockRange", () => {
    const records = [
      { id: "a", blockNumber: 100 },
      { id: "b", blockNumber: 150 },
      { id: "c", blockNumber: 200 },
      { id: "d", blockNumber: 250 },
    ];

    it("keeps only records inside the range", () => {
      const result = filterByBlockRange(records, { from: 120, to: 200 }, (r) => r.blockNumber);
      expect(result.map((r) => r.id)).toEqual(["b", "c"]);
    });

    it("returns an empty list when nothing matches", () => {
      expect(filterByBlockRange(records, { from: 999, to: 1000 }, (r) => r.blockNumber)).toEqual(
        [],
      );
    });
  });

  describe("shiftBlockRange", () => {
    it("slides the window forward and backward by the offset", () => {
      const range: BlockRange = { from: 100, to: 199 };
      expect(shiftBlockRange(range, 100)).toEqual({ from: 200, to: 299 });
      expect(shiftBlockRange(range, -100)).toEqual({ from: 0, to: 99 });
    });
  });

  describe("getLatestBlockRange", () => {
    const bounds: BlockRange = { from: 1000, to: 5000 };

    it("builds an inclusive window ending at the latest block", () => {
      expect(getLatestBlockRange(5000, 250, bounds)).toEqual({ from: 4751, to: 5000 });
    });

    it("clamps the window to the lower bound", () => {
      expect(getLatestBlockRange(5000, 100000, bounds)).toEqual({ from: 1000, to: 5000 });
    });

    it("never produces a zero-width window", () => {
      expect(getLatestBlockRange(5000, 0, bounds)).toEqual({ from: 5000, to: 5000 });
    });
  });

  describe("describeBlockRange", () => {
    it("renders a readable inclusive label", () => {
      expect(describeBlockRange({ from: 6119000, to: 6120940 })).toBe("#6,119,000 – #6,120,940");
    });
  });

  describe("BLOCK_PRESETS", () => {
    it("exposes ascending window sizes", () => {
      const sizes = BLOCK_PRESETS.map((p) => p.size);
      expect(sizes).toEqual([...sizes].sort((a, b) => a - b));
      expect(sizes.every((s) => s > 0)).toBe(true);
    });
  });
});
