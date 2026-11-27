import { describe, it, expect, vi } from "vitest";
import {
  parseSimulationError,
  verifyPreflightFeeReserve,
  evaluateResourceFeeSlippage,
  simulateWithTimeout,
  stroopsToXlmNumber,
  xlmToStroops,
} from "../lib/sorobanSimulation";

describe("Soroban Simulation & Gas Estimation Error Handling Suite (#422)", () => {
  // =========================================================================
  // 1. Simulation Response Parser Decoding Soroban Error Codes
  // =========================================================================
  describe("1. Simulation Response Parser & Error Decoding", () => {
    it("decodes BudgetExceeded / Error(Contract, #1) into compute limit guidance", () => {
      const err = parseSimulationError("HostError: Error(Contract, #1)");
      expect(err.code).toBe("BUDGET_EXCEEDED");
      expect(err.category).toBe("BUDGET_EXCEEDED");
      expect(err.friendlyMessage).toContain("Resource limit exceeded");
      expect(err.friendlyMessage).toContain("CPU instructions or memory");
      expect(err.retryable).toBe(false);
    });

    it("decodes StorageError / Error(Contract, #2) into archived state guidance", () => {
      const err = parseSimulationError({
        error: "HostError: Error(Contract, #2) - Entry not found in storage",
      });
      expect(err.code).toBe("STORAGE_ERROR");
      expect(err.category).toBe("STORAGE_ERROR");
      expect(err.friendlyMessage).toContain("Contract state missing");
      expect(err.friendlyMessage).toContain("storage entry was archived");
    });

    it("decodes Unauthorized / Error(Contract, #3) into permission guidance", () => {
      const err = parseSimulationError(
        "HostError: Error(Contract, #3) - invoker is not authorized",
      );
      expect(err.code).toBe("UNAUTHORIZED");
      expect(err.category).toBe("UNAUTHORIZED");
      expect(err.friendlyMessage).toContain("Invocation rejected");
      expect(err.friendlyMessage).toContain("contract permissions or signature authorization");
      expect(err.retryable).toBe(false);
    });

    it("decodes SlippageExceeded / Error(Contract, #4) into retryable slippage guidance", () => {
      const err = parseSimulationError("HostError: Error(Contract, #4) - SlippageExceeded");
      expect(err.code).toBe("SLIPPAGE_EXCEEDED");
      expect(err.category).toBe("SLIPPAGE_EXCEEDED");
      expect(err.friendlyMessage).toContain("Transaction aborted");
      expect(err.friendlyMessage).toContain("slippage tolerance");
      expect(err.retryable).toBe(true);
    });

    it("decodes InsufficientBalance / Error(Contract, #5) into token balance guidance", () => {
      const err = parseSimulationError({
        message: "Error(Contract, #5): underfunded contract token balance",
      });
      expect(err.code).toBe("INSUFFICIENT_BALANCE");
      expect(err.category).toBe("INSUFFICIENT_BALANCE");
      expect(err.friendlyMessage).toContain("Account has insufficient balance");
      expect(err.retryable).toBe(false);
    });

    it("decodes general Soroban HostError traps with helpful troubleshooting prompt", () => {
      const err = parseSimulationError("HostError: Transaction simulation trapped");
      expect(err.code).toBe("HOST_ERROR");
      expect(err.category).toBe("HOST_ERROR");
      expect(err.friendlyMessage).toContain("Contract invocation trapped inside Soroban Host");
    });

    it("handles parsing unexpected simulation errors with fallback", () => {
      const err = parseSimulationError(new Error("RPC socket disconnected unexpectedly"));
      expect(err.code).toBe("UNKNOWN");
      expect(err.category).toBe("UNKNOWN");
      expect(err.friendlyMessage).toContain("Simulation failed");
      expect(err.retryable).toBe(true);
    });
  });

  // =========================================================================
  // 2. Pre-flight Balance Check (XLM Fee Reserve Verification)
  // =========================================================================
  describe("2. Pre-Flight Fee Reserve Verification", () => {
    it("prevents transaction submission when user balance is insufficient to cover base reserve + fee", () => {
      // User has 0.8 XLM; Base reserve is 1.0 XLM + Estimated fee is 0.05 XLM (500,000 stroops)
      // Total required = 1.05 XLM -> Missing = 0.25 XLM
      const result = verifyPreflightFeeReserve(0.8, 500_000, 1.0);

      expect(result.canSubmit).toBe(false);
      expect(result.userBalanceXlm).toBe(0.8);
      expect(result.totalRequiredXlm).toBe(1.05);
      expect(result.missingXlm).toBe(0.25);
      expect(result.reason).toContain("Insufficient XLM reserve");
      expect(result.reason).toContain("Please add at least 0.2500 XLM");
    });

    it("permits transaction submission when user balance comfortably satisfies reserve requirements", () => {
      // User has 50.0 XLM; Base reserve = 1.0 XLM + Estimated fee = 0.01 XLM (100,000 stroops)
      const result = verifyPreflightFeeReserve("50.00", 100_000, 1.0);

      expect(result.canSubmit).toBe(true);
      expect(result.missingXlm).toBe(0);
      expect(result.reason).toBeUndefined();
    });

    it("handles zero or invalid user balances safely", () => {
      const result = verifyPreflightFeeReserve("invalid_balance", 200_000, 1.0);

      expect(result.canSubmit).toBe(false);
      expect(result.userBalanceXlm).toBe(0);
      expect(result.missingXlm).toBe(1.02);
    });
  });

  // =========================================================================
  // 3. UI Warning Display for Resource Fee Slippage
  // =========================================================================
  describe("3. Resource Fee Slippage Tolerance Evaluation", () => {
    it("generates UI warning when simulated resource fees exceed user's slippage tolerance", () => {
      // Simulated fee: 150,000 stroops (0.015 XLM)
      // Max tolerance: 100,000 stroops (0.010 XLM) -> 50% over tolerance
      const evaluation = evaluateResourceFeeSlippage(150_000, 100_000);

      expect(evaluation.exceedsSlippage).toBe(true);
      expect(evaluation.simulatedFeeXlm).toBe(0.015);
      expect(evaluation.maxToleranceXlm).toBe(0.01);
      expect(evaluation.percentageOver).toBe(50.0);
      expect(evaluation.warning).toContain("exceeds your maximum slippage tolerance");
      expect(evaluation.warning).toContain("by 50%");
    });

    it("does not generate warning when simulated resource fees are within slippage tolerance", () => {
      // Simulated fee: 80,000 stroops (0.008 XLM); Max tolerance: 100,000 stroops (0.010 XLM)
      const evaluation = evaluateResourceFeeSlippage(80_000, 100_000);

      expect(evaluation.exceedsSlippage).toBe(false);
      expect(evaluation.percentageOver).toBe(0);
      expect(evaluation.warning).toBeNull();
    });

    it("converts between stroops and XLM accurately", () => {
      expect(stroopsToXlmNumber(10_000_000)).toBe(1.0);
      expect(stroopsToXlmNumber(500_000)).toBe(0.05);
      expect(xlmToStroops(1.5)).toBe(15_000_000);
      expect(xlmToStroops("0.02")).toBe(200_000);
    });
  });

  // =========================================================================
  // 4. Simulation Timeout (10s) Graceful Abort & Retry Prompt
  // =========================================================================
  describe("4. Simulation Timeout Graceful Abort & Retry", () => {
    it("aborts simulation gracefully when execution exceeds configured timeout", async () => {
      // Simulate hanging simulation function exceeding 50ms test timeout
      const hangingSimulation = () =>
        new Promise<string>((resolve) => setTimeout(() => resolve("late_result"), 200));

      await expect(simulateWithTimeout(hangingSimulation, 50)).rejects.toThrow(
        "Simulation timed out after 0s. The Soroban network may be congested. Please retry your transaction.",
      );
    });

    it("resolves successfully when simulation completes within timeout limit", async () => {
      const fastSimulation = vi.fn().mockResolvedValue({
        minResourceFee: 100_000,
        cost: { cpuInsns: 125000, memBytes: 4096 },
      });

      const result = await simulateWithTimeout(fastSimulation, 1000);
      expect(result.minResourceFee).toBe(100_000);
      expect(fastSimulation).toHaveBeenCalled();
    });

    it("translates internal simulation error thrown by simulationFn cleanly", async () => {
      const failingSimulation = vi
        .fn()
        .mockRejectedValue(new Error("HostError: Error(Contract, #4) - SlippageExceeded"));

      await expect(simulateWithTimeout(failingSimulation, 1000)).rejects.toThrow(
        "Transaction aborted: Price movement or resource fee exceeded your slippage tolerance. Adjust slippage and try again.",
      );
    });
  });
});
