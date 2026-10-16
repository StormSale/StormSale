/**
 * Merkle Tree Cryptographic Engine & Data Models for Batch-Settled Ledger Logs.
 * Complies with StormSale Auditor Enterprise specifications.
 */

export interface OrderMetadata {
  orderId: string;
  txHash: string; // 64-char hex (e.g. 0x...)
  affiliateAddress: string;
  campaignId: string;
  campaignName: string;
  amountXlm: number;
  commissionXlm: number;
  timestamp: string;
  clearingStatus: "Settled" | "Escrowed" | "Released";
  signature?: string;
}

export interface MerkleNode {
  id: string; // Unique node ID, e.g., "L0-N0"
  hash: string; // 64-char lowercase hex
  level: number; // 0 = leaf, 1..h-1 = branch, h = root
  index: number; // Index at level
  isLeaf: boolean;
  isRoot: boolean;
  left?: MerkleNode;
  right?: MerkleNode;
  parent?: MerkleNode;
  order?: OrderMetadata; // Present on leaves
}

export interface MerkleProofStep {
  level: number;
  currentHash: string;
  siblingHash: string;
  siblingPosition: "left" | "right";
  computedHash: string;
  expectedHash: string;
  isVerified: boolean;
  formula: string;
}

export interface MerkleProof {
  leafIndex: number;
  leafHash: string;
  leafOrder?: OrderMetadata;
  rootHash: string;
  steps: MerkleProofStep[];
  isValid: boolean;
}

export interface SettlementBatch {
  batchId: string;
  campaignName: string;
  campaignAddress: string;
  ledgerSequence: number;
  settledAt: string;
  contractRootHash: string; // Published root on Soroban escrow contract
  orders: OrderMetadata[];
}

/**
 * Robust SHA-256 hashing supporting Browser Web Crypto & Node.js
 */
export async function sha256Hex(input: string | Uint8Array): Promise<string> {
  const data = typeof input === "string" ? new TextEncoder().encode(input) : input;

  if (typeof globalThis !== "undefined" && globalThis.crypto?.subtle) {
    const hashBuffer = await globalThis.crypto.subtle.digest(
      "SHA-256",
      data as unknown as BufferSource,
    );
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  }

  // Pure JS fallback in rare environments without SubtleCrypto
  return fallbackSha256(data);
}

/**
 * Minimalist pure JS SHA-256 implementation as a bulletproof fallback
 */
