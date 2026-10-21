import { describe, it, expect } from "vitest";
import { initialMockCampaigns, type Campaign } from "../components/advertiser/MyCampaignsList";
import { refundCampaignEscrowContractCall } from "../lib/stellar";

describe("[Advertiser] Real-time Escrow & Refund Monitor (#37)", () => {
  const isCampaignLowEscrow = (c: Campaign) => {
    if (c.status === "Completed" || c.escrowInitial <= 0) return false;
    return c.escrowBalance / c.escrowInitial < 0.10 && c.escrowBalance > 0;
  };

  describe("Visual Alert at <10% Balance", () => {
    it("flags campaigns with less than 10% escrow remaining as low escrow", () => {
      // Campaign 2 has 750 / 10000 = 7.5%
      const campaign2 = initialMockCampaigns.find((c) => c.id === "2");
      expect(campaign2).toBeDefined();
      expect(isCampaignLowEscrow(campaign2!)).toBe(true);
      expect(campaign2!.escrowBalance / campaign2!.escrowInitial).toBeLessThan(0.10);

      // Campaign 3 has 680 / 8000 = 8.5%
      const campaign3 = initialMockCampaigns.find((c) => c.id === "3");
      expect(campaign3).toBeDefined();
      expect(isCampaignLowEscrow(campaign3!)).toBe(true);
      expect(campaign3!.escrowBalance / campaign3!.escrowInitial).toBeLessThan(0.10);
    });

    it("does not flag campaigns with 10% or higher escrow as low escrow", () => {
      // Campaign 1 has 3250 / 5000 = 65%
      const campaign1 = initialMockCampaigns.find((c) => c.id === "1");
      expect(campaign1).toBeDefined();
      expect(isCampaignLowEscrow(campaign1!)).toBe(false);
      expect(campaign1!.escrowBalance / campaign1!.escrowInitial).toBeGreaterThanOrEqual(0.10);
    });

    it("does not flag completed campaigns even if balance is low or zero", () => {
      const campaign5 = initialMockCampaigns.find((c) => c.id === "5");
      expect(campaign5).toBeDefined();
      expect(campaign5!.status).toBe("Completed");
      expect(isCampaignLowEscrow(campaign5!)).toBe(false);
    });
  });

  describe("Refund Action for Ended / Completed Campaigns", () => {
    it("identifies completed campaigns with refundable escrow", () => {
      const completedCampaign = initialMockCampaigns.find((c) => c.id === "4");
      expect(completedCampaign).toBeDefined();
      expect(completedCampaign!.status).toBe("Completed");
      expect(completedCampaign!.escrowBalance).toBe(1200);
      expect(completedCampaign!.isRefunded).toBe(false);
    });

    it("executes refund contract call on Soroban returning valid txHash", async () => {
      const testAdvertiser = "GASTORMSALE7TESTNET7AFFILIATE7MERCHANT7ESCROW7XLM77777";
      const campaignId = 4;

      const result = await refundCampaignEscrowContractCall(testAdvertiser, campaignId, "mock");
      expect(result.success).toBe(true);
      expect(result.txHash).toBeDefined();
      expect(typeof result.txHash).toBe("string");
    });

    it("handles mock refund even with empty caller address gracefully", async () => {
      const result = await refundCampaignEscrowContractCall("", 4, "mock");
      expect(result.success).toBe(true);
      expect(result.txHash).toBeDefined();
    });
  });
});
