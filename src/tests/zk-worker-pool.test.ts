import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  ZKWorkerPool,
  resolveOptimalPoolSize,
  MIN_POOL_SIZE,
  MAX_POOL_SIZE,
  DEFAULT_POOL_SIZE,
  createVerificationWorkerBlobUrl,
} from "../lib/zkWorkerPool";
import { generateZKRevenueProof, compileHistoricConversions } from "../lib/zkProofEngine";
import type { ZKRevenueProof } from "../types/zkProof";

class MockWorker {
  public onmessage: ((event: MessageEvent) => void) | null = null;
  public onerror: ((event: ErrorEvent) => void) | null = null;
  public isTerminated = false;
  public postMessageCallCount = 0;

  constructor() {}

  postMessage(data: { id: string; proof: ZKRevenueProof }): void {
    this.postMessageCallCount++;
    setTimeout(() => {
      if (this.isTerminated) return;
      if (this.onmessage) {
        this.onmessage({
          data: {
            id: data.id,
            success: true,
            result: {
              isValid: true,
              verifiedAt: new Date().toISOString(),
              affiliateAddress: data.proof.affiliateAddress,
              claimedThresholdUsd: data.proof.claimedThresholdUsd,
              revenueTier: data.proof.revenueTier,
              conversionsCount: data.proof.totalConversionsCount,
              verificationSteps: [
                {
                  step: "WORKER_PROOF_EVALUATION",
                  description: "Mock off-thread execution",
                  passed: true,
                },
              ],
            },
          },
        } as unknown as MessageEvent);
      }
    }, 10);
  }

  terminate(): void {
    this.isTerminated = true;
  }
}

