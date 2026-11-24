import { computeMerkleTree, getMerkleProof, verifyMerkleProof } from "./merkleTree";

export interface MerkleProofWorkerRequest {
  id: string;
  leaves: string[];
  targetIndex: number;
  expectedRoot: string;
  leafHash?: string;
}

export interface MerkleProofWorkerResponse {
  id: string;
  success: boolean;
  isValid?: boolean;
  root?: string;
  proofLength?: number;
  error?: string;
}

export interface MerkleProofWorkerOptions {
  workerFactory?: () => Worker;
  forceFallback?: boolean;
}

export const MERKLE_WORKER_SOURCE = `
function rightRotate(value, amount) {
  return (value >>> amount) | (value << (32 - amount));
}

var K = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
];

function sha256(str) {
  var buffer = new TextEncoder().encode(str);
  var H0 = 0x6a09e667, H1 = 0xbb67ae85, H2 = 0x3c6ef372, H3 = 0xa54ff53a;
  var H4 = 0x510e527f, H5 = 0x9b05688c, H6 = 0x1f83d9ab, H7 = 0x5be0cd19;
  var len = buffer.length;
  var bitLen = len * 8;
  var pad = (56 - ((len + 1) % 64) + 64) % 64;
  var totalLen = len + 1 + pad + 8;
  var padded = new Uint8Array(totalLen);
  padded.set(buffer);
  padded[len] = 0x80;
  var view = new DataView(padded.buffer);
  view.setUint32(totalLen - 8, Math.floor(bitLen / 0x100000000), false);
  view.setUint32(totalLen - 4, bitLen >>> 0, false);
  var W = new Int32Array(64);

  for (var i = 0; i < totalLen; i += 64) {
    for (var t = 0; t < 16; t++) {
      W[t] = view.getInt32(i + t * 4, false);
    }
    for (t = 16; t < 64; t++) {
      var s0 = rightRotate(W[t - 15], 7) ^ rightRotate(W[t - 15], 18) ^ (W[t - 15] >>> 3);
      var s1 = rightRotate(W[t - 2], 17) ^ rightRotate(W[t - 2], 19) ^ (W[t - 2] >>> 10);
      W[t] = (W[t - 16] + s0 + W[t - 7] + s1) | 0;
    }

    var a = H0, b = H1, c = H2, d = H3, e = H4, f = H5, g = H6, h = H7;
    for (t = 0; t < 64; t++) {
      var S1 = rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25);
      var ch = (e & f) ^ (~e & g);
      var temp1 = (h + S1 + ch + K[t] + W[t]) | 0;
      var S0 = rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22);
      var maj = (a & b) ^ (a & c) ^ (b & c);
      var temp2 = (S0 + maj) | 0;
      h = g;
      g = f;
      f = e;
      e = (d + temp1) | 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) | 0;
    }

    H0 = (H0 + a) | 0;
    H1 = (H1 + b) | 0;
    H2 = (H2 + c) | 0;
    H3 = (H3 + d) | 0;
    H4 = (H4 + e) | 0;
    H5 = (H5 + f) | 0;
    H6 = (H6 + g) | 0;
    H7 = (H7 + h) | 0;
  }

  return [H0, H1, H2, H3, H4, H5, H6, H7]
    .map(function (value) { return (value >>> 0).toString(16).padStart(8, "0"); })
    .join("");
}

function buildLevels(leaves) {
  var current = leaves.slice();
  var levels = [current];
  while (current.length > 1) {
    if (current.length % 2 === 1) {
      current.push(current[current.length - 1]);
    }
    var next = [];
    for (var i = 0; i < current.length; i += 2) {
      next.push(sha256(current[i] + current[i + 1]));
    }
    levels.push(next);
    current = next;
  }
  return levels;
}

function buildProof(levels, index) {
  var proof = [];
  for (var levelIndex = 0; levelIndex < levels.length - 1; levelIndex++) {
    var isRightNode = index % 2 === 1;
    var siblingIndex = isRightNode ? index - 1 : index + 1;
    proof.push({ position: isRightNode ? "left" : "right", hash: levels[levelIndex][siblingIndex] });
    index = Math.floor(index / 2);
  }
  return proof;
}

function verifyProof(leafHash, proof, expectedRoot) {
  var current = String(leafHash).toLowerCase().replace(/^0x/, "");
  var target = String(expectedRoot).toLowerCase().replace(/^0x/, "");
  for (var i = 0; i < proof.length; i++) {
    var sibling = String(proof[i].hash).toLowerCase().replace(/^0x/, "");
    current = proof[i].position === "right" ? sha256(current + sibling) : sha256(sibling + current);
  }
  return current === target;
}

function handleRequest(data) {
  try {
    if (!data.leaves || data.leaves.length === 0) {
      throw new Error("No leaves supplied for Merkle proof verification.");
    }
    var levels = buildLevels(data.leaves);
    var targetIndex = data.targetIndex;
    var proof = buildProof(levels, targetIndex);
    var leafHash = data.leafHash !== undefined ? data.leafHash : data.leaves[targetIndex];
    emit({
      id: data.id,
      success: true,
      isValid: verifyProof(leafHash, proof, data.expectedRoot),
      root: levels[levels.length - 1][0],
      proofLength: proof.length
    });
  } catch (error) {
    emit({ id: data.id, success: false, error: error && error.message ? error.message : String(error) });
  }
}

var scope = typeof self !== "undefined" ? self : (typeof globalThis !== "undefined" ? globalThis : this);
var nodePort = null;
try {
  nodePort = require("worker_threads").parentPort;
} catch (error) {
  nodePort = null;
}

function emit(message) {
  if (nodePort) {
    nodePort.postMessage(message);
  } else {
    scope.postMessage(message);
  }
}

if (nodePort) {
  nodePort.on("message", handleRequest);
} else {
  scope.onmessage = function (event) { handleRequest(event.data); };
}
`;

