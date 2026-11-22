// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  chunkSaleBatch,
  buildBatchTransactionEnvelope,
  executeBatchSaleLogging,
  resumeFailedBatchLogging,
  resumeBatchAllocationSubmission,
  BatchAllocationProgressTracker,
  MAX_BATCH_SIZE,
  STELLAR_MAX_TX_SIZE_BYTES,
  type SaleItem,
  type ChunkSubmitter,
} from "../lib/batchSaleLogging";
import { STELLAR_CONFIG } from "../config/stellar";
import * as stellarLib from "../lib/stellar";
import {
  Account,
  Keypair,
  Contract,
  TransactionBuilder,
  SorobanDataBuilder,
  StrKey,
  xdr,
  rpc,
} from "@stellar/stellar-sdk";

// Ephemeral mock keypairs for testing - generated in memory, never real secrets
const dummyAdvertiser = Keypair.random().publicKey();
const dummyAffiliate1 = Keypair.random().publicKey();
const dummyAffiliate2 = Keypair.random().publicKey();

/**
 * Programmatically generates N allocation records for batch tests without inline fixtures.
 */
function makeAllocations(count: number): SaleItem[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `ALLOC_${i + 1}`,
    campaignId: 100 + (i % 5),
    affiliateAddress: i % 2 === 0 ? dummyAffiliate1 : dummyAffiliate2,
    saleAmountXlm: 10 + (i % 100),
    customerRef: `REF_${i + 1}`,
  }));
}

