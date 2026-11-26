import { describe, it, expect, vi, beforeEach } from "vitest";
import { TxQueueManager, type TxQueueStatusSummary } from "../lib/txQueue";

const ACCOUNT = "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5";

describe("Soroban Transaction Replay Protection & Nonce Tracking Suite (#429)", () => {
  let queue: TxQueueManager;

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    queue = new TxQueueManager();
    queue.setAccount(ACCOUNT);
  });

  it("disables UI buttons during transaction signature and submission flight", async () => {
    queue.sequenceFetcher = vi.fn().mockResolvedValue("100");
    const snapshots: TxQueueStatusSummary[] = [];
    queue.subscribe((s) => snapshots.push(s));

    let releaseSigning!: () => void;
    const signing = new Promise<void>((r) => (releaseSigning = r));
    const isButtonDisabled = () => queue.getStatus().isProcessing;

    expect(isButtonDisabled()).toBe(false);
    const pending = queue.enqueue("fund_campaign", "Fund escrow", async (seq) => {
      await signing;
      return seq;
    });

    // While the transaction is being signed/submitted, the action stays disabled.
    await vi.waitFor(() => expect(queue.getStatus().inFlight).not.toBeNull());
    expect(isButtonDisabled()).toBe(true);
    expect(queue.getStatus().inFlight?.actionType).toBe("fund_campaign");

    releaseSigning();
    await expect(pending).resolves.toBe("100");
    expect(isButtonDisabled()).toBe(false);
    expect(snapshots.some((s) => s.isProcessing)).toBe(true);
  });

  it("updates the local sequence counter optimistically and resyncs with Horizon", async () => {
    const fetcher = vi.fn().mockResolvedValue("500");
    queue.sequenceFetcher = fetcher;
    const used: string[] = [];

    // Rapid double-click: both dispatches are serialized, never sharing a sequence.
    await Promise.all([
      queue.enqueue("claim", "Claim #1", async (seq) => used.push(seq)),
      queue.enqueue("claim", "Claim #2", async (seq) => used.push(seq)),
      queue.enqueue("claim", "Claim #3", async (seq) => used.push(seq)),
    ]);

    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(used).toEqual(["500", "501", "502"]);
    expect(new Set(used).size).toBe(used.length);
    expect(queue.getStatus().currentOptimisticSequence).toBe("502");

    fetcher.mockResolvedValueOnce("900");
    await queue.resyncSequenceFromHorizon(ACCOUNT);
    expect(queue.getStatus().currentOptimisticSequence).toBe("900");
    expect(queue.getStatus().resyncCount).toBe(2);
  });

  it("retries txBAD_SEQ errors by automatically fetching the current sequence", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce("195").mockResolvedValueOnce("200");
    queue.sequenceFetcher = fetcher;

    const attempts: string[] = [];
    const result = await queue.enqueue("payout", "Distribute payout", async (seq) => {
      attempts.push(seq);
      if (BigInt(seq) < 200n) throw new Error("tx_failed: txBAD_SEQ");
      return "SUCCESS";
    });

    expect(result).toBe("SUCCESS");
    expect(attempts).toEqual(["195", "200"]);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(queue.isSequenceDesyncError(new Error("txBAD_SEQ"))).toBe(true);
    expect(queue.isSequenceDesyncError(new Error("insufficient balance"))).toBe(false);
    expect(queue.getStatus().completedCount).toBe(1);
  });

  it("does not retry non-sequence errors (no replay of failed submissions)", async () => {
    queue.sequenceFetcher = vi.fn().mockResolvedValue("10");
    const execute = vi.fn().mockRejectedValue(new Error("op_underfunded"));

    await expect(queue.enqueue("payout", "Underfunded", execute)).rejects.toThrow(
      "op_underfunded",
    );
    expect(execute).toHaveBeenCalledTimes(1);
    expect(queue.getStatus().failedCount).toBe(1);
  });
});