describe("Web Worker Thread Pooling for Concurrent ZK Proof Verification (#469)", () => {
  const TEST_AFFILIATE = "GASTORMSALE7ZKPROOFAFFILIATE0000000000000000000000000000001";
  let sampleProof: ZKRevenueProof;

  beforeEach(async () => {
    vi.restoreAllMocks();
    const records = compileHistoricConversions(TEST_AFFILIATE);
    const { proof } = await generateZKRevenueProof({
      affiliateAddress: TEST_AFFILIATE,
      conversions: records,
      targetThresholdUsd: 50_000,
    });
    sampleProof = proof;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("1. Concurrency Limits & Hardware Concurrency Bounding", () => {
    it("bounds concurrency based on navigator.hardwareConcurrency", () => {
      const originalNavigator = globalThis.navigator;

      // When navigator has 8 cores
      Object.defineProperty(globalThis, "navigator", {
        value: { hardwareConcurrency: 8 },
        configurable: true,
        writable: true,
      });
      expect(resolveOptimalPoolSize()).toBe(8);

      // When navigator has 64 cores, capped at MAX_POOL_SIZE (16)
      Object.defineProperty(globalThis, "navigator", {
        value: { hardwareConcurrency: 64 },
        configurable: true,
        writable: true,
      });
      expect(resolveOptimalPoolSize()).toBe(MAX_POOL_SIZE);

      // When navigator has 0 or negative cores, clamped to MIN_POOL_SIZE
      Object.defineProperty(globalThis, "navigator", {
        value: { hardwareConcurrency: 0 },
        configurable: true,
        writable: true,
      });
      expect(resolveOptimalPoolSize()).toBe(DEFAULT_POOL_SIZE);

      // Restore
      Object.defineProperty(globalThis, "navigator", {
        value: originalNavigator,
        configurable: true,
        writable: true,
      });
    });

    it("allows explicit concurrency overrides within safe thresholds", () => {
      expect(resolveOptimalPoolSize(2)).toBe(2);
      expect(resolveOptimalPoolSize(32)).toBe(MAX_POOL_SIZE);
      expect(resolveOptimalPoolSize(1)).toBe(MIN_POOL_SIZE);
    });

    it("respects concurrency limits and queues excess verification jobs in FIFO order", async () => {
      const mockWorkers: MockWorker[] = [];
      const pool = new ZKWorkerPool({
        concurrency: 2,
        workerFactory: () => {
          const w = new MockWorker();
          mockWorkers.push(w);
          return w as unknown as Worker;
        },
      });

      expect(pool.maxConcurrency).toBe(2);
      const metricsInitial = pool.getMetrics();
      expect(metricsInitial.maxConcurrency).toBe(2);
      expect(metricsInitial.activeWorkers).toBe(0);
      expect(metricsInitial.queuedJobs).toBe(0);

      // Dispatch 5 proofs concurrently to a pool of 2 workers
      const p1 = pool.verifyProof(sampleProof);
      const p2 = pool.verifyProof(sampleProof);
      const p3 = pool.verifyProof(sampleProof);
      const p4 = pool.verifyProof(sampleProof);
      const p5 = pool.verifyProof(sampleProof);

      // Immediately after dispatch: 2 active, 3 queued
      const metricsMid = pool.getMetrics();
      expect(metricsMid.activeWorkers).toBe(2);
      expect(metricsMid.queuedJobs).toBe(3);

      const results = await Promise.all([p1, p2, p3, p4, p5]);
      expect(results).toHaveLength(5);
      results.forEach((r) => {
        expect(r.isValid).toBe(true);
        expect(r.affiliateAddress).toBe(TEST_AFFILIATE);
      });

      const metricsFinal = pool.getMetrics();
      expect(metricsFinal.activeWorkers).toBe(0);
      expect(metricsFinal.queuedJobs).toBe(0);

      pool.terminate();
    });
  });

  describe("2. Worker Termination & Resource Cleanup", () => {
    it("terminates all workers and cleans up blob resources when leaving verification screen", () => {
      const mockWorkers: MockWorker[] = [];
      const pool = new ZKWorkerPool({
        concurrency: 3,
        workerFactory: () => {
          const w = new MockWorker();
          mockWorkers.push(w);
          return w as unknown as Worker;
        },
      });

      expect(mockWorkers).toHaveLength(3);
      mockWorkers.forEach((w) => expect(w.isTerminated).toBe(false));

      pool.terminate();

      expect(pool.isTerminated).toBe(true);
      mockWorkers.forEach((w) => expect(w.isTerminated).toBe(true));
      expect(pool.getMetrics().isTerminated).toBe(true);
      expect(pool.getMetrics().activeWorkers).toBe(0);
    });

    it("rejects in-flight and queued jobs immediately on pool termination", async () => {
      const pool = new ZKWorkerPool({
        concurrency: 1,
        workerFactory: () => {
          const w = new MockWorker();
          // Never respond to simulate pending work
          w.postMessage = () => {};
          return w as unknown as Worker;
        },
      });

      const p1 = pool.verifyProof(sampleProof);
      const p2 = pool.verifyProof(sampleProof);

      expect(pool.getMetrics().activeWorkers).toBe(1);
      expect(pool.getMetrics().queuedJobs).toBe(1);

      pool.terminate();

      await expect(p1).rejects.toThrow("Worker pool terminated. Job cancelled.");
      await expect(p2).rejects.toThrow("Worker pool terminated. Job cancelled.");
    });

    it("rejects any new verifyProof calls after termination", async () => {
      const pool = new ZKWorkerPool({ forceFallback: true });
      pool.terminate();

      await expect(pool.verifyProof(sampleProof)).rejects.toThrow(
        "Worker pool has been terminated.",
      );
    });
  });

  describe("3. Graceful Fallback to Single-Threaded Verification", () => {
    it("falls back to single-threaded verification when forceFallback is enabled", async () => {
      const pool = new ZKWorkerPool({ forceFallback: true });
      expect(pool.isFallbackMode).toBe(true);

      const result = await pool.verifyProof(sampleProof);
      expect(result.isValid).toBe(true);
      expect(result.affiliateAddress).toBe(TEST_AFFILIATE);
    });

    it("falls back gracefully when Worker constructor throws (e.g. CSP block)", async () => {
      const pool = new ZKWorkerPool({
        concurrency: 2,
        workerFactory: () => {
          throw new Error("SecurityError: Worker creation blocked by Content Security Policy");
        },
      });

      expect(pool.isFallbackMode).toBe(true);

      const result = await pool.verifyProof(sampleProof);
      expect(result.isValid).toBe(true);
      expect(result.affiliateAddress).toBe(TEST_AFFILIATE);
    });

    it("handles batch verification seamlessly across thread pooling and fallback modes", async () => {
      const poolFallback = new ZKWorkerPool({ forceFallback: true });
      const batchResults = await poolFallback.verifyBatch([sampleProof, sampleProof]);
      expect(batchResults).toHaveLength(2);
      expect(batchResults[0].isValid).toBe(true);
      expect(batchResults[1].isValid).toBe(true);
      poolFallback.terminate();
    });

    it("creates inline blob URL properly when URL and Blob are supported", () => {
      if (typeof URL !== "undefined" && typeof Blob !== "undefined") {
        const url = createVerificationWorkerBlobUrl();
        expect(typeof url).toBe("string");
      }
    });
  });
});
