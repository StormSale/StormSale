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

export type BatchExecutionStatus =
  | "idle"
  | "in_progress"
  | "completed"
  | "failed"
  | "rolled_back"
  | "rollback_failed";

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
  rollbackErrors?: Error[];
}

/**
 * Deep-clones state objects while preserving primitives, BigInt, Date, Map, Set, and nested structures.
 */
export function deepClone<T>(val: T): T {
  if (val === null || typeof val !== "object") {
    return val;
  }
  if (typeof val === "bigint" || typeof val === "symbol") {
    return val;
  }
  if (val instanceof Date) {
    return new Date(val.getTime()) as unknown as T;
  }
  if (val instanceof RegExp) {
    return new RegExp(val.source, val.flags) as unknown as T;
  }
  if (val instanceof Map) {
    const copy = new Map();
    for (const [k, v] of val.entries()) {
      copy.set(deepClone(k), deepClone(v));
    }
    return copy as unknown as T;
  }
  if (val instanceof Set) {
    const copy = new Set();
    for (const v of val.values()) {
      copy.add(deepClone(v));
    }
    return copy as unknown as T;
  }
  if (Array.isArray(val)) {
    return val.map((item) => deepClone(item)) as unknown as T;
  }
  const copy: Record<string, unknown> = {};
  for (const key of Object.keys(val as Record<string, unknown>)) {
    copy[key] = deepClone((val as Record<string, unknown>)[key]);
  }
  return copy as unknown as T;
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
  private isRunning: boolean = false;

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
    if (this.isRunning) {
      throw new Error("ContractBatchExecutor is already executing a batch");
    }

    if (!this.steps.length) {
      this.progress.status = "completed";
      this.progress.percentage = 100;
      this.notify();
      return { success: true, results: {} };
    }

    this.isRunning = true;
    try {
      // 1. Take atomic pristine snapshot of frontend state before execution begins
      // Uses deepClone to safely preserve BigInt and complex structures without JSON.stringify throwing
      this.snapshotState = deepClone(initialState || {});
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
          // Pass an independent working copy to the step execution so mutations do not taint the rollback snapshot
          const workingInput = deepClone(this.snapshotState);
          const stepResult = await step.execute(workingInput, this.progress.results);
          this.progress.results[step.id] = stepResult;
          executedSteps.push(step);
        } catch (stepErr: unknown) {
          const error = stepErr instanceof Error ? stepErr : new Error(String(stepErr));
          this.progress.status = "failed";
          this.progress.error = error.message;
          this.notify();

          const rollbackErrors: Error[] = [];

          // 2. Roll back executed sub-operations in reverse compensation order
          for (let r = executedSteps.length - 1; r >= 0; r--) {
            const executed = executedSteps[r];
            if (executed.rollback) {
              try {
                const rollbackInput = deepClone(this.snapshotState);
                await executed.rollback(rollbackInput, error);
              } catch (rbErr: unknown) {
                const err = rbErr instanceof Error ? rbErr : new Error(String(rbErr));
                rollbackErrors.push(err);
                console.error(`[ContractBatchExecutor] Rollback failed for step ${executed.id}:`, rbErr);
              }
            }
          }

          // 3. Atomically restore frontend state to original pre-execution snapshot
          if (onStateRollback) {
            try {
              onStateRollback(deepClone(this.snapshotState));
            } catch (rbErr: unknown) {
              const err = rbErr instanceof Error ? rbErr : new Error(String(rbErr));
              rollbackErrors.push(err);
              console.error("[ContractBatchExecutor] Frontend rollback callback failed:", rbErr);
            }
          }

          if (rollbackErrors.length > 0) {
            this.progress.status = "rollback_failed";
            this.progress.error = `Execution failed: ${error.message}. Rollback errors: ${rollbackErrors.map((e) => e.message).join("; ")}`;
          } else {
            this.progress.status = "rolled_back";
          }
          this.notify();

          return {
            success: false,
            results: this.progress.results,
            error,
            rollbackErrors: rollbackErrors.length > 0 ? rollbackErrors : undefined,
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
    } finally {
      this.isRunning = false;
    }
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
