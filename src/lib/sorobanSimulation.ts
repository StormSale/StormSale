/**
 * Soroban Transaction Simulation & Gas Estimation Error Handler
 * Decodes HostError codes into human-readable messages, validates pre-flight
 * fee reserves, monitors resource fee slippage, and enforces simulation timeouts.
 */

export type SimulationErrorCategory =
  | "BUDGET_EXCEEDED"
  | "INSUFFICIENT_BALANCE"
  | "SLIPPAGE_EXCEEDED"
  | "UNAUTHORIZED"
  | "STORAGE_ERROR"
  | "SIMULATION_TIMEOUT"
  | "HOST_ERROR"
  | "UNKNOWN";

export interface SorobanSimulationErrorDetails {
  code: string;
  rawError: string;
  friendlyMessage: string;
  category: SimulationErrorCategory;
  retryable: boolean;
}

export interface PreflightReserveCheckResult {
  canSubmit: boolean;
  userBalanceXlm: number;
  totalRequiredXlm: number;
  missingXlm: number;
  reason?: string;
}

export interface FeeSlippageEvaluation {
  exceedsSlippage: boolean;
  simulatedFeeXlm: number;
  maxToleranceXlm: number;
  percentageOver: number;
  warning: string | null;
}

export const STROOPS_PER_XLM = 10_000_000;
export const DEFAULT_SIMULATION_TIMEOUT_MS = 10_000; // 10 seconds
export const DEFAULT_STELLAR_BASE_RESERVE_XLM = 1.0; // 1 XLM base account reserve

/**
 * Converts stroops to human-readable XLM number.
 */
export function stroopsToXlmNumber(stroops: number): number {
  return Number((stroops / STROOPS_PER_XLM).toFixed(7));
}

/**
 * Converts XLM number or string to stroops integer.
 */
export function xlmToStroops(xlm: number | string): number {
  const val = typeof xlm === "string" ? parseFloat(xlm) : xlm;
  if (isNaN(val) || val <= 0) return 0;
  return Math.round(val * STROOPS_PER_XLM);
}

/**
 * Parses Soroban simulateTransaction responses, HostErrors, or thrown exceptions
 * and decodes them into human-readable messages with error classification.
 */
export function parseSimulationError(errorInput: unknown): SorobanSimulationErrorDetails {
  let rawMsg: string;

  if (typeof errorInput === "string") {
    rawMsg = errorInput;
  } else if (errorInput && typeof errorInput === "object") {
    const obj = errorInput as Record<string, unknown>;
    if (obj.error) {
      rawMsg = typeof obj.error === "string" ? obj.error : JSON.stringify(obj.error);
    } else if (obj.message && typeof obj.message === "string") {
      rawMsg = obj.message;
    } else if (obj.diagnosticEvents) {
      rawMsg = JSON.stringify(obj.diagnosticEvents);
    } else {
      rawMsg = String(errorInput);
    }
  } else {
    rawMsg = String(errorInput || "Unknown Soroban simulation error");
  }

  const lower = rawMsg.toLowerCase();

  // 1. Simulation Timeout
  if (lower.includes("timeout") || lower.includes("timed out") || lower.includes("abort")) {
    const friendlyMessage = rawMsg.includes("Simulation timed out")
      ? rawMsg
      : "Simulation timed out after 10s. The Soroban network may be congested. Please retry your transaction.";

    return {
      code: "SIMULATION_TIMEOUT",
      rawError: rawMsg,
      category: "SIMULATION_TIMEOUT",
      friendlyMessage,
      retryable: true,
    };
  }

  // 2. Slippage Exceeded
  if (
    lower.includes("slippage") ||
    lower.includes("slippageexceeded") ||
    lower.includes("error(contract, #4)") ||
    lower.includes("error(contract, 4)")
  ) {
    return {
      code: "SLIPPAGE_EXCEEDED",
      rawError: rawMsg,
      category: "SLIPPAGE_EXCEEDED",
      friendlyMessage:
        "Transaction aborted: Price movement or resource fee exceeded your slippage tolerance. Adjust slippage and try again.",
      retryable: true,
    };
  }

  // 3. Insufficient Balance
  if (
    lower.includes("insufficient balance") ||
    lower.includes("balance insufficient") ||
    lower.includes("underfunded") ||
    lower.includes("error(contract, #5)") ||
    lower.includes("error(contract, 5)")
  ) {
    return {
      code: "INSUFFICIENT_BALANCE",
      rawError: rawMsg,
      category: "INSUFFICIENT_BALANCE",
      friendlyMessage:
        "Contract simulation failed: Account has insufficient balance to complete the transfer or escrow deposit.",
      retryable: false,
    };
  }

  // 4. Budget Exceeded (CPU or Memory Compute Limits)
  if (
    lower.includes("budget") ||
    lower.includes("exceeded cpu") ||
    lower.includes("exceeded memory") ||
    lower.includes("cost exceeded") ||
    lower.includes("error(contract, #1)") ||
    lower.includes("error(contract, 1)")
  ) {
    return {
      code: "BUDGET_EXCEEDED",
      rawError: rawMsg,
      category: "BUDGET_EXCEEDED",
      friendlyMessage:
        "Resource limit exceeded: Contract requires more CPU instructions or memory bytes than Soroban protocol permits.",
      retryable: false,
    };
  }

  // 5. Unauthorized / Auth Verification Failure
  if (
    lower.includes("unauthorized") ||
    lower.includes("auth") ||
    lower.includes("invoker is not authorized") ||
    lower.includes("error(contract, #3)") ||
    lower.includes("error(contract, 3)")
  ) {
    return {
      code: "UNAUTHORIZED",
      rawError: rawMsg,
      category: "UNAUTHORIZED",
      friendlyMessage:
        "Invocation rejected: Caller does not possess the requisite contract permissions or signature authorization.",
      retryable: false,
    };
  }

  // 6. Storage Entry / TTL Expired
  if (
    lower.includes("storage") ||
    lower.includes("ttl expired") ||
    lower.includes("entry not found") ||
    lower.includes("error(contract, #2)") ||
    lower.includes("error(contract, 2)")
  ) {
    return {
      code: "STORAGE_ERROR",
      rawError: rawMsg,
      category: "STORAGE_ERROR",
      friendlyMessage:
        "Contract state missing: Target storage entry was archived or does not exist on the current ledger.",
      retryable: false,
    };
  }

  // 7. General HostError
  if (lower.includes("hosterror") || lower.includes("error(contract")) {
    return {
      code: "HOST_ERROR",
      rawError: rawMsg,
      category: "HOST_ERROR",
      friendlyMessage:
        "Contract invocation trapped inside Soroban Host environment. Review contract arguments and state requirements.",
      retryable: false,
    };
  }

  // 8. Generic Fallback
  return {
    code: "UNKNOWN",
    rawError: rawMsg,
    category: "UNKNOWN",
    friendlyMessage: `Simulation failed: ${rawMsg}`,
    retryable: true,
  };
}

