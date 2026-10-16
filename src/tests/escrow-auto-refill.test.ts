import { describe, it, expect, beforeEach } from "vitest";
import {
  clampThreshold,
  calculateEscrowReserveStatus,
  getAutoRefillConfig,
  saveAutoRefillConfig,
  depositEscrowRefillContractCall,
  MIN_REFILL_THRESHOLD_PERCENT,
  MAX_REFILL_THRESHOLD_PERCENT,
  DEFAULT_REFILL_THRESHOLD_PERCENT,
} from "../lib/escrowAutoRefill";

describe("Escrow Auto-Refill Triggers & Low-Balance Thresholds (#139)", () => {
  beforeEach(() => {
    if (typeof window !== "undefined" && window.localStorage) {
      window.localStorage.clear();
    }
  });

  describe("Threshold Clamping (5% to 30%)", () => {
    it("should clamp values below 5% to 5%", () => {
      expect(clampThreshold(0)).toBe(MIN_REFILL_THRESHOLD_PERCENT);
      expect(clampThreshold(3)).toBe(MIN_REFILL_THRESHOLD_PERCENT);
      expect(clampThreshold(-10)).toBe(MIN_REFILL_THRESHOLD_PERCENT);
    });

    it("should clamp values above 30% to 30%", () => {
      expect(clampThreshold(35)).toBe(MAX_REFILL_THRESHOLD_PERCENT);
      expect(clampThreshold(50)).toBe(MAX_REFILL_THRESHOLD_PERCENT);
      expect(clampThreshold(100)).toBe(MAX_REFILL_THRESHOLD_PERCENT);
    });

    it("should retain valid percentages between 5% and 30%", () => {
      expect(clampThreshold(5)).toBe(5);
      expect(clampThreshold(15)).toBe(15);
      expect(clampThreshold(22)).toBe(22);
      expect(clampThreshold(30)).toBe(30);
    });

    it("should default to 15% if NaN", () => {
      expect(clampThreshold(NaN)).toBe(DEFAULT_REFILL_THRESHOLD_PERCENT);
    });
  });

  describe("Escrow Reserve Health & Low-Balance Calculation", () => {
    it("should accurately calculate remaining percentage and threshold balance", () => {
      // 2,000 initial, 300 current, 15% threshold => threshold is 300 XLM, remaining is 15%
      const status = calculateEscrowReserveStatus(300, 2000, 15, "camp-1");
      expect(status.remainingPercent).toBe(15);
      expect(status.thresholdBalanceXlm).toBe(300);
      expect(status.isLowReserve).toBe(true);
      expect(status.warningLevel).toBe("warning");
    });

    it("should flag critical reserve when remaining balance <= 5%", () => {
      // 2,000 initial, 80 current (4%)
      const status = calculateEscrowReserveStatus(80, 2000, 15, "camp-1");
      expect(status.remainingPercent).toBe(4);
      expect(status.isLowReserve).toBe(true);
      expect(status.warningLevel).toBe("critical");
    });

    it("should report healthy when current balance is above threshold", () => {
      // 2,000 initial, 1,500 current (75%)
      const status = calculateEscrowReserveStatus(1500, 2000, 15, "camp-1");
      expect(status.remainingPercent).toBe(75);
      expect(status.isLowReserve).toBe(false);
      expect(status.warningLevel).toBe("healthy");
    });
  });

  describe("Configuration Storage & Retrieval", () => {
    it("should save and retrieve campaign auto-refill configuration", () => {
      saveAutoRefillConfig({
        campaignId: "campaign-123",
        thresholdPercent: 25,
        autoRefillAmountXlm: 750,
        isAutoRefillEnabled: true,
      });

      const loaded = getAutoRefillConfig("campaign-123");
      expect(loaded.campaignId).toBe("campaign-123");
      expect(loaded.thresholdPercent).toBe(25);
      expect(loaded.autoRefillAmountXlm).toBe(750);
      expect(loaded.isAutoRefillEnabled).toBe(true);
    });

    it("should clamp stored threshold if out-of-bounds", () => {
      saveAutoRefillConfig({
        campaignId: "campaign-clamp",
        thresholdPercent: 45, // Exceeds max 30%
        autoRefillAmountXlm: 300,
        isAutoRefillEnabled: true,
      });

      const loaded = getAutoRefillConfig("campaign-clamp");
      expect(loaded.thresholdPercent).toBe(30);
    });
  });

  describe("On-Chain / Sandbox Escrow Deposit Execution", () => {
    it("should reject deposit amounts less than or equal to 0", async () => {
      await expect(
        depositEscrowRefillContractCall({
          campaignId: "camp-1",
          amountXlm: 0,
          callerAddress: "GBZXN7PIRZGNMHGA728R3AA7UNVYDAA677",
          walletType: "mock",
        }),
      ).rejects.toThrow("Deposit amount must be greater than 0 XLM.");
    });

    it("should execute escrow refill deposit and update balance", async () => {
      const depositAmount = 500;
      const result = await depositEscrowRefillContractCall({
        campaignId: "camp-deposit-test",
        amountXlm: depositAmount,
        callerAddress: "GBZXN7PIRZGNMHGA728R3AA7UNVYDAA677",
        walletType: "mock",
      });

      expect(result.success).toBe(true);
      expect(result.depositedAmountXlm).toBe(500);
      expect(result.txHash).toBeDefined();
      expect(result.txHash.startsWith("0x")).toBe(true);
      expect(result.newBalanceXlm).toBeGreaterThanOrEqual(500);
      expect(result.timestamp).toBeGreaterThan(0);
    });
  });
});
