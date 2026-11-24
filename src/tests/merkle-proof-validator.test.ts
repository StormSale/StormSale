import { beforeAll, describe, expect, it } from "vitest";
import { Worker as NodeWorker } from "node:worker_threads";
import {
  computeMerkleTree,
  getMerkleProof,
  hashSaleLeaf,
  sha256,
  verifyMerkleProof,
} from "../lib/merkleTree";
import { SAMPLE_STELLAR_KEYS } from "../lib/batchSaleParser";
import {
  MERKLE_WORKER_SOURCE,
  verifyMerkleProofInWorker,
  type MerkleProofWorkerRequest,
  type MerkleProofWorkerResponse,
} from "../lib/merkleProofWorker";
import type { MerkleProofStep, MerkleTreeResult } from "../types/batchSale";

class NodeThreadMerkleWorker {
  public onmessage: ((event: MessageEvent) => void) | null = null;
  public onerror: ((event: ErrorEvent) => void) | null = null;
  private readonly thread: NodeWorker;

  constructor() {
    this.thread = new NodeWorker(MERKLE_WORKER_SOURCE, { eval: true });
    this.thread.on("message", (data: MerkleProofWorkerResponse) => {
      this.onmessage?.({ data } as unknown as MessageEvent);
    });
    this.thread.on("error", (error: Error) => {
      this.onerror?.(error as unknown as ErrorEvent);
    });
  }

  postMessage(request: MerkleProofWorkerRequest): void {
    this.thread.postMessage(request);
  }

  terminate(): void {
    void this.thread.terminate();
  }
}

