import { describe, it, expect } from "vitest";
import {
  hashWalletAddress,
  validateNoPII,
  mapCampaignViewed,
  mapOrderCompleted,
  PIIValidationError,
} from "../utils/analyticsMapper";

describe("Analytics Mapper & Privacy Guard Suite", () => {
  describe("hashWalletAddress", () => {
    it("produces standard SHA-256 hex digest matching RFC 4634 / FIPS 180-4 standard", () => {
      const sampleStellarAddress = "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5";
      const actualHash = hashWalletAddress(sampleStellarAddress);

      // Standard SHA-256 hash of sampleStellarAddress
      const expectedHash = "65208331504742190a7c6b7acdd13b25d9ddf1dd88ee98af1d52cd1db88ffc90";

      expect(actualHash).toBe(expectedHash);
      expect(actualHash).toHaveLength(64);
      expect(actualHash).toMatch(/^[a-f0-9]{64}$/);
    });

    it("produces deterministic output for identical wallet addresses", () => {
      const addr = "GASTORMSALE7TESTNET7AFFILIATE7MERCHANT7ESCROW7XLM77777";
      const hash1 = hashWalletAddress(addr);
      const hash2 = hashWalletAddress(addr);
      expect(hash1).toBe(hash2);
    });

    it("handles whitespace and empty strings gracefully", () => {
      expect(hashWalletAddress("")).toBe("");
      expect(hashWalletAddress("   ")).toBe("");
      expect(hashWalletAddress(null as any)).toBe("");
      expect(hashWalletAddress(undefined as any)).toBe("");

      const unpadded = "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5";
      expect(hashWalletAddress(`  ${unpadded}  `)).toBe(hashWalletAddress(unpadded));
    });
  });

  describe("validateNoPII", () => {
    it("passes for clean payloads with no PII", () => {
      const cleanPayload = {
        campaign_id: "101",
        campaign_name: "Tech Gadgets Pro",
        category: "Hardware",
        commission_rate: 15,
        currency: "XLM",
        affiliate_id: hashWalletAddress("GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5"),
      };

      expect(() => validateNoPII(cleanPayload)).not.toThrow();
    });

    it("throws PIIValidationError when payload contains raw Stellar public key", () => {
      const leakyPayload = {
        campaign_id: "101",
        user_wallet: "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
      };

      expect(() => validateNoPII(leakyPayload)).toThrow(PIIValidationError);
      expect(() => validateNoPII(leakyPayload)).toThrow(/raw Stellar wallet address/i);
    });

    it("throws PIIValidationError when payload contains raw Ethereum address", () => {
      const leakyPayload = {
        order_id: "ORD_1",
        destination: "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045",
      };

      expect(() => validateNoPII(leakyPayload)).toThrow(PIIValidationError);
      expect(() => validateNoPII(leakyPayload)).toThrow(/raw Ethereum address/i);
    });

    it("throws PIIValidationError when payload contains forbidden PII keys", () => {
      const forbiddenKeyPayloads = [
        { private_key: "some_secret_value" },
        { mnemonic: "twelve random words seed phrase test" },
        { sessionToken: "jwt_token_12345" },
        { walletAddress: "an_address" },
        { email: "user@example.com" },
      ];

      for (const payload of forbiddenKeyPayloads) {
        expect(() => validateNoPII(payload)).toThrow(PIIValidationError);
      }
    });

    it("throws PIIValidationError when payload contains a potential Stellar secret seed", () => {
      const dangerousPayload = {
        config: "SB4XYZABCDEFGHIJKLMNOPQRSTUVWXYZ234567ABCDEFGHIJKLMNOPQR",
      };

      expect(() => validateNoPII(dangerousPayload)).toThrow(PIIValidationError);
      expect(() => validateNoPII(dangerousPayload)).toThrow(/secret seed/i);
    });
  });

  describe("mapCampaignViewed", () => {
    it("maps internal campaign data to standard Segment Campaign Viewed spec", () => {
      const result = mapCampaignViewed({
        campaignId: 42,
        campaignName: "DeFi Remittance Launch",
        category: "Fintech",
        commissionRate: 12.5,
      });

      expect(result.event).toBe("Campaign Viewed");
      expect(result.properties).toEqual({
        campaign_id: "42",
        campaign_name: "DeFi Remittance Launch",
        category: "Fintech",
        commission_rate: 12.5,
      });
    });

    it("provides clean defaults and never includes wallet or user IDs", () => {
      const result = mapCampaignViewed({
        campaignId: "test-camp-99",
        campaignName: "",
        commissionRate: 10,
      });

      expect(result.properties.campaign_id).toBe("test-camp-99");
      expect(result.properties.campaign_name).toBe("Untitled Campaign");
      expect(result.properties.category).toBe("General");
      expect(result.properties.commission_rate).toBe(10);
      expect(result.properties).not.toHaveProperty("wallet");
      expect(result.properties).not.toHaveProperty("affiliate_id");
    });
  });

  describe("mapOrderCompleted", () => {
    it("maps on-chain sale to standard Segment Order Completed spec with hashed affiliate ID", () => {
      const rawAffiliate = "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5";
      const expectedHash = "65208331504742190a7c6b7acdd13b25d9ddf1dd88ee98af1d52cd1db88ffc90";

      const result = mapOrderCompleted({
        orderId: "SALE_1001",
        campaignId: "CAMPAIGN_500",
        revenue: 250.75,
        affiliateAddress: rawAffiliate,
      });

      expect(result.event).toBe("Order Completed");
      expect(result.properties).toEqual({
        order_id: "SALE_1001",
        campaign_id: "CAMPAIGN_500",
        revenue: 250.75,
        currency: "XLM",
        affiliate_id: expectedHash,
      });

      // Raw wallet address is NEVER present in the output
      expect(JSON.stringify(result.properties)).not.toContain(rawAffiliate);
      expect(result.properties.affiliate_id).toBe(expectedHash);
    });

    it("parses string revenue accurately into a float number", () => {
      const rawAffiliate = "GASTORMSALE7TESTNET7AFFILIATE7MERCHANT7ESCROW7XLM77777";
      const result = mapOrderCompleted({
        orderId: 999,
        campaignId: 101,
        revenue: "1500.50",
        affiliateAddress: rawAffiliate,
      });

      expect(result.properties.revenue).toBe(1500.5);
      expect(typeof result.properties.revenue).toBe("number");
      expect(result.properties.currency).toBe("XLM");
    });
  });
});
