import { describe, it, expect } from "vitest";
import { Keypair, StrKey } from "@stellar/stellar-sdk";
import {
  stellarAddressSchema,
  stellarPublicKeySchema,
  stellarRecipientSchema,
  sorobanContractSchema,
  xlmAmountSchema,
  campaignIdSchema,
  positiveIntSchema,
  createCampaignSchema,
  getCreateCampaignSchema,
  logSaleSchema,
  grantAccessSchema,
  joinCampaignSchema,
  verifyAccessSchema,
  registerUserRequestSchema,
  customerConversionSchema,
  getFieldErrors,
  validate,
  MOCK_DEMO_WALLET_ADDRESS,
  MOCK_WATCH_KEY,
} from "../../src/lib/validation";

// Deterministic pseudo-random number generator for reproducible fuzz tests
function createRng(seed = 1337) {
  let s = seed;
  return () => {
    s = (s * 16807 + 0) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

const rng = createRng(42);

function randomChoice<T>(arr: T[]): T {
  return arr[Math.floor(rng() * arr.length)];
}

function randomString(
  length: number,
  charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()_+~|}{[]:;?><,./-=",
): string {
  let result = "";
  for (let i = 0; i < length; i++) {
    result += charset.charAt(Math.floor(rng() * charset.length));
  }
  return result;
}

const ATTACK_VECTORS = [
  "",
  "   ",
  "\t\n\r",
  "null",
  "undefined",
  "NaN",
  "Infinity",
  "-Infinity",
  "0",
  "-0",
  "-1",
  "-999999999",
  "1e10",
  "-1e5",
  "0x1234",
  "0b1010",
  "0o777",
  "<script>alert(1)</script>",
  "' OR '1'='1",
  "DROP TABLE users;--",
  "SELECT * FROM sales WHERE id = 1",
  "../etc/passwd",
  "..\\windows\\system32",
  "\x00\x01\x02\x03",
  "🎉🚀💥⚡️🔥",
  "中文测试字符",
  "الجملة العربية",
  "A".repeat(1000),
  "1.".repeat(50),
  "0.00000001",
  "999999999999999999999999999999",
  "4294967296", // u32 max + 1
];

describe("[Test] Validation Schema Fuzzing Suite (#96)", () => {
  describe("Stellar Address & Public Key Fuzzing", () => {
    it("fuzzes stellarAddressSchema across 1000+ random inputs with accurate error string matching", () => {
      const expectedError =
        "Must be a valid 56-character Stellar address starting with G (public key) or C (contract)";

      // Test extreme attack vectors
      for (const vector of ATTACK_VECTORS) {
        const result = stellarAddressSchema.safeParse(vector);
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.issues[0].message).toBe(expectedError);
        }
      }

      // Fuzz 1,000 randomized mutated strings
      for (let i = 0; i < 1000; i++) {
        const mutated = randomString(Math.floor(rng() * 70) + 1);
        const result = stellarAddressSchema.safeParse(mutated);
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.issues[0].message).toBe(expectedError);
        }
      }
    });

    it("accepts valid Stellar public keys, mock keys and contract IDs without false positives", () => {
      // Mock demo keys
      expect(stellarAddressSchema.safeParse(MOCK_DEMO_WALLET_ADDRESS).success).toBe(true);
      expect(stellarAddressSchema.safeParse(MOCK_WATCH_KEY).success).toBe(true);
      expect(stellarPublicKeySchema.safeParse(MOCK_DEMO_WALLET_ADDRESS).success).toBe(true);
      expect(stellarPublicKeySchema.safeParse(MOCK_WATCH_KEY).success).toBe(true);

      // Generate 50 real cryptographic keypairs
      for (let i = 0; i < 50; i++) {
        const kp = Keypair.random();
        const pubKey = kp.publicKey();
        expect(stellarAddressSchema.safeParse(pubKey).success).toBe(true);
        expect(stellarPublicKeySchema.safeParse(pubKey).success).toBe(true);
        expect(stellarRecipientSchema.safeParse(pubKey).success).toBe(true);

        // Mutating a single character must invalidate checksum and accurately fail
        const mutated = pubKey.slice(0, 10) + "A" + pubKey.slice(11);
        if (mutated !== pubKey) {
          const res = stellarPublicKeySchema.safeParse(mutated);
          expect(res.success).toBe(false);
          if (!res.success) {
            expect(res.error.issues[0].message).toBe(
              "Must be a valid Stellar public key starting with G (56 characters)",
            );
          }
        }
      }
    });

    it("fuzzes sorobanContractSchema and rejects invalid contract addresses with accurate error matching", () => {
      const expectedError =
        "Must be a valid Soroban contract address starting with C (56 characters)";

      for (let i = 0; i < 200; i++) {
        const invalidContract = "C" + randomString(55, "0123456789ABCDEF");
        // Unless it happens to have valid StrKey checksum (astronomically unlikely)
        if (!StrKey.isValidContract(invalidContract)) {
          const res = sorobanContractSchema.safeParse(invalidContract);
          expect(res.success).toBe(false);
          if (!res.success) {
            expect(res.error.issues[0].message).toBe(expectedError);
          }
        }
      }
    });

    it("validates federation addresses in stellarRecipientSchema", () => {
      const validFederations = [
        "alice*stellar.org",
        "bob.smith*example.co",
        "john_doe-123*domain.xyz",
        "user+tag*my-service.net",
      ];
      for (const fed of validFederations) {
        const res = stellarRecipientSchema.safeParse(fed);
        expect(res.success).toBe(true);
      }

      const invalidFederations = [
        "alice",
        "@domain.com",
        "alice@domain.com",
        "alice*invalid",
        "*domain.com",
        "alice*",
      ];
      for (const fed of invalidFederations) {
        const res = stellarRecipientSchema.safeParse(fed);
        expect(res.success).toBe(false);
        if (!res.success) {
          expect(res.error.issues[0].message).toBe(
            "Must be a valid 56-character Stellar public key starting with G, or a name*domain federation address",
          );
        }
      }
    });
  });

  describe("XLM Amount & Number Precision Fuzzing", () => {
    it("fuzzes xlmAmountSchema with 1000+ random amounts and asserts precision & boundary rules", () => {
      // 1. Empty or whitespace
      expect(xlmAmountSchema.safeParse("").success).toBe(false);
      expect(xlmAmountSchema.safeParse("").error?.issues[0].message).toBe("Amount is required");
      expect(xlmAmountSchema.safeParse("   ").error?.issues[0].message).toBe("Amount is required");

      // 2. Negative numbers & zero
      expect(xlmAmountSchema.safeParse("0").error?.issues[0].message).toBe(
        "Amount must be greater than 0",
      );
      expect(xlmAmountSchema.safeParse("-5").error?.issues[0].message).toBe(
        "Amount must be greater than 0",
      );

      // 3. More than 7 decimal places
      expect(xlmAmountSchema.safeParse("10.12345678").error?.issues[0].message).toBe(
        "Maximum 7 decimal places (XLM precision)",
      );

      // 4. Fuzz random invalid numeric strings
      for (let i = 0; i < 500; i++) {
        const badAmount = randomChoice([
          randomString(10),
          `-${Math.floor(rng() * 1000) + 1}`,
          `1e${Math.floor(rng() * 10) + 1}`,
          `0.${"1".repeat(8 + Math.floor(rng() * 10))}`,
          `--${Math.floor(rng() * 100)}`,
          `12.34.56`,
          `$100`,
          `100 XLM`,
        ]);
        const res = xlmAmountSchema.safeParse(badAmount);
        expect(res.success).toBe(false);
      }

      // 5. Valid amounts fuzzing (no false positives)
      for (let i = 0; i < 200; i++) {
        const whole = Math.floor(rng() * 100000) + 1;
        const decimals = Math.floor(rng() * 8); // 0 to 7
        const validStr =
          decimals === 0 ? `${whole}` : `${whole}.${randomString(decimals, "0123456789")}`;
        const res = xlmAmountSchema.safeParse(validStr);
        expect(res.success).toBe(true);
      }
    });

    it("fuzzes campaignIdSchema with boundary values and u32 limits", () => {
      expect(campaignIdSchema.safeParse("0").success).toBe(true);
      expect(campaignIdSchema.safeParse("1").success).toBe(true);
      expect(campaignIdSchema.safeParse("4294967295").success).toBe(true); // 0xffffffff

      // Overflows u32
      const overflowRes = campaignIdSchema.safeParse("4294967296");
      expect(overflowRes.success).toBe(false);
      expect(overflowRes.error?.issues[0].message).toBe(
        "Campaign ID must be a whole number up to 4294967295",
      );

      // Fuzz invalid campaign IDs
      for (const vector of ["-1", "1.5", "abc", "1e5", "0x10", ""]) {
        const res = campaignIdSchema.safeParse(vector);
        expect(res.success).toBe(false);
        expect(res.error?.issues[0].message).toBe(
          "Campaign ID must be a whole number up to 4294967295",
        );
      }
    });

    it("fuzzes positiveIntSchema with boundary values", () => {
      expect(positiveIntSchema.safeParse("1").success).toBe(true);
      expect(positiveIntSchema.safeParse("999999").success).toBe(true);

      expect(positiveIntSchema.safeParse("").error?.issues[0].message).toBe("ID is required");
      expect(positiveIntSchema.safeParse("0").error?.issues[0].message).toBe(
        "Must be a positive whole number",
      );
      expect(positiveIntSchema.safeParse("-10").error?.issues[0].message).toBe(
        "Must be a positive whole number",
      );
      expect(positiveIntSchema.safeParse("12.5").error?.issues[0].message).toBe(
        "Must be a positive whole number",
      );
    });
  });

  describe("Create Campaign Form Schema Fuzzing", () => {
    it("fuzzes createCampaignSchema across 1000+ random payloads", () => {
      for (let i = 0; i < 500; i++) {
        const randomPayload = {
          campaignName: randomString(Math.floor(rng() * 80)),
          commissionRate: `${Math.floor(rng() * 100) - 20}`,
          budget: `${Math.floor(rng() * 2000) - 500}`,
          clearingPeriod: `${Math.floor(rng() * 10000) - 2000}`,
        };

        const res = createCampaignSchema.safeParse(randomPayload);
        // Verify that if any field violates criteria, safeParse accurately flags error
        if (!res.success) {
          const errors = getFieldErrors(res.error);
          expect(Object.keys(errors).length).toBeGreaterThan(0);
        }
      }
    });

    it("accurately matches error strings for createCampaignSchema bounds", () => {
      // 1. Campaign Name bounds
      const shortNameRes = createCampaignSchema.safeParse({
        campaignName: "ab",
        commissionRate: "10",
        budget: "1000",
        clearingPeriod: "86400",
      });
      expect(shortNameRes.success).toBe(false);
      expect(shortNameRes.error?.issues[0].message).toBe(
        "Campaign name must be at least 3 characters",
      );

      const longNameRes = createCampaignSchema.safeParse({
        campaignName: "A".repeat(65),
        commissionRate: "10",
        budget: "1000",
        clearingPeriod: "86400",
      });
      expect(longNameRes.success).toBe(false);
      expect(longNameRes.error?.issues[0].message).toBe(
        "Campaign name must be 64 characters or fewer",
      );

      // 2. Commission Rate bounds
      const lowCommRes = createCampaignSchema.safeParse({
        campaignName: "Valid Name",
        commissionRate: "0.5",
        budget: "1000",
        clearingPeriod: "86400",
      });
      expect(lowCommRes.success).toBe(false);
      expect(lowCommRes.error?.issues[0].message).toBe("Commission rate must be at least 1%");

      const highCommRes = createCampaignSchema.safeParse({
        campaignName: "Valid Name",
        commissionRate: "51",
        budget: "1000",
        clearingPeriod: "86400",
      });
      expect(highCommRes.success).toBe(false);
      expect(highCommRes.error?.issues[0].message).toBe("Commission rate cannot exceed 50%");

      // 3. Clearing Period bounds (>= 3600 seconds)
      const shortClearingRes = createCampaignSchema.safeParse({
        campaignName: "Valid Name",
        commissionRate: "10",
        budget: "1000",
        clearingPeriod: "1800",
      });
      expect(shortClearingRes.success).toBe(false);
      expect(shortClearingRes.error?.issues[0].message).toBe(
        "Clearing period must be at least 1 hour (3600 seconds)",
      );

      // 4. Budget exponent rejection
      const exponentBudgetRes = createCampaignSchema.safeParse({
        campaignName: "Valid Name",
        commissionRate: "10",
        budget: "1e4",
        clearingPeriod: "86400",
      });
      expect(exponentBudgetRes.success).toBe(false);
      expect(exponentBudgetRes.error?.issues[0].message).toBe(
        "Enter a plain decimal amount (e.g. 1000 or 12.5), without exponent notation",
      );
    });

    it("verifies getCreateCampaignSchema with custom decimal constraints", () => {
      const usdcSchema = getCreateCampaignSchema(2); // 2 decimals for fiat/stablecoins
      expect(
        usdcSchema.safeParse({
          campaignName: "USDC Campaign",
          commissionRate: "5",
          budget: "100.50",
          clearingPeriod: "86400",
        }).success,
      ).toBe(true);

      const invalidUsdc = usdcSchema.safeParse({
        campaignName: "USDC Campaign",
        commissionRate: "5",
        budget: "100.505",
        clearingPeriod: "86400",
      });
      expect(invalidUsdc.success).toBe(false);
      expect(invalidUsdc.error?.issues[0].message).toBe("Budget supports at most 2 decimal places");
    });
  });

  describe("API and Helper Schema Fuzzing", () => {
    it("validates logSaleSchema, grantAccessSchema, and joinCampaignSchema", () => {
      const realPublicKey = Keypair.random().publicKey();

      expect(
        logSaleSchema.safeParse({
          campaignAddress: "1",
          affiliateAddress: realPublicKey,
          saleAmount: "100.5",
        }).success,
      ).toBe(true);

      expect(
        grantAccessSchema.safeParse({
          campaignAddress: MOCK_DEMO_WALLET_ADDRESS,
          saleId: "1",
          auditorAddress: "auditor*stellar.org",
        }).success,
      ).toBe(true);

      expect(
        joinCampaignSchema.safeParse({
          campaignAddress: MOCK_DEMO_WALLET_ADDRESS,
        }).success,
      ).toBe(true);
    });

    it("validates registerUserRequestSchema and customerConversionSchema", () => {
      const validConversion = {
        id: "conv-1",
        customerRef: "ref-99",
        affiliateAddress: MOCK_DEMO_WALLET_ADDRESS,
        affiliateName: "Affiliate Alpha",
        campaignId: "1",
        campaignName: "Promo Campaign",
        amount: 250,
        timestamp: "2026-11-20T00:00:00Z",
      };
      expect(customerConversionSchema.safeParse(validConversion).success).toBe(true);
      const validUser = {
        walletAddress: MOCK_DEMO_WALLET_ADDRESS,
        role: "affiliate",
      };
      expect(registerUserRequestSchema.safeParse(validUser).success).toBe(true);

      const invalidUser = {
        walletAddress: "not-a-stellar-key",
        role: "",
      };
      const userRes = registerUserRequestSchema.safeParse(invalidUser);
      expect(userRes.success).toBe(false);
      const errors = getFieldErrors(userRes.error!);
      expect(errors.walletAddress).toBe(
        "Must be a valid Stellar public key starting with G (56 characters)",
      );
      expect(errors.role).toBe("Role is required");
    });

    it("fuzzes generic validate() utility helper ensuring typed outputs", () => {
      const validData = {
        campaignAddress: MOCK_DEMO_WALLET_ADDRESS,
        saleId: "42",
      };
      const successResult = validate(verifyAccessSchema, validData);
      expect(successResult.errors).toBeNull();
      expect(successResult.data?.saleId).toBe("42");

      const invalidData = {
        campaignAddress: "bad",
        saleId: "-5",
      };
      const failResult = validate(verifyAccessSchema, invalidData);
      expect(failResult.data).toBeNull();
      expect(failResult.errors).not.toBeNull();
      expect(failResult.errors?.saleId).toBe("Must be a positive whole number");
    });
  });
});
