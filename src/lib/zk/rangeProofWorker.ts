/**
 * WebAssembly Web Worker for Zero-Knowledge Range Proof Verification (Issue #175)
 *
 * Runs Bulletproofs verification off the main browser UI thread to prevent
 * any UI lag, ensuring sub-500ms client-side verification performance.
 */

import { verifyRangeProofWasm } from "./bulletproofWasm";
import type {
  ConversionLedgerMetadata,
  VerificationResult,
  ZKWorkerRequest,
  ZKWorkerResponse,
} from "./types";

/**
 * Worker message handler
 */
self.onmessage = async (event: MessageEvent<ZKWorkerRequest>) => {
  const { id, type, metadata, expectedBudgetMin, expectedBudgetMax } = event.data;

  try {
    if (type === "VERIFY_RANGE_PROOF") {
      const singleMeta = metadata as ConversionLedgerMetadata;
      const startTime = performance.now();

      const verification = await verifyRangeProofWasm(singleMeta.rangeProof, {
        expectedBudgetMin,
        expectedBudgetMax,
      });

      // Enhance with ledger metadata verification
      const ledgerValid = Boolean(
        singleMeta.txHash &&
        singleMeta.txHash.length >= 32 &&
        singleMeta.ledgerSequence > 0 &&
        singleMeta.campaignAddress.startsWith("C"),
      );

      const endTime = performance.now();
      const totalTimeMs = Math.max(0.1, Number((endTime - startTime).toFixed(2)));

      const finalResult: VerificationResult = {
        ...verification,
        valid: verification.valid && ledgerValid,
        verificationTimeMs: totalTimeMs,
        meetsPerformanceTarget: totalTimeMs < 500,
        ledgerVerified: ledgerValid,
        diagnostics: {
          ...verification.diagnostics,
          ledgerSequence: singleMeta.ledgerSequence,
          txHash: singleMeta.txHash,
          workerThread: true,
        },
      };

      const response: ZKWorkerResponse = {
        id,
        type: "VERIFICATION_SUCCESS",
        result: finalResult,
        executionTimeMs: totalTimeMs,
      };

      self.postMessage(response);
    } else if (type === "BATCH_VERIFY_RANGE_PROOFS") {
      const metas = metadata as ConversionLedgerMetadata[];
      const startTime = performance.now();

      const results: VerificationResult[] = [];
      for (const meta of metas) {
        const v = await verifyRangeProofWasm(meta.rangeProof, {
          expectedBudgetMin,
          expectedBudgetMax,
        });
        const ledgerValid = Boolean(meta.ledgerSequence > 0 && meta.txHash);
        results.push({
          ...v,
          valid: v.valid && ledgerValid,
          ledgerVerified: ledgerValid,
          diagnostics: {
            ...v.diagnostics,
            ledgerSequence: meta.ledgerSequence,
            txHash: meta.txHash,
            workerThread: true,
          },
        });
      }

      const totalTimeMs = Math.max(0.1, Number((performance.now() - startTime).toFixed(2)));
      const response: ZKWorkerResponse = {
        id,
        type: "VERIFICATION_SUCCESS",
        result: results,
        executionTimeMs: totalTimeMs,
      };

      self.postMessage(response);
    }
  } catch (error: unknown) {
    const errorMsg = error instanceof Error ? error.message : "Internal worker verification error";
    const response: ZKWorkerResponse = {
      id,
      type: "VERIFICATION_ERROR",
      error: errorMsg,
    };
    self.postMessage(response);
  }
};
