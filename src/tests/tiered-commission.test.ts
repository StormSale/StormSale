import { describe, it, expect } from "vitest";
import {
  type CommissionTier,
  DEFAULT_COMMISSION_TIERS,
  validateCommissionTiers,
  resolveTierForSales,
  mapTierToScVal,
  mapTiersToScValVec,
  mapScValToTier,
  mapScValVecToTiers,
} from "../lib/commissionTiers";
import { xdr } from "@stellar/stellar-sdk";

describe("Tiered Multi-Level Commission Structure (#102)", () => {
  describe("Tier Validation Logic", () => {
    it("should accept default predefined performance tiers", () => {
      const res = validateCommissionTiers(DEFAULT_COMMISSION_TIERS);
      expect(res.valid).toBe(true);
      expect(res.error).toBeUndefined();
    });

    it("should reject an empty tier array", () => {
      const res = validateCommissionTiers([]);
      expect(res.valid).toBe(false);
      expect(res.error).toContain("At least one commission tier is required");
    });

    it("should reject tiers without a name", () => {
      const invalidTiers: CommissionTier[] = [
        { id: "1", name: "", minSales: 0, commissionRate: 10 },
      ];
      const res = validateCommissionTiers(invalidTiers);
      expect(res.valid).toBe(false);
      expect(res.error).toContain("must have a name");
    });

    it("should reject negative sales thresholds", () => {
      const invalidTiers: CommissionTier[] = [
        { id: "1", name: "Base", minSales: -5, commissionRate: 10 },
      ];
      const res = validateCommissionTiers(invalidTiers);
      expect(res.valid).toBe(false);
      expect(res.error).toContain("valid sales threshold");
    });

    it("should reject invalid commission rates (<= 0% or > 100%)", () => {
      const zeroRate: CommissionTier[] = [
        { id: "1", name: "Base", minSales: 0, commissionRate: 0 },
      ];
      expect(validateCommissionTiers(zeroRate).valid).toBe(false);

      const excessiveRate: CommissionTier[] = [
        { id: "1", name: "Base", minSales: 0, commissionRate: 110 },
      ];
      expect(validateCommissionTiers(excessiveRate).valid).toBe(false);
    });

    it("should reject duplicate sales thresholds", () => {
      const duplicateTiers: CommissionTier[] = [
        { id: "1", name: "Tier 1", minSales: 0, commissionRate: 10 },
        { id: "2", name: "Tier 2", minSales: 50, commissionRate: 15 },
        { id: "3", name: "Tier 3", minSales: 50, commissionRate: 20 },
      ];
      const res = validateCommissionTiers(duplicateTiers);
      expect(res.valid).toBe(false);
      expect(res.error).toContain("Thresholds must be unique");
    });

    it("should enforce a baseline tier starting at 0 sales", () => {
      const noBaseTier: CommissionTier[] = [
        { id: "1", name: "Silver", minSales: 50, commissionRate: 15 },
        { id: "2", name: "Gold", minSales: 100, commissionRate: 20 },
      ];
      const res = validateCommissionTiers(noBaseTier);
      expect(res.valid).toBe(false);
      expect(res.error).toContain("baseline tier with a threshold of 0 sales is required");
    });
  });

  describe("Affiliate Tier Resolution Logic", () => {
    it("should resolve Base Tier for 0 sales", () => {
      const result = resolveTierForSales(0, DEFAULT_COMMISSION_TIERS);
      expect(result.tier?.name).toBe("Base Tier");
      expect(result.commissionRate).toBe(10);
      expect(result.nextTier?.name).toBe("Silver Tier");
      expect(result.salesToNextTier).toBe(50);
    });

    it("should resolve Base Tier for sales under 50", () => {
      const result = resolveTierForSales(49, DEFAULT_COMMISSION_TIERS);
      expect(result.tier?.name).toBe("Base Tier");
      expect(result.commissionRate).toBe(10);
      expect(result.nextTier?.name).toBe("Silver Tier");
      expect(result.salesToNextTier).toBe(1);
    });

    it("should resolve Silver Tier at 50 sales", () => {
      const result = resolveTierForSales(50, DEFAULT_COMMISSION_TIERS);
      expect(result.tier?.name).toBe("Silver Tier");
      expect(result.commissionRate).toBe(15);
      expect(result.nextTier?.name).toBe("Gold Tier");
      expect(result.salesToNextTier).toBe(50);
    });

    it("should resolve Gold Tier at milestone threshold (>100 sales)", () => {
      const at100 = resolveTierForSales(100, DEFAULT_COMMISSION_TIERS);
      expect(at100.tier?.name).toBe("Gold Tier");
      expect(at100.commissionRate).toBe(20);
      expect(at100.nextTier?.name).toBe("Platinum Tier");
      expect(at100.salesToNextTier).toBe(150);

      const above100 = resolveTierForSales(150, DEFAULT_COMMISSION_TIERS);
      expect(above100.tier?.name).toBe("Gold Tier");
      expect(above100.commissionRate).toBe(20);
      expect(above100.salesToNextTier).toBe(100);
    });

    it("should resolve top Platinum Tier for >=250 sales with no next tier", () => {
      const result = resolveTierForSales(300, DEFAULT_COMMISSION_TIERS);
      expect(result.tier?.name).toBe("Platinum Tier");
      expect(result.commissionRate).toBe(25);
      expect(result.nextTier).toBeNull();
      expect(result.salesToNextTier).toBe(0);
    });

    it("should fallback gracefully if tiers list is empty", () => {
      const result = resolveTierForSales(50, [], 12);
      expect(result.tier).toBeNull();
      expect(result.commissionRate).toBe(12);
      expect(result.nextTier).toBeNull();
    });
  });

  describe("On-Chain Soroban Tier Mapping Logic", () => {
    it("should correctly encode CommissionTier into Soroban ScVal Map", () => {
      const tier: CommissionTier = {
        id: "tier-gold",
        name: "Gold Tier",
        minSales: 100,
        commissionRate: 20,
      };

      const scVal = mapTierToScVal(tier);
      expect(scVal).toBeDefined();
      expect((scVal as any).type).toBe("scvMap");

      // Decode back
      const decoded = mapScValToTier(scVal, 0);
      expect(decoded.name).toBe("Gold Tier");
      expect(decoded.minSales).toBe(100);
      expect(decoded.commissionRate).toBe(20);
    });

    it("should accurately encode and decode an array of tiers as ScVal Vec", () => {
      const scValVec = mapTiersToScValVec(DEFAULT_COMMISSION_TIERS);
      expect((scValVec as any).type).toBe("scvVec");

      const decodedTiers = mapScValVecToTiers(scValVec);
      expect(decodedTiers.length).toBe(DEFAULT_COMMISSION_TIERS.length);

      expect(decodedTiers[0].minSales).toBe(0);
      expect(decodedTiers[0].commissionRate).toBe(10);

      expect(decodedTiers[1].minSales).toBe(50);
      expect(decodedTiers[1].commissionRate).toBe(15);

      expect(decodedTiers[2].minSales).toBe(100);
      expect(decodedTiers[2].commissionRate).toBe(20);

      expect(decodedTiers[3].minSales).toBe(250);
      expect(decodedTiers[3].commissionRate).toBe(25);
    });
  });
});
