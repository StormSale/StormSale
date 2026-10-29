import type { MerkleProofStep, MerkleTreeResult } from "../types/batchSale";

/**
 * Standard FIPS 180-4 SHA-256 hash implementation in pure TypeScript.
 * Works seamlessly in Browsers, Web Workers, Node.js, and Vitest.
 */
function rightRotate(value: number, amount: number): number {
  return (value >>> amount) | (value << (32 - amount));
}

const K = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
];

/**
 * Synchronous, standard SHA-256 computation returning 64-character lowercase hex string.
 */
export function sha256(str: string): string {
  const buffer = new TextEncoder().encode(str);
  let H0 = 0x6a09e667,
    H1 = 0xbb67ae85,
    H2 = 0x3c6ef372,
    H3 = 0xa54ff53a;
  let H4 = 0x510e527f,
    H5 = 0x9b05688c,
    H6 = 0x1f83d9ab,
    H7 = 0x5be0cd19;

  const len = buffer.length;
  const bitLen = len * 8;
  const k = (56 - ((len + 1) % 64) + 64) % 64;
  const totalLen = len + 1 + k + 8;
  const padded = new Uint8Array(totalLen);
  padded.set(buffer);
  padded[len] = 0x80;

  const view = new DataView(padded.buffer);
  view.setUint32(totalLen - 8, Math.floor(bitLen / 0x100000000), false);
  view.setUint32(totalLen - 4, bitLen >>> 0, false);

  const W = new Int32Array(64);

  for (let i = 0; i < totalLen; i += 64) {
    for (let t = 0; t < 16; t++) {
      W[t] = view.getInt32(i + t * 4, false);
    }
    for (let t = 16; t < 64; t++) {
      const s0 = rightRotate(W[t - 15], 7) ^ rightRotate(W[t - 15], 18) ^ (W[t - 15] >>> 3);
      const s1 = rightRotate(W[t - 2], 17) ^ rightRotate(W[t - 2], 19) ^ (W[t - 2] >>> 10);
      W[t] = (W[t - 16] + s0 + W[t - 7] + s1) | 0;
    }

    let a = H0,
      b = H1,
      c = H2,
      d = H3,
      e = H4,
      f = H5,
      g = H6,
      h = H7;

    for (let t = 0; t < 64; t++) {
      const S1 = rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (h + S1 + ch + K[t] + W[t]) | 0;
      const S0 = rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (S0 + maj) | 0;

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
    .map((val) => (val >>> 0).toString(16).padStart(8, "0"))
    .join("");
}

/**
 * Computes canonical leaf representation for a sale.
 * Format: ORDER_ID:AFFILIATE_ADDR:AMOUNT_XLM:ISO_TIMESTAMP
 */
export function createSaleLeafString(
  orderId: string,
  affiliateAddress: string,
  saleAmountXlm: number,
  isoTimestamp: string,
): string {
  const normalizedAmount = Number(saleAmountXlm).toFixed(7);
  return `${orderId.trim()}:${affiliateAddress.trim()}:${normalizedAmount}:${isoTimestamp.trim()}`;
}

/**
 * Hashes a canonical sale row to produce its Merkle leaf.
 */
export function hashSaleLeaf(
  orderId: string,
  affiliateAddress: string,
  saleAmountXlm: number,
  isoTimestamp: string,
): string {
  const canonical = createSaleLeafString(orderId, affiliateAddress, saleAmountXlm, isoTimestamp);
  return sha256(canonical);
}

/**
 * Computes a binary Merkle tree from an array of leaf hashes.
 * Follows RFC 6962 / standard binary Merkle tree pairing:
 * - If leaves is empty, returns 32-byte zero hash.
 * - If odd number of nodes at any level, duplicates the last node.
 * - Computes pairwise SHA-256(left + right) up to root.
 */
export function computeMerkleTree(
  leafHashes: string[],
  totalAmountXlm: number = 0,
): MerkleTreeResult {
  if (leafHashes.length === 0) {
    const zeroRoot = "0000000000000000000000000000000000000000000000000000000000000000";
    return {
      root: `0x${zeroRoot}`,
      rootWithoutPrefix: zeroRoot,
      leaves: [],
      totalValidSales: 0,
      totalAmountXlm: 0,
      depth: 0,
    };
  }

  let currentLevel = [...leafHashes];
  let depth = 0;

  while (currentLevel.length > 1) {
    depth++;
    const nextLevel: string[] = [];

    // If odd number of elements, duplicate last element (standard Merkle rule)
    if (currentLevel.length % 2 === 1) {
      currentLevel.push(currentLevel[currentLevel.length - 1]);
    }

    for (let i = 0; i < currentLevel.length; i += 2) {
      const left = currentLevel[i];
      const right = currentLevel[i + 1];
      const combinedHash = sha256(`${left}${right}`);
      nextLevel.push(combinedHash);
    }

    currentLevel = nextLevel;
  }

  const root = currentLevel[0];
  return {
    root: `0x${root}`,
    rootWithoutPrefix: root,
    leaves: leafHashes,
    totalValidSales: leafHashes.length,
    totalAmountXlm,
    depth: depth === 0 && leafHashes.length === 1 ? 1 : depth,
  };
}

/**
 * Generates an audit proof for a specific leaf index in the Merkle tree.
 */
export function getMerkleProof(leafHashes: string[], targetIndex: number): MerkleProofStep[] {
  if (targetIndex < 0 || targetIndex >= leafHashes.length) {
    throw new Error(
      `Target index ${targetIndex} is out of bounds for leaves length ${leafHashes.length}`,
    );
  }

  let currentLevel = [...leafHashes];
  let index = targetIndex;
  const proof: MerkleProofStep[] = [];

  while (currentLevel.length > 1) {
    if (currentLevel.length % 2 === 1) {
      currentLevel.push(currentLevel[currentLevel.length - 1]);
    }

    const isRightNode = index % 2 === 1;
    const siblingIndex = isRightNode ? index - 1 : index + 1;

    proof.push({
      position: isRightNode ? "left" : "right",
      hash: currentLevel[siblingIndex],
    });

    const nextLevel: string[] = [];
    for (let i = 0; i < currentLevel.length; i += 2) {
      nextLevel.push(sha256(`${currentLevel[i]}${currentLevel[i + 1]}`));
    }

    currentLevel = nextLevel;
    index = Math.floor(index / 2);
  }

  return proof;
}

/**
 * Cryptographically verifies a Merkle proof against a known Merkle root.
 */
export function verifyMerkleProof(
  leafHash: string,
  proof: MerkleProofStep[],
  expectedRoot: string,
): boolean {
  let currentHash = leafHash.toLowerCase().replace(/^0x/, "");
  const targetRoot = expectedRoot.toLowerCase().replace(/^0x/, "");

  for (const step of proof) {
    const siblingHash = step.hash.toLowerCase().replace(/^0x/, "");
    if (step.position === "right") {
      currentHash = sha256(`${currentHash}${siblingHash}`);
    } else {
      currentHash = sha256(`${siblingHash}${currentHash}`);
    }
  }

  return currentHash === targetRoot;
}
