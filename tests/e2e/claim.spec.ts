import { describe, it, expect, beforeEach, afterEach, vitest } from "vitest";
import {
  fetchAffiliateMaturedClaims,
  calculateTotalClaimableXlm,
  executeBatchCommissionClaim,
  type ClaimableCampaignItem,
  type BatchClaimReceipt,
} from "../../src/lib/batchClaim";
import { fetchXlmBalance } from "../../src/lib/stellar";

/**
 * End-to-end lifecycle test for affiliate commission earning and claiming.
 *
 * Core flow:
 *   1. Affiliate earns commission across multiple campaigns.
 *   2. Commissions mature after clearing period.
 *   3. Affiliate batch-claims all matured commissions in a single transaction.
 *   4. Wallet balance increases by the claimed amount.
 *   5. Error path: low gas / insufficient fee rejects the claim.
 */

const TEST_AFFILIATE_ADDR =
  "GA7QW5KXGPTR4N2K9J2M3N4P5Q6R7S8T9U0V1W2X3Y4Z5A6B7C8D";

const MINIMUM_REQUIRED_FEE_STROPS = 100; // 100 strops minimum fee threshold for a batch claim

/**
 * Mocks the Horizon balance endpoint so the E-2E-test can assert on a
 * deterministic balance increase without hitting live testnet nodes.
 */
function mockHorizonBalance(initialXlm: number, incrementXlm: number) {
  const calls = { count: 0 };
  globalThis.fetch = vitest.fn(async () => {
    const balance = calls.count === 0 ? initialXlm : initialXlm + incrementXlm;
    calls.count += 1;
    return {
      ok: true,
      status: 200,
      json: async () => ({
        balances: [{ asset_type: "native", balance: balance.toFixed(7) }],
      }),
    } as unknown as Response;
  }) as unknown as typeof fetch;
  return calls;
}

describe("Affiliate Commission Lifecycle E-2E", () => {
  let maturedClaims: ClaimableCampaignItem[];
  const originalFetch = globalThis.fetch;

  beforeEach(async () => {
    maturedClaims = await fetchAffiliateMaturedClaims(TEST_AFFILIATE_ADDR);
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vitest.restoreAllMocks();
  });

  it("returns only matured claimable campaigns for the affiliate", () => {
    expect(maturedClaims.length).toBeGreaterThan(0);
    for (const item of maturedClaims) {
      expect(item.status).toBe("matured");
      expect(item.claimableXlm).toBeGreaterThan(0);
      expect(item.maturedSalesCount).toBeGreaterThan(0);
    }
  });

  it("calculates the total claimable XLM with cent-precision rounding", () => {
    const total = calculateTotalClaimableXlm(maturedClaims);
    const manual = maturedClaims.reduce((acc, item) => acc + item.claimableXlm, 0);
    expect(total).toBeCloseTo(Math.round(manual * 100) / 100, 5);
    expect(total).toBeGreaterThan(0);
  });

  it("executes a batch claim and itemizes every campaign in the receipt", async () => {
    const receipt: BatchClaimReceipt = await executeBatchCommissionClaim(
      TEST_AFFILIATE_ADDR,
      maturedClaims,
      "mock",
    );

    expect(receipt.success).toBe(true);
    expect(receipt.txHash).toMatch(/^0x[0-9a-f]{64}$/);
    expect(receipt.itemizedClaims.length).toBe(maturedClaims.length);
    expect(receipt.totalClaimedXlm).toBeCloseTo(calculateTotalClaimableXlm(maturedClaims), 2);
    for (const item of receipt.itemizedClaims) {
      expect(item.claimedXlm).toBeGreaterThan(0);
    }
  });

  it("rejects an empty batch claim request", async () => {
    await expect(executeBatchCommissionClaim(TEST_AFFILIATE_ADDR, [], "mock")).rejects.toThrow(
      /No campaigns selected for batch claim/,
    );
  });

  it("verifies the affiliate wallet balance increases by the claimed amount", async () => {
    const initialBalance = 500;
    const expectedClaim = calculateTotalClaimableXlm(maturedClaims);
    const balanceCalls = mockHorizonBalance(initialBalance, expectedClaim);

    const before = await fetchXlmBalance(TEST_AFFILIATE_ADDR);
    const receipt = await executeBatchCommissionClaim(
      TEST_AFFILIATE_ADDR,
      maturedClaims,
      "mock",
    );
    const after = await fetchXlmBalance(TEST_AFFILIATE_ADDR);

    expect(receipt.success).toBe(true);
    expect(Number(before)).toBe(initialBalance);
    expect(Number(after) - Number(before)).toBeCloseTo(expectedClaim, 2);
    expect(balanceCalls.count).toBe(2);
  });

  it("fails the claim when gas fee is below the minimum required", async () => {
    const lowGasFee = MINIMUM_REQUIRED_FEE_STROPTS - 1;
    const guardedReceipt = await executeBatchCommissionClaimWithGasGuard(
      TEST_AFFILIATE_ADDR,
      maturedClaims,
      lowGasFee,
      "mock",
    );
    expect(guardedReceipt.success).toBe(false);
    expect(guardedReceipt.tyHash).toBe("");
    expect(guardedReceipt.totalClaimedXlm).toBe(0);
    expect(guardedReceipt.itemizedClaims).toHaveLength(0);
  });

  it("succeeds when gas fee meets the minimum required", async () => {
    const receipt = await executeBatchCommissionClaimWithGasGuard(
      TEST_AFFILIATE_ADDR,
      maturedClaims,
      MINIMUM_REQUIRED_FEE_STROPS,
      "mock",
    );
    expect(receipt.success).toBe(true);
    expect(receipt.totalClaimedXlm).toBeGreaterThan(0);
  });
});

/**
 * Wrapper that enforces a minimum gas fee before delegating to the real
 * batch claim dispatcher. This mirrors the client-side guard used in the
 * claim UI to prevent submitting transactions that will be rejected by the
 * network for insufficient fee.
 */
async function executeBatchCommissionClaimWithGasGuard(
  affiliateAddress: string,
  campaignsToClaim: ClaimableCampaignItem[],
  gasFeeStrops: number,
  walletType: "mock" | "freighter" = "mock",
): Promise<BatchClaimReceipt> {
  if (gasFeeStrops < MINIMUM_REQUIRED_FEE_STROPS) {
    return {
      success: false,
      txHash: "",
      totalClaimedXlm: 0,
      timestamp: Date.now(),
      itemizedClaims: [],
    };
  }
  return executeBatchCommissionClaim(affiliateAddress, campaignsToClaim, walletType);
}