describe("batch allocation chunking", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe("array slicing", () => {
    it("splits 5000 allocations into deterministic sub-batches", () => {
      const totalCount = 5000;
      const chunkSize = MAX_BATCH_SIZE; // 15
      const allocations = makeAllocations(totalCount);

      const chunksRun1 = chunkSaleBatch(allocations, chunkSize);
      const chunksRun2 = chunkSaleBatch(allocations, chunkSize);

      const expectedChunkCount = Math.ceil(totalCount / chunkSize);
      expect(chunksRun1.length).toBe(expectedChunkCount);

      // Verify lengths of all sub-batches: each should be chunkSize except last remainder
      for (let i = 0; i < chunksRun1.length - 1; i++) {
        expect(chunksRun1[i].length).toBe(chunkSize);
      }
      const remainder = totalCount % chunkSize;
      expect(chunksRun1[chunksRun1.length - 1].length).toBe(
        remainder === 0 ? chunkSize : remainder,
      );

      // Determinism check: boundaries and records match across runs
      expect(chunksRun1.length).toBe(chunksRun2.length);
      for (let i = 0; i < chunksRun1.length; i++) {
        expect(chunksRun1[i].length).toBe(chunksRun2[i].length);
        expect(chunksRun1[i][0].id).toBe(chunksRun2[i][0].id);
        expect(chunksRun1[i][chunksRun1[i].length - 1].id).toBe(
          chunksRun2[i][chunksRun2[i].length - 1].id,
        );
      }
    });

    it("empty allocation array produces no chunks", () => {
      const chunks = chunkSaleBatch([], MAX_BATCH_SIZE);
      expect(chunks).toEqual([]);
    });

    it("allocation count exactly divisible by chunk size produces no remainder chunk", () => {
      const totalCount = 100;
      const chunkSize = 10;
      const allocations = makeAllocations(totalCount);

      const chunks = chunkSaleBatch(allocations, chunkSize);
      const expectedCount = totalCount / chunkSize; // 10

      expect(chunks.length).toBe(expectedCount);
      for (const chunk of chunks) {
        expect(chunk.length).toBe(chunkSize);
      }
    });

    it("single allocation produces one chunk of one", () => {
      const allocations = makeAllocations(1);
      const chunks = chunkSaleBatch(allocations, MAX_BATCH_SIZE);

      expect(chunks.length).toBe(1);
      expect(chunks[0].length).toBe(1);
      expect(chunks[0][0].id).toBe(allocations[0].id);
    });
  });

  describe("XDR packing", () => {
    it("packed chunk does not exceed the XDR size limit", () => {
      const chunk = makeAllocations(MAX_BATCH_SIZE);
      const account = new Account(dummyAdvertiser, "1000");

      const builder = buildBatchTransactionEnvelope(account, dummyAdvertiser, chunk);
      const tx = builder.build();
      const xdrBuffer = tx.toEnvelope().toXDR();

      // Serialized envelope must be within Stellar's 128 KB transaction byte ceiling
      expect(xdrBuffer.length).toBeLessThanOrEqual(STELLAR_MAX_TX_SIZE_BYTES);
      expect(xdrBuffer.length).toBeGreaterThan(0);
    });

    it("chunk one entry over the limit exceeds the XDR size limit", () => {
      // Derive a boundary case exceeding STELLAR_MAX_TX_SIZE_BYTES (131,072 bytes)
      const account = new Account(dummyAdvertiser, "1000");
      const contractId = StrKey.isValidContract(STELLAR_CONFIG.contractId)
        ? STELLAR_CONFIG.contractId
        : "CAAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQC526";
      const contract = new Contract(contractId);

      // Construct an envelope with an ScVal bytes payload sized to exceed the 128 KB limit
      const oversizedPayload = xdr.ScVal.scvBytes(Buffer.alloc(STELLAR_MAX_TX_SIZE_BYTES, 65));
      const builder = new TransactionBuilder(account, {
        fee: "100000",
        networkPassphrase: STELLAR_CONFIG.networkPassphrase,
      });
      builder.addOperation(contract.call("log_sale", oversizedPayload));
      const oversizedTx = builder.setTimeout(90).build();
      const oversizedXdr = oversizedTx.toEnvelope().toXDR();

      expect(oversizedXdr.length).toBeGreaterThan(STELLAR_MAX_TX_SIZE_BYTES);
    });

    it("packing is deterministic — same input produces identical XDR bytes", () => {
      // Freeze Date.now() across both builds so setTimeout(90) assigns identical maxTime
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
      try {
        const chunk = makeAllocations(MAX_BATCH_SIZE);
        const account1 = new Account(dummyAdvertiser, "1000");
        const account2 = new Account(dummyAdvertiser, "1000");

        const tx1 = buildBatchTransactionEnvelope(account1, dummyAdvertiser, chunk).build();
        const tx2 = buildBatchTransactionEnvelope(account2, dummyAdvertiser, chunk).build();

        const bytes1 = tx1.toEnvelope().toXDR();
        const bytes2 = tx2.toEnvelope().toXDR();

        expect(bytes1).toEqual(bytes2);
        expect(tx1.toXDR()).toBe(tx2.toXDR());
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe("partial failure resumption", () => {
    it("re-submitting only failed chunk indices skips successful chunks", async () => {
      const sales = makeAllocations(45); // 3 chunks: [0, 1, 2] of 15 each
      const chunks = chunkSaleBatch(sales, MAX_BATCH_SIZE);
      expect(chunks.length).toBe(3);

      const dummyAccount = new Account(dummyAdvertiser, "100");
      const mockSimSuccess = {
        transactionData: new SorobanDataBuilder().build().toXDR("base64"),
        minResourceFee: "100",
        results: [{ auth: [] }],
      };

      let sendCallCount = 0;
      const sentTxHashes: string[] = [];
      const mockServer = {
        getAccount: vi.fn().mockResolvedValue(dummyAccount),
        simulateTransaction: vi.fn().mockImplementation(async (_tx: unknown) => {
          return mockSimSuccess;
        }),
        sendTransaction: vi.fn().mockImplementation(async () => {
          sendCallCount++;
          if (sendCallCount === 2) {
            // Fail second chunk (chunk 1)
            return {
              status: "ERROR",
              errorResult: "Transaction rejected on ledger",
            };
          }
          const hash = `${sendCallCount}`.repeat(64);
          sentTxHashes.push(hash);
          return {
            status: "PENDING",
            hash,
          };
        }),
        getTransaction: vi.fn().mockResolvedValue({ status: "SUCCESS" }),
      };

      vi.spyOn(stellarLib, "getSorobanRpcServer").mockReturnValue(
        mockServer as unknown as rpc.Server,
      );
      vi.spyOn(stellarLib, "signWalletTransaction").mockImplementation(async (xdrStr) => xdrStr);

      const tracker = new BatchAllocationProgressTracker(chunks.length);

      // Initial execution: chunks 0, 1, 2 submitted; chunk 1 fails
      const initialReceipt = await executeBatchSaleLogging(dummyAdvertiser, sales, {
        walletType: "freighter",
        tracker,
      });

      expect(initialReceipt.completedBatchIndices).toEqual([0, 2]);
      expect(initialReceipt.failedBatchIndices).toEqual([1]);
      expect(tracker.isChunkComplete(0)).toBe(true);
      expect(tracker.isChunkFailed(1)).toBe(true);
      expect(tracker.isChunkComplete(2)).toBe(true);
      expect(tracker.isAllComplete()).toBe(false);

      // Reset mock server spy to monitor retry behavior
      mockServer.sendTransaction.mockClear();
      mockServer.sendTransaction.mockResolvedValue({
        status: "PENDING",
        hash: "7".repeat(64),
      });

      // Resume only the failed chunk index (1)
      const resumeReceipt = await resumeFailedBatchLogging(
        dummyAdvertiser,
        sales,
        initialReceipt.failedBatchIndices ?? [],
        "freighter",
        undefined,
        tracker,
      );

      // Assert only chunk 1 was re-submitted, skipping chunks 0 and 2
      expect(mockServer.sendTransaction).toHaveBeenCalledTimes(1);
      expect(resumeReceipt.batchesExecuted).toBe(1);
      expect(resumeReceipt.confirmedCount).toBe(15);
      expect(resumeReceipt.failedCount).toBe(0);

      // Successful chunks 0 and 2 completion state was preserved; all chunks now complete
      expect(tracker.isChunkComplete(0)).toBe(true);
      expect(tracker.isChunkComplete(1)).toBe(true);
      expect(tracker.isChunkComplete(2)).toBe(true);
      expect(tracker.isAllComplete()).toBe(true);
      expect(tracker.getProgressPercentage()).toBe(100);
    });

    it("resumption with no failed chunks is a no-op", async () => {
      const sales = makeAllocations(30);
      const mockServer = {
        getAccount: vi.fn(),
        sendTransaction: vi.fn(),
      };
      vi.spyOn(stellarLib, "getSorobanRpcServer").mockReturnValue(
        mockServer as unknown as rpc.Server,
      );

      const result = await resumeFailedBatchLogging(dummyAdvertiser, sales, [], "freighter");

      expect(mockServer.sendTransaction).not.toHaveBeenCalled();
      expect(result.batchesExecuted).toBe(0);
      expect(result.confirmedCount).toBe(0);
    });

    it("resumption with all chunks failed re-submits all", async () => {
      const chunks = chunkSaleBatch(makeAllocations(45), MAX_BATCH_SIZE); // 3 chunks
      const resumeSubmit = vi
        .fn<ChunkSubmitter<SaleItem>>()
        .mockResolvedValue({ success: true, txHash: "hash_all" });

      const allFailedIndices = [0, 1, 2];
      const result = await resumeBatchAllocationSubmission(chunks, allFailedIndices, resumeSubmit);

      expect(resumeSubmit).toHaveBeenCalledTimes(3);
      expect(result.submittedIndices).toEqual([0, 1, 2]);
      expect(resumeSubmit).toHaveBeenNthCalledWith(1, chunks[0], 0);
      expect(resumeSubmit).toHaveBeenNthCalledWith(2, chunks[1], 1);
      expect(resumeSubmit).toHaveBeenNthCalledWith(3, chunks[2], 2);
    });

    it("failed chunk index out of range is rejected", async () => {
      const sales = makeAllocations(30); // 2 chunks: 0, 1

      // Negative index
      await expect(
        resumeFailedBatchLogging(dummyAdvertiser, sales, [-1], "freighter"),
      ).rejects.toThrow(RangeError);

      // Out-of-bounds upper index
      await expect(
        resumeFailedBatchLogging(dummyAdvertiser, sales, [2], "freighter"),
      ).rejects.toThrow(RangeError);
    });
  });

  describe("progress tracker", () => {
    it("tracker reflects exact sub-batch completion after each chunk", () => {
      const totalChunks = 3;
      const tracker = new BatchAllocationProgressTracker(totalChunks);

      // Initially no chunks are complete
      expect(tracker.isChunkComplete(0)).toBe(false);
      expect(tracker.isChunkComplete(1)).toBe(false);
      expect(tracker.isChunkComplete(2)).toBe(false);

      // Process chunk 0
      tracker.markChunkComplete(0);
      expect(tracker.isChunkComplete(0)).toBe(true);
      expect(tracker.isChunkComplete(1)).toBe(false);
      expect(tracker.isChunkComplete(2)).toBe(false);

      // Process chunk 1
      tracker.markChunkComplete(1);
      expect(tracker.isChunkComplete(0)).toBe(true);
      expect(tracker.isChunkComplete(1)).toBe(true);
      expect(tracker.isChunkComplete(2)).toBe(false);

      // Process chunk 2
      tracker.markChunkComplete(2);
      expect(tracker.isChunkComplete(0)).toBe(true);
      expect(tracker.isChunkComplete(1)).toBe(true);
      expect(tracker.isChunkComplete(2)).toBe(true);
    });

    it("tracker reaches 100% only when all chunks complete", () => {
      const totalChunks = 3;
      const tracker = new BatchAllocationProgressTracker(totalChunks);

      // After first chunk
      tracker.markChunkComplete(0);
      expect(tracker.getProgressPercentage()).toBe(33);
      expect(tracker.isAllComplete()).toBe(false);

      // After second chunk
      tracker.markChunkComplete(1);
      expect(tracker.getProgressPercentage()).toBe(66);
      expect(tracker.isAllComplete()).toBe(false);

      // After third chunk
      tracker.markChunkComplete(2);
      expect(tracker.getProgressPercentage()).toBe(100);
      expect(tracker.isAllComplete()).toBe(true);
    });

    it("tracker state is correct after partial failure and resumption", () => {
      const totalChunks = 3;
      const tracker = new BatchAllocationProgressTracker(totalChunks);

      // Chunks 0 and 2 succeed, chunk 1 fails
      tracker.markChunkComplete(0);
      tracker.markChunkFailed(1);
      tracker.markChunkComplete(2);

      expect(tracker.isChunkComplete(0)).toBe(true);
      expect(tracker.isChunkComplete(1)).toBe(false);
      expect(tracker.isChunkComplete(2)).toBe(true);
      expect(tracker.isChunkFailed(1)).toBe(true);
      expect(tracker.isAllComplete()).toBe(false);
      expect(tracker.getFailedChunkIndices()).toEqual([1]);

      // Resume chunk 1
      tracker.markChunkComplete(1);

      expect(tracker.isChunkComplete(0)).toBe(true);
      expect(tracker.isChunkComplete(1)).toBe(true);
      expect(tracker.isChunkComplete(2)).toBe(true);
      expect(tracker.isChunkFailed(1)).toBe(false);
      expect(tracker.isAllComplete()).toBe(true);
      expect(tracker.getProgressPercentage()).toBe(100);
      expect(tracker.getFailedChunkIndices()).toEqual([]);
    });
  });
});