export function createMerkleProofWorkerBlobUrl(): string {
  const blob = new Blob([MERKLE_WORKER_SOURCE], { type: "application/javascript" });
  return URL.createObjectURL(blob);
}

function verifyLocally(
  request: Omit<MerkleProofWorkerRequest, "id">,
  id: string,
): MerkleProofWorkerResponse {
  try {
    const tree = computeMerkleTree(request.leaves);
    const proof = getMerkleProof(request.leaves, request.targetIndex);
    const leafHash = request.leafHash ?? request.leaves[request.targetIndex];
    return {
      id,
      success: true,
      isValid: verifyMerkleProof(leafHash, proof, request.expectedRoot),
      root: tree.root,
      proofLength: proof.length,
    };
  } catch (error) {
    return { id, success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export async function verifyMerkleProofInWorker(
  request: Omit<MerkleProofWorkerRequest, "id">,
  options: MerkleProofWorkerOptions = {},
): Promise<MerkleProofWorkerResponse> {
  const id = `merkle_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

  if (options.forceFallback || typeof Worker === "undefined") {
    return verifyLocally(request, id);
  }

  const blobUrl = options.workerFactory ? null : createMerkleProofWorkerBlobUrl();
  const worker = options.workerFactory ? options.workerFactory() : new Worker(blobUrl!);

  try {
    return await new Promise<MerkleProofWorkerResponse>((resolve, reject) => {
      worker.onmessage = (event: MessageEvent) => {
        const response = event.data as MerkleProofWorkerResponse;
        if (response?.id === id) resolve(response);
      };
      worker.onerror = () => reject(new Error("Merkle proof worker failed"));
      worker.postMessage({ id, ...request });
    });
  } finally {
    worker.terminate();
    if (blobUrl) URL.revokeObjectURL(blobUrl);
  }
}
