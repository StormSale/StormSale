/**
 * Account Sequence Desynchronization Recovery & In-Flight Transaction Queue (Issue #130)
 *
 * Implements:
 * 1. Sequential FIFO transaction queue preventing sequence collisions (txBAD_SEQ) under rapid clicks.
 * 2. Local optimistic sequence number tracker.
 * 3. Automated sequence desynchronization detection, Horizon resynchronization, and single-retry recovery.
 * 4. Observable queue status for real-time user notification and UI telemetry.
 */

export type TxQueueItemStatus = "queued" | "in_flight" | "retrying" | "succeeded" | "failed";

export interface TxQueueItem<T = unknown> {
  id: string;
  actionType: string;
  description: string;
  status: TxQueueItemStatus;
  sequence: string | null;
  enqueuedAt: number;
  completedAt?: number;
  error?: string;
  retryCount: number;
  execute: (sequence: string) => Promise<T>;
  resolve: (value: T | PromiseLike<T>) => void;
  reject: (reason?: unknown) => void;
}

export interface TxQueueStatusSummary {
  inFlight: { id: string; actionType: string; description: string; sequence: string | null } | null;
  pendingCount: number;
  completedCount: number;
  failedCount: number;
  resyncCount: number;
  currentOptimisticSequence: string | null;
  isProcessing: boolean;
  history: Array<{
    id: string;
    actionType: string;
    status: TxQueueItemStatus;
    description: string;
  }>;
}

export type QueueListener = (status: TxQueueStatusSummary) => void;

export class TxQueueManager {
  private queue: TxQueueItem<any>[] = [];
  private inFlightItem: TxQueueItem<any> | null = null;
  private history: TxQueueItem<any>[] = [];
  private optimisticSequence: bigint | null = null;
  private activeAccount: string | null = null;
  private resyncCount = 0;
  private isProcessing = false;
  private listeners: Set<QueueListener> = new Set();

  /**
   * Sequence fetcher hook - by default queries Horizon/Soroban or generates incremental fallback sequence.
   */
  public sequenceFetcher: (address: string) => Promise<string> = async (_address: string) => {
    // Default fallback sequence derivation
    return (BigInt(Date.now()) * 1000n).toString();
  };

  public setAccount(address: string | null) {
    if (this.activeAccount !== address) {
      this.activeAccount = address;
      this.optimisticSequence = null;
      this.notifyListeners();
    }
  }

  public subscribe(listener: QueueListener): () => void {
    this.listeners.add(listener);
    listener(this.getStatus());
    return () => this.listeners.delete(listener);
  }

  private notifyListeners() {
    const status = this.getStatus();
    for (const listener of this.listeners) {
      try {
        listener(status);
      } catch (err) {
        console.error("[TxQueueManager] Listener notification error:", err);
      }
    }
  }

  public getStatus(): TxQueueStatusSummary {
    return {
      inFlight: this.inFlightItem
        ? {
            id: this.inFlightItem.id,
            actionType: this.inFlightItem.actionType,
            description: this.inFlightItem.description,
            sequence: this.inFlightItem.sequence,
          }
        : null,
      pendingCount: this.queue.length,
      completedCount: this.history.filter((h) => h.status === "succeeded").length,
      failedCount: this.history.filter((h) => h.status === "failed").length,
      resyncCount: this.resyncCount,
      currentOptimisticSequence: this.optimisticSequence
        ? this.optimisticSequence.toString()
        : null,
      isProcessing: this.isProcessing,
      history: this.history.slice(-10).map((h) => ({
        id: h.id,
        actionType: h.actionType,
        status: h.status,
        description: h.description,
      })),
    };
  }

  /**
   * Resets internal queue state (useful in tests or hard resets).
   */
  public clear() {
    this.queue = [];
    this.inFlightItem = null;
    this.history = [];
    this.optimisticSequence = null;
    this.resyncCount = 0;
    this.isProcessing = false;
    this.notifyListeners();
  }

