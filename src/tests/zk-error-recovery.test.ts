import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";
import {
  calculateCircuitRetryBackoff,
  validateWhitelistSecret,
  dispatchZKTelemetryEvent,
  addZKTelemetryListener,
  clearZKTelemetryRegistry,
  getZKTelemetryHistory,
  executeZKProofWithRecovery,
  type ZKTelemetryEvent,
} from "../lib/zkErrorRecovery";
import { ZKErrorRecoveryCard } from "../components/affiliate/ZKErrorRecoveryCard";

describe("Zero-Knowledge Proof Generation Error Recovery and UX Feedback (#467)", () => {
  beforeEach(() => {
    clearZKTelemetryRegistry();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    clearZKTelemetryRegistry();
  });

  describe("1. Friendly Error Display for Incorrect Whitelist Secret", () => {
    it("validates whitelist secret and produces user-friendly error message on incorrect input", () => {
      // Empty input
      const emptyResult = validateWhitelistSecret("");
      expect(emptyResult.valid).toBe(false);
      expect(emptyResult.error).toContain("Whitelist secret is required");

      // Too short / malformed input
      const shortResult = validateWhitelistSecret("short_sec");
      expect(shortResult.valid).toBe(false);
      expect(shortResult.error).toBe(
        "Incorrect whitelist secret. Please verify the secret key provided by your campaign manager and try again.",
      );

      // Mismatched expected secret
      const mismatchResult = validateWhitelistSecret(
        "mock_mismatched_auth_code",
        "mock_authorized_auth_code",
      );
      expect(mismatchResult.valid).toBe(false);
      expect(mismatchResult.error).toBe(
        "Incorrect whitelist secret. Please verify the secret key provided by your campaign manager and try again.",
      );

      // Correct secret
      const validResult = validateWhitelistSecret(
        "mock_authorized_auth_code",
        "mock_authorized_auth_code",
      );
      expect(validResult.valid).toBe(true);
      expect(validResult.error).toBeUndefined();
    });

    it("renders friendly error card in UI when user provides incorrect whitelist secret", () => {
      const html = renderToString(
        React.createElement(ZKErrorRecoveryCard, {
          errorCode: "INVALID_WHITELIST_SECRET",
          errorMessage:
            "Incorrect whitelist secret. Please verify the secret key provided by your campaign manager and try again.",
        }),
      );

      expect(html).toContain("Invalid Access Credentials");
      expect(html).toContain("Incorrect whitelist secret");
      expect(html).toContain("Please verify the secret key provided by your campaign manager");
      expect(html).toContain("Verify Secret");
    });

    it("halts execution and emits friendly error when invalid whitelist secret is provided to runner", async () => {
      const runner = vi.fn().mockResolvedValue("proof_success");

      const result = await executeZKProofWithRecovery({
        whitelistSecret: "mismatched_test_code",
        expectedSecret: "authorized_test_code",
        circuitRunner: runner,
      });

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe("INVALID_WHITELIST_SECRET");
      expect(result.error).toContain("Incorrect whitelist secret");
      // Circuit runner should never be invoked when secret validation fails
      expect(runner).not.toHaveBeenCalled();

      // Telemetry event must be dispatched
      const history = getZKTelemetryHistory();
      expect(history).toHaveLength(1);
      expect(history[0].type).toBe("zk_proof_error");
      expect(history[0].errorCode).toBe("INVALID_WHITELIST_SECRET");
    });
  });

  describe("2. Retry Button with Exponential Backoff on Circuit Timeout", () => {
    it("calculates exponential backoff delays with an upper cap", () => {
      // Attempt 0 = 0ms
      expect(calculateCircuitRetryBackoff(0, 1000, 30000)).toBe(0);

      // Attempt 1 = 1000 * 2^0 = 1,000ms (1s)
      expect(calculateCircuitRetryBackoff(1, 1000, 30000)).toBe(1000);

      // Attempt 2 = 1000 * 2^1 = 2,000ms (2s)
      expect(calculateCircuitRetryBackoff(2, 1000, 30000)).toBe(2000);

      // Attempt 3 = 1000 * 2^2 = 4,000ms (4s)
      expect(calculateCircuitRetryBackoff(3, 1000, 30000)).toBe(4000);

      // Attempt 4 = 1000 * 2^3 = 8,000ms (8s)
      expect(calculateCircuitRetryBackoff(4, 1000, 30000)).toBe(8000);

      // Attempt 5 = 1000 * 2^4 = 16,000ms (16s)
      expect(calculateCircuitRetryBackoff(5, 1000, 30000)).toBe(16000);

      // Attempt 6 = 1000 * 2^5 = 32,000ms -> capped at 30,000ms (30s)
      expect(calculateCircuitRetryBackoff(6, 1000, 30000)).toBe(30000);

      // Attempt 10 -> capped at 30,000ms
      expect(calculateCircuitRetryBackoff(10, 1000, 30000)).toBe(30000);
    });

    it("renders Retry button with exponential backoff indicator in UI", () => {
      const html = renderToString(
        React.createElement(ZKErrorRecoveryCard, {
          errorCode: "CIRCUIT_TIMEOUT",
          attemptCount: 2,
        }),
      );

      expect(html).toContain("Proof Circuit Timeout");
      expect(html).toContain("Attempt 2");
      // For attempt 2, next attempt is 3: delay = 1000 * 2^2 = 4000ms = 4s
      expect(html).toContain("Exponential backoff delay:");
      expect(html).toContain("Retry in 4s");
    });

    it("retries circuit with exponential backoff before succeeding", async () => {
      let callCount = 0;
      const runner = vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount < 2) {
          // Simulate timeout on first call
          const err = new Error("Circuit simulation timed out");
          (err as unknown as { code: string }).code = "CIRCUIT_TIMEOUT";
          return Promise.reject(err);
        }
        return Promise.resolve("proof_success_after_retry");
      });

      const statusChanges: string[] = [];

      const result = await executeZKProofWithRecovery({
        circuitTimeoutMs: 50,
        initialBackoffMs: 10, // Small delay for fast test execution
        maxBackoffMs: 50,
        maxRetries: 3,
        circuitRunner: runner,
        onStatusChange: (status) => {
          statusChanges.push(status.state);
        },
      });

      expect(result.success).toBe(true);
      expect(result.attempts).toBe(2);
      expect(result.proofResult).toBe("proof_success_after_retry");
      expect(statusChanges).toContain("retrying");
      expect(statusChanges).toContain("success");

      // Verify telemetry recorded the circuit timeout and subsequent success
      const history = getZKTelemetryHistory();
      expect(history.some((e) => e.type === "zk_circuit_timeout")).toBe(true);
      expect(history.some((e) => e.type === "zk_proof_success")).toBe(true);
    });
  });

  describe("3. Telemetry Event Dispatch for Unhandled Errors", () => {
    it("dispatches structured telemetry events and notifies registered listeners", () => {
      const receivedEvents: ZKTelemetryEvent[] = [];
      const unsubscribe = addZKTelemetryListener((e) => receivedEvents.push(e));

      const unhandledEvent: ZKTelemetryEvent = {
        type: "zk_proof_error",
        errorCode: "UNHANDLED_ERROR",
        message: "Wasm memory buffer allocation failure (OOM)",
        attempt: 1,
        timestamp: Date.now(),
        circuitId: "groth16_batch_v2",
        diagnostics: { memoryUsageMb: 2048, platform: "browser" },
      };

      dispatchZKTelemetryEvent(unhandledEvent);

      expect(receivedEvents).toHaveLength(1);
      expect(receivedEvents[0].errorCode).toBe("UNHANDLED_ERROR");
      expect(receivedEvents[0].message).toContain("allocation failure");
      expect(receivedEvents[0].diagnostics?.memoryUsageMb).toBe(2048);

      // Verify unsubscribe works
      unsubscribe();
      dispatchZKTelemetryEvent({
        type: "zk_proof_error",
        errorCode: "CIRCUIT_TIMEOUT",
        message: "Another timeout",
        attempt: 2,
        timestamp: Date.now(),
      });

      // Listener shouldn't receive subsequent events
      expect(receivedEvents).toHaveLength(1);
    });

    it("captures unhandled exception in runner, dispatches telemetry, and provides friendly error to UI", async () => {
      const runner = vi.fn().mockRejectedValue(new Error("Fatal WebAssembly runtime trap"));

      const telemetryEvents: ZKTelemetryEvent[] = [];
      addZKTelemetryListener((e) => telemetryEvents.push(e));

      const result = await executeZKProofWithRecovery({
        circuitRunner: runner,
      });

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe("UNHANDLED_ERROR");
      expect(result.error).toContain("unexpected error occurred during proof generation");

      // Telemetry was dispatched
      expect(telemetryEvents).toHaveLength(1);
      expect(telemetryEvents[0].errorCode).toBe("UNHANDLED_ERROR");
      expect(telemetryEvents[0].message).toBe("Fatal WebAssembly runtime trap");
      expect(telemetryEvents[0].diagnostics).toBeDefined();
    });
  });
});
