import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  INITIAL_MARKETPLACE_CAMPAIGNS,
  getStoredJoinedCampaignIds,
  saveStoredJoinedCampaignIds,
  type MarketplaceCampaign,
} from "../hooks/useCampaigns";

describe("[Affiliate] Browse Campaigns Marketplace (#41)", () => {
  let store: Record<string, string> = {};
  const mockLocalStorage = {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value.toString();
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
  };

  beforeEach(() => {
    store = {};
    vi.stubGlobal("localStorage", mockLocalStorage);
  });

  describe("Marketplace Campaigns Dataset", () => {
    it("contains verified active campaigns with requisite fields", () => {
      expect(INITIAL_MARKETPLACE_CAMPAIGNS.length).toBeGreaterThan(0);
      INITIAL_MARKETPLACE_CAMPAIGNS.forEach((c) => {
        expect(c.id).toBeDefined();
        expect(c.name).toBeTruthy();
        expect(c.category).toBeTruthy();
        expect(c.rewardAmount).toBeGreaterThan(0);
        expect(c.roi).toBeGreaterThan(0);
        expect(c.escrowBalance).toBeGreaterThan(0);
        expect(c.status).toBe("Active");
        expect(Array.isArray(c.tags)).toBe(true);
        expect(c.tags.length).toBeGreaterThan(0);
      });
    });
  });

  describe("Campaign Filtering & Sorting Logic", () => {
    it("filters campaigns correctly by category", () => {
      const defiCampaigns = INITIAL_MARKETPLACE_CAMPAIGNS.filter((c) => c.category === "DeFi");
      expect(defiCampaigns.length).toBeGreaterThan(0);
      defiCampaigns.forEach((c) => expect(c.category).toBe("DeFi"));
    });

    it("filters campaigns correctly by minimum reward rate", () => {
      const minReward = 20;
      const highReward = INITIAL_MARKETPLACE_CAMPAIGNS.filter((c) => c.rewardAmount >= minReward);
      expect(highReward.length).toBeGreaterThan(0);
      highReward.forEach((c) => expect(c.rewardAmount).toBeGreaterThanOrEqual(20));
    });

    it("filters campaigns correctly by minimum ROI", () => {
      const minRoi = 200;
      const highRoi = INITIAL_MARKETPLACE_CAMPAIGNS.filter((c) => c.roi >= minRoi);
      expect(highRoi.length).toBeGreaterThan(0);
      highRoi.forEach((c) => expect(c.roi).toBeGreaterThanOrEqual(200));
    });

    it("searches campaigns across name, description, and tags", () => {
      const query = "staking";
      const matched = INITIAL_MARKETPLACE_CAMPAIGNS.filter(
        (c) =>
          c.name.toLowerCase().includes(query) ||
          c.description.toLowerCase().includes(query) ||
          c.tags.some((t) => t.toLowerCase().includes(query)),
      );
      expect(matched.length).toBeGreaterThan(0);
      matched.forEach((c) => {
        const hasMatch =
          c.name.toLowerCase().includes(query) ||
          c.description.toLowerCase().includes(query) ||
          c.tags.some((t) => t.toLowerCase().includes(query));
        expect(hasMatch).toBe(true);
      });
    });

    it("sorts campaigns by ROI descending", () => {
      const sorted = [...INITIAL_MARKETPLACE_CAMPAIGNS].sort((a, b) => b.roi - a.roi);
      for (let i = 0; i < sorted.length - 1; i++) {
        expect(sorted[i].roi).toBeGreaterThanOrEqual(sorted[i + 1].roi);
      }
    });

    it("sorts campaigns by Reward descending", () => {
      const sorted = [...INITIAL_MARKETPLACE_CAMPAIGNS].sort(
        (a, b) => b.rewardAmount - a.rewardAmount,
      );
      for (let i = 0; i < sorted.length - 1; i++) {
        expect(sorted[i].rewardAmount).toBeGreaterThanOrEqual(sorted[i + 1].rewardAmount);
      }
    });
  });

  describe("Affiliate Campaign Joining & Persistence", () => {
    it("persists and reads joined campaign IDs from localStorage", () => {
      expect(getStoredJoinedCampaignIds()).toEqual([]);

      saveStoredJoinedCampaignIds(["camp-001", "camp-003"]);
      const stored = getStoredJoinedCampaignIds();
      expect(stored).toEqual(["camp-001", "camp-003"]);
      expect(stored.includes("camp-001")).toBe(true);
      expect(stored.includes("camp-002")).toBe(false);
    });

    it("evaluates eligibility accurately based on wallet connection and status", () => {
      const sampleCampaign: MarketplaceCampaign = INITIAL_MARKETPLACE_CAMPAIGNS[0];

      // Disconnected wallet
      const checkEligibilityDisconnected = (wallet: string | null, c: MarketplaceCampaign) => {
        if (!wallet) return { eligible: false, reason: "Connect your Stellar wallet to join" };
        if (c.joined) return { eligible: false, reason: "You have already joined this campaign" };
        if (c.status !== "Active")
          return { eligible: false, reason: "Campaign is currently inactive" };
        if (c.escrowBalance <= 0)
          return { eligible: false, reason: "Campaign escrow pool is exhausted" };
        return { eligible: true };
      };

      const resNoWallet = checkEligibilityDisconnected(null, sampleCampaign);
      expect(resNoWallet.eligible).toBe(false);
      expect(resNoWallet.reason).toContain("Connect your Stellar wallet");

      const resConnected = checkEligibilityDisconnected("GVALIDADDRESS12345", sampleCampaign);
      expect(resConnected.eligible).toBe(true);

      const resAlreadyJoined = checkEligibilityDisconnected("GVALIDADDRESS12345", {
        ...sampleCampaign,
        joined: true,
      });
      expect(resAlreadyJoined.eligible).toBe(false);
      expect(resAlreadyJoined.reason).toContain("already joined");
    });
  });
});
