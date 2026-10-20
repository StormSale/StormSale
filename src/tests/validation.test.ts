import { describe, it, expect } from "vitest";
import {
  stellarAddressSchema,
  stellarPublicKeySchema,
  sorobanContractSchema,
  xlmAmountSchema,
  positiveIntSchema,
  createCampaignSchema,
  getCreateCampaignSchema,
  logSaleSchema,
  grantAccessSchema,
  joinCampaignSchema,
  verifyAccessSchema,
  registerUserRequestSchema,
  conversionsListResponseSchema,
  getFieldErrors,
  validate,
} from "../lib/validation";

describe("Validation Schemas & Error Mapping Suite (#74)", () => {
  const validPublicKey = "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5"; // 56 chars, valid Ed25519 public key
  const validContractId = "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC"; // 56 chars, valid contract ID

  describe("Stellar & Soroban Address Primitives", () => {
    it("validates valid 56-char public keys and contract IDs", () => {
      expect(stellarAddressSchema.safeParse(validPublicKey).success).toBe(true);
      expect(stellarAddressSchema.safeParse(validContractId).success).toBe(true);
      expect(stellarPublicKeySchema.safeParse(validPublicKey).success).toBe(true);
      expect(sorobanContractSchema.safeParse(validContractId).success).toBe(true);
    });

    it("rejects invalid keys, checksum failures, and wrong prefixes", () => {
      // 56 chars starting with G, but invalid CRC checksum
      expect(
        stellarPublicKeySchema.safeParse("GASTORMSALE7TESTNET7AFFILIATE7MERCHANT7ESCROW7XLM7777777")
          .success,
      ).toBe(false);
      expect(stellarPublicKeySchema.safeParse(validContractId).success).toBe(false);
      expect(sorobanContractSchema.safeParse(validPublicKey).success).toBe(false);
      expect(stellarAddressSchema.safeParse("SHORT_KEY").success).toBe(false);
      expect(stellarAddressSchema.safeParse("X" + validPublicKey.slice(1)).success).toBe(false);
    });
  });

  describe("Numeric & Amount Primitives", () => {
    it("validates positive XLM amount up to 7 decimal places", () => {
      expect(xlmAmountSchema.safeParse("100").success).toBe(true);
      expect(xlmAmountSchema.safeParse("10.1234567").success).toBe(true);
      expect(xlmAmountSchema.safeParse("0").success).toBe(false);
      expect(xlmAmountSchema.safeParse("-5").success).toBe(false);
      expect(xlmAmountSchema.safeParse("10.12345678").success).toBe(false); // exceeds 7 decimals
      expect(xlmAmountSchema.safeParse("abc").success).toBe(false);
    });

    it("validates positive integers for IDs", () => {
      expect(positiveIntSchema.safeParse("1").success).toBe(true);
      expect(positiveIntSchema.safeParse("42").success).toBe(true);
      expect(positiveIntSchema.safeParse("0").success).toBe(false);
      expect(positiveIntSchema.safeParse("-1").success).toBe(false);
      expect(positiveIntSchema.safeParse("1.5").success).toBe(false);
      expect(positiveIntSchema.safeParse("abc").success).toBe(false);
    });
  });

  describe("createCampaignSchema and getCreateCampaignSchema", () => {
    it("accepts valid campaign payload with budget", () => {
      const valid = {
        campaignName: "Holiday Sale 2026",
        commissionRate: "15",
        budget: "1000",
        clearingPeriod: "86400",
      };
      const result = createCampaignSchema.safeParse(valid);
      expect(result.success).toBe(true);
    });

    it("requires budget and rejects missing, empty, or non-positive budget", () => {
      const missingBudget = {
        campaignName: "Spring Promo",
        commissionRate: "10",
        clearingPeriod: "3600",
      };
      expect(createCampaignSchema.safeParse(missingBudget).success).toBe(false);

      const emptyBudget = {
        ...missingBudget,
        budget: "",
      };
      expect(createCampaignSchema.safeParse(emptyBudget).success).toBe(false);

      const zeroBudget = {
        ...missingBudget,
        budget: "0",
      };
      expect(createCampaignSchema.safeParse(zeroBudget).success).toBe(false);

      const negativeBudget = {
        ...missingBudget,
        budget: "-50",
      };
      expect(createCampaignSchema.safeParse(negativeBudget).success).toBe(false);
    });

    it("enforces maxDecimals precision dynamically using getCreateCampaignSchema", () => {
      // 7 decimals for XLM
      const xlmSchema = getCreateCampaignSchema(7);
      expect(
        xlmSchema.safeParse({
          campaignName: "XLM Campaign",
          commissionRate: "10",
          budget: "100.1234567",
          clearingPeriod: "3600",
        }).success,
      ).toBe(true);
      expect(
        xlmSchema.safeParse({
          campaignName: "XLM Campaign",
          commissionRate: "10",
          budget: "100.12345678",
          clearingPeriod: "3600",
        }).success,
      ).toBe(false);

      // 2 decimals (e.g., standard fiat token)
      const fiatSchema = getCreateCampaignSchema(2);
      expect(
        fiatSchema.safeParse({
          campaignName: "Fiat Campaign",
          commissionRate: "10",
          budget: "100.25",
          clearingPeriod: "3600",
        }).success,
      ).toBe(true);
      expect(
        fiatSchema.safeParse({
          campaignName: "Fiat Campaign",
          commissionRate: "10",
          budget: "100.255",
          clearingPeriod: "3600",
        }).success,
      ).toBe(false);
    });

    it("rejects invalid campaign names", () => {
      const short = {
        campaignName: "ab",
        commissionRate: "10",
        budget: "100",
        clearingPeriod: "3600",
      };
      const long = {
        campaignName: "a".repeat(65),
        commissionRate: "10",
        budget: "100",
        clearingPeriod: "3600",
      };
      expect(createCampaignSchema.safeParse(short).success).toBe(false);
      expect(createCampaignSchema.safeParse(long).success).toBe(false);
    });

    it("enforces 1% - 50% commission rate bounds", () => {
      expect(
        createCampaignSchema.safeParse({
          campaignName: "Test Campaign",
          commissionRate: "0",
          budget: "100",
          clearingPeriod: "3600",
        }).success,
      ).toBe(false);

      expect(
        createCampaignSchema.safeParse({
          campaignName: "Test Campaign",
          commissionRate: "51",
          budget: "100",
          clearingPeriod: "3600",
        }).success,
      ).toBe(false);

      expect(
        createCampaignSchema.safeParse({
          campaignName: "Test Campaign",
          commissionRate: "15abc",
          budget: "100",
          clearingPeriod: "3600",
        }).success,
      ).toBe(false);
    });

    it("enforces minimum clearing period of 1 hour (3600s)", () => {
      expect(
        createCampaignSchema.safeParse({
          campaignName: "Test Campaign",
          commissionRate: "10",
          budget: "100",
          clearingPeriod: "3599",
        }).success,
      ).toBe(false);

      expect(
        createCampaignSchema.safeParse({
          campaignName: "Test Campaign",
          commissionRate: "10",
          budget: "100",
          clearingPeriod: "3600",
        }).success,
      ).toBe(true);
    });
  });

  describe("Form Action Schemas", () => {
    it("validates logSaleSchema", () => {
      const valid = {
        campaignAddress: validContractId,
        affiliateAddress: validPublicKey,
        saleAmount: "250.5",
        customerData: "Cust-01",
      };
      expect(logSaleSchema.safeParse(valid).success).toBe(true);

      const invalid = {
        campaignAddress: "INVALID",
        affiliateAddress: validContractId, // contract ID cannot be affiliate address
        saleAmount: "0",
      };
      expect(logSaleSchema.safeParse(invalid).success).toBe(false);
    });

    it("validates grantAccessSchema", () => {
      const valid = {
        campaignAddress: validContractId,
        saleId: "5",
        auditorAddress: validPublicKey,
      };
      expect(grantAccessSchema.safeParse(valid).success).toBe(true);

      const invalid = {
        campaignAddress: "short",
        saleId: "-1",
        auditorAddress: "invalid",
      };
      expect(grantAccessSchema.safeParse(invalid).success).toBe(false);
    });

    it("validates joinCampaignSchema and verifyAccessSchema", () => {
      expect(joinCampaignSchema.safeParse({ campaignAddress: validContractId }).success).toBe(true);
      expect(joinCampaignSchema.safeParse({ campaignAddress: "invalid" }).success).toBe(false);

      expect(
        verifyAccessSchema.safeParse({ campaignAddress: validContractId, saleId: "12" }).success,
      ).toBe(true);
      expect(
        verifyAccessSchema.safeParse({ campaignAddress: validContractId, saleId: "0" }).success,
      ).toBe(false);
    });
  });

  describe("API Schemas", () => {
    it("validates registerUserRequestSchema", () => {
      expect(
        registerUserRequestSchema.safeParse({
          walletAddress: validPublicKey,
          role: "AFFILIATE",
        }).success,
      ).toBe(true);

      // Rejects invalid checksum / format
      expect(
        registerUserRequestSchema.safeParse({
          walletAddress: "INVALID",
          role: "AFFILIATE",
        }).success,
      ).toBe(false);

      // Rejects contract address (only public keys allowed for user registration)
      expect(
        registerUserRequestSchema.safeParse({
          walletAddress: validContractId,
          role: "AFFILIATE",
        }).success,
      ).toBe(false);

      // Rejects empty role
      expect(
        registerUserRequestSchema.safeParse({
          walletAddress: validPublicKey,
          role: "",
        }).success,
      ).toBe(false);
    });

    it("validates conversionsListResponseSchema", () => {
      const conversions = [
        {
          id: "tx-1",
          customerRef: "CUST_1",
          affiliateAddress: validPublicKey,
          affiliateName: "Alice",
          campaignId: "CAMP_1",
          campaignName: "Campaign A",
          amount: 150,
          timestamp: new Date().toISOString(),
        },
      ];
      expect(conversionsListResponseSchema.safeParse(conversions).success).toBe(true);
      expect(conversionsListResponseSchema.safeParse([{ id: "1" }]).success).toBe(false);
    });
  });

  describe("getFieldErrors & validate helpers", () => {
    it("maps Zod error issues into a flat field -> message map", () => {
      const parsed = createCampaignSchema.safeParse({
        campaignName: "a",
        commissionRate: "100",
        clearingPeriod: "10",
      });
      expect(parsed.success).toBe(false);
      if (!parsed.success) {
        const errors = getFieldErrors(parsed.error);
        expect(errors.campaignName).toBeDefined();
        expect(errors.commissionRate).toBeDefined();
        expect(errors.clearingPeriod).toBeDefined();
        expect(errors.budget).toBeDefined();
      }
    });

    it("validate helper returns typed data or mapped errors", () => {
      const valid = validate(positiveIntSchema, "10");
      expect(valid.errors).toBeNull();
      expect(valid.data).toBe("10");

      const invalid = validate(positiveIntSchema, "-1");
      expect(invalid.data).toBeNull();
      expect(invalid.errors).toBeDefined();
    });
  });
});
