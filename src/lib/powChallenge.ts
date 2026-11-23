/**
 * Proof-of-Work (PoW) Client Challenge for Abnormal Traffic Mitigation (#477)
 *
 * Implements Hashcash-style SHA-256 client challenge to throttle automated bot traffic
 * and abnormal referral surges before permitting transaction submission.
 */

export interface PoWChallenge {
  id: string;
  prefix: string;
  difficulty: number; // Number of leading hex zeroes required (e.g., 2, 3, or 4)
  createdAt: number;
  expiresAt: number;
  timeoutMs: number;
  solved: boolean;
}

export interface PoWProof {
  challengeId: string;
  nonce: number;
  hash: string;
  elapsedMs: number;
}

export interface PoWVerificationResult {
  valid: boolean;
  reason?: string;
}

// In-memory single-use nonce / challenge registry to prevent replay attacks
const consumedNonces = new Set<string>();

/**
 * Reset nonce tracker (primarily for test isolation)
 */
export function resetPoWNonceTracker(): void {
  consumedNonces.clear();
}

/**
 * Checks and marks a challenge nonce as consumed.
 * Returns true if the nonce is fresh and single-use, false if replayed.
 */
export function consumePoWNonce(challengeId: string, nonce: number | string): boolean {
  const key = `${challengeId}:${nonce}`;
  if (consumedNonces.has(key)) {
    return false;
  }
  consumedNonces.add(key);
  return true;
}

/**
 * Pure JS SHA-256 implementation ensuring deterministic hash calculation
 * across Node.js, Web Workers, and browser DOM environments.
 */
export function sha256Sync(ascii: string): string {
  function rightRotate(value: number, amount: number): number {
    return (value >>> amount) | (value << (32 - amount));
  }

  const mathPow = Math.pow;
  const maxWord = mathPow(2, 32);
  const lengthProperty = "length";
  let i: number;
  let j: number;

  const words: number[] = [];
  const asciiBitLength = ascii[lengthProperty] * 8;

  const hash: number[] = [];
  const k: number[] = [];
  let primeCounter = 0;

  const isComposite: Record<number, boolean> = {};
  for (let candidate = 2; primeCounter < 64; candidate++) {
    if (!isComposite[candidate]) {
      for (i = 0; i < 300; i += candidate) {
        isComposite[i] = true;
      }
      hash[primeCounter] = (mathPow(candidate, 0.5) * maxWord) | 0;
      k[primeCounter++] = (mathPow(candidate, 1 / 3) * maxWord) | 0;
    }
  }

  ascii += "\x80";
  while ((ascii[lengthProperty] % 64) - 56) ascii += "\x00";
  for (i = 0; i < ascii[lengthProperty]; i++) {
    j = ascii.charCodeAt(i);
    if (j >> 8) return ""; // Non-ASCII
    words[i >> 2] |= j << (((3 - i) % 4) * 8);
  }
  words[words[lengthProperty]] = (asciiBitLength / maxWord) | 0;
  words[words[lengthProperty]] = asciiBitLength | 0;

  for (j = 0; j < words[lengthProperty]; ) {
    const w = words.slice(j, (j += 16));
    const oldHash = hash.slice(0);

    for (i = 0; i < 64; i++) {
      const s0 =
        i < 16
          ? w[i]
          : (w[i] =
              ((rightRotate(w[i - 2], 17) ^ rightRotate(w[i - 2], 19) ^ (w[i - 2] >>> 10)) +
                w[i - 7] +
                (rightRotate(w[i - 15], 7) ^ rightRotate(w[i - 15], 18) ^ (w[i - 15] >>> 3)) +
                w[i - 16]) |
              0);

      const s1 = rightRotate(oldHash[0], 2) ^ rightRotate(oldHash[0], 13) ^ rightRotate(oldHash[0], 22);
      const ch = (oldHash[0] & oldHash[1]) ^ (~oldHash[0] & oldHash[2]);
      const temp1 = (oldHash[7] + (rightRotate(oldHash[4], 6) ^ rightRotate(oldHash[4], 11) ^ rightRotate(oldHash[4], 25)) + ((oldHash[4] & oldHash[5]) ^ (~oldHash[4] & oldHash[6])) + k[i] + s0) | 0;
      const temp2 = (s1 + ch) | 0;

      oldHash[7] = oldHash[6];
      oldHash[6] = oldHash[5];
      oldHash[5] = oldHash[4];
      oldHash[4] = (oldHash[3] + temp1) | 0;
      oldHash[3] = oldHash[2];
      oldHash[2] = oldHash[1];
      oldHash[1] = oldHash[0];
      oldHash[0] = (temp1 + temp2) | 0;
    }

    for (i = 0; i < 8; i++) {
      hash[i] = (hash[i] + oldHash[i]) | 0;
    }
  }

  let result = "";
  for (i = 0; i < 8; i++) {
    for (let b = 3; b >= 0; b--) {
      const byte = (hash[i] >> (b * 8)) & 255;
      result += (byte < 16 ? "0" : "") + byte.toString(16);
    }
  }
  return result;
}