/**
 * Pre-flight balance check preventing transaction broadcast if the user's
 * XLM balance is insufficient to cover the network base reserve + resource fees.
 */
export function verifyPreflightFeeReserve(
  userXlmBalance: number | string,
  estimatedResourceFeeStroops: number,
  baseReserveXlm: number = DEFAULT_STELLAR_BASE_RESERVE_XLM,
): PreflightReserveCheckResult {
  const balance = typeof userXlmBalance === "string" ? parseFloat(userXlmBalance) : userXlmBalance;
  const safeBalance = isNaN(balance) || balance < 0 ? 0 : balance;

  const feeXlm = stroopsToXlmNumber(estimatedResourceFeeStroops);
  const totalRequired = Number((baseReserveXlm + feeXlm).toFixed(7));

  if (safeBalance < totalRequired) {
    const missing = Number((totalRequired - safeBalance).toFixed(7));
    return {
      canSubmit: false,
      userBalanceXlm: safeBalance,
      totalRequiredXlm: totalRequired,
      missingXlm: missing,
      reason: `Insufficient XLM reserve: You have ${safeBalance.toFixed(2)} XLM, but ${totalRequired.toFixed(
        4,
      )} XLM is required (${baseReserveXlm.toFixed(1)} XLM base reserve + ${feeXlm.toFixed(
        4,
      )} XLM resource fee). Please add at least ${missing.toFixed(4)} XLM.`,
    };
  }

  return {
    canSubmit: true,
    userBalanceXlm: safeBalance,
    totalRequiredXlm: totalRequired,
    missingXlm: 0,
  };
}

/**
 * Evaluates whether simulated transaction resource fees exceed user's slippage tolerance.
 * Generates clear UI warning feedback when exceeded.
 */
export function evaluateResourceFeeSlippage(
  simulatedFeeStroops: number,
  maxFeeToleranceStroops: number,
): FeeSlippageEvaluation {
  const simulatedXlm = stroopsToXlmNumber(simulatedFeeStroops);
  const maxToleranceXlm = stroopsToXlmNumber(maxFeeToleranceStroops);

  if (simulatedFeeStroops > maxFeeToleranceStroops && maxFeeToleranceStroops > 0) {
    const diff = simulatedFeeStroops - maxFeeToleranceStroops;
    const percentageOver = Number(((diff / maxFeeToleranceStroops) * 100).toFixed(1));

    return {
      exceedsSlippage: true,
      simulatedFeeXlm: simulatedXlm,
      maxToleranceXlm: maxToleranceXlm,
      percentageOver,
      warning: `Transaction resource fee (${simulatedXlm} XLM) exceeds your maximum slippage tolerance (${maxToleranceXlm} XLM) by ${percentageOver}%. You may incur higher execution costs.`,
    };
  }

  return {
    exceedsSlippage: false,
    simulatedFeeXlm: simulatedXlm,
    maxToleranceXlm: maxToleranceXlm,
    percentageOver: 0,
    warning: null,
  };
}

/**
 * Executes a Soroban simulation with a strict timeout (defaults to 10 seconds).
 * Aborts gracefully with retry prompt if the timeout is reached.
 */
export async function simulateWithTimeout<T>(
  simulationFn: () => Promise<T>,
  timeoutMs: number = DEFAULT_SIMULATION_TIMEOUT_MS,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      const err = new Error(
        `Simulation timed out after ${Math.round(timeoutMs / 1000)}s. The Soroban network may be congested. Please retry your transaction.`,
      ) as Error & { code?: string };
      err.code = "SIMULATION_TIMEOUT";
      reject(err);
    }, timeoutMs);
  });

  try {
    return await Promise.race([simulationFn(), timeoutPromise]);
  } catch (err: unknown) {
    const parsed = parseSimulationError(err);
    throw new Error(parsed.friendlyMessage, { cause: err });
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}
