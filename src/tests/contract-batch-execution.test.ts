import { describe, it, expect, vi, beforeEach } from "vitest";
import { TxQueueManager, type TxQueueStatusSummary, type TxQueueItemStatus } from "../lib/txQueue";

/**
 * Web3 Contract Invocation Batching & Sequential Execution Engine
 *
 * Implements:
 * 1. Sequential execution of interdependent smart contract calls (e.g. approve -> create -> fund -> verify).
 * 2. Atomic state rollback in frontend state if any sub-operation fails mid-flight.
 * 3. Progress bar indicator with percentage tracking and error state management.
 */

export interface ContractBatchStep<TInput = unknown, TOutput = unknown> {
  id: string;
  name: string;
  execute: (input: TInput, prevResults: Record<string, unknown>) => Promise<TOutput>;
  rollback?: (input: TInput, error: Error) => Promise<void> | void;
}

export interface BatchProgressState {
  currentStepIndex: number;
  totalSteps: number;
  percentage: number;
  currentStepName: string;
  status: "idle" | "in_progress" | "completed" | "failed" | "rolled_back";
  error?: string;
  results: Record<string, unknown>;
}

export type BatchProgressSubscriber = (state: BatchProgressState) => void;

export class ContractBatchExecutor {
  private steps: ContractBatchStep<any, any>[] = [];
  private progress: BatchProgressState = {
    currentStepIndex: 0,
    totalSteps: 0,
    percentage: 0,
    currentStepName: "",
    status: "idle",
    results: {},
  };
  private subscribers: Set<BatchProgressSubscriber> = new Set();
  private snapshotState: Record<string, unknown> = {};

  constructor(steps: ContractBatchStep<any, any>[] = []) {
    this.steps = steps;
    this.progress.totalSteps = steps.length;
  }

  public subscribe(callback: BatchProgressSubscriber): () => void {
    this.subscribers.add(callback);
    callback(this.getProgress());
    return () => this.subscribers.delete(callback);
  }

  public getProgress(): BatchProgressState {
    return { ...this.progress, results: { ...this.progress.results } };
  }

  private notify() {
    const current = this.getProgress();
    for (const sub of this.subscribers) {
      try {
        sub(current);
      } catch (err) {
        console.error("Batch progress subscriber error:", err);
      }
    }
  }

  public async executeBatch(
    initialState: Record<string, unknown>,
    onStateRollback?: (snapshot: Record<string, unknown>) => void
  ): Promise<{ success: boolean; results: Record<string, unknown>; error?: Error }> {
    // 1. Take atomic snapshot of frontend state before execution begins
    this.snapshotState = JSON.parse(JSON.stringify(initialState));
    this.progress.status = "in_progress";
    this.progress.currentStepIndex = 0;
    this.progress.percentage = 0;
    this.progress.results = {};
    delete this.progress.error;
    this.notify();

    const executedSteps: ContractBatchStep<any, any>[] = [];

    for (let i = 0; i < this.steps.length; i++) {
      const step = this.steps[i];
      this.progress.currentStepIndex = i + 1;
      this.progress.currentStepName = step.name;
      this.progress.percentage = Math.round((i / this.steps.length) * 100);
      this.notify();

      try {
        const stepResult = await step.execute(this.snapshotState, this.progress.results);
        this.progress.results[step.id] = stepResult;
        executedSteps.push(step);
      } catch (stepErr: any) {
        // Step failed: perform atomic rollback
        const error = stepErr instanceof Error ? stepErr : new Error(String(stepErr));
        this.progress.status = "failed";
        this.progress.error = error.message;
        this.notify();

        // Roll back executed sub-operations in reverse order
        for (let r = executedSteps.length - 1; r >= 0; r--) {
          const executed = executedSteps[r];
          if (executed.rollback) {
            try {
              await executed.rollback(this.snapshotState, error);
            } catch (rbErr) {
              console.error(`Rollback failed for step ${executed.id}:`, rbErr);
            }
          }
        }

        // Restore frontend state from pre-execution snapshot
        if (onStateRollback) {
          onStateRollback(this.snapshotState);
        }

        this.progress.status = "rolled_back";
        this.notify();

        return {
          success: false,
          results: this.progress.results,
          error,
        };
      }
    }

    this.progress.status = "completed";
    this.progress.percentage = 100;
    this.progress.currentStepName = "Complete";
    this.notify();

    return {
      success: true,
      results: this.progress.results,
    };
  }
}

