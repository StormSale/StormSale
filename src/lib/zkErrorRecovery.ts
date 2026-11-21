/**
 * Zero-Knowledge Proof Generation Error Recovery and UX Feedback Engine (#467)
 *
 * Implements:
 * 1. Friendly diagnostic error messages for user-facing errors (e.g. invalid whitelist secrets).
 * 2. Circuit timeout recovery with exponential backoff retry scheduling.
 * 3. Structured telemetry event dispatch for unhandled or circuit failure events.
 */

export type ZKProofErrorCode =
  | "INVALID_WHITELIST_SECRET"
  | "CIRCUIT_TIMEOUT"
  | "BROWSER_OUT_OF_MEMORY"
  | "INSUFFICIENT_VOLUME"
  | "UNHANDLED_ERROR";

export interface ZKTelemetryEvent {
  type: "zk_proof_error" | "zk_circuit_timeout" | "zk_proof_retry" | "zk_proof_success";
  errorCode: ZKProofErrorCode;
  message: string;
  attempt: number;
  timestamp: number;
  affiliateAddress?: string;
  circuitId?: string;
  diagnostics?: Record<string, unknown>;
}

export const DEFAULT_INITIAL_BACKOFF_MS = 1000;
export const DEFAULT_MAX_BACKOFF_MS = 30000;
export const DEFAULT_CIRCUIT_TIMEOUT_MS = 5000;

export const EXPECTED_WHITELIST_SECRET_PREFIX = "zk_wh_auth_";

/**
 * Calculates exponential backoff delay for circuit timeout retries.
 * Formula: initialMs * (2 ^ (attempt - 1)), capped at maxMs.
 */
export function calculateCircuitRetryBackoff(
  attempt: number,
  initialMs = DEFAULT_INITIAL_BACKOFF_MS,
  maxMs = DEFAULT_MAX_BACKOFF_MS,
): number {
  if (attempt <= 0) return 0;
  const backoff = initialMs * Math.pow(2, attempt - 1);
  return Math.min(Math.round(backoff), maxMs);
}

/**
 * Maps error codes to user-friendly diagnostic messages.
 */
export function formatZKErrorMessage(code: ZKProofErrorCode, customMessage?: string): string {
  switch (code) {
    case "INVALID_WHITELIST_SECRET":
      return (
        customMessage ||
        "Incorrect whitelist secret. Please verify the secret key provided by your campaign manager and try again."
      );
    case "CIRCUIT_TIMEOUT":
      return (
        customMessage ||
        "ZK proof circuit synthesis timed out. System resources were busy. Click Retry to re-run with exponential backoff."
      );
    case "BROWSER_OUT_OF_MEMORY":
      return (
        customMessage ||
        "Browser memory limit reached during proof generation. Please close other heavy tabs and retry."
      );
    case "INSUFFICIENT_VOLUME":
      return (
        customMessage ||
        "Insufficient verified on-chain revenue volume for the requested tier threshold."
      );
    case "UNHANDLED_ERROR":
    default:
      return (
        customMessage ||
        "An unexpected error occurred during proof generation. Diagnostic telemetry has been dispatched."
      );
  }
}

/**
 * Validates a whitelist secret key format and validity.
 */
export function validateWhitelistSecret(
  secret: string,
  expectedSecret?: string,
): { valid: boolean; error?: string } {
  const trimmed = (secret || "").trim();

  if (!trimmed) {
    return {
      valid: false,
      error: "Whitelist secret is required to access private tier proof generation.",
    };
  }

  if (trimmed.length < 12) {
    return {
      valid: false,
      error: formatZKErrorMessage("INVALID_WHITELIST_SECRET"),
    };
  }

  if (expectedSecret && trimmed !== expectedSecret.trim()) {
    return {
      valid: false,
      error: formatZKErrorMessage("INVALID_WHITELIST_SECRET"),
    };
  }

  return { valid: true };
}

// Telemetry Registry & Global Event Bus
type TelemetryListener = (event: ZKTelemetryEvent) => void;
const telemetryListeners: Set<TelemetryListener> = new Set();
const telemetryHistory: ZKTelemetryEvent[] = [];

/**
 * Dispatches a telemetry event to all active listeners and stores it in history.
 */
export function dispatchZKTelemetryEvent(event: ZKTelemetryEvent): void {
  telemetryHistory.push(event);
  telemetryListeners.forEach((listener) => {
    try {
      listener(event);
    } catch (err) {
      console.warn("Error in ZK telemetry listener:", err);
    }
  });
}

/**
 * Subscribes a listener to ZK telemetry events. Returns an unsubscribe function.
 */
export function addZKTelemetryListener(listener: TelemetryListener): () => void {
  telemetryListeners.add(listener);
  return () => {
    telemetryListeners.delete(listener);
  };
}

/**
 * Clears all telemetry listeners and resets event history (useful for test isolation).
 */
export function clearZKTelemetryRegistry(): void {
  telemetryListeners.clear();
  telemetryHistory.length = 0;
}

/**
 * Returns a copy of the telemetry event history.
 */
export function getZKTelemetryHistory(): ZKTelemetryEvent[] {
  return [...telemetryHistory];
}

