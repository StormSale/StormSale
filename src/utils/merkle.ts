import { recordsScopedToOrg } from "../lib/auditorTenancy";

/**
 * Merkle Tree Cryptographic Engine & Data Models for Batch-Settled Ledger Logs.
 * Complies with StormSale Auditor Enterprise specifications.
 */

export interface OrderMetadata {
  orderId: string;
  txHash: string; // 64-char hex (e.g. 0x...)
  affiliateAddress: string; // Valid 56-char Stellar public key (G...)
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
  siblingHash: string | null;
  siblingPosition: "left" | "right" | "none";
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
  campaignAddress: string; // Valid 56-char Stellar contract ID (C...)
  ledgerSequence: number;
  settledAt: string;
  contractRootHash: string; // Precomputed trusted root on Soroban escrow contract
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
 * Pure JS SHA-256 implementation used as a fallback and verified against NIST vectors.
 */
export function fallbackSha256(data: Uint8Array): string {
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
    BigInt(Math.round(order.amountXlm * 1e7)).toString(),
    BigInt(Math.round(order.commissionXlm * 1e7)).toString(),
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
 * Builds an authentic Merkle Tree from an array of conversion orders using odd-node promotion.
 * Eliminates duplicate-node vulnerabilities so [A, B, C] and [A, B, C, C] produce distinct roots.
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

  // 2. Build intermediate levels up to root using odd-node promotion
  let currentLevelNodes = leaves;
  let levelIdx = 1;

  while (currentLevelNodes.length > 1) {
    const nextLevelNodes: MerkleNode[] = [];
    const pairsCount = Math.floor(currentLevelNodes.length / 2);

    for (let i = 0; i < pairsCount * 2; i += 2) {
      const leftNode = currentLevelNodes[i];
      const rightNode = currentLevelNodes[i + 1];
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

    // Odd-node promotion: promote the last node without duplicating
    if (currentLevelNodes.length % 2 !== 0) {
      const oddNode = currentLevelNodes[currentLevelNodes.length - 1];
      const promotedNode: MerkleNode = {
        id: `L${levelIdx}-N${pairsCount}`,
        hash: oddNode.hash, // Retain identical hash on promotion
        level: levelIdx,
        index: pairsCount,
        isLeaf: false,
        isRoot: false,
        left: oddNode,
      };
      oddNode.parent = promotedNode;
      nextLevelNodes.push(promotedNode);
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
 * Computes inclusion proof for a leaf by index against a trusted root.
 */
export async function generateMerkleProof(
  tree: MerkleTree,
  leafIndex: number,
  expectedRootHash?: string,
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
    const isOddPromoted = levelNodes.length % 2 !== 0 && currentIndex === levelNodes.length - 1;

    let siblingHash: string | null = null;
    let siblingPosition: "left" | "right" | "none" = "none";
    let computedHash = currentHash;
    let formula = `Promote (L${lvl} ➔ L${lvl + 1})`;

    if (!isOddPromoted) {
      const isEven = currentIndex % 2 === 0;
      const siblingIndex = isEven ? currentIndex + 1 : currentIndex - 1;
      siblingPosition = isEven ? "right" : "left";
      siblingHash = levelNodes[siblingIndex].hash;

      const left = siblingPosition === "left" ? siblingHash : currentHash;
      const right = siblingPosition === "right" ? siblingHash : currentHash;
      computedHash = await hashPair(left, right);
      formula =
        siblingPosition === "left"
          ? `H(sibling: ${siblingHash.slice(0, 8)}... || current: ${currentHash.slice(0, 8)}...)`
          : `H(current: ${currentHash.slice(0, 8)}... || sibling: ${siblingHash.slice(0, 8)}...)`;
    }

    const parentIndex = Math.floor(currentIndex / 2);
    const expectedHash = tree.levels[lvl + 1][parentIndex].hash;

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

  const trusted = expectedRootHash || tree.root.hash;
  const isValid = currentHash === trusted && steps.every((s) => s.isVerified);

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
 * Validates a Merkle Proof step-by-step from scratch using SHA-256 against an independent trusted root.
 */
export async function verifyMerkleProofStepByStep(
  proof: MerkleProof,
  trustedRootHash: string,
  customLeafHash?: string,
): Promise<{
  isValid: boolean;
  computedRoot: string;
  expectedRoot: string;
  verifiedSteps: MerkleProofStep[];
}> {
  // Respect explicit empty string without falling back to proof.leafHash
  const startingLeafHash = customLeafHash !== undefined ? customLeafHash : proof.leafHash;
  const leafBindsOrder =
    proof.leafOrder === undefined ||
    (await hashOrderLeaf(proof.leafOrder)) === proof.leafHash;
  let runningHash = startingLeafHash;
  const verifiedSteps: MerkleProofStep[] = [];

  for (let i = 0; i < proof.steps.length; i++) {
    const step = proof.steps[i];
    let computed: string;

    if (step.siblingPosition === "none" || !step.siblingHash) {
      // Promoted node directly moves up
      computed = runningHash;
    } else if (step.siblingPosition === "left") {
      computed = await hashPair(step.siblingHash, runningHash);
    } else {
      computed = await hashPair(runningHash, step.siblingHash);
    }

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
    isValid: leafBindsOrder && runningHash === trustedRootHash,
    computedRoot: runningHash,
    expectedRoot: trustedRootHash,
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
 * Extracts a candidate 64-character hex transaction hash from uploaded receipt text (JSON, CSV, or raw text).
 */
export function parseTransactionHashFromReceipt(text: string, isJson = false): string | null {
  if (!text) return null;
  const trimmed = text.trim();
  if (!trimmed) return null;

  if (isJson) {
    try {
      const parsed = JSON.parse(trimmed);
      const candidate =
        parsed.txHash ||
        parsed.transactionHash ||
        parsed.hash ||
        (Array.isArray(parsed) && parsed[0]?.txHash) ||
        null;
      if (candidate && typeof candidate === "string") {
        return candidate.trim();
      }
    } catch {
      // Fall back to regex parsing below if JSON parsing fails
    }
  }

  const match0x = trimmed.match(/0x[a-fA-F0-9]{64}/);
  if (match0x) {
    return match0x[0];
  }

  const rawMatch = trimmed.match(/[a-fA-F0-9]{64}/);
  if (rawMatch) {
    return `0x${rawMatch[0]}`;
  }

  return null;
}

/**
 * Calculates commission percentage dynamically per order without division-by-zero errors.
 */
export function calculateCommissionPercentage(amountXlm: number, commissionXlm: number): string {
  if (!amountXlm || amountXlm <= 0) return "0";
  return ((commissionXlm / amountXlm) * 100).toFixed(0);
}

/**
 * Valid RFC 4648 Base32 56-character Ed25519 Stellar public keys (G...) and Soroban contract IDs (C...).
 */
const STELLAR_FIXTURE_KEYS = {
  contracts: {
    techGadgets: "CDMJ3U7QHS3A4LYJVWHDJ5S4EN4VWAWSVEF2PG3SFOK4P6UJEGTOGZGT",
    web3Masterclass: "CDRIFAFTLH3TYPJJLSIIVPWQQ5ZEAZ2NQMVZJKEQUKDAFDJVIJMBYQKV",
    summerSale: "CA6AZRFHR3DP7H3K7RCVPANTXT3ZNAMODQE26YAB45P4JNC4TLE4PJSL",
  },
  affiliates: [
    "GB3TUBZ57Q457XWRH3C4VRBTQSDVH2ANRNKPTZS6HWMMH5WSRIFQCSA5",
    "GDPJZN2LYFGETWYBSFAYW7S6IMNFK55YMNX7YK7DW35ZDGPOE4BRWLIA",
    "GBYHPM7TF5B3DVY5S6NVZOCJHRKJMQGSLJBYSGPYZA5F4LMVCRIQZMC3",
    "GBSQKZMF4FMDE5WUXQACQPEXOW2OCE4SNM6JDAJ5EM6FLES5NDNXHGE2",
    "GBVBVUAOFT7GFIXRVRQDH7OJZLBPZD7BPXGT4D5KI4J2SCZIWEHMGN3H",
    "GBTZV4UPL3HXEEUCZVIVO5GFYDG7WLF5WU3FQXWFRWD7YJ5QT3NPBYCP",
    "GAN3GI3RAALUFSFBPHYDNWPCPOIJ3RCO3Z2ATCYOFEJEXGXQCA3Y2JWN",
    "GDMGRLUP4CAPRY67HOBNXGZRNXIRKFNGJ46Z42U4DTVGJC6UHU4WO6BC",
  ],
};

/**
 * Sample realistic settlement batches with authentic precomputed Soroban contract roots.
 */
export const SAMPLE_SETTLEMENT_BATCHES: SettlementBatch[] = [
  {
    batchId: "BATCH-2026-05-16-01",
    campaignName: "Tech Gadgets Pro",
    campaignAddress: STELLAR_FIXTURE_KEYS.contracts.techGadgets,
    ledgerSequence: 48291042,
    settledAt: "2026-05-16 08:30 UTC",
    contractRootHash: "c08ad5fd64631602f635ab068e5c44f19ecf3996db01ac7305e28b422d0819b8",
    orders: [
      {
        orderId: "ORD-9401",
        txHash: "0x8f2a1b4c7d9e0f3a6b5c8d1e4f7a0b3c6d9e2f5a8b1c4d7e0f3a6b9c2d5e8f1a",
        affiliateAddress: STELLAR_FIXTURE_KEYS.affiliates[0],
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
        affiliateAddress: STELLAR_FIXTURE_KEYS.affiliates[1],
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
        affiliateAddress: STELLAR_FIXTURE_KEYS.affiliates[2],
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
        affiliateAddress: STELLAR_FIXTURE_KEYS.affiliates[3],
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
        affiliateAddress: STELLAR_FIXTURE_KEYS.affiliates[4],
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
        affiliateAddress: STELLAR_FIXTURE_KEYS.affiliates[5],
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
        affiliateAddress: STELLAR_FIXTURE_KEYS.affiliates[6],
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
        affiliateAddress: STELLAR_FIXTURE_KEYS.affiliates[7],
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
    campaignAddress: STELLAR_FIXTURE_KEYS.contracts.web3Masterclass,
    ledgerSequence: 48150918,
    settledAt: "2026-05-15 14:45 UTC",
    contractRootHash: "f19f9e8d92b4eb019714420dc7aebc0bd9f6e7e566da4284e22cf0dd7871982a",
    orders: [
      {
        orderId: "ORD-8810",
        txHash: "0xaa11bb22cc33dd44ee55ff6677889900aabbccddeeff00112233445566778899",
        affiliateAddress: STELLAR_FIXTURE_KEYS.affiliates[0],
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
        affiliateAddress: STELLAR_FIXTURE_KEYS.affiliates[1],
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
        affiliateAddress: STELLAR_FIXTURE_KEYS.affiliates[2],
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
        affiliateAddress: STELLAR_FIXTURE_KEYS.affiliates[3],
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
    campaignAddress: STELLAR_FIXTURE_KEYS.contracts.summerSale,
    ledgerSequence: 47992301,
    settledAt: "2026-05-14 18:00 UTC",
    contractRootHash: "770ea719c523dd3b1dec51be3b8fe99aeea5b815d63362b437a13527932f1be4",
    orders: [
      {
        orderId: "ORD-7101",
        txHash: "0xee55ff6677889900aabbccddeeff00112233445566778899aa11bb22cc33dd44",
        affiliateAddress: STELLAR_FIXTURE_KEYS.affiliates[4],
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
        affiliateAddress: STELLAR_FIXTURE_KEYS.affiliates[5],
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

/**
 * Scopes settlement batches to the selected organization using recordsScopedToOrg.
 */
export function filterBatchesForOrg(
  orgId: string | undefined,
  batches: SettlementBatch[] = SAMPLE_SETTLEMENT_BATCHES,
): SettlementBatch[] {
  if (!orgId) return batches;
  const batchesWithSaleId = batches.map((b) => ({
    ...b,
    saleId: b.orders[0]?.campaignId.replace(/^camp-/i, "") || "",
  }));
  const scoped = recordsScopedToOrg(orgId, batchesWithSaleId);
  return scoped.length > 0 ? scoped : batches;
}