describe("Client-side Merkle proof generator and tree validator (#459)", () => {
  const LEAF_COUNT = 10_000;
  let largeTree: MerkleTreeResult;

  beforeAll(() => {
    const leaves = Array.from({ length: LEAF_COUNT }, (_, index) =>
      sha256(`whitelist-allocation:${index}`),
    );
    largeTree = computeMerkleTree(leaves);
  });

  describe("1. Leaf hashing and SHA-256 tree generation", () => {
    it("matches SHA-256 test vectors and derives deterministic sale leaves", () => {
      expect(sha256("")).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
      expect(sha256("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");

      const leaf = hashSaleLeaf(
        "ORD-459",
        SAMPLE_STELLAR_KEYS[0],
        125.5,
        "2026-11-21T12:00:00.000Z",
      );
      expect(leaf).toMatch(/^[a-f0-9]{64}$/);
      expect(leaf).toBe(
        hashSaleLeaf("ORD-459", SAMPLE_STELLAR_KEYS[0], 125.5, "2026-11-21T12:00:00.000Z"),
      );
      expect(leaf).not.toBe(
        hashSaleLeaf("ORD-460", SAMPLE_STELLAR_KEYS[0], 125.5, "2026-11-21T12:00:00.000Z"),
      );
    });

    it("builds a deterministic root from pairwise leaf hashes", () => {
      const leaves = ["a", "b", "c", "d"].map(sha256);
      const tree = computeMerkleTree(leaves, 400);

      expect(tree.root).toBe(`0x${tree.rootWithoutPrefix}`);
      expect(tree.rootWithoutPrefix).toMatch(/^[a-f0-9]{64}$/);
      expect(tree.leaves).toEqual(leaves);
      expect(tree.totalValidSales).toBe(4);
      expect(tree.totalAmountXlm).toBe(400);
      expect(tree.depth).toBe(2);
      expect(computeMerkleTree(leaves).root).toBe(tree.root);

      const left = sha256(`${leaves[0]}${leaves[1]}`);
      const right = sha256(`${leaves[2]}${leaves[3]}`);
      expect(tree.rootWithoutPrefix).toBe(sha256(`${left}${right}`));
    });

    it("accepts Keccak-256 leaf hashes produced by external whitelist tooling", () => {
      const keccakLeaves = [
        "c5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470",
        "4e03657aea45a94fc7d47ba826c8d667c0d1e6e33a64a036ec44f58fa12d6c45",
      ];
      const tree = computeMerkleTree(keccakLeaves);

      expect(tree.leaves).toEqual(keccakLeaves);
      expect(tree.rootWithoutPrefix).toBe(sha256(`${keccakLeaves[0]}${keccakLeaves[1]}`));
      for (let index = 0; index < keccakLeaves.length; index++) {
        expect(
          verifyMerkleProof(keccakLeaves[index], getMerkleProof(keccakLeaves, index), tree.root),
        ).toBe(true);
      }
    });
  });

  describe("2. Inclusion proof verification", () => {
    it("accepts every valid leaf and rejects modified leaves, siblings, and roots", () => {
      const leaves = ["a", "b", "c", "d"].map(sha256);
      const tree = computeMerkleTree(leaves);

      for (let index = 0; index < leaves.length; index++) {
        const proof = getMerkleProof(leaves, index);
        expect(verifyMerkleProof(leaves[index], proof, tree.root)).toBe(true);
        expect(verifyMerkleProof(leaves[index], proof, tree.rootWithoutPrefix)).toBe(true);
        expect(verifyMerkleProof(sha256(`${leaves[index]}:tampered`), proof, tree.root)).toBe(false);
      }

      const proof = getMerkleProof(leaves, 0);
      const forgedProof: MerkleProofStep[] = proof.map((step, index) =>
        index === 0 ? { ...step, hash: sha256("forged-sibling") } : step,
      );
      expect(verifyMerkleProof(leaves[0], forgedProof, tree.root)).toBe(false);
      expect(verifyMerkleProof(leaves[0], proof, `0x${"f".repeat(64)}`)).toBe(false);
      expect(() => getMerkleProof(leaves, leaves.length)).toThrow(/out of bounds/);
    });
  });

  describe("3. Edge cases", () => {
    it("returns an empty tree with a zero root for no leaves", () => {
      const tree = computeMerkleTree([]);

      expect(tree.root).toBe(`0x${"0".repeat(64)}`);
      expect(tree.rootWithoutPrefix).toBe("0".repeat(64));
      expect(tree.leaves).toEqual([]);
      expect(tree.totalValidSales).toBe(0);
      expect(tree.totalAmountXlm).toBe(0);
      expect(tree.depth).toBe(0);
      expect(() => getMerkleProof([], 0)).toThrow(/out of bounds/);
      expect(verifyMerkleProof(sha256("unlisted"), [], tree.root)).toBe(false);
    });

    it("treats a single leaf as the root with an empty proof", () => {
      const leaf = sha256("single-whitelist-allocation");
      const tree = computeMerkleTree([leaf], 12.5);

      expect(tree.rootWithoutPrefix).toBe(leaf);
      expect(tree.totalValidSales).toBe(1);
      expect(tree.totalAmountXlm).toBe(12.5);
      expect(tree.depth).toBe(1);
      expect(getMerkleProof([leaf], 0)).toEqual([]);
      expect(verifyMerkleProof(leaf, [], tree.root)).toBe(true);
      expect(verifyMerkleProof(sha256("intruder"), [], tree.root)).toBe(false);
    });

    it("duplicates the last node for an odd number of leaves", () => {
      const leaves = ["a", "b", "c"].map(sha256);
      const tree = computeMerkleTree(leaves);
      const left = sha256(`${leaves[0]}${leaves[1]}`);
      const right = sha256(`${leaves[2]}${leaves[2]}`);

      expect(tree.rootWithoutPrefix).toBe(sha256(`${left}${right}`));
      expect(getMerkleProof(leaves, 2)[0]).toEqual({ position: "right", hash: leaves[2] });
      for (let index = 0; index < leaves.length; index++) {
        expect(verifyMerkleProof(leaves[index], getMerkleProof(leaves, index), tree.root)).toBe(true);
      }
    });
  });

  describe("4. Web Worker verification of a 10,000-leaf tree", () => {
    const createWorker = () => new NodeThreadMerkleWorker() as unknown as Worker;

    it("verifies a real claim and rejects a modified claim on a separate thread", async () => {
      expect(largeTree.totalValidSales).toBe(LEAF_COUNT);

      const valid = await verifyMerkleProofInWorker(
        {
          leaves: largeTree.leaves,
          targetIndex: LEAF_COUNT - 1,
          expectedRoot: largeTree.root,
        },
        { workerFactory: createWorker },
      );
      expect(valid.success).toBe(true);
      expect(valid.isValid).toBe(true);
      expect(valid.root).toBe(largeTree.rootWithoutPrefix);
      expect(valid.proofLength).toBeGreaterThan(0);

      const forged = await verifyMerkleProofInWorker(
        {
          leaves: largeTree.leaves,
          targetIndex: LEAF_COUNT - 1,
          expectedRoot: largeTree.root,
          leafHash: sha256("unauthorized-claim"),
        },
        { workerFactory: createWorker },
      );
      expect(forged.success).toBe(true);
      expect(forged.isValid).toBe(false);
    });

    it("keeps UI ticks running while the worker verifies a 10,000-leaf proof", async () => {
      let uiTicks = 0;
      const ticker = setInterval(() => {
        uiTicks += 1;
      }, 1);

      try {
        const ticksBeforeVerification = uiTicks;
        const result = await verifyMerkleProofInWorker(
          {
            leaves: largeTree.leaves,
            targetIndex: 0,
            expectedRoot: largeTree.root,
          },
          { workerFactory: createWorker },
        );

        expect(result.isValid).toBe(true);
        expect(uiTicks - ticksBeforeVerification).toBeGreaterThan(0);
      } finally {
        clearInterval(ticker);
      }
    });
  });
});