export interface ProofGenerationOptions {
  circuitTimeoutMs?: number;
  maxRetries?: number;
  initialBackoffMs?: number;
  maxBackoffMs?: number;
  whitelistSecret?: string;
  expectedSecret?: string;
  circuitRunner?: () => Promise<string>;
  onTelemetry?: (event: ZKTelemetryEvent) => void;
  onStatusChange?: (status: {
    state: "idle" | "generating" | "retrying" | "success" | "error";
    attempt: number;
    delayMs?: number;
    error?: string;
    errorCode?: ZKProofErrorCode;
  }) => void;
}

export interface ProofGenerationExecutionResult {
  success: boolean;
  proofResult?: string;
  attempts: number;
  error?: string;
  errorCode?: ZKProofErrorCode;
}

/**
 * Executes ZK proof generation with circuit timeout detection, exponential backoff retries,
 * and automated telemetry dispatch on unhandled errors.
 */
export async function executeZKProofWithRecovery(
  options: ProofGenerationOptions,
): Promise<ProofGenerationExecutionResult> {
  const {
    circuitTimeoutMs = DEFAULT_CIRCUIT_TIMEOUT_MS,
    maxRetries = 3,
    initialBackoffMs = DEFAULT_INITIAL_BACKOFF_MS,
    maxBackoffMs = DEFAULT_MAX_BACKOFF_MS,
    whitelistSecret,
    expectedSecret,
    circuitRunner,
    onStatusChange,
  } = options;

  // 1. Whitelist secret check
  if (whitelistSecret !== undefined) {
    const secretValidation = validateWhitelistSecret(whitelistSecret, expectedSecret);
    if (!secretValidation.valid) {
      const errorMsg = secretValidation.error!;
      const errorCode: ZKProofErrorCode = "INVALID_WHITELIST_SECRET";

      dispatchZKTelemetryEvent({
        type: "zk_proof_error",
        errorCode,
        message: errorMsg,
        attempt: 0,
        timestamp: Date.now(),
      });

      onStatusChange?.({
        state: "error",
        attempt: 0,
        error: errorMsg,
        errorCode,
      });

      return {
        success: false,
        attempts: 0,
        error: errorMsg,
        errorCode,
      };
    }
  }

  let attempt = 0;

  while (attempt <= maxRetries) {
    attempt++;

    onStatusChange?.({
      state: "generating",
      attempt,
    });

    try {
      // Execute circuit with timeout race
      const proofResult = await Promise.race([
        circuitRunner ? circuitRunner() : Promise.resolve("mock_proof_digest_success"),
        new Promise<never>((_, reject) =>
          setTimeout(() => {
            const timeoutErr = new Error(`Circuit timeout after ${circuitTimeoutMs}ms`);
            (timeoutErr as unknown as { code: string }).code = "CIRCUIT_TIMEOUT";
            reject(timeoutErr);
          }, circuitTimeoutMs),
        ),
      ]);

      dispatchZKTelemetryEvent({
        type: "zk_proof_success",
        errorCode: "UNHANDLED_ERROR", // dummy for success
        message: "Proof generated successfully",
        attempt,
        timestamp: Date.now(),
      });

      onStatusChange?.({
        state: "success",
        attempt,
      });

      return {
        success: true,
        proofResult,
        attempts: attempt,
      };
    } catch (err: unknown) {
      const errorObj = err instanceof Error ? err : new Error(String(err));
      const isTimeout =
        (errorObj as unknown as { code: string }).code === "CIRCUIT_TIMEOUT" ||
        errorObj.message.includes("Circuit timeout");

      if (isTimeout) {
        const backoffDelay = calculateCircuitRetryBackoff(attempt, initialBackoffMs, maxBackoffMs);

        dispatchZKTelemetryEvent({
          type: "zk_circuit_timeout",
          errorCode: "CIRCUIT_TIMEOUT",
          message: errorObj.message,
          attempt,
          timestamp: Date.now(),
          diagnostics: { backoffDelay, circuitTimeoutMs },
        });

        if (attempt <= maxRetries) {
          onStatusChange?.({
            state: "retrying",
            attempt,
            delayMs: backoffDelay,
            error: formatZKErrorMessage("CIRCUIT_TIMEOUT"),
            errorCode: "CIRCUIT_TIMEOUT",
          });

          // Wait exponential backoff before next attempt
          await new Promise((resolve) => setTimeout(resolve, backoffDelay));
          continue;
        } else {
          const finalError = formatZKErrorMessage("CIRCUIT_TIMEOUT");
          onStatusChange?.({
            state: "error",
            attempt,
            error: finalError,
            errorCode: "CIRCUIT_TIMEOUT",
          });

          return {
            success: false,
            attempts: attempt,
            error: finalError,
            errorCode: "CIRCUIT_TIMEOUT",
          };
        }
      }

      // Unhandled error
      const errorCode: ZKProofErrorCode = "UNHANDLED_ERROR";
      const friendlyMessage = formatZKErrorMessage(errorCode);

      dispatchZKTelemetryEvent({
        type: "zk_proof_error",
        errorCode,
        message: errorObj.message,
        attempt,
        timestamp: Date.now(),
        diagnostics: {
          stack: errorObj.stack,
          name: errorObj.name,
        },
      });

      onStatusChange?.({
        state: "error",
        attempt,
        error: friendlyMessage,
        errorCode,
      });

      return {
        success: false,
        attempts: attempt,
        error: friendlyMessage,
        errorCode,
      };
    }
  }

  return {
    success: false,
    attempts: attempt,
    error: "Maximum retries exceeded",
    errorCode: "CIRCUIT_TIMEOUT",
  };
}
