import { describe, it, expect, beforeEach } from "vitest";
import { TxQueueManager, type TxQueueStatusSummary } from "../lib/txQueue";

describe("[Web3] Account Sequence Desynchronization Recovery & In-Flight Tx Queue (#130)", () => {
  let queueManager: TxQueueManager;

  beforeEach(() => {
    queueManager = new TxQueueManager();
    queueManager.setAccount("GBZXN7PIRZGNMHGA728RGRYA7XPO5CFSGSJAA5T6Q5WWC62MWFPZ4ES2");
  });

  describe("FIFO Sequential Execution", () => {
    it("executes rapid sequential submissions one at a time in order", async () => {
      const executionOrder: number[] = [];
      let serverSequence = 1000n;
      queueManager.sequenceFetcher = async () => {
        return (serverSequence++).toString();
      };

      const task1 = queueManager.enqueue("log_sale", "Sale 1", async (seq) => {
        await new Promise((resolve) => setTimeout(resolve, 20));
        executionOrder.push(1);
        return { txId: 1, seq };
      });

      const task2 = queueManager.enqueue("log_sale", "Sale 2", async (seq) => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        executionOrder.push(2);
        return { txId: 2, seq };
      });

      const task3 = queueManager.enqueue("log_sale", "Sale 3", async (seq) => {
        executionOrder.push(3);
        return { txId: 3, seq };
      });

      const [res1, res2, res3] = await Promise.all([task1, task2, task3]);

      expect(executionOrder).toEqual([1, 2, 3]);
      expect(res1.txId).toBe(1);
      expect(res2.txId).toBe(2);
      expect(res3.txId).toBe(3);

      // Sequence numbers strictly incremented without collision
      expect(BigInt(res2.seq)).toBeGreaterThan(BigInt(res1.seq));
      expect(BigInt(res3.seq)).toBeGreaterThan(BigInt(res2.seq));
    });
  });

  describe("txBAD_SEQ Sequence Desynchronization Recovery", () => {
    it("recognizes various txBAD_SEQ error formats", () => {
      expect(queueManager.isSequenceDesyncError(new Error("txBAD_SEQ"))).toBe(true);
      expect(
        queueManager.isSequenceDesyncError(new Error("Transaction failed with tx_bad_seq")),
      ).toBe(true);
      expect(
        queueManager.isSequenceDesyncError(
          new Error("Error submitting txn: Sequence number does not match account sequence"),
        ),
      ).toBe(true);
      expect(queueManager.isSequenceDesyncError(new Error("insufficient balance"))).toBe(false);
      expect(queueManager.isSequenceDesyncError(null)).toBe(false);
    });

    it("automatically resyncs sequence from Horizon and retries once on txBAD_SEQ error", async () => {
      let attempts = 0;
      let resyncCalled = false;
      let authoritativeHorizonSeq = 5050n;

      queueManager.sequenceFetcher = async () => {
        resyncCalled = true;
        authoritativeHorizonSeq += 10n;
        return authoritativeHorizonSeq.toString();
      };

      const result = await queueManager.enqueue("claim_payout", "Claim 50 XLM", async (seq) => {
        attempts++;
        if (attempts === 1) {
          // Simulate txBAD_SEQ error on first attempt
          throw new Error("Stellar RPC Error: txBAD_SEQ - Sequence number desynchronized");
        }
        return { success: true, attempts, seq };
      });

      expect(attempts).toBe(2);
      expect(resyncCalled).toBe(true);
      expect(result.success).toBe(true);
      expect(result.attempts).toBe(2);

      const status = queueManager.getStatus();
      expect(status.resyncCount).toBeGreaterThan(0);
      expect(status.completedCount).toBe(1);
      expect(status.failedCount).toBe(0);
    });

    it("rejects task when retry fails or error is not sequence related", async () => {
      await expect(
        queueManager.enqueue("refund_escrow", "Refund", async () => {
          throw new Error("Unauthorized caller");
        }),
      ).rejects.toThrow("Unauthorized caller");

      const status = queueManager.getStatus();
      expect(status.failedCount).toBe(1);
    });
  });

  describe("Queue Status Observer & Telemetry", () => {
    it("notifies subscribers of queue state changes", async () => {
      const snapshots: TxQueueStatusSummary[] = [];
      const unsubscribe = queueManager.subscribe((status) => {
        snapshots.push(status);
      });

      await queueManager.enqueue("approve_topup", "Topup 100", async () => {
        return "done";
      });

      unsubscribe();

      expect(snapshots.length).toBeGreaterThan(1);
      const last = snapshots[snapshots.length - 1];
      expect(last.isProcessing).toBe(false);
      expect(last.pendingCount).toBe(0);
      expect(last.completedCount).toBe(1);
    });
  });
});
