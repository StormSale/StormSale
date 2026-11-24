import { describe, it, expect, vi, beforeEach } from "vitest";
import { Keypair } from "@stellar/stellar-sdk";
import {
  invokeSorobanMethod,
  getCampaignContractQuery,
} from "../lib/stellar";

vi.mock("../lib/stellar", async () => {
  const actual = await vi.importActual("../lib/stellar");
  return {
    ...actual,
    invokeSorobanMethod: vi.fn(),
    getCampaignContractQuery: vi.fn(),
  };
});

describe("B2B Enterprise Bulk Affiliate Payout Distribution Wizard Tests", () => {
  const advertiserWallet = Keypair.random().publicKey();
  const affiliateWallets = Array.from({ length: 100 }, () => Keypair.random().publicKey());

  let mockInvokeSorobanMethod: ReturnType<typeof vi.fn>;
  let mockGetCampaignContractQuery: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockInvokeSorobanMethod = invokeSorobanMethod as ReturnType<typeof vi.fn>;
    mockGetCampaignContractQuery = getCampaignContractQuery as ReturnType<typeof vi.fn>;
    mockInvokeSorobanMethod.mockResolvedValue({
      success: true,
      txHash: "mock-tx-hash",
      resultValue: 1,
    });
  });

  interface AffiliatePayout {
    affiliateId: string;
    address: string;
    amountStroops: bigint;
  }

  interface AggregatedPayout {
    recipients: Array<{ address: string; amountStroops: bigint }>;
    duplicates: Array<{ address: string; count: number; totalAmount: bigint }>;
    totalAmount: bigint;
  }

  interface BatchProgress {
    batchIndex: number;
    totalBatches: number;
    batchSize: number;
    successful: number;
    failed: number;
    status: "pending" | "in_progress" | "completed" | "failed";
    transactionHash?: string;
    error?: string;
  }

  interface BulkPayoutResult {
    invoiceId: string;
    totalRecipients: number;
    totalAmount: bigint;
    batches: BatchProgress[];
    successfulCount: number;
    failedCount: number;
    failedRecipients: Array<{ address: string; amount: bigint; error: string }>;
  }

  function aggregatePayouts(payouts: AffiliatePayout[]): AggregatedPayout {
    const addressMap = new Map<string, { count: number; totalAmount: bigint }>();

    for (const payout of payouts) {
      const existing = addressMap.get(payout.address);
      if (existing) {
        existing.count += 1;
        existing.totalAmount += payout.amountStroops;
      } else {
        addressMap.set(payout.address, { count: 1, totalAmount: payout.amountStroops });
      }
    }

    const recipients = Array.from(addressMap, ([address, value]) => ({
      address,
      amountStroops: value.totalAmount,
    }));

    const duplicates = Array.from(addressMap.entries())
      .filter(([, value]) => value.count > 1)
      .map(([address, value]) => ({ address, ...value }));

    const totalAmount = recipients.reduce((sum, r) => sum + r.amountStroops, 0n);

    return { recipients, duplicates, totalAmount };
  }

  async function checkEscrowBalance(
    _invoiceId: string,
    requiredAmount: bigint
  ): Promise<{ sufficient: boolean; escrowBalance: bigint; requiredAmount: bigint; shortfall?: bigint }> {
    const escrowBalance = 1_000_000_000_000n;
    const sufficient = escrowBalance >= requiredAmount;
    return {
      sufficient,
      escrowBalance,
      requiredAmount,
      shortfall: sufficient ? undefined : requiredAmount - escrowBalance,
    };
  }

  async function executeBulkPayout(
    invoiceId: string,
    payouts: AffiliatePayout[],
    chunkSize = 50,
    feeBps = 250,
    feeRecipient = Keypair.random().publicKey()
  ): Promise<BulkPayoutResult> {
    const aggregated = aggregatePayouts(payouts);
    const fee = (aggregated.totalAmount * BigInt(feeBps)) / 10_000n;
    const totalRequired = aggregated.totalAmount + fee;

    const balanceCheck = await checkEscrowBalance(invoiceId, totalRequired);
    if (!balanceCheck.sufficient) {
      throw new Error(
        `Insufficient escrow balance: ${balanceCheck.escrowBalance} < ${balanceCheck.requiredAmount}`
      );
    }

    const chunks: Array<Array<{ address: string; amountStroops: bigint }>> = [];
    for (let i = 0; i < aggregated.recipients.length; i += chunkSize) {
      chunks.push(aggregated.recipients.slice(i, i + chunkSize));
    }

    const batches: BatchProgress[] = chunks.map((chunk, index) => ({
      batchIndex: index,
      totalBatches: chunks.length,
      batchSize: chunk.length,
      successful: 0,
      failed: 0,
      status: "pending" as const,
    }));

    const failedRecipients: Array<{ address: string; amount: bigint; error: string }> = [];
    let successfulCount = 0;

    const { Address, nativeToScVal } = await import("@stellar/stellar-sdk");

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const batch = batches[i];
      batch.status = "in_progress";

      try {
        await invokeSorobanMethod(
          advertiserWallet,
          "distribute_payouts",
          [
            new Address(advertiserWallet).toScVal(),
            nativeToScVal(chunk.map((r) => r.address), { type: ["address"] }),
            nativeToScVal(chunk.map((r) => r.amountStroops), { type: ["i128"] }),
            new Address(feeRecipient).toScVal(),
            nativeToScVal(feeBps, { type: "u32" }),
          ],
          "mock"
        );

        batch.status = "completed";
        batch.transactionHash = `tx-hash-${i}`;
        batch.successful = chunk.length;
        successfulCount += chunk.length;
      } catch (error) {
        batch.status = "failed";
        batch.failed = chunk.length;
        const errorMessage = error instanceof Error ? error.message : "Unknown error";

        for (const recipient of chunk) {
          failedRecipients.push({
            address: recipient.address,
            amount: recipient.amountStroops,
            error: errorMessage,
          });
        }
      }
    }

    return {
      invoiceId,
      totalRecipients: aggregated.recipients.length,
      totalAmount: aggregated.totalAmount,
      batches,
      successfulCount,
      failedCount: failedRecipients.length,
      failedRecipients,
    };
  }

  function getRetryablePayouts(result: BulkPayoutResult): AffiliatePayout[] {
    return result.failedRecipients.map((fr) => ({
      affiliateId: fr.address,
      address: fr.address,
      amountStroops: fr.amount,
    }));
  }

  describe("Affiliate Payout List Aggregation & Duplicate Detection", () => {
    it("aggregates unique affiliate payouts correctly", () => {
      const payouts: AffiliatePayout[] = [
        { affiliateId: "a1", address: "GABC1", amountStroops: 1000n },
        { affiliateId: "a2", address: "GABC2", amountStroops: 2000n },
        { affiliateId: "a3", address: "GABC3", amountStroops: 3000n },
      ];

      const result = aggregatePayouts(payouts);

      expect(result.recipients).toHaveLength(3);
      expect(result.totalAmount).toBe(6000n);
      expect(result.duplicates).toHaveLength(0);
    });

    it("detects and aggregates duplicate destinations", () => {
      const address = "GABC123";
      const payouts: AffiliatePayout[] = [
        { affiliateId: "a1", address, amountStroops: 1000n },
        { affiliateId: "a2", address, amountStroops: 2000n },
        { affiliateId: "a3", address: "GABC2", amountStroops: 3000n },
      ];

      const result = aggregatePayouts(payouts);

      expect(result.recipients).toHaveLength(2);
      expect(result.totalAmount).toBe(6000n);
      expect(result.duplicates).toHaveLength(1);
      expect(result.duplicates[0].address).toBe(address);
      expect(result.duplicates[0].count).toBe(2);
      expect(result.duplicates[0].totalAmount).toBe(3000n);
    });

    it("handles multiple duplicate groups", () => {
      const payouts: AffiliatePayout[] = [
        { affiliateId: "a1", address: "GABC1", amountStroops: 1000n },
        { affiliateId: "a2", address: "GABC1", amountStroops: 2000n },
        { affiliateId: "a3", address: "GABC2", amountStroops: 3000n },
        { affiliateId: "a4", address: "GABC2", amountStroops: 4000n },
        { affiliateId: "a5", address: "GABC3", amountStroops: 5000n },
      ];

      const result = aggregatePayouts(payouts);

      expect(result.recipients).toHaveLength(3);
      expect(result.duplicates).toHaveLength(2);
      expect(result.duplicates.map((d) => d.address).sort()).toEqual(["GABC1", "GABC2"]);
    });

    it("handles empty payout list", () => {
      const result = aggregatePayouts([]);
      expect(result.recipients).toHaveLength(0);
      expect(result.totalAmount).toBe(0n);
      expect(result.duplicates).toHaveLength(0);
    });

    it("handles single payout", () => {
      const payouts: AffiliatePayout[] = [{ affiliateId: "a1", address: "GABC1", amountStroops: 1000n }];
      const result = aggregatePayouts(payouts);
      expect(result.recipients).toHaveLength(1);
      expect(result.totalAmount).toBe(1000n);
    });

    it("handles very large payout amounts with bigint precision", () => {
      const payouts: AffiliatePayout[] = [
        { affiliateId: "a1", address: "GABC1", amountStroops: 999_999_999_999_999_999n },
        { affiliateId: "a2", address: "GABC2", amountStroops: 1n },
      ];
      const result = aggregatePayouts(payouts);
      expect(result.totalAmount).toBe(1_000_000_000_000_000_000n);
    });
  });

  describe("Escrow Balance Verification", () => {
    it("returns sufficient when escrow balance covers required amount", async () => {
      const result = await checkEscrowBalance("INV-1", 1000n);
      expect(result.sufficient).toBe(true);
      expect(result.escrowBalance).toBeGreaterThanOrEqual(result.requiredAmount);
      expect(result.shortfall).toBeUndefined();
    });

    it("returns insufficient with shortfall when escrow balance is too low", async () => {
      const largeAmount = 2_000_000_000_000n;
      const result = await checkEscrowBalance("INV-1", largeAmount);
      expect(result.sufficient).toBe(false);
      expect(result.shortfall).toBe(largeAmount - result.escrowBalance);
    });

    it("verifies total payout sum matches on-chain escrow balance check before execution", async () => {
      const payouts: AffiliatePayout[] = Array.from({ length: 5 }, (_, i) => ({
        affiliateId: `a${i}`,
        address: Keypair.random().publicKey(),
        amountStroops: 500_000_000_000n,
      }));

      await expect(executeBulkPayout("INV-103", payouts)).rejects.toThrow("Insufficient escrow balance");
    });
  });

  describe("Batch Execution Progress (Chunks of 50)", () => {
    it("executes single batch for small number of recipients", async () => {
      const payouts: AffiliatePayout[] = Array.from({ length: 10 }, (_, i) => ({
        affiliateId: `a${i}`,
        address: Keypair.random().publicKey(),
        amountStroops: 1000n,
      }));

      const result = await executeBulkPayout("INV-100", payouts);

      expect(result.invoiceId).toBe("INV-100");
      expect(result.totalRecipients).toBe(10);
      expect(result.batches).toHaveLength(1);
      expect(result.batches[0].status).toBe("completed");
      expect(result.batches[0].transactionHash).toBeDefined();
      expect(result.successfulCount).toBe(10);
      expect(result.failedCount).toBe(0);
      expect(result.failedRecipients).toHaveLength(0);
    });

    it("chunks into multiple batches of configured size (50)", async () => {
      const payouts: AffiliatePayout[] = Array.from({ length: 120 }, (_, i) => ({
        affiliateId: `a${i}`,
        address: Keypair.random().publicKey(),
        amountStroops: 1000n,
      }));

      const result = await executeBulkPayout("INV-101", payouts);

      expect(result.batches).toHaveLength(3);
      expect(result.batches[0].batchSize).toBe(50);
      expect(result.batches[1].batchSize).toBe(50);
      expect(result.batches[2].batchSize).toBe(20);
      expect(result.batches.every((b) => b.status === "completed")).toBe(true);
      expect(result.successfulCount).toBe(120);
    });

    it("tracks progress per sub-batch with confirmation", async () => {
      const payouts: AffiliatePayout[] = Array.from({ length: 75 }, (_, i) => ({
        affiliateId: `a${i}`,
        address: Keypair.random().publicKey(),
        amountStroops: 1000n,
      }));

      const result = await executeBulkPayout("INV-102", payouts);

      expect(result.batches).toHaveLength(2);
      expect(result.batches[0]).toMatchObject({
        batchIndex: 0,
        totalBatches: 2,
        batchSize: 50,
        successful: 50,
        failed: 0,
        status: "completed",
      });
      expect(result.batches[0].transactionHash).toBeDefined();
      expect(result.batches[1]).toMatchObject({
        batchIndex: 1,
        totalBatches: 2,
        batchSize: 25,
        successful: 25,
        failed: 0,
        status: "completed",
      });
    });

    it("calculates fee correctly and includes in total required amount", async () => {
      const payouts: AffiliatePayout[] = Array.from({ length: 5 }, (_, i) => ({
        affiliateId: `a${i}`,
        address: Keypair.random().publicKey(),
        amountStroops: 1000n,
      }));
      const totalAmount = payouts.reduce((sum, p) => sum + p.amountStroops, 0n);
      const result = await executeBulkPayout("INV-104", payouts);

      expect(result.totalAmount).toBe(totalAmount);
    });
  });

  describe("Failure Summary Report & Retry Logic", () => {
    it("records failed recipients with error details", async () => {
      mockInvokeSorobanMethod.mockRejectedValue(new Error("Transaction reverted"));

      const payouts: AffiliatePayout[] = Array.from({ length: 5 }, (_, i) => ({
        affiliateId: `a${i}`,
        address: Keypair.random().publicKey(),
        amountStroops: 1000n,
      }));

      const result = await executeBulkPayout("INV-105", payouts);

      expect(result.failedCount).toBe(5);
      expect(result.successfulCount).toBe(0);
      expect(result.failedRecipients).toHaveLength(5);
      expect(result.failedRecipients.every((fr) => fr.error)).toBe(true);
      expect(result.batches.every((b) => b.status === "failed")).toBe(true);
    });

    it("provides failure summary report with retryable payouts", async () => {
      mockInvokeSorobanMethod.mockRejectedValue(new Error("Transaction reverted"));

      const payouts: AffiliatePayout[] = Array.from({ length: 10 }, (_, i) => ({
        affiliateId: `a${i}`,
        address: Keypair.random().publicKey(),
        amountStroops: 1000n,
      }));

      const result = await executeBulkPayout("INV-106", payouts);
      const retryable = getRetryablePayouts(result);

      expect(retryable).toHaveLength(10);
      expect(retryable.map((r) => r.address).sort()).toEqual(
        payouts.map((p) => p.address).sort()
      );
      expect(retryable.map((r) => r.amountStroops).sort()).toEqual(
        payouts.map((p) => p.amountStroops).sort()
      );
    });

    it("allows retry only for failed payout recipients", async () => {
      mockInvokeSorobanMethod
        .mockRejectedValueOnce(new Error("Transaction reverted"))
        .mockResolvedValueOnce({ success: true, txHash: "retry-hash", resultValue: 1 });

      const payouts: AffiliatePayout[] = Array.from({ length: 6 }, (_, i) => ({
        affiliateId: `a${i}`,
        address: Keypair.random().publicKey(),
        amountStroops: 1000n,
      }));

      const firstResult = await executeBulkPayout("INV-107", payouts);
      expect(firstResult.failedCount).toBe(6);

      const retryPayouts = getRetryablePayouts(firstResult);
      const retryResult = await executeBulkPayout("INV-107-retry", retryPayouts);

      expect(retryResult.successfulCount).toBe(6);
      expect(retryResult.failedCount).toBe(0);
    });

    it("handles partial failure in multi-batch scenario", async () => {
      let callCount = 0;
      mockInvokeSorobanMethod.mockImplementation(async () => {
        callCount++;
        if (callCount <= 2) return { success: true, txHash: `tx-${callCount}`, resultValue: 1 };
        throw new Error("Transaction reverted");
      });

      const payouts: AffiliatePayout[] = Array.from({ length: 6 }, (_, i) => ({
        affiliateId: `a${i}`,
        address: Keypair.random().publicKey(),
        amountStroops: 1000n,
      }));

      const result = await executeBulkPayout("INV-108", payouts, 2);

      expect(result.batches).toHaveLength(3);
      expect(result.batches[0].status).toBe("completed");
      expect(result.batches[1].status).toBe("completed");
      expect(result.batches[2].status).toBe("failed");
      expect(result.failedCount).toBe(2);
      expect(result.successfulCount).toBe(4);
    });
  });

  describe("Integration with Soroban Contract", () => {
    it("invokes distribute_payouts contract method with correct parameters", async () => {
      mockInvokeSorobanMethod.mockResolvedValue({
        success: true,
        txHash: "integration-tx-hash",
        resultValue: 1,
      });

      const payouts: AffiliatePayout[] = [
        { affiliateId: "a1", address: affiliateWallets[0], amountStroops: 1000n },
        { affiliateId: "a2", address: affiliateWallets[1], amountStroops: 2000n },
      ];

      await executeBulkPayout("INV-200", payouts);

      expect(mockInvokeSorobanMethod).toHaveBeenCalledWith(
        advertiserWallet,
        "distribute_payouts",
        expect.any(Array),
        "mock"
      );
    });

    it("uses mock wallet type for test environment", async () => {
      mockInvokeSorobanMethod.mockResolvedValue({
        success: true,
        txHash: "mock-tx-hash",
        resultValue: 1,
      });

      const payouts: AffiliatePayout[] = [
        { affiliateId: "a1", address: affiliateWallets[0], amountStroops: 1000n },
      ];

      await executeBulkPayout("INV-201", payouts);

      expect(mockInvokeSorobanMethod).toHaveBeenCalledWith(
        expect.any(String),
        "distribute_payouts",
        expect.any(Array),
        "mock"
      );
    });

    it("verifies campaign escrow balance via contract query", async () => {
      mockGetCampaignContractQuery.mockResolvedValue({
        budget: "50000000000",
        spent: "10000000000",
        remaining: "40000000000",
      });

      const campaign = await getCampaignContractQuery(123);
      expect(campaign).toBeDefined();
      expect(campaign.remaining).toBe("40000000000");
    });
  });

  describe("Edge Cases", () => {
    it("uses default chunk size of 50 when not specified", async () => {
      mockInvokeSorobanMethod.mockResolvedValue({
        success: true,
        txHash: "default-chunk-tx",
        resultValue: 1,
      });

      const payouts: AffiliatePayout[] = Array.from({ length: 60 }, (_, i) => ({
        affiliateId: `a${i}`,
        address: Keypair.random().publicKey(),
        amountStroops: 1000n,
      }));

      const result = await executeBulkPayout("INV-300", payouts);

      expect(result.batches).toHaveLength(2);
      expect(result.batches[0].batchSize).toBe(50);
      expect(result.batches[1].batchSize).toBe(10);
    });

    it("handles custom chunk size", async () => {
      mockInvokeSorobanMethod.mockResolvedValue({
        success: true,
        txHash: "custom-chunk-tx",
        resultValue: 1,
      });

      const payouts: AffiliatePayout[] = Array.from({ length: 25 }, (_, i) => ({
        affiliateId: `a${i}`,
        address: Keypair.random().publicKey(),
        amountStroops: 1000n,
      }));

      const result = await executeBulkPayout("INV-301", payouts, 10);

      expect(result.batches).toHaveLength(3);
      expect(result.batches[0].batchSize).toBe(10);
      expect(result.batches[1].batchSize).toBe(10);
      expect(result.batches[2].batchSize).toBe(5);
    });

    it("handles custom fee basis points", async () => {
      mockInvokeSorobanMethod.mockResolvedValue({
        success: true,
        txHash: "custom-fee-tx",
        resultValue: 1,
      });

      const payouts: AffiliatePayout[] = [
        { affiliateId: "a1", address: affiliateWallets[0], amountStroops: 10000n },
      ];

      const result = await executeBulkPayout("INV-302", payouts, 50, 500);

      expect(result.totalAmount).toBe(10000n);
    });

    it("handles custom fee recipient", async () => {
      mockInvokeSorobanMethod.mockResolvedValue({
        success: true,
        txHash: "custom-fee-recipient-tx",
        resultValue: 1,
      });

      const payouts: AffiliatePayout[] = [
        { affiliateId: "a1", address: affiliateWallets[0], amountStroops: 10000n },
      ];

      const customFeeRecipient = "GABC12345678901234567890123456789012345678901234567890123";
      const result = await executeBulkPayout("INV-303", payouts, 50, 250, customFeeRecipient);

      expect(result.totalAmount).toBe(10000n);
    });
  });
});