/**
 * Creates a new PoW challenge with a 15-second default validity window.
 */
export function createPoWChallenge(options: {
  difficulty?: number;
  timeoutMs?: number;
  prefix?: string;
} = {}): PoWChallenge {
  const difficulty = options.difficulty ?? 3;
  const timeoutMs = options.timeoutMs ?? 15000;
  const now = Date.now();
  const id = `pow_${now}_${Math.random().toString(36).substring(2, 9)}`;
  const prefix = options.prefix ?? `stormsale_${Math.random().toString(36).substring(2, 10)}`;

  return {
    id,
    prefix,
    difficulty,
    createdAt: now,
    expiresAt: now + timeoutMs,
    timeoutMs,
    solved: false,
  };
}

/**
 * Verifies that a PoW proof satisfies the challenge requirements:
 * 1. Matches challenge ID
 * 2. Generated before challenge expiration (<= 15s)
 * 3. SHA-256(prefix + ":" + nonce) matches proof hash
 * 4. Proof hash begins with N leading zeroes
 */
export function verifyPoWProof(
  challenge: PoWChallenge,
  proof: { nonce: number; hash: string; challengeId?: string }
): PoWVerificationResult {
  if (proof.challengeId && proof.challengeId !== challenge.id) {
    return { valid: false, reason: "Challenge ID mismatch" };
  }

  if (Date.now() > challenge.expiresAt) {
    return { valid: false, reason: "Challenge expired" };
  }

  const expectedHash = sha256Sync(`${challenge.prefix}:${proof.nonce}`);
  if (expectedHash !== proof.hash) {
    return { valid: false, reason: "Computed hash does not match expected SHA-256 digest" };
  }

  const targetPrefix = "0".repeat(challenge.difficulty);
  if (!proof.hash.startsWith(targetPrefix)) {
    return { valid: false, reason: `Hash does not meet difficulty requirement (${challenge.difficulty} zeroes)` };
  }

  return { valid: true };
}

/**
 * Solves a PoW challenge synchronously or in chunked loop.
 */
