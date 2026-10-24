import { describe, expect, it } from "vitest";
import {
  assessCommissionTier,
  calculateCommissionAmount,
  getAffiliateCampaignVolume,
  getCommissionTierValidationError,
  loadCampaignCommissionConfig,
  normalizeCommissionCampaignId,
  recordAffiliateCampaignSale,
  saveCampaignCommissionConfig,
} from "../lib/commissionTiers";

describe("tiered commission matrix", () => {
  it("normalizes campaign labels and selects rates at cumulative volume thresholds", () => {
    expect(normalizeCommissionCampaignId(" Campaign #42 ")).toBe("42");

    const config = {
      campaignId: "42",
      baseRate: 5,
      tiers: [
        { name: "Silver", volumeThreshold: 5000, commissionRate: 10 },
        { name: "Gold", volumeThreshold: 20000, commissionRate: 15 },
      ],
      updatedAt: new Date().toISOString(),
    };

    const bronzeAssessment = assessCommissionTier(config, 4999);
    expect(bronzeAssessment).toMatchObject({
      currentTier: null,
      nextTier: config.tiers[0],
      commissionRate: 5,
    });
    expect(bronzeAssessment.progressPercent).toBeCloseTo(99.98);
    expect(assessCommissionTier(config, 5000)).toMatchObject({
      currentTier: config.tiers[0],
      nextTier: config.tiers[1],
      commissionRate: 10,
      progressPercent: 0,
    });
    expect(assessCommissionTier(config, 25000)).toMatchObject({
      currentTier: config.tiers[1],
      nextTier: null,
      commissionRate: 15,
      progressPercent: 100,
    });
  });

  it("persists tier metadata and cumulative affiliate volume by campaign", () => {
    const campaignId = `commission-test-${Date.now()}`;
    const affiliateAddress = "GABC123";
    saveCampaignCommissionConfig(campaignId, 5, [
      { name: "Gold", volumeThreshold: 20000, commissionRate: 15 },
      { name: "Silver", volumeThreshold: 5000, commissionRate: 10 },
    ]);

    expect(loadCampaignCommissionConfig(campaignId)?.tiers.map((tier) => tier.name)).toEqual([
      "Silver",
      "Gold",
    ]);
    expect(getAffiliateCampaignVolume(campaignId, affiliateAddress)).toBe(0);
    expect(recordAffiliateCampaignSale(campaignId, affiliateAddress, 2500)).toBe(2500);
    expect(recordAffiliateCampaignSale(campaignId, affiliateAddress, 2500)).toBe(5000);
    expect(getAffiliateCampaignVolume(campaignId, affiliateAddress.toLowerCase())).toBe(5000);
  });

  it("calculates commission amounts to Stellar's seven decimal precision", () => {
    expect(calculateCommissionAmount(100.12345678, 15)).toBe(15.0185185);
  });

  it("rejects invalid or duplicate milestone thresholds and rates", () => {
    expect(
      getCommissionTierValidationError(5, [
        { name: "Silver", volumeThreshold: 5000, commissionRate: 10 },
        { name: "Gold", volumeThreshold: 5000, commissionRate: 15 },
      ]),
    ).toContain("unique");
    expect(
      getCommissionTierValidationError(5, [
        { name: "Silver", volumeThreshold: 0, commissionRate: 10 },
      ]),
    ).toContain("positive");
    expect(
      getCommissionTierValidationError(5, [
        { name: "Silver", volumeThreshold: 5000, commissionRate: 51 },
      ]),
    ).toContain("between 1% and 50%");
  });
});
