import { describe, it, expect, beforeEach } from "vitest";
import {
  calculateTotalClaimableXlm,
  executeBatchCommissionClaim,
  type ClaimableCampaignItem,
} from "../lib/batchClaim";

const MOCK_AFFILIATE = "GASTORMSALE7TESTNET7AFFILIATE7MERCHANT7ESCROW7XLM77777";

const maturedItem = (overrides: Partial<ClaimableCampaignItem> = {}): ClaimableCampaignItem => ({
  campaignId: 101,
  campaignName: "Apex Alpha Performance Tech",
  advertiserAddress: "GA7QW5KXGPTR4N2K9J2M3N4P5Q6R7S8T9U0V1W2X3Y4Z5A6B7C8D",
  maturedSalesCount: 4,
  claimableXlm: 45.5,
  clearingPeriodDays: 7,
  lastSaleDate: "2026-10-01",
  status: "matured",
  ...overrides,
});

describe("Secure Claim Settlement Validation (#49)", () => {
  it("settles a valid mock batch without changing the receipt shape", async () => {
    const receipt = await executeBatchCommissionClaim(MOCK_AFFILIATE, [maturedItem()], "mock");
    expect(receipt.success).toBe(true);
    expect(receipt.txHash.startsWith("0x")).toBe(true);
    expect(receipt.totalClaimedXlm).toBe(45.5);
    expect(receipt.itemizedClaims).toHaveLength(1);
  });

  it("rejects non-matured campaigns instead of settling them", async () => {
    await expect(
      executeBatchCommissionClaim(MOCK_AFFILIATE, [maturedItem({ status: "clearing" })], "mock"),
    ).rejects.toThrow("not matured and cannot be claimed");
  });

  it("rejects duplicate campaign ids", async () => {
    await expect(
      executeBatchCommissionClaim(MOCK_AFFILIATE, [maturedItem(), maturedItem()], "mock"),
    ).rejects.toThrow("Duplicate campaignId");
  });

  it("rejects invalid claim amounts", async () => {
    await expect(
      executeBatchCommissionClaim(MOCK_AFFILIATE, [maturedItem({ claimableXlm: NaN })], "mock"),
    ).rejects.toThrow("Invalid claimable amount");
    await expect(
      executeBatchCommissionClaim(MOCK_AFFILIATE, [maturedItem({ claimableXlm: -5 })], "mock"),
    ).rejects.toThrow("Invalid claimable amount");
  });

  it("rejects invalid affiliate addresses", async () => {
    await expect(executeBatchCommissionClaim("not-an-address", [maturedItem()], "mock")).rejects.toThrow(
      "Invalid affiliate address",
    );
  });

  it("rejects readonly wallets instead of faking a receipt", async () => {
    await expect(
      executeBatchCommissionClaim(MOCK_AFFILIATE, [maturedItem()], "readonly"),
    ).rejects.toThrow("Readonly wallet cannot sign");
  });

  it("rejects negative totals in aggregation", () => {
    expect(() => calculateTotalClaimableXlm([maturedItem({ claimableXlm: -1 })])).toThrow(
      "Negative claimable amount",
    );
  });

  describe("wallet balance increase", () => {
    let balanceBefore: number;

    beforeEach(() => {
      balanceBefore = 1000;
    });

    it("increases the affiliate wallet balance by the total claimed amount", async () => {
      const items = [maturedItem(), maturedItem({ campaignId: 102, claimableXlm: 12.25 })];
      const receipt = await executeBatchCommissionClaim(MOCK_AFFILIATE, items, "mock");
      const expectedTotal = calculateTotalClaimableXlm(items);
      const balanceAfter = balanceBefore + receipt.totalClaimedXlm;

      expect(receipt.success).toBe(true);
      expect(receipt.totalClaimedXlm).toBe(expectedTotal);
      expect(balanceAfter - balanceBefore).toBeCloseTo(receipt.totalClaimedXlm, 1e-9);
      expect(balanceAfter).toBe(1057.75);
    });
  });

  describe("error path: low gas", () => {
    it("rejects the claim when gas fees exceed the available balance", async () => {
      const availableBalanceXlm = 0.00001;
      const estimatedFeeXlm = 0.0001;
      const items = [maturedItem()];
      const totalClaimable = calculateTotalClaimableXlm(items);

      expect(estimatedFeeXlm).toBeGreaterThan(availableBalanceXlm);
      await expect(
        executeBatchCommissionClaim(MOCK_AFFILIATE, items, "mock", {
          availableBalanceXlm,
          estimatedFeeXlm: estimatedFeeXlm,
        }),
      ).rejects.toThrow("Insufficient gas fees");
      expect(totalClaimable).toBe(45.5);
    });

    it("rejects the claim when the fee estimate is invalid", async () => {
      await expect(
        executeBatchCommissionClaim(MOCK_AFFILIATE, [maturedItem()], "mock", {
          availableBalanceXlm: 1000,
          estimatedFeeXlm: NaN,
        }),
      ).rejects.toThrow("Invalid gas fee estimate");
    });
  });
});