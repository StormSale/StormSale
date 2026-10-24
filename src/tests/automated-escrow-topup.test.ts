import { describe, it, expect, beforeEach } from "vitest";
import {
  evaluateAutoTopUpTrigger,
  getDefaultAutoTopUpConfig,
  getStoredAutoTopUpConfig,
  saveAutoTopUpConfig,
  topUpCampaignEscrowContractCall,
  type AutoTopUpConfig,
} from "../lib/escrowTopUp";
import {
  approveTokenContractCall,
  getTokenAllowanceQuery,
} from "../lib/stellar";
import { initialMockCampaigns } from "../components/advertiser/MyCampaignsList";

describe("[Advertiser] Automated Escrow Top-Up Logic (#107)", () => {
  const testAdvertiser = "GASTORMSALE7TESTNET7AFFILIATE7MERCHANT7ESCROW7XLM77777";
  let storage: Record<string, string> = {};

  beforeEach(() => {
    storage = {};
    const mockStorage = {
      getItem: (key: string) => storage[key] ?? null,
      setItem: (key: string, val: string) => {
        storage[key] = val;
      },
      removeItem: (key: string) => {
        delete storage[key];
      },
      clear: () => {
        storage = {};
      },
      length: 0,
      key: () => null,
    };
    (globalThis as any).window = { localStorage: mockStorage };
    (globalThis as any).localStorage = mockStorage;
  });

  describe("User-Defined Trigger Thresholds", () => {
    it("evaluates percentage-based trigger threshold correctly", () => {
      const campaign = {
        id: "1",
        status: "Active",
        escrowInitial: 10000,
        escrowBalance: 1400, // 14%
      };

      const config: AutoTopUpConfig = {
        campaignId: "1",
        enabled: true,
        thresholdType: "percentage",
        thresholdValue: 15, // 15% = 1,500 XLM
        topUpAmount: 2000,
        maxTopUpsPerDay: 5,
        topUpCountToday: 0,
      };

      // When allowance is 5000 (sufficient)
      const evaluation = evaluateAutoTopUpTrigger(campaign, config, 5000);
      expect(evaluation.shouldTrigger).toBe(true);
      expect(evaluation.thresholdAmount).toBe(1500);
      expect(evaluation.currentBalance).toBe(1400);
      expect(evaluation.hasSufficientAllowance).toBe(true);
      expect(evaluation.allowanceDeficit).toBe(0);
    });

    it("does not trigger when balance is above percentage threshold", () => {
      const campaign = {
        id: "1",
        status: "Active",
        escrowInitial: 10000,
        escrowBalance: 3500, // 35%
      };

      const config: AutoTopUpConfig = {
        campaignId: "1",
        enabled: true,
        thresholdType: "percentage",
        thresholdValue: 20, // 20% = 2,000 XLM
        topUpAmount: 1000,
        maxTopUpsPerDay: 5,
        topUpCountToday: 0,
      };

      const evaluation = evaluateAutoTopUpTrigger(campaign, config, 5000);
      expect(evaluation.shouldTrigger).toBe(false);
      expect(evaluation.thresholdAmount).toBe(2000);
      expect(evaluation.reason).toContain("healthy and above trigger threshold");
    });

    it("evaluates fixed XLM balance threshold correctly", () => {
      const campaign = {
        id: "2",
        status: "Active",
        escrowInitial: 10000,
        escrowBalance: 450, // 450 XLM
      };

      const config: AutoTopUpConfig = {
        campaignId: "2",
        enabled: true,
        thresholdType: "fixed",
        thresholdValue: 500, // Fixed 500 XLM
        topUpAmount: 1500,
        maxTopUpsPerDay: 3,
        topUpCountToday: 0,
      };

      const evaluation = evaluateAutoTopUpTrigger(campaign, config, 3000);
      expect(evaluation.shouldTrigger).toBe(true);
      expect(evaluation.thresholdAmount).toBe(500);
      expect(evaluation.currentBalance).toBe(450);
    });

    it("does not trigger when automated top-up is disabled by user", () => {
      const campaign = {
        id: "2",
        status: "Active",
        escrowInitial: 10000,
        escrowBalance: 200,
      };

      const config: AutoTopUpConfig = {
        campaignId: "2",
        enabled: false, // Disabled
        thresholdType: "percentage",
        thresholdValue: 25,
        topUpAmount: 2000,
        maxTopUpsPerDay: 3,
        topUpCountToday: 0,
      };

      const evaluation = evaluateAutoTopUpTrigger(campaign, config, 5000);
      expect(evaluation.shouldTrigger).toBe(false);
      expect(evaluation.reason).toContain("Automated top-up is disabled");
    });

    it("does not trigger on completed campaigns", () => {
      const completedCampaign = {
        id: "4",
        status: "Completed",
        escrowInitial: 3000,
        escrowBalance: 100, // < 10%
      };

      const config = getDefaultAutoTopUpConfig("4", 3000);
      const evaluation = evaluateAutoTopUpTrigger(completedCampaign, config, 5000);
      expect(evaluation.shouldTrigger).toBe(false);
      expect(evaluation.reason).toContain("completed or ended");
    });

    it("respects daily max top-up limit safeguard", () => {
      const campaign = {
        id: "3",
        status: "Active",
        escrowInitial: 5000,
        escrowBalance: 300,
      };

      const config: AutoTopUpConfig = {
        campaignId: "3",
        enabled: true,
        thresholdType: "percentage",
        thresholdValue: 20,
        topUpAmount: 1000,
        maxTopUpsPerDay: 3,
        topUpCountToday: 3, // Already hit limit of 3
      };

      const evaluation = evaluateAutoTopUpTrigger(campaign, config, 5000);
      expect(evaluation.shouldTrigger).toBe(false);
      expect(evaluation.reason).toContain("Daily top-up limit reached");
    });

    it("resets topUpCountToday when lastTopUpAt is from a previous day in evaluateAutoTopUpTrigger", () => {
      const campaign = {
        id: "3",
        status: "Active",
        escrowInitial: 5000,
        escrowBalance: 300,
      };

      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const config: AutoTopUpConfig = {
        campaignId: "3",
        enabled: true,
        thresholdType: "percentage",
        thresholdValue: 20,
        topUpAmount: 1000,
        maxTopUpsPerDay: 3,
        topUpCountToday: 3, // hit yesterday's limit
        lastTopUpAt: yesterday,
      };

      const evaluation = evaluateAutoTopUpTrigger(campaign, config, 5000);
      expect(evaluation.shouldTrigger).toBe(true);
      expect(evaluation.hasSufficientAllowance).toBe(true);
    });
  });

  describe("Pre-Authorized Allowance Handling", () => {
    it("flags allowance deficit when pre-authorized allowance is less than top-up amount", () => {
      const campaign = {
        id: "2",
        status: "Active",
        escrowInitial: 10000,
        escrowBalance: 500, // 5%
      };

      const config: AutoTopUpConfig = {
        campaignId: "2",
        enabled: true,
        thresholdType: "percentage",
        thresholdValue: 15,
        topUpAmount: 2500, // Requires 2,500 XLM
        maxTopUpsPerDay: 5,
        topUpCountToday: 0,
      };

      // Current pre-authorized allowance is only 1,000 XLM
      const currentAllowance = 1000;
      const evaluation = evaluateAutoTopUpTrigger(campaign, config, currentAllowance);

      expect(evaluation.shouldTrigger).toBe(false);
      expect(evaluation.hasSufficientAllowance).toBe(false);
      expect(evaluation.allowanceDeficit).toBe(1500); // 2500 - 1000
      expect(evaluation.reason).toContain("pre-authorized allowance is insufficient");
      expect(evaluation.reason).toContain("1,500 XLM more allowance approval");
    });

    it("approves pre-authorized allowance and resolves deficit", async () => {
      // 1. Initial allowance is 0
      const initialAllowance = await getTokenAllowanceQuery(testAdvertiser);
      expect(initialAllowance).toBe(0);

      // 2. Approve allowance of 5,000 XLM
      const approval = await approveTokenContractCall(testAdvertiser, 5000, undefined, "mock");
      expect(approval.success).toBe(true);
      expect(approval.allowance).toBe(5000);

      // 3. Verify allowance query returns 5000 XLM
      const updatedAllowance = await getTokenAllowanceQuery(testAdvertiser);
      expect(updatedAllowance).toBe(5000);

      // 4. Trigger evaluation with 5000 allowance is now sufficient
      const campaign = {
        id: "2",
        status: "Active",
        escrowInitial: 10000,
        escrowBalance: 500,
      };
      const config = getDefaultAutoTopUpConfig("2", 10000);
      config.topUpAmount = 2500;

      const evaluation = evaluateAutoTopUpTrigger(campaign, config, updatedAllowance);
      expect(evaluation.shouldTrigger).toBe(true);
      expect(evaluation.hasSufficientAllowance).toBe(true);
      expect(evaluation.allowanceDeficit).toBe(0);
    });

    it("executes automated escrow top-up and deducts from pre-authorized allowance", async () => {
      // 1. Pre-authorize 4,000 XLM
      await approveTokenContractCall(testAdvertiser, 4000, undefined, "mock");
      const allowanceBefore = await getTokenAllowanceQuery(testAdvertiser);
      expect(allowanceBefore).toBe(4000);

      // 2. Execute Top Up of 1,500 XLM
      const topUpResult = await topUpCampaignEscrowContractCall(
        testAdvertiser,
        2,
        1500,
        "mock",
        "XLM",
      );

      expect(topUpResult.success).toBe(true);
      expect(topUpResult.toppedUpAmount).toBe(1500);
      expect(topUpResult.txHash).toBeDefined();

      // 3. Remaining pre-authorized allowance should now be 2,500 XLM (4000 - 1500)
      const allowanceAfter = await getTokenAllowanceQuery(testAdvertiser);
      expect(allowanceAfter).toBe(2500);
    });

    it("rejects top-up with non-positive amount or missing address", async () => {
      await expect(
        topUpCampaignEscrowContractCall(testAdvertiser, 1, 0, "mock"),
      ).rejects.toThrow("Top-up amount must be greater than zero");

      await expect(
        topUpCampaignEscrowContractCall(testAdvertiser, 1, -500, "mock"),
      ).rejects.toThrow("Top-up amount must be greater than zero");

      await expect(
        topUpCampaignEscrowContractCall("", 1, 1000, "mock"),
      ).rejects.toThrow("Wallet not connected");
    });
  });

  describe("Configuration Persistence & Storage", () => {
    it("persists user-defined trigger settings to localStorage and retrieves correctly", () => {
      const customConfig: AutoTopUpConfig = {
        campaignId: "test_camp_99",
        enabled: true,
        thresholdType: "percentage",
        thresholdValue: 22,
        topUpAmount: 3500,
        maxTopUpsPerDay: 7,
        topUpCountToday: 1,
        lastTopUpAt: "2026-10-18T20:00:00Z",
        lastTopUpTx: "0xabc123",
      };

      saveAutoTopUpConfig(customConfig);

      const retrieved = getStoredAutoTopUpConfig("test_camp_99", 5000);
      expect(retrieved.thresholdValue).toBe(22);
      expect(retrieved.topUpAmount).toBe(3500);
      expect(retrieved.maxTopUpsPerDay).toBe(7);
      expect(retrieved.lastTopUpTx).toBe("0xabc123");
    });

    it("provides sane default configuration if no config exists in storage", () => {
      const config = getStoredAutoTopUpConfig("non_existent_camp", 8000);
      expect(config.enabled).toBe(true);
      expect(config.thresholdType).toBe("percentage");
      expect(config.thresholdValue).toBe(15);
      expect(config.topUpAmount).toBe(1600); // 20% of 8,000
      expect(config.maxTopUpsPerDay).toBe(5);
    });

    it("resets topUpCountToday to 0 when lastTopUpAt is from a previous day in getStoredAutoTopUpConfig", () => {
      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const storedConfig: AutoTopUpConfig = {
        campaignId: "test_yesterday",
        enabled: true,
        thresholdType: "percentage",
        thresholdValue: 20,
        topUpAmount: 1000,
        maxTopUpsPerDay: 5,
        topUpCountToday: 5,
        lastTopUpAt: yesterday,
      };

      saveAutoTopUpConfig(storedConfig);
      const loaded = getStoredAutoTopUpConfig("test_yesterday", 5000);
      expect(loaded.topUpCountToday).toBe(0);
      expect(loaded.lastTopUpAt).toBe(yesterday);
    });
  });

  describe("Mock Campaign Initial State Integration", () => {
    it("identifies Low Escrow campaigns in initial mock data (Campaigns 2 and 3)", () => {
      const campaign2 = initialMockCampaigns.find((c) => c.id === "2")!;
      const config2 = getDefaultAutoTopUpConfig("2", campaign2.escrowInitial);
      // Campaign 2 balance: 750 / 10000 = 7.5% (< 15% threshold)
      const eval2 = evaluateAutoTopUpTrigger(campaign2, config2, 5000);
      expect(eval2.shouldTrigger).toBe(true);

      const campaign3 = initialMockCampaigns.find((c) => c.id === "3")!;
      const config3 = getDefaultAutoTopUpConfig("3", campaign3.escrowInitial);
      // Campaign 3 balance: 680 / 8000 = 8.5% (< 15% threshold)
      const eval3 = evaluateAutoTopUpTrigger(campaign3, config3, 5000);
      expect(eval3.shouldTrigger).toBe(true);
    });

    it("does not trigger on healthy campaigns (Campaign 1)", () => {
      const campaign1 = initialMockCampaigns.find((c) => c.id === "1")!;
      const config1 = getDefaultAutoTopUpConfig("1", campaign1.escrowInitial);
      // Campaign 1 balance: 3250 / 5000 = 65% (> 15% threshold)
      const eval1 = evaluateAutoTopUpTrigger(campaign1, config1, 5000);
      expect(eval1.shouldTrigger).toBe(false);
    });
  });
});
