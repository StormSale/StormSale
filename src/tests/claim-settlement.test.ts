import { describe, it, expect } from "vitest";
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
});