describe("Smart Contract Invocation Batching and Execution Order (#432)", () => {
  let queueManager: TxQueueManager;

  beforeEach(() => {
    queueManager = new TxQueueManager();
    queueManager.setAccount("GBZXN7PIRZGNMHGA728RGRYA7XPO5CFSGSJAA5T6Q5WWC62MWFPZ4ES2");
  });

  describe("1. Sequential Execution of Interdependent Contract Calls", () => {
    it("executes interdependent multi-step calls strictly in sequential order", async () => {
      const executionTimeline: Array<{ step: string; timestamp: number; input: unknown }> = [];

      const step1: ContractBatchStep = {
        id: "approve_allowance",
        name: "Approve Token Allowance",
        execute: async (state: any) => {
          await new Promise((resolve) => setTimeout(resolve, 20));
          const result = { allowance: 5000, txHash: "0x_allowance_abc" };
          executionTimeline.push({ step: "approve_allowance", timestamp: Date.now(), input: state });
          return result;
        },
      };

      const step2: ContractBatchStep = {
        id: "create_campaign",
        name: "Deploy Campaign Escrow",
        execute: async (_state: any, prevResults) => {
          // Relies on step 1 output
          expect(prevResults["approve_allowance"]).toBeDefined();
          await new Promise((resolve) => setTimeout(resolve, 15));
          const result = { campaignId: 402, txHash: "0x_campaign_def" };
          executionTimeline.push({ step: "create_campaign", timestamp: Date.now(), input: prevResults["approve_allowance"] });
          return result;
        },
      };

      const step3: ContractBatchStep = {
        id: "deposit_escrow",
        name: "Deposit Escrow Collateral",
        execute: async (_state: any, prevResults) => {
          // Relies on step 2 output
          const campaign = prevResults["create_campaign"] as { campaignId: number };
          expect(campaign.campaignId).toBe(402);
          await new Promise((resolve) => setTimeout(resolve, 10));
          const result = { depositedAmount: 2500, txHash: "0x_escrow_ghi" };
          executionTimeline.push({ step: "deposit_escrow", timestamp: Date.now(), input: campaign });
          return result;
        },
      };

      const executor = new ContractBatchExecutor([step1, step2, step3]);
      const initialFrontendState = { userBalance: 10000, activeCampaigns: 2 };

      const outcome = await executor.executeBatch(initialFrontendState);

      expect(outcome.success).toBe(true);
      expect(executionTimeline).toHaveLength(3);
      expect(executionTimeline[0].step).toBe("approve_allowance");
      expect(executionTimeline[1].step).toBe("create_campaign");
      expect(executionTimeline[2].step).toBe("deposit_escrow");
      expect(executionTimeline[1].timestamp).toBeGreaterThanOrEqual(executionTimeline[0].timestamp);
      expect(executionTimeline[2].timestamp).toBeGreaterThanOrEqual(executionTimeline[1].timestamp);
      expect(outcome.results["create_campaign"]).toEqual({ campaignId: 402, txHash: "0x_campaign_def" });
    });

    it("ensures TxQueueManager processes sequential calls with monotonically increasing sequence", async () => {
      let serverSequence = 50000n;
      queueManager.sequenceFetcher = async () => (serverSequence++).toString();

      const callOrder: string[] = [];
      const call1 = queueManager.enqueue("contract_call", "Step 1: Check Allowance", async (seq) => {
        callOrder.push("step_1");
        return { step: 1, seq };
      });

      const call2 = queueManager.enqueue("contract_call", "Step 2: Transfer Assets", async (seq) => {
        callOrder.push("step_2");
        return { step: 2, seq };
      });

      const [res1, res2] = await Promise.all([call1, call2]);

      expect(callOrder).toEqual(["step_1", "step_2"]);
      expect(BigInt(res2.seq)).toBeGreaterThan(BigInt(res1.seq));
    });
  });

  describe("2. Atomic State Rollback in Frontend State on Sub-operation Failure", () => {
    it("reverts frontend state to original snapshot when intermediate sub-operation fails", async () => {
      let frontendState = {
        userBalance: 5000,
        pendingCommitments: 0,
        activeCampaigns: ["campaign_alpha"],
      };

      const rollbackTracker: string[] = [];

      const step1: ContractBatchStep = {
        id: "lock_funds",
        name: "Lock Funds Optimistically",
        execute: async () => {
          // Mutate frontend state optimistically
          frontendState.userBalance -= 1000;
          frontendState.pendingCommitments += 1000;
          return { locked: 1000 };
        },
        rollback: async () => {
          rollbackTracker.push("lock_funds_rolled_back");
        },
      };

      const step2: ContractBatchStep = {
        id: "invoke_contract_creation",
        name: "Soroban Contract Deployment",
        execute: async () => {
          // Simulate smart contract invocation failure (HostError or out-of-gas)
          throw new Error("HostError: Contract error #102: Escrow initialization unauthorized");
        },
      };

      const step3: ContractBatchStep = {
        id: "finalize_verification",
        name: "Finalize Verification",
        execute: async () => {
          return { verified: true };
        },
      };

      const executor = new ContractBatchExecutor([step1, step2, step3]);

      const onRollback = vi.fn((snapshot: Record<string, unknown>) => {
        // Atomic restoration of frontend state
        frontendState = { ...(snapshot as typeof frontendState) };
      });

      const outcome = await executor.executeBatch(frontendState, onRollback);

      expect(outcome.success).toBe(false);
      expect(outcome.error?.message).toContain("Contract error #102");
      expect(rollbackTracker).toContain("lock_funds_rolled_back");
      expect(onRollback).toHaveBeenCalledTimes(1);

      // Verify that frontend state was atomically restored to original state
      expect(frontendState.userBalance).toBe(5000);
      expect(frontendState.pendingCommitments).toBe(0);
      expect(frontendState.activeCampaigns).toEqual(["campaign_alpha"]);
    });

    it("prevents partial side-effects if step 1 passes but step 2 aborts", async () => {
      const compensatedSteps: string[] = [];

      const stepA: ContractBatchStep = {
        id: "step_a",
        name: "Allocate Resource",
        execute: async () => ({ allocated: true }),
        rollback: () => {
          compensatedSteps.push("step_a");
        },
      };

      const stepB: ContractBatchStep = {
        id: "step_b",
        name: "Register On-Chain",
        execute: async () => {
          throw new Error("RPC network timeout (tx_timeout)");
        },
      };

      const executor = new ContractBatchExecutor([stepA, stepB]);
      const initial = { allocationId: null };

      const outcome = await executor.executeBatch(initial);

      expect(outcome.success).toBe(false);
      expect(compensatedSteps).toEqual(["step_a"]);
      expect(executor.getProgress().status).toBe("rolled_back");
    });
  });

  describe("3. Progress Bar Indicator for Multi-Step Transaction Flows", () => {
    it("reports incremental percentage progress and current step status across full pipeline", async () => {
      const progressSnapshots: Array<{ stepIndex: number; percentage: number; stepName: string; status: string }> = [];

      const steps: ContractBatchStep[] = [
        {
          id: "step_1",
          name: "1/4: Signature Verification",
          execute: async () => ({ sig: "valid" }),
        },
        {
          id: "step_2",
          name: "2/4: Soroban Simulation",
          execute: async () => ({ simulatedFee: "100" }),
        },
        {
          id: "step_3",
          name: "3/4: Transaction Broadcast",
          execute: async () => ({ txHash: "0x_broadcast_123" }),
        },
        {
          id: "step_4",
          name: "4/4: Ledger Finality Confirmation",
          execute: async () => ({ confirmedInLedger: 541092 }),
        },
      ];

      const executor = new ContractBatchExecutor(steps);

      executor.subscribe((progress) => {
        progressSnapshots.push({
          stepIndex: progress.currentStepIndex,
          percentage: progress.percentage,
          stepName: progress.currentStepName,
          status: progress.status,
        });
      });

      const outcome = await executor.executeBatch({ session: "test_session" });

      expect(outcome.success).toBe(true);

      // Verify progression transitions
      const percentages = progressSnapshots.map((p) => p.percentage);
      expect(percentages).toContain(0);
      expect(percentages).toContain(25);
      expect(percentages).toContain(50);
      expect(percentages).toContain(75);
      expect(percentages).toContain(100);

      // Verify final completion state
      const finalState = executor.getProgress();
      expect(finalState.status).toBe("completed");
      expect(finalState.percentage).toBe(100);
      expect(finalState.currentStepIndex).toBe(4);
    });

    it("clamps progress between 0% and 100% and halts increment on failure", async () => {
      const steps: ContractBatchStep[] = [
        {
          id: "step_1",
          name: "Preparing Payload",
          execute: async () => ({ ready: true }),
        },
        {
          id: "step_2",
          name: "Executing Call",
          execute: async () => {
            throw new Error("Simulation aborted: insufficient gas");
          },
        },
        {
          id: "step_3",
          name: "Publishing Event",
          execute: async () => ({ event: "published" }),
        },
      ];

      const executor = new ContractBatchExecutor(steps);
      const outcome = await executor.executeBatch({});

      expect(outcome.success).toBe(false);

      const finalState = executor.getProgress();
      expect(finalState.percentage).toBeLessThan(100);
      expect(finalState.status).toBe("rolled_back");
      expect(finalState.error).toContain("insufficient gas");
      // Step 3 was never executed
      expect(finalState.results["step_3"]).toBeUndefined();
    });
  });
});
