import { describe, it, expect } from "vitest";
import {
  sha256Hex,
  hashOrderLeaf,
  hashPair,
  buildMerkleTree,
  generateMerkleProof,
  verifyMerkleProofStepByStep,
  findLeafByTxHash,
  SAMPLE_SETTLEMENT_BATCHES,
  type OrderMetadata,
} from "../utils/merkle";

describe("Merkle Tree Cryptographic Engine & Auditor Inclusion Verification", () => {
  it("calculates deterministic SHA-256 hex strings", async () => {
    // Known NIST vector: SHA-256("hello") = 2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824
    const hash = await sha256Hex("hello");
    expect(hash).toBe("2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824");

    // Test hashOrderLeaf
    const order = SAMPLE_SETTLEMENT_BATCHES[0].orders[0];
    const leafHash = await hashOrderLeaf(order);
    expect(leafHash).toMatch(/^[a-f0-9]{64}$/);

    // Test hashPair
    const combined = await hashPair(leafHash, leafHash);
    expect(combined).toMatch(/^[a-f0-9]{64}$/);
  });

  it("builds a balanced Merkle tree for 8 orders and computes on-chain root", async () => {
    const batch = SAMPLE_SETTLEMENT_BATCHES[0];
    const tree = await buildMerkleTree(batch.orders);

    expect(tree.leafCount).toBe(8);
    expect(tree.leaves.length).toBe(8);
    expect(tree.levels.length).toBe(4); // L0 (8), L1 (4), L2 (2), L3 (1 root)
    expect(tree.levels[0].length).toBe(8);
    expect(tree.levels[1].length).toBe(4);
    expect(tree.levels[2].length).toBe(2);
    expect(tree.levels[3].length).toBe(1);
    expect(tree.root.isRoot).toBe(true);
    expect(tree.root.hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("handles odd numbers of conversion orders gracefully by duplicating last node", async () => {
    // 3 orders
    const orders: OrderMetadata[] = SAMPLE_SETTLEMENT_BATCHES[0].orders.slice(0, 3);
    const tree = await buildMerkleTree(orders);

    expect(tree.leafCount).toBe(3);
    expect(tree.levels[0].length).toBe(3);
    // Level 1: 3 nodes -> duplicated to 4 -> 2 parent nodes
    expect(tree.levels[1].length).toBe(2);
    // Level 2: 2 parent nodes -> 1 root
    expect(tree.levels[2].length).toBe(1);
    expect(tree.root.hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("generates and verifies cryptographic inclusion proofs for all leaves", async () => {
    const batch = SAMPLE_SETTLEMENT_BATCHES[0];
    const tree = await buildMerkleTree(batch.orders);

    for (let i = 0; i < tree.leaves.length; i++) {
      const proof = await generateMerkleProof(tree, i);

      expect(proof.leafIndex).toBe(i);
      expect(proof.leafHash).toBe(tree.leaves[i].hash);
      expect(proof.rootHash).toBe(tree.root.hash);
      expect(proof.steps.length).toBe(tree.height); // 3 steps for 8 leaves
      expect(proof.isValid).toBe(true);

      // Verify step-by-step
      const verification = await verifyMerkleProofStepByStep(proof);
      expect(verification.isValid).toBe(true);
      expect(verification.computedRoot).toBe(tree.root.hash);
      expect(verification.verifiedSteps.every((s) => s.isVerified)).toBe(true);
    }
  });

  it("identifies sibling positions correctly (left vs right) along verification path", async () => {
    const batch = SAMPLE_SETTLEMENT_BATCHES[0];
    const tree = await buildMerkleTree(batch.orders);

    // Leaf 0 (even) should have sibling at index 1 on right
    const proof0 = await generateMerkleProof(tree, 0);
    expect(proof0.steps[0].siblingPosition).toBe("right");
    expect(proof0.steps[0].siblingHash).toBe(tree.levels[0][1].hash);

    // Leaf 1 (odd) should have sibling at index 0 on left
    const proof1 = await generateMerkleProof(tree, 1);
    expect(proof1.steps[0].siblingPosition).toBe("left");
    expect(proof1.steps[0].siblingHash).toBe(tree.levels[0][0].hash);
  });

  it("detects cryptographic tampering and rejects invalid inclusion proofs", async () => {
    const batch = SAMPLE_SETTLEMENT_BATCHES[0];
    const tree = await buildMerkleTree(batch.orders);
    const proof = await generateMerkleProof(tree, 0);

    // Simulate tampered leaf hash (e.g. fraudulent transaction or altered commission)
    const tamperedLeafHash = "0000000000000000000000000000000000000000000000000000000000000000";
    const verification = await verifyMerkleProofStepByStep(proof, tamperedLeafHash);

    expect(verification.isValid).toBe(false);
    expect(verification.computedRoot).not.toBe(tree.root.hash);
  });

  it("locates leaf position by transaction hash ignoring case and 0x prefix", async () => {
    const batch = SAMPLE_SETTLEMENT_BATCHES[0];
    const tree = await buildMerkleTree(batch.orders);

    const targetTx = batch.orders[3].txHash;
    const result = findLeafByTxHash(tree, targetTx);

    expect(result).not.toBeNull();
    expect(result?.index).toBe(3);
    expect(result?.node.order?.orderId).toBe("ORD-9404");

    // Test with uppercase and without 0x
    const rawUpper = targetTx.replace(/^0x/, "").toUpperCase();
    const result2 = findLeafByTxHash(tree, rawUpper);
    expect(result2?.index).toBe(3);

    // Non-existent tx
    const notFound = findLeafByTxHash(tree, "0x1111111111111111111111111111111111111111");
    expect(notFound).toBeNull();
  });

  it("verifies all sample batches construct valid trees with matching inclusion proofs", async () => {
    for (const batch of SAMPLE_SETTLEMENT_BATCHES) {
      const tree = await buildMerkleTree(batch.orders);
      expect(tree.leafCount).toBe(batch.orders.length);
      expect(tree.root.hash).toMatch(/^[a-f0-9]{64}$/);

      // Verify every leaf in every batch
      for (let i = 0; i < tree.leaves.length; i++) {
        const proof = await generateMerkleProof(tree, i);
        expect(proof.isValid).toBe(true);
        const verification = await verifyMerkleProofStepByStep(proof);
        expect(verification.isValid).toBe(true);
        expect(verification.computedRoot).toBe(tree.root.hash);
      }
    }
  });

  it("generates an exportable audit proof JSON payload with full sibling metadata", async () => {
    const batch = SAMPLE_SETTLEMENT_BATCHES[0];
    const tree = await buildMerkleTree(batch.orders);
    const proof = await generateMerkleProof(tree, 2);

    const exportPayload = {
      batchId: batch.batchId,
      ledgerSequence: batch.ledgerSequence,
      leafIndex: proof.leafIndex,
      leafHash: proof.leafHash,
      orderMetadata: proof.leafOrder,
      rootHash: proof.rootHash,
      siblings: proof.steps.map((s) => ({
        level: s.level,
        position: s.siblingPosition,
        siblingHash: s.siblingHash,
      })),
      verifiedAt: "2026-05-16T08:30:00Z",
    };

    const serialized = JSON.stringify(exportPayload);
    const parsed = JSON.parse(serialized);

    expect(parsed.batchId).toBe("BATCH-2026-05-16-01");
    expect(parsed.leafIndex).toBe(2);
    expect(parsed.siblings.length).toBe(3);
    expect(parsed.rootHash).toBe(tree.root.hash);
  });
});
