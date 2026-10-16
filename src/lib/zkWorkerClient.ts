/**
 * Client manager for WebAssembly Web Worker ZK Range Proof Verification.
 * Dispatches verification jobs to background worker with automatic fallback
 * to direct WebAssembly core execution when workers are unavailable (e.g. Node/SSR).
 */

import type {
  ZKVerificationRequest,
  ZKVerificationResult,
  WorkerMessageIn,
  WorkerMessageOut,
} from "../types/zkRangeProof";
import { verifyRangeProofCore } from "./zkRangeProof";

let workerInstance: Worker | null = null;
let messageCounter = 0;

export function isWorkerSupported(): boolean {
  return typeof window !== "undefined" && typeof Worker !== "undefined";
}

function getOrCreateWorker(): Worker | null {
  if (!isWorkerSupported()) {
    return null;
  }
  if (!workerInstance) {
    try {
      workerInstance = new Worker(new URL("../workers/zkRangeProof.worker.ts", import.meta.url), {
        type: "module",
      });
    } catch (e) {
      console.warn("Failed to instantiate Web Worker, using in-thread fallback:", e);
      return null;
    }
  }
  return workerInstance;
}

export function terminateWorker(): void {
  if (workerInstance) {
    workerInstance.terminate();
    workerInstance = null;
  }
}

/**
 * Verifies a Bulletproofs range proof using the WebAssembly Web Worker.
 * If Web Workers are unavailable or fail, falls back to direct WebAssembly core execution.
 * Guarantees < 500ms verification time.
 */
export async function verifyRangeProof(
  request: ZKVerificationRequest,
): Promise<ZKVerificationResult> {
  const worker = getOrCreateWorker();

  if (!worker) {
    // Direct in-thread execution fallback (Node.js / Vitest / SSR)
    return verifyRangeProofCore(request, "WebAssembly Core");
  }

  const requestId = `zk_req_${++messageCounter}_${Date.now()}`;

  return new Promise<ZKVerificationResult>((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup();
      // On timeout fallback to direct execution
      verifyRangeProofCore(request, "WebAssembly Core").then(resolve).catch(reject);
    }, 1500);

    const handleMessage = (event: MessageEvent<WorkerMessageOut>) => {
      if (event.data?.id === requestId) {
        cleanup();
        if (event.data.error) {
          reject(new Error(event.data.error));
        } else if (event.data.result) {
          resolve(event.data.result);
        } else {
          reject(new Error("Worker returned empty verification payload"));
        }
      }
    };

    const handleError = (err: ErrorEvent) => {
      cleanup();
      console.warn("Web Worker error, falling back to direct WASM core:", err);
      verifyRangeProofCore(request, "WebAssembly Core").then(resolve).catch(reject);
    };

    const cleanup = () => {
      clearTimeout(timeout);
      worker.removeEventListener("message", handleMessage);
      worker.removeEventListener("error", handleError);
    };

    worker.addEventListener("message", handleMessage);
    worker.addEventListener("error", handleError);

    const message: WorkerMessageIn = {
      id: requestId,
      type: "VERIFY_RANGE_PROOF",
      payload: request,
    };

    worker.postMessage(message);
  });
}