export function solvePoWChallenge(
  challenge: PoWChallenge,
  options: { maxIterations?: number; signal?: AbortSignal } = {}
): Promise<PoWProof> {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    const targetPrefix = "0".repeat(challenge.difficulty);
    const maxIterations = options.maxIterations ?? 1_000_000;
    let nonce = 0;

    const checkTimeout = () => {
      if (Date.now() > challenge.expiresAt) {
        reject(new Error("PoW challenge timed out"));
        return true;
      }
      if (options.signal?.aborted) {
        reject(new Error("PoW challenge aborted"));
        return true;
      }
      return false;
    };

    function processBatch() {
      if (checkTimeout()) return;

      const batchLimit = Math.min(nonce + 5000, maxIterations);
      while (nonce < batchLimit) {
        const hash = sha256Sync(`${challenge.prefix}:${nonce}`);
        if (hash.startsWith(targetPrefix)) {
          resolve({
            challengeId: challenge.id,
            nonce,
            hash,
            elapsedMs: Date.now() - startTime,
          });
          return;
        }
        nonce++;
      }

      if (nonce >= maxIterations) {
        reject(new Error("PoW max iterations exceeded"));
        return;
      }

      if (typeof setTimeout !== "undefined") {
        setTimeout(processBatch, 0);
      } else {
        processBatch();
      }
    }

    processBatch();
  });
}

/**
 * Web Worker solver script string
 */
export const WORKER_SOLVER_SCRIPT = `
${sha256Sync.toString()}

self.onmessage = function(e) {
  const { challenge } = e.data;
  const targetPrefix = "0".repeat(challenge.difficulty);
  const startTime = Date.now();
  let nonce = 0;

  while (true) {
    if (Date.now() > challenge.expiresAt) {
      self.postMessage({ type: "TIMEOUT", error: "PoW challenge timed out" });
      return;
    }
    const hash = sha256Sync(challenge.prefix + ":" + nonce);
    if (hash.startsWith(targetPrefix)) {
      self.postMessage({
        type: "SOLVED",
        proof: {
          challengeId: challenge.id,
          nonce: nonce,
          hash: hash,
          elapsedMs: Date.now() - startTime
        }
      });
      return;
    }
    nonce++;
  }
};
`;

/**
 * Solves the PoW challenge in a Web Worker to ensure UI thread remains responsive.
 * Gracefully falls back to asynchronous solver when Web Workers are unavailable.
 */
export function solvePoWChallengeInWorker(
  challenge: PoWChallenge,
  options: { timeoutMs?: number; signal?: AbortSignal } = {}
): Promise<PoWProof> {
  const timeoutMs = options.timeoutMs ?? challenge.timeoutMs;

  return new Promise((resolve, reject) => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    let worker: Worker | null = null;
    let blobUrl: string | null = null;

    const cleanup = () => {
      if (timer) clearTimeout(timer);
      if (worker) {
        try {
          worker.terminate();
        } catch {
          // ignore termination errors
        }
      }
      if (blobUrl && typeof URL !== "undefined" && URL.revokeObjectURL) {
        try {
          URL.revokeObjectURL(blobUrl);
        } catch {
          // ignore
        }
      }
    };

    timer = setTimeout(() => {
      cleanup();
      reject(new Error("PoW challenge timed out"));
    }, timeoutMs);

    if (options.signal) {
      options.signal.addEventListener("abort", () => {
        cleanup();
        reject(new Error("PoW challenge aborted"));
      });
    }

    const runFallback = () => {
      solvePoWChallenge(challenge, { signal: options.signal })
        .then((proof) => {
          cleanup();
          resolve(proof);
        })
        .catch((err) => {
          cleanup();
          reject(err);
        });
    };

    if (typeof Worker === "undefined" || typeof Blob === "undefined" || typeof URL === "undefined") {
      runFallback();
      return;
    }

    try {
      const blob = new Blob([WORKER_SOLVER_SCRIPT], { type: "application/javascript" });
      blobUrl = URL.createObjectURL(blob);
      worker = new Worker(blobUrl);

      worker.onmessage = (event) => {
        const data = event.data;
        if (data.type === "SOLVED") {
          cleanup();
          resolve(data.proof);
        } else if (data.type === "TIMEOUT") {
          cleanup();
          reject(new Error(data.error || "PoW challenge timed out"));
        }
      };

      worker.onerror = () => {
        cleanup();
        // Fall back to main-thread async solver if worker encounters an error
        runFallback();
      };

      worker.postMessage({ challenge });
    } catch {
      runFallback();
    }
  });
}
