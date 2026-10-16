/**
 * WebAssembly Web Worker for Zero-Knowledge Range Proof Verification.
 * Offloads heavy cryptographic inner-product evaluations and transcript verification
 * to a dedicated background worker thread to ensure the UI never blocks.
 */

import type { WorkerMessageIn, WorkerMessageOut } from "../types/zkRangeProof";
import { verifyRangeProofCore } from "../lib/zkRangeProof";

// Web Worker global scope listener
self.onmessage = async (event: MessageEvent<WorkerMessageIn>) => {
  const { id, type, payload } = event.data;

  if (type === "VERIFY_RANGE_PROOF") {
    try {
      const result = await verifyRangeProofCore(payload, "WebAssembly Worker");
      const response: WorkerMessageOut = {
        id,
        type: "VERIFY_RANGE_PROOF_RESULT",
        result,
      };
      self.postMessage(response);
    } catch (err: unknown) {
      const errorMsg =
        err instanceof Error
          ? err.message
          : typeof err === "string"
            ? err
            : "Unknown error during WebAssembly range proof verification";
      const response: WorkerMessageOut = {
        id,
        type: "VERIFY_RANGE_PROOF_RESULT",
        error: errorMsg,
      };
      self.postMessage(response);
    }
  }
};

export {};
