import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen } from "@testing-library/react";
import { StrKey } from "@stellar/stellar-sdk";
import { TxQueueManager } from "../lib/txQueue";
import {
  ContractBatchExecutor,
  executeContractBatch,
  toBatchExecutionProgress,
  type ContractBatchStep,
} from "../lib/contractBatchExecutor";
import type { BatchExecutionProgress } from "../lib/batchSaleLogging";
import { BulkSaleLogModal } from "../components/advertiser/BulkSaleLogModal";
import { NotificationProvider } from "../context/NotificationContext";

vi.mock("../hooks/useWeb3", () => ({
  useWeb3: () => ({
    userAddress: "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
    connectorType: "freighter",
    isConnected: true,
  }),
}));

describe("Smart Contract Invocation Batching and Execution Order (#432)", () => {
  let queueManager: TxQueueManager;
  const VALID_STELLAR_PUBLIC_KEY = "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5";

  beforeEach(() => {
    queueManager = new TxQueueManager();
    // Validate Stellar public-key fixture
    expect(StrKey.isValidEd25519PublicKey(VALID_STELLAR_PUBLIC_KEY)).toBe(true);
    queueManager.setAccount(VALID_STELLAR_PUBLIC_KEY);
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

    it("ensures TxQueueManager serializes calls without overlap with monotonically increasing sequence", async () => {
      let serverSequence = 50000n;
      queueManager.sequenceFetcher = async () => (serverSequence++).toString();

      const callOrder: string[] = [];
      let step1Started = false;
      let step2Started = false;
      let resolveStep1!: () => void;
      const step1Deferred = new Promise<void>((resolve) => {
        resolveStep1 = resolve;
      });

      const call1 = queueManager.enqueue("contract_call", "Step 1: Check Allowance", async (seq) => {
        step1Started = true;
        await step1Deferred;
        callOrder.push("step_1");
        return { step: 1, seq };
      });

      const call2 = queueManager.enqueue("contract_call", "Step 2: Transfer Assets", async (seq) => {
        step2Started = true;
        callOrder.push("step_2");
        return { step: 2, seq };
      });

      // Assert that call 1 has started but call 2 is held pending
      await new Promise((r) => setTimeout(r, 15));
      expect(step1Started).toBe(true);
      expect(step2Started).toBe(false);

      // Now resolve step 1 and verify serialized completion
      resolveStep1();
      const [res1, res2] = await Promise.all([call1, call2]);

      expect(step2Started).toBe(true);
      expect(callOrder).toEqual(["step_1", "step_2"]);
      expect(BigInt(res2.seq)).toBeGreaterThan(BigInt(res1.seq));
    });

    it("verifies executeContractBatch functional helper runs successfully", async () => {
      const step: ContractBatchStep = {
        id: "single_step",
        name: "Single Step Execution",
        execute: async () => ({ value: 42 }),
      };

      const outcome = await executeContractBatch([step], { test: 1 });
      expect(outcome.success).toBe(true);
      expect(outcome.results["single_step"]).toEqual({ value: 42 });
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
        frontendState = { ...(snapshot as typeof frontendState) };
      });

      const outcome = await executor.executeBatch(frontendState, onRollback);

      expect(outcome.success).toBe(false);
      expect(outcome.error?.message).toContain("Contract error #102");
      expect(rollbackTracker).toContain("lock_funds_rolled_back");
      expect(onRollback).toHaveBeenCalledTimes(1);

      expect(frontendState.userBalance).toBe(5000);
      expect(frontendState.pendingCommitments).toBe(0);
      expect(frontendState.activeCampaigns).toEqual(["campaign_alpha"]);
    });

    it("preserves BigInt values in state without throwing JSON serialization errors", async () => {
      const stateWithBigInt = {
        tokenAmount: 1000000000000000000n,
        feeStroops: 25000n,
        memo: "escrow_seed",
      };

      let restoredState: { tokenAmount: bigint; feeStroops: bigint; memo: string } | null = null;

      const step1: ContractBatchStep = {
        id: "step_bigint_verify",
        name: "Verify BigInt Balance",
        execute: async (state: any) => {
          expect(typeof state.tokenAmount).toBe("bigint");
          expect(state.tokenAmount).toBe(1000000000000000000n);
          return { verified: true };
        },
      };

      let step2Ran = false;
      const step2: ContractBatchStep = {
        id: "step_bigint_fail",
        name: "Fail and Rollback BigInt",
        execute: async () => {
          step2Ran = true;
          throw new Error("Simulation rejected");
        },
      };

      const executor = new ContractBatchExecutor([step1, step2]);
      const outcome = await executor.executeBatch(stateWithBigInt, (snapshot) => {
        restoredState = snapshot as { tokenAmount: bigint; feeStroops: bigint; memo: string };
      });

      expect(outcome.success).toBe(false);
      expect(outcome.error?.message).toBe("Simulation rejected");
      expect(step2Ran).toBe(true);
      expect(restoredState).not.toBeNull();
      const verifiedRestored = (restoredState as unknown) as { tokenAmount: bigint; feeStroops: bigint; memo: string };
      expect(verifiedRestored.tokenAmount).toBe(1000000000000000000n);
      expect(verifiedRestored.feeStroops).toBe(25000n);
    });

    it("keeps rollback snapshot pristine when step execution directly mutates supplied input", async () => {
      const initialState = {
        userBalance: 5000,
        settings: { autoWithdraw: false },
      };

      let restoredState: { userBalance: number; settings: { autoWithdraw: boolean } } | null = null;

      const step1: ContractBatchStep = {
        id: "step_mutator",
        name: "Mutate Supplied Input",
        execute: async (input: any) => {
          // Mutate the input object provided to the step
          input.userBalance = 999;
          input.settings.autoWithdraw = true;
          return { mutated: true };
        },
      };

      let step2MutatorRan = false;
      const step2: ContractBatchStep = {
        id: "step_fail",
        name: "Fail Execution",
        execute: async () => {
          step2MutatorRan = true;
          throw new Error("Step 2 failed");
        },
      };

      const executor = new ContractBatchExecutor([step1, step2]);
      const outcome = await executor.executeBatch(initialState, (snapshot) => {
        restoredState = snapshot as { userBalance: number; settings: { autoWithdraw: boolean } };
      });

      expect(outcome.success).toBe(false);
      expect(outcome.error?.message).toBe("Step 2 failed");
      expect(step2MutatorRan).toBe(true);
      expect(restoredState).not.toBeNull();
      const verifiedState = (restoredState as unknown) as { userBalance: number; settings: { autoWithdraw: boolean } };
      // Original values must NOT be corrupted by step1's mutation
      expect(verifiedState.userBalance).toBe(5000);
      expect(verifiedState.settings.autoWithdraw).toBe(false);
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

    it("reports rollback_failed and collects errors if rollback callback or step compensation throws", async () => {
      const step1: ContractBatchStep = {
        id: "step_comp_fail",
        name: "Step with Failing Rollback",
        execute: async () => ({ ok: true }),
        rollback: () => {
          throw new Error("Step compensation failed");
        },
      };

      const step2: ContractBatchStep = {
        id: "step_trigger_fail",
        name: "Step Trigger Fail",
        execute: async () => {
          throw new Error("Trigger step failed");
        },
      };

      const executor = new ContractBatchExecutor([step1, step2]);
      const outcome = await executor.executeBatch({ count: 1 }, () => {
        throw new Error("Frontend rollback callback crashed");
      });

      expect(outcome.success).toBe(false);
      expect(executor.getProgress().status).toBe("rollback_failed");
      expect(outcome.rollbackErrors).toBeDefined();
      expect(outcome.rollbackErrors?.length).toBe(2);
      expect(outcome.rollbackErrors?.[0].message).toBe("Step compensation failed");
      expect(outcome.rollbackErrors?.[1].message).toBe("Frontend rollback callback crashed");
    });

    it("awaits asynchronous frontend restoration callback before releasing running lock and returning", async () => {
      let asyncRestored = false;
      const executionOrder: string[] = [];

      const step1: ContractBatchStep = {
        id: "step_async_fail",
        name: "Failing Step",
        execute: async () => {
          throw new Error("Trigger async rollback");
        },
      };

      const executor = new ContractBatchExecutor([step1]);
      const outcome = await executor.executeBatch({ counter: 42 }, async (snapshot) => {
        await new Promise((resolve) => setTimeout(resolve, 30));
        asyncRestored = true;
        executionOrder.push("restored");
        expect(snapshot.counter).toBe(42);
      });

      executionOrder.push("finished");
      expect(asyncRestored).toBe(true);
      expect(executionOrder).toEqual(["restored", "finished"]);
      expect(outcome.success).toBe(false);
      expect(outcome.rollbackErrors).toBeUndefined();
      expect(executor.getProgress().status).toBe("rolled_back");
    });

    it("captures rejected promise from async onStateRollback in rollbackErrors", async () => {
      const step1: ContractBatchStep = {
        id: "step_reject",
        name: "Failing Step for Async Throw",
        execute: async () => {
          throw new Error("Trigger async error");
        },
      };

      const executor = new ContractBatchExecutor([step1]);
      const outcome = await executor.executeBatch({ val: 1 }, async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        throw new Error("Async frontend restoration failed");
      });

      expect(outcome.success).toBe(false);
      expect(outcome.rollbackErrors).toBeDefined();
      expect(outcome.rollbackErrors?.length).toBe(1);
      expect(outcome.rollbackErrors?.[0].message).toBe("Async frontend restoration failed");
      expect(executor.getProgress().status).toBe("rollback_failed");
    });

    it("prevents concurrent executeBatch calls on the same executor instance", async () => {
      const slowStep: ContractBatchStep = {
        id: "slow_step",
        name: "Slow Step",
        execute: async () => {
          await new Promise((resolve) => setTimeout(resolve, 50));
          return { done: true };
        },
      };

      const executor = new ContractBatchExecutor([slowStep]);
      const firstRun = executor.executeBatch({ val: 1 });
      await expect(executor.executeBatch({ val: 2 })).rejects.toThrow(
        /already executing a batch/i
      );
      const firstOutcome = await firstRun;
      expect(firstOutcome.success).toBe(true);
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

      const percentages = progressSnapshots.map((p) => p.percentage);
      expect(percentages).toContain(0);
      expect(percentages).toContain(25);
      expect(percentages).toContain(50);
      expect(percentages).toContain(75);
      expect(percentages).toContain(100);

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
      expect(finalState.results["step_3"]).toBeUndefined();
    });

    it("handles empty batch gracefully", async () => {
      const executor = new ContractBatchExecutor([]);
      expect(executor.stepCount).toBe(0);
      const outcome = await executor.executeBatch({});
      expect(outcome.success).toBe(true);
      expect(executor.getProgress().percentage).toBe(100);
      expect(executor.getProgress().status).toBe("completed");
    });

    it("connects executor progress to BulkSaleLogModal progress indicator during multi-step flow", async () => {
      const step1: ContractBatchStep = {
        id: "step_1",
        name: "Check balance",
        execute: async () => ({ step: 1 }),
      };
      const step2: ContractBatchStep = {
        id: "step_2",
        name: "Invoke batch contract",
        execute: async () => ({ step: 2 }),
      };

      const executor = new ContractBatchExecutor([step1, step2]);
      const capturedProgress: BatchExecutionProgress[] = [];

      executor.subscribe((state) => {
        capturedProgress.push(toBatchExecutionProgress(state));
      });

      const outcome = await executor.executeBatch({});
      expect(outcome.success).toBe(true);

      // Verify progress telemetry was captured across the flow
      expect(capturedProgress.length).toBeGreaterThanOrEqual(3);

      const midProgress = capturedProgress.find((p) => p.currentBatchIndex === 1 && p.currentStatus === "submitting");
      expect(midProgress).toBeDefined();

      const { rerender } = render(
        React.createElement(
          NotificationProvider,
          null,
          React.createElement(BulkSaleLogModal as any, {
            initialProgress: midProgress,
          }),
        ),
      );

      const progressBar = screen.getByRole("progressbar", { name: /batch execution progress/i });
      expect(progressBar).toBeDefined();
      expect(progressBar.getAttribute("aria-valuenow")).toBeTruthy();
      expect(screen.getByText(/batch 1 of 2/i)).toBeDefined();

      // Render with final executor progress
      const finalProgress = capturedProgress[capturedProgress.length - 1];
      expect(finalProgress.currentStatus).toBe("completed");

      rerender(
        React.createElement(
          NotificationProvider,
          null,
          React.createElement(BulkSaleLogModal as any, {
            initialProgress: finalProgress,
          }),
        ),
      );

      const finalProgressBar = screen.getByRole("progressbar", { name: /batch execution progress/i });
      expect(finalProgressBar.getAttribute("aria-valuenow")).toBe("100");
      expect(screen.getByText("100% Complete")).toBeDefined();
    });

    it("renders live batch progress indicator in BulkSaleLogModal from executor progress adapter", () => {
      const mockState = {
        currentStepIndex: 3,
        totalSteps: 5,
        percentage: 60,
        currentStepName: "Transfer Tokens",
        status: "in_progress" as const,
        results: {},
      };

      const adaptedProgress = toBatchExecutionProgress(mockState);
      expect(adaptedProgress.currentBatchIndex).toBe(3);
      expect(adaptedProgress.totalBatches).toBe(5);
      expect(adaptedProgress.currentStatus).toBe("submitting");

      render(
        React.createElement(
          NotificationProvider,
          null,
          React.createElement(BulkSaleLogModal as any, {
            initialProgress: adaptedProgress,
          }),
        ),
      );

      const progressBar = screen.getByRole("progressbar", { name: /batch execution progress/i });
      expect(progressBar).toBeDefined();
      expect(progressBar.getAttribute("aria-valuenow")).toBeTruthy();
      expect(screen.getByText(/batch 3 of 5/i)).toBeDefined();
    });
  });
});