  /**
   * Detects if an error signifies Stellar txBAD_SEQ desynchronization.
   */
  public isSequenceDesyncError(error: unknown): boolean {
    if (!error) return false;
    const errStr = (error instanceof Error ? error.message : String(error)).toLowerCase();
    return (
      errStr.includes("txbad_seq") ||
      errStr.includes("tx_bad_seq") ||
      errStr.includes("bad_seq") ||
      errStr.includes("bad sequence") ||
      errStr.includes("sequence number does not match") ||
      errStr.includes("tx_bad_seq_error")
    );
  }

  /**
   * Queries authoritative sequence from Horizon/Soroban RPC.
   */
  public async resyncSequenceFromHorizon(address: string): Promise<bigint> {
    try {
      const rawSeq = await this.sequenceFetcher(address);
      const parsed = BigInt(rawSeq);
      this.optimisticSequence = parsed;
      this.resyncCount++;
      this.notifyListeners();
      return parsed;
    } catch (err) {
      console.warn(
        "[TxQueueManager] Failed to fetch sequence from server, advancing locally:",
        err,
      );
      if (this.optimisticSequence === null) {
        this.optimisticSequence = BigInt(Date.now()) * 1000n;
      } else {
        this.optimisticSequence += 1n;
      }
      this.resyncCount++;
      this.notifyListeners();
      return this.optimisticSequence;
    }
  }

  /**
   * Enqueues an on-chain operation into the sequential in-flight queue.
   */
  public enqueue<T>(
    actionType: string,
    description: string,
    task: (sequence: string) => Promise<T>,
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const id = `tx_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
      const item: TxQueueItem<T> = {
        id,
        actionType,
        description,
        status: "queued",
        sequence: null,
        enqueuedAt: Date.now(),
        retryCount: 0,
        execute: task,
        resolve,
        reject,
      };

      this.queue.push(item);
      this.notifyListeners();

      // Trigger queue processing loop
      void this.processQueue();
    });
  }

  private async processQueue(): Promise<void> {
    if (this.isProcessing) return;
    this.isProcessing = true;

    while (this.queue.length > 0) {
      const current = this.queue.shift()!;
      this.inFlightItem = current;
      current.status = "in_flight";

      // Initialize sequence if not yet loaded
      if (this.optimisticSequence === null && this.activeAccount) {
        await this.resyncSequenceFromHorizon(this.activeAccount);
      } else if (this.optimisticSequence !== null) {
        this.optimisticSequence += 1n;
      }

      current.sequence = this.optimisticSequence ? this.optimisticSequence.toString() : "1";
      this.notifyListeners();

      let success = false;
      let finalResult: any = null;
      let finalError: any = null;

      try {
        finalResult = await current.execute(current.sequence);
        success = true;
      } catch (err: unknown) {
        // Check for sequence desynchronization
        if (this.isSequenceDesyncError(err) && current.retryCount === 0 && this.activeAccount) {
          console.warn(
            `[TxQueueManager] Sequence collision detected for tx ${current.id}. Resyncing from Horizon and retrying...`,
          );
          current.status = "retrying";
          current.retryCount++;
          this.notifyListeners();

          try {
            const freshSeq = await this.resyncSequenceFromHorizon(this.activeAccount);
            current.sequence = freshSeq.toString();
            this.notifyListeners();

            finalResult = await current.execute(current.sequence);
            success = true;
          } catch (retryErr: unknown) {
            finalError = retryErr;
          }
        } else {
          finalError = err;
        }
      }

      current.completedAt = Date.now();
      if (success) {
        current.status = "succeeded";
        this.history.push(current);
        this.inFlightItem = null;
        this.notifyListeners();
        current.resolve(finalResult);
      } else {
        current.status = "failed";
        current.error = finalError instanceof Error ? finalError.message : String(finalError);
        this.history.push(current);
        this.inFlightItem = null;
        this.notifyListeners();
        current.reject(finalError);
      }
    }

    this.isProcessing = false;
    this.notifyListeners();
  }
}

export const txQueueManager = new TxQueueManager();