function fallbackSha256(data: Uint8Array): string {
  function rightRotate(value: number, amount: number) {
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

  let H0 = 0x6a09e667,
    H1 = 0xbb67ae85,
    H2 = 0x3c6ef372,
    H3 = 0xa54ff53a;
  let H4 = 0x510e527f,
    H5 = 0x9b05688c,
    H6 = 0x1f83d9ab,
    H7 = 0x5be0cd19;

  const bitLength = data.length * 8;
  const newByteLen = (((bitLength + 64) >>> 9) << 4) + 16;
  const words = new Uint32Array(newByteLen);

  for (let i = 0; i < data.length; i++) {
    words[i >>> 2] |= data[i] << (24 - (i % 4) * 8);
  }
  words[data.length >>> 2] |= 0x80 << (24 - (data.length % 4) * 8);
  words[newByteLen - 1] = bitLength;

  const W = new Uint32Array(64);
  for (let i = 0; i < words.length; i += 16) {
    for (let j = 0; j < 16; j++) W[j] = words[i + j];
    for (let j = 16; j < 64; j++) {
      const s0 = rightRotate(W[j - 15], 7) ^ rightRotate(W[j - 15], 18) ^ (W[j - 15] >>> 3);
      const s1 = rightRotate(W[j - 2], 17) ^ rightRotate(W[j - 2], 19) ^ (W[j - 2] >>> 10);
      W[j] = (W[j - 16] + s0 + W[j - 7] + s1) | 0;
    }

    let a = H0,
      b = H1,
      c = H2,
      d = H3,
      e = H4,
      f = H5,
      g = H6,
      h = H7;

    for (let j = 0; j < 64; j++) {
      const S1 = rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (h + S1 + ch + K[j] + W[j]) | 0;
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

  const toHex = (n: number) => (n >>> 0).toString(16).padStart(8, "0");
  return `${toHex(H0)}${toHex(H1)}${toHex(H2)}${toHex(H3)}${toHex(H4)}${toHex(H5)}${toHex(H6)}${toHex(H7)}`;
}

/**
 * Computes canonical leaf hash from OrderMetadata.
 */
export async function hashOrderLeaf(order: OrderMetadata): Promise<string> {
  const canonicalString = [
    order.orderId,
    order.txHash.toLowerCase(),
    order.affiliateAddress,
    order.campaignId,
    order.amountXlm.toFixed(2),
    order.commissionXlm.toFixed(2),
    order.timestamp,
    order.clearingStatus,
  ].join("|");

  return sha256Hex(canonicalString);
}

/**
 * Combines two sibling hashes into a parent node hash.
 */
export async function hashPair(leftHex: string, rightHex: string): Promise<string> {
  const normalizedLeft = leftHex.toLowerCase().replace(/^0x/, "");
  const normalizedRight = rightHex.toLowerCase().replace(/^0x/, "");
  return sha256Hex(normalizedLeft + normalizedRight);
}

export interface MerkleTree {
  root: MerkleNode;
  levels: MerkleNode[][]; // levels[0] = leaves, levels[h] = [root]
  height: number;
  leaves: MerkleNode[];
  leafCount: number;
}

/**
 * Builds an authentic Merkle Tree from an array of conversion orders.
 */
export async function buildMerkleTree(orders: OrderMetadata[]): Promise<MerkleTree> {
  if (!orders || orders.length === 0) {
    throw new Error("Cannot build Merkle Tree without orders.");
  }

  // 1. Create Level 0 (Leaves)
  const leaves: MerkleNode[] = [];
  for (let i = 0; i < orders.length; i++) {
    const order = orders[i];
    const hash = await hashOrderLeaf(order);
    leaves.push({
      id: `L0-N${i}`,
      hash,
      level: 0,
      index: i,
      isLeaf: true,
      isRoot: orders.length === 1,
      order,
    });
  }

  const levels: MerkleNode[][] = [leaves];

  // 2. Build intermediate levels up to root
  let currentLevelNodes = leaves;
  let levelIdx = 1;

  while (currentLevelNodes.length > 1) {
    const nextLevelNodes: MerkleNode[] = [];

    // Duplicate last node if odd number of nodes
    const nodePairs: MerkleNode[] = [...currentLevelNodes];
    if (nodePairs.length % 2 !== 0) {
      const last = nodePairs[nodePairs.length - 1];
      nodePairs.push({
        ...last,
        id: `${last.id}-dup`,
        index: nodePairs.length,
      });
    }

    for (let i = 0; i < nodePairs.length; i += 2) {
      const leftNode = nodePairs[i];
      const rightNode = nodePairs[i + 1];
      const parentHash = await hashPair(leftNode.hash, rightNode.hash);

      const parentNode: MerkleNode = {
        id: `L${levelIdx}-N${Math.floor(i / 2)}`,
        hash: parentHash,
        level: levelIdx,
        index: Math.floor(i / 2),
        isLeaf: false,
        isRoot: false,
        left: leftNode,
        right: rightNode,
      };

      leftNode.parent = parentNode;
      rightNode.parent = parentNode;
      nextLevelNodes.push(parentNode);
    }

    levels.push(nextLevelNodes);
    currentLevelNodes = nextLevelNodes;
    levelIdx++;
  }

  const root = levels[levels.length - 1][0];
  root.isRoot = true;

  return {
    root,
    levels,
    height: levels.length - 1,
    leaves,
    leafCount: leaves.length,
  };
}

/**
 * Computes inclusion proof for a leaf by index.
 */
export async function generateMerkleProof(
  tree: MerkleTree,
  leafIndex: number,
): Promise<MerkleProof> {
  if (leafIndex < 0 || leafIndex >= tree.leaves.length) {
    throw new Error(`Leaf index ${leafIndex} out of bounds (0-${tree.leaves.length - 1})`);
  }

  const targetLeaf = tree.leaves[leafIndex];
  const steps: MerkleProofStep[] = [];

  let currentIndex = leafIndex;
  let currentHash = targetLeaf.hash;

  for (let lvl = 0; lvl < tree.height; lvl++) {
    const levelNodes = tree.levels[lvl];
    const isOddAtLevel = levelNodes.length % 2 !== 0;

    // Sibling calculation
    const isEven = currentIndex % 2 === 0;
    const siblingIndex = isEven ? currentIndex + 1 : currentIndex - 1;

    let siblingHash: string;
    let siblingPosition: "left" | "right";

    if (isEven) {
      siblingPosition = "right";
      if (siblingIndex < levelNodes.length) {
        siblingHash = levelNodes[siblingIndex].hash;
      } else if (isOddAtLevel && currentIndex === levelNodes.length - 1) {
        // Odd node paired with duplicate of itself
        siblingHash = currentHash;
      } else {
        throw new Error(`Invalid tree sibling state at level ${lvl}`);
      }
    } else {
      siblingPosition = "left";
      siblingHash = levelNodes[siblingIndex].hash;
    }

    const left = siblingPosition === "left" ? siblingHash : currentHash;
    const right = siblingPosition === "right" ? siblingHash : currentHash;
    const computedHash = await hashPair(left, right);

    const parentIndex = Math.floor(currentIndex / 2);
    const expectedHash = tree.levels[lvl + 1][parentIndex].hash;

    const formula =
      siblingPosition === "left"
        ? `H(sibling: ${siblingHash.slice(0, 8)}... || current: ${currentHash.slice(0, 8)}...)`
        : `H(current: ${currentHash.slice(0, 8)}... || sibling: ${siblingHash.slice(0, 8)}...)`;

    steps.push({
      level: lvl,
      currentHash,
      siblingHash,
      siblingPosition,
      computedHash,
      expectedHash,
      isVerified: computedHash === expectedHash,
      formula,
    });

    currentHash = computedHash;
    currentIndex = parentIndex;
  }

  const isValid = currentHash === tree.root.hash && steps.every((s) => s.isVerified);

  return {
    leafIndex,
    leafHash: targetLeaf.hash,
    leafOrder: targetLeaf.order,
    rootHash: tree.root.hash,
    steps,
    isValid,
  };
}

/**
 * Validates a Merkle Proof step-by-step from scratch using SHA-256.
 */
export async function verifyMerkleProofStepByStep(
  proof: MerkleProof,
  customLeafHash?: string,
): Promise<{
  isValid: boolean;
  computedRoot: string;
  expectedRoot: string;
  verifiedSteps: MerkleProofStep[];
}> {
  let runningHash = customLeafHash || proof.leafHash;
  const verifiedSteps: MerkleProofStep[] = [];

  for (let i = 0; i < proof.steps.length; i++) {
    const step = proof.steps[i];
    const left = step.siblingPosition === "left" ? step.siblingHash : runningHash;
    const right = step.siblingPosition === "right" ? step.siblingHash : runningHash;

    const computed = await hashPair(left, right);
    const matchesExpected = computed === step.expectedHash;

    verifiedSteps.push({
      ...step,
      currentHash: runningHash,
      computedHash: computed,
      isVerified: matchesExpected,
    });

    runningHash = computed;
  }

  return {
    isValid: runningHash === proof.rootHash,
    computedRoot: runningHash,
    expectedRoot: proof.rootHash,
    verifiedSteps,
  };
}

/**
 * Finds a leaf in the Merkle Tree by transaction hash (case-insensitive, ignores 0x prefix).
 */
export function findLeafByTxHash(
  tree: MerkleTree,
  txHash: string,
): { node: MerkleNode; index: number } | null {
  if (!txHash) return null;
  const cleanInput = txHash.trim().toLowerCase().replace(/^0x/, "");

  for (let i = 0; i < tree.leaves.length; i++) {
    const leaf = tree.leaves[i];
    if (leaf.order) {
      const cleanOrderTx = leaf.order.txHash.toLowerCase().replace(/^0x/, "");
      if (cleanOrderTx === cleanInput) {
        return { node: leaf, index: i };
      }
    }
  }
  return null;
}

/**
 * Sample realistic settlement batches with cryptographic authenticity.
 */
export const SAMPLE_SETTLEMENT_BATCHES: SettlementBatch[] = [
  {
    batchId: "BATCH-2026-05-16-01",
    campaignName: "Tech Gadgets Pro",
    campaignAddress: "CA7QW5KXGPTR4N2K9J2L77XLMESCROW9999STORMTESTNET1",
    ledgerSequence: 48291042,
    settledAt: "2026-05-16 08:30 UTC",
    contractRootHash: "", // Will be assigned from tree root
    orders: [
      {
        orderId: "ORD-9401",
        txHash: "0x8f2a1b4c7d9e0f3a6b5c8d1e4f7a0b3c6d9e2f5a8b1c4d7e0f3a6b9c2d5e8f1a",
        affiliateAddress: "GB12...34CD",
        campaignId: "CAMP-1042",
        campaignName: "Tech Gadgets Pro",
        amountXlm: 450.0,
        commissionXlm: 45.0,
        timestamp: "2026-05-16 07:15:22",
        clearingStatus: "Settled",
      },
      {
        orderId: "ORD-9402",
        txHash: "0x3c7e9a1b5d8f0a2c4e6b8d0f2a4c6e8a0b2d4f6a8c0e2b4d6f8a0c2e4b6d8f0a",
        affiliateAddress: "GC78...90GH",
        campaignId: "CAMP-1042",
        campaignName: "Tech Gadgets Pro",
        amountXlm: 820.0,
        commissionXlm: 82.0,
        timestamp: "2026-05-16 07:22:45",
        clearingStatus: "Settled",
      },
      {
        orderId: "ORD-9403",
        txHash: "0x1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b",
        affiliateAddress: "GD34...56IJ",
        campaignId: "CAMP-1042",
        campaignName: "Tech Gadgets Pro",
        amountXlm: 310.0,
        commissionXlm: 31.0,
        timestamp: "2026-05-16 07:35:10",
        clearingStatus: "Settled",
      },
      {
        orderId: "ORD-9404",
        txHash: "0x9f8e7d6c5b4a3f2e1d0c9b8a7f6e5d4c3b2a1f0e9d8c7b6a5f4e3d2c1b0a9f8e",
        affiliateAddress: "GE56...78KL",
        campaignId: "CAMP-1042",
        campaignName: "Tech Gadgets Pro",
        amountXlm: 1250.0,
        commissionXlm: 125.0,
        timestamp: "2026-05-16 07:44:03",
        clearingStatus: "Settled",
      },
      {
        orderId: "ORD-9405",
        txHash: "0x4b6d8f0a2c4e6a8b0d2f4a6c8e0b2d4f6a8c0e2b4d6f8a0c2e4b6d8f0a2c4e6a",
        affiliateAddress: "GF78...90MN",
        campaignId: "CAMP-1042",
        campaignName: "Tech Gadgets Pro",
        amountXlm: 540.0,
        commissionXlm: 54.0,
        timestamp: "2026-05-16 07:51:19",
        clearingStatus: "Settled",
      },
      {
        orderId: "ORD-9406",
        txHash: "0x6e8a0b2d4f6a8c0e2b4d6f8a0c2e4b6d8f0a2c4e6a8b0d2f4a6c8e0b2d4f6a8c",
        affiliateAddress: "GG90...12OP",
        campaignId: "CAMP-1042",
        campaignName: "Tech Gadgets Pro",
        amountXlm: 670.0,
        commissionXlm: 67.0,
        timestamp: "2026-05-16 08:02:40",
        clearingStatus: "Settled",
      },
      {
        orderId: "ORD-9407",
        txHash: "0x2d4f6a8c0e2b4d6f8a0c2e4b6d8f0a2c4e6a8b0d2f4a6c8e0b2d4f6a8c0e2b4d",
        affiliateAddress: "GH12...34QR",
        campaignId: "CAMP-1042",
        campaignName: "Tech Gadgets Pro",
        amountXlm: 390.0,
        commissionXlm: 39.0,
        timestamp: "2026-05-16 08:14:11",
        clearingStatus: "Settled",
      },
      {
        orderId: "ORD-9408",
        txHash: "0x0c2e4b6d8f0a2c4e6a8b0d2f4a6c8e0b2d4f6a8c0e2b4d6f8a0c2e4b6d8f0a2c",
        affiliateAddress: "GJ34...56ST",
        campaignId: "CAMP-1042",
        campaignName: "Tech Gadgets Pro",
        amountXlm: 390.0,
        commissionXlm: 39.0,
        timestamp: "2026-05-16 08:25:50",
        clearingStatus: "Settled",
      },
    ],
  },
  {
    batchId: "BATCH-2026-05-15-02",
    campaignName: "Web3 Masterclass",
    campaignAddress: "CB9E88LMNPQR5TUV2WXY4444ESCROW8888STORMTESTNET2",
    ledgerSequence: 48150918,
    settledAt: "2026-05-15 14:45 UTC",
    contractRootHash: "",
    orders: [
      {
        orderId: "ORD-8810",
        txHash: "0xaa11bb22cc33dd44ee55ff6677889900aabbccddeeff00112233445566778899",
        affiliateAddress: "GA11...22AA",
        campaignId: "CAMP-988",
        campaignName: "Web3 Masterclass",
        amountXlm: 750.0,
        commissionXlm: 112.5,
        timestamp: "2026-05-15 13:10:00",
        clearingStatus: "Settled",
      },
      {
        orderId: "ORD-8811",
        txHash: "0xbb22cc33dd44ee55ff6677889900aabbccddeeff00112233445566778899aa11",
        affiliateAddress: "GB22...33BB",
        campaignId: "CAMP-988",
        campaignName: "Web3 Masterclass",
        amountXlm: 1200.0,
        commissionXlm: 180.0,
        timestamp: "2026-05-15 13:25:12",
        clearingStatus: "Settled",
      },
      {
        orderId: "ORD-8812",
        txHash: "0xcc33dd44ee55ff6677889900aabbccddeeff00112233445566778899aa11bb22",
        affiliateAddress: "GC33...44CC",
        campaignId: "CAMP-988",
        campaignName: "Web3 Masterclass",
        amountXlm: 980.0,
        commissionXlm: 147.0,
        timestamp: "2026-05-15 13:40:30",
        clearingStatus: "Settled",
      },
      {
        orderId: "ORD-8813",
        txHash: "0xdd44ee55ff6677889900aabbccddeeff00112233445566778899aa11bb22cc33",
        affiliateAddress: "GD44...55DD",
        campaignId: "CAMP-988",
        campaignName: "Web3 Masterclass",
        amountXlm: 620.0,
        commissionXlm: 93.0,
        timestamp: "2026-05-15 14:05:18",
        clearingStatus: "Settled",
      },
    ],
  },
  {
    batchId: "BATCH-2026-05-14-03",
    campaignName: "Summer Sale 2026",
    campaignAddress: "CD4M11STORM22ESCROW33SOROBAN44AFFILIATE55XLM6",
    ledgerSequence: 47992301,
    settledAt: "2026-05-14 18:00 UTC",
    contractRootHash: "",
    orders: [
      {
        orderId: "ORD-7101",
        txHash: "0xee55ff6677889900aabbccddeeff00112233445566778899aa11bb22cc33dd44",
        affiliateAddress: "GE55...66EE",
        campaignId: "CAMP-1100",
        campaignName: "Summer Sale 2026",
        amountXlm: 500.0,
        commissionXlm: 50.0,
        timestamp: "2026-05-14 16:30:00",
        clearingStatus: "Settled",
      },
      {
        orderId: "ORD-7102",
        txHash: "0xff6677889900aabbccddeeff00112233445566778899aa11bb22cc33dd44ee55",
        affiliateAddress: "GF66...77FF",
        campaignId: "CAMP-1100",
        campaignName: "Summer Sale 2026",
        amountXlm: 1450.0,
        commissionXlm: 145.0,
        timestamp: "2026-05-14 17:12:44",
        clearingStatus: "Settled",
      },
    ],
  },
];
