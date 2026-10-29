// @vitest-environment jsdom
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  mintMilestoneBadgeContractCall: vi.fn(),
}));

vi.mock("../lib/stellar", () => ({
  mintMilestoneBadgeContractCall: mocks.mintMilestoneBadgeContractCall,
}));

import {
  MILESTONE_BADGES,
  getAffiliatePrivacy,
  setAffiliatePrivacy,
  maskStellarAddress,
  getMaskedPseudonym,
  getClaimedBadges,
  saveClaimedBadge,
  getUserGrossSales,
  setUserGrossSales,
  getLeaderboardRankings,
  getAffiliateProfile,
  claimMilestoneBadge,
} from "../lib/affiliateLeaderboard";
import type { ClaimedMilestoneRecord, MilestoneTier } from "../types/affiliateLeaderboard";

const LONG_ADDRESS = "GDXRN7VQK66EZM6PFFKYY2F6J6E4YQZ5YQ47T7V6PX6T3K42P37X2LTA";

function makeRecord(
  affiliateAddress: string,
  tier: MilestoneTier,
  tokenId = `SBT-${tier}`,
): ClaimedMilestoneRecord {
  return {
    tier,
    tokenId,
    txHash: "0xabc123",
    claimedAt: "2025-01-01T00:00:00Z",
    nonTransferable: true,
    tokenUri: `ipfs://badge-${tier}`,
    contractAddress: "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC",
    affiliateAddress,
  };
}

