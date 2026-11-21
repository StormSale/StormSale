// @vitest-environment happy-dom
import { describe, it, expect, beforeAll } from "vitest";
import { FuzzySearchIndex } from "../lib/fuzzySearch";

interface CampaignItem {
  id: number;
  title: string;
  category: string;
  advertiser: string;
}

describe("fuzzy-search-perf test suite (Issue #506)", () => {
  // Generate 5,000 realistic campaign records
  const sampleCategories = ["DeFi", "NFT", "Gaming", "Infrastructure", "E-commerce", "Stellar", "Soroban"];
  const sampleWords = [
    "Storm", "Sale", "Token", "Escrow", "Protocol", "Yield", "Staking",
    "Affiliate", "Network", "Rewards", "Boost", "Marketing", "Crypto", "Wallet"
  ];

  const generateRecords = (count: number): CampaignItem[] => {
    const list: CampaignItem[] = [];
    for (let i = 0; i < count; i++) {
      const w1 = sampleWords[i % sampleWords.length];
      const w2 = sampleWords[(i * 3 + 1) % sampleWords.length];
      const cat = sampleCategories[i % sampleCategories.length];
      list.push({
        id: i + 1,
        title: `${w1} ${w2} Campaign #${i + 1}`,
        category: cat,
        advertiser: `advertiser_${(i % 50) + 1}`,
      });
    }
    return list;
  };

  const records = generateRecords(5_000);
  const index = new FuzzySearchIndex<CampaignItem>({
    keys: ["title", "category", "advertiser"],
    maxEdits: 2,
  });

  beforeAll(() => {
    // Warmup JIT with a tiny sample so cold engine start doesn't inflate microbenchmarks
    const warmupRecords = generateRecords(50);
    const warmupIndex = new FuzzySearchIndex<CampaignItem>({
      keys: ["title", "category", "advertiser"],
      maxEdits: 2,
    });
    warmupIndex.buildIndex(warmupRecords);
    warmupIndex.search("strm");
  });

  it("1. Test index construction time < 50ms for 5,000 records", () => {
    const start = performance.now();
    index.buildIndex(records);
    const duration = performance.now() - start;

    expect(duration).toBeLessThan(50);
  });

  it("2. Verify search query execution time < 5ms per keystroke", () => {
    // Ensure index is built
    index.buildIndex(records);

    // Simulate typical search keystrokes: "s", "st", "sto", "stor", "storm"
    const keystrokes = ["s", "st", "sto", "stor", "storm", "defi", "escrow", "yield"];

    for (const stroke of keystrokes) {
      const start = performance.now();
      const results = index.search(stroke, 20);
      const elapsed = performance.now() - start;

      expect(elapsed).toBeLessThan(5);
      expect(results.length).toBeGreaterThan(0);
    }
  });

  it("3. Test typo-tolerant matching (e.g. 'strm' matches 'storm')", () => {
    // Ensure index is populated
    index.buildIndex(records);

    // Typo test 1: "strm" should match "Storm"
    const strmResults = index.search("strm", 10);
    expect(strmResults.length).toBeGreaterThan(0);
    const hasStorm = strmResults.some((res) => res.item.title.toLowerCase().includes("storm"));
    expect(hasStorm).toBe(true);

    // Typo test 2: "escrw" should match "Escrow"
    const escrwResults = index.search("escrw", 10);
    expect(escrwResults.length).toBeGreaterThan(0);
    const hasEscrow = escrwResults.some((res) => res.item.title.toLowerCase().includes("escrow"));
    expect(hasEscrow).toBe(true);

    // Typo test 3: "revrds" should match "Rewards"
    const revrdsResults = index.search("revrds", 10);
    expect(revrdsResults.length).toBeGreaterThan(0);
    const hasRewards = revrdsResults.some((res) => res.item.title.toLowerCase().includes("rewards"));
    expect(hasRewards).toBe(true);
  });
});
