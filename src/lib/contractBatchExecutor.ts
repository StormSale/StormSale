/**
 * Smart Contract Invocation Batching, Sequential Execution & Rollback Engine (Issue #432)
 *
 * Implements:
 * 1. Sequential execution of interdependent contract calls.
 * 2. Pre-execution frontend state snapshotting and atomic rollback on intermediate failure.
 * 3. Progress bar indicator calculation (0-100%) and real-time state telemetry.
 */

export interface ContractBatchStep<TInput = Record<string, unknown>, TOutput = unknown> {
  id: string;
  name: string;
  execute: (input: TInput, prevResults: Record<string, unknown>) => Promise<TOutput>;
  rollback?: (input: TInput, error: Error) => Promise<void> | void;
}

export type BatchExecutionStatus = "idle" | "in_progress" | "completed" | "failed" | "rolled_back";

export interface BatchProgressState {
  currentStepIndex: number;
  totalSteps: number;
  percentage: number;
  currentStepName: string;
  status: BatchExecutionStatus;
  error?: string;
  results: Record<string, unknown>;
}

export type BatchProgressSubscriber = (state: BatchProgressState) => void;

export interface BatchExecutionResult {
  success: boolean;
  results: Record<string, unknown>;
  error?: Error;
}

/**
 * Executes a pipeline of interdependent contract operations with atomic rollback and progress telemetry.
 */
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

  public get stepCount(): number {
    return this.steps.length;
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
        console.error("[ContractBatchExecutor] Subscriber error:", err);
      }
    }
  }

  /**
   * Executes the batch sequentially with snapshot preservation and compensation on failure.
   */
  public async executeBatch(
    initialState: Record<string, unknown>,
    onStateRollback?: (snapshot: Record<string, unknown>) => void
  ): Promise<BatchExecutionResult> {
    if (!this.steps.length) {
      this.progress.status = "completed";
      this.progress.percentage = 100;
      this.notify();
      return { success: true, results: {} };
    }

    // 1. Take atomic snapshot of frontend state before execution begins
    this.snapshotState = JSON.parse(JSON.stringify(initialState || {}));
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
      } catch (stepErr: unknown) {
        const error = stepErr instanceof Error ? stepErr : new Error(String(stepErr));
        this.progress.status = "failed";
        this.progress.error = error.message;
        this.notify();

        // 2. Roll back executed sub-operations in reverse compensation order
        for (let r = executedSteps.length - 1; r >= 0; r--) {
          const executed = executedSteps[r];
          if (executed.rollback) {
            try {
              await executed.rollback(this.snapshotState, error);
            } catch (rbErr) {
              console.error(`[ContractBatchExecutor] Rollback failed for step ${executed.id}:`, rbErr);
            }
          }
        }

        // 3. Atomically restore frontend state to original pre-execution snapshot
        if (onStateRollback) {
          try {
            onStateRollback(this.snapshotState);
          } catch (rbErr) {
            console.error("[ContractBatchExecutor] Frontend rollback callback failed:", rbErr);
          }
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

/**
 * Functional helper to execute a batch pipeline directly.
 */
export async function executeContractBatch(
  steps: ContractBatchStep<any, any>[],
  initialState: Record<string, unknown>,
  onRollback?: (snapshot: Record<string, unknown>) => void
): Promise<BatchExecutionResult> {
  const executor = new ContractBatchExecutor(steps);
  return executor.executeBatch(initialState, onRollback);
}