describe("affiliateLeaderboard lib", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("MILESTONE_BADGES", () => {
    it("defines the three tier thresholds", () => {
      expect(MILESTONE_BADGES["1k"].thresholdGrossSales).toBe(1000);
      expect(MILESTONE_BADGES["10k"].thresholdGrossSales).toBe(10000);
      expect(MILESTONE_BADGES["100k"].thresholdGrossSales).toBe(100000);
    });
  });

  describe("maskStellarAddress", () => {
    it("returns ANON for short/empty addresses", () => {
      expect(maskStellarAddress("")).toBe("G***ANON");
      expect(maskStellarAddress("GABC")).toBe("G***ANON");
    });

    it("masks long addresses keeping the last four chars", () => {
      expect(maskStellarAddress(LONG_ADDRESS)).toBe(`G***${LONG_ADDRESS.slice(-4)}`);
    });
  });

  describe("getMaskedPseudonym", () => {
    it("returns a default for empty input", () => {
      expect(getMaskedPseudonym("")).toBe("StealthStormer#0000");
    });

    it("generates a deterministic pseudonym with a numeric suffix", () => {
      const first = getMaskedPseudonym(LONG_ADDRESS);
      const second = getMaskedPseudonym(LONG_ADDRESS);
      expect(first).toBe(second);
      expect(first).toMatch(/#.+/);
    });
  });

  describe("privacy toggles", () => {
    it("defaults to false for empty address", () => {
      expect(getAffiliatePrivacy("")).toBe(false);
    });

    it("persists and reads a masked preference", () => {
      setAffiliatePrivacy(LONG_ADDRESS, true);
      expect(getAffiliatePrivacy(LONG_ADDRESS)).toBe(true);
      setAffiliatePrivacy(LONG_ADDRESS, false);
      expect(getAffiliatePrivacy(LONG_ADDRESS)).toBe(false);
    });

    it("ignores setAffiliatePrivacy for empty address", () => {
      setAffiliatePrivacy("", true);
      expect(getAffiliatePrivacy("")).toBe(false);
    });

    it("survives a storage read failure", () => {
      const spy = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
        throw new Error("boom");
      });
      expect(getAffiliatePrivacy(LONG_ADDRESS)).toBe(false);
      spy.mockRestore();
    });

    it("logs and swallows a storage write failure", () => {
      const err = vi.spyOn(console, "error").mockImplementation(() => {});
      const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
        throw new Error("quota");
      });
      setAffiliatePrivacy(LONG_ADDRESS, true);
      expect(err).toHaveBeenCalled();
      spy.mockRestore();
      err.mockRestore();
    });
  });

  describe("claimed badges storage", () => {
    it("returns empty for a fresh address", () => {
      expect(getClaimedBadges(LONG_ADDRESS)).toEqual([]);
    });

    it("saves a badge and dedups by tier", () => {
      saveClaimedBadge(makeRecord(LONG_ADDRESS, "1k", "first"));
      saveClaimedBadge(makeRecord(LONG_ADDRESS, "1k", "second"));
      saveClaimedBadge(makeRecord(LONG_ADDRESS, "10k", "silver"));
      const badges = getClaimedBadges(LONG_ADDRESS);
      const bronze = badges.filter((b) => b.tier === "1k");
      expect(bronze).toHaveLength(1);
      expect(bronze[0].tokenId).toBe("second");
      expect(badges).toHaveLength(2);
    });

    it("ignores saving a record with no address", () => {
      saveClaimedBadge(makeRecord("", "1k"));
      expect(getClaimedBadges("")).toEqual([]);
    });

    it("returns empty and tolerates malformed stored JSON", () => {
      localStorage.setItem(`stormsale_claimed_badges_${LONG_ADDRESS}`, "{not-json");
      expect(getClaimedBadges(LONG_ADDRESS)).toEqual([]);
    });
  });

  describe("gross sales", () => {
    it("returns zeros for empty address", () => {
      expect(getUserGrossSales("")).toEqual({ weekly: 0, monthly: 0, allTime: 0 });
    });

    it("is deterministic without an override", () => {
      const a = getUserGrossSales(LONG_ADDRESS);
      const b = getUserGrossSales(LONG_ADDRESS);
      expect(a).toEqual(b);
      expect(a.monthly).toBeGreaterThan(0);
    });

    it("honors a manual override", () => {
      setUserGrossSales(LONG_ADDRESS, { monthly: 5000 });
      expect(getUserGrossSales(LONG_ADDRESS).monthly).toBe(5000);
    });

    it("derives weekly/allTime when only monthly is supplied", () => {
      setUserGrossSales(LONG_ADDRESS, { monthly: 10000 });
      const sales = getUserGrossSales(LONG_ADDRESS);
      expect(sales.weekly).toBe(Math.round(10000 * 0.28));
      expect(sales.allTime).toBe(Math.round(10000 * 4.2));
    });

    it("keeps explicit weekly/allTime values", () => {
      setUserGrossSales(LONG_ADDRESS, { weekly: 123, monthly: 1000, allTime: 9999 });
      expect(getUserGrossSales(LONG_ADDRESS)).toEqual({ weekly: 123, monthly: 1000, allTime: 9999 });
    });

    it("ignores empty-address overrides", () => {
      setUserGrossSales("", { monthly: 500 });
      expect(getUserGrossSales("")).toEqual({ weekly: 0, monthly: 0, allTime: 0 });
    });
  });

  describe("getLeaderboardRankings", () => {
    it("returns ranked items and aggregate stats", () => {
      const { items, stats } = getLeaderboardRankings("monthly", "", "sales", null);
      expect(items.length).toBeGreaterThan(0);
      expect(items.length).toBeLessThanOrEqual(50);
      expect(items[0].rank).toBe(1);
      expect(stats.activeAffiliatesCount).toBeGreaterThan(0);
      expect(stats.topAffiliateMonthlyVolume).toBeGreaterThanOrEqual(items[0].monthlyGrossSales);
    });

    it("sorts differently across timeframes and sort keys", () => {
      const weekly = getLeaderboardRankings("weekly", "", "sales", null).items;
      expect(weekly[0].weeklyGrossSales).toBeGreaterThanOrEqual(weekly[1].weeklyGrossSales);
      const allTime = getLeaderboardRankings("all-time", "", "sales", null).items;
      expect(allTime[0].allTimeGrossSales).toBeGreaterThanOrEqual(allTime[1].allTimeGrossSales);
      const conv = getLeaderboardRankings("monthly", "", "conversions", null).items;
      expect(conv[0].verifiedSalesCount).toBeGreaterThanOrEqual(conv[1].verifiedSalesCount);
      const comm = getLeaderboardRankings("monthly", "", "commission", null).items;
      expect(comm[0].commissionEarnedXlm).toBeGreaterThanOrEqual(comm[1].commissionEarnedXlm);
    });

    it("injects the connected user into the board", () => {
      const userAddr = "GCONNECTEDUSERAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
      setUserGrossSales(userAddr, { monthly: 500000 });
      const { items } = getLeaderboardRankings("monthly", "", "sales", userAddr);
      const found = items.find((i) => i.address === userAddr);
      expect(found).toBeDefined();
      expect(found!.monthlyGrossSales).toBe(500000);
    });

    it("filters items by search term", () => {
      const { items } = getLeaderboardRankings("monthly", "zzzznomatch", "sales", null);
      expect(items).toHaveLength(0);
      const byRank = getLeaderboardRankings("monthly", "1", "sales", null).items;
      expect(byRank.some((i) => i.rank === 1)).toBe(true);
    });

    it("merges local privacy + claimed badge overrides into seed rows", () => {
      const seed = getLeaderboardRankings("monthly", "", "sales", null).items[0];
      setAffiliatePrivacy(seed.address, true);
      saveClaimedBadge(makeRecord(seed.address, "100k"));
      const refreshed = getLeaderboardRankings("monthly", "", "sales", null).items.find(
        (i) => i.address === seed.address,
      );
      expect(refreshed!.isPrivacyMasked).toBe(true);
      expect(refreshed!.claimedBadges.some((b) => b.tier === "100k")).toBe(true);
    });
  });

  describe("getAffiliateProfile", () => {
    it("targets the $1K tier when below threshold", () => {
      const addr = "GBELOW1KAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
      setUserGrossSales(addr, { monthly: 500 });
      const profile = getAffiliateProfile(addr, null);
      expect(profile.nextMilestoneProgress.nextTier).toBe("1k");
      expect(profile.unlockedTiers).toEqual([]);
    });

    it("targets the $10K tier after unlocking $1K", () => {
      const addr = "GBRONZEUSERAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
      setUserGrossSales(addr, { monthly: 5000 });
      const profile = getAffiliateProfile(addr, null);
      expect(profile.unlockedTiers).toContain("1k");
      expect(profile.nextMilestoneProgress.nextTier).toBe("10k");
    });

    it("targets the $100K tier after unlocking $10K", () => {
      const addr = "GSILVERUSERAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
      setUserGrossSales(addr, { monthly: 50000 });
      const profile = getAffiliateProfile(addr, null);
      expect(profile.unlockedTiers).toEqual(expect.arrayContaining(["1k", "10k"]));
      expect(profile.nextMilestoneProgress.nextTier).toBe("100k");
    });

    it("reports all milestones achieved past $100K", () => {
      const addr = "GGOLDTITANAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
      setUserGrossSales(addr, { monthly: 250000 });
      const profile = getAffiliateProfile(addr, null);
      expect(profile.unlockedTiers).toEqual(["1k", "10k", "100k"]);
      expect(profile.nextMilestoneProgress.nextTier).toBeNull();
      expect(profile.nextMilestoneProgress.progressPercentage).toBe(100);
    });

    it("flags the current user and carries claimed badges", () => {
      const addr = "GCURRENTUSERAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
      setUserGrossSales(addr, { monthly: 2000 });
      saveClaimedBadge(makeRecord(addr, "1k"));
      const profile = getAffiliateProfile(addr, addr);
      expect(profile.avatarSeed).toBe("current-user");
      expect(profile.claimedBadges.some((b) => b.tier === "1k")).toBe(true);
    });
  });

  describe("claimMilestoneBadge", () => {
    it("throws for an unknown tier", async () => {
      await expect(
        claimMilestoneBadge(LONG_ADDRESS, "999k" as MilestoneTier, "mock"),
      ).rejects.toThrow(/Invalid milestone badge tier/);
    });

    it("throws when the sales threshold is not met", async () => {
      const addr = "GPOORAFFILIATEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
      setUserGrossSales(addr, { monthly: 10 });
      await expect(claimMilestoneBadge(addr, "1k", "mock")).rejects.toThrow(/Milestone not reached/);
    });

    it("returns an existing record without re-minting", async () => {
      const addr = "GEXistingAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
      setUserGrossSales(addr, { monthly: 5000 });
      saveClaimedBadge(makeRecord(addr, "1k", "already"));
      const record = await claimMilestoneBadge(addr, "1k", "mock");
      expect(record.tokenId).toBe("already");
      expect(mocks.mintMilestoneBadgeContractCall).not.toHaveBeenCalled();
    });

    it("mints on-chain and persists a new soulbound record", async () => {
      const addr = "GNEWWINNERAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
      setUserGrossSales(addr, { monthly: 150000 });
      mocks.mintMilestoneBadgeContractCall.mockResolvedValue({
        success: true,
        txHash: "0xfreshmint",
        tokenId: "SBT-FRESH-100K",
      });
      const record = await claimMilestoneBadge(addr, "100k", "mock");
      expect(mocks.mintMilestoneBadgeContractCall).toHaveBeenCalledWith(addr, "100k", "mock");
      expect(record.tokenId).toBe("SBT-FRESH-100K");
      expect(record.nonTransferable).toBe(true);
      expect(getClaimedBadges(addr).some((b) => b.tokenId === "SBT-FRESH-100K")).toBe(true);
    });

    it("propagates on-chain mint failures", async () => {
      const addr = "GFAILUSERAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
      setUserGrossSales(addr, { monthly: 5000 });
      mocks.mintMilestoneBadgeContractCall.mockRejectedValue(new Error("ledger rejected"));
      await expect(claimMilestoneBadge(addr, "1k", "ledger")).rejects.toThrow(
        /ledger rejected/,
      );
    });
  });
});
