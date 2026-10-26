import { describe, it, expect } from "vitest";
import { StrKey } from "@stellar/stellar-sdk";
import {
  sha256Hex,
  fallbackSha256,
  hashOrderLeaf,
  hashPair,
  buildMerkleTree,
  generateMerkleProof,
  verifyMerkleProofStepByStep,
  findLeafByTxHash,
  SAMPLE_SETTLEMENT_BATCHES,
} from "../utils/merkle";

describe("Merkle Tree Cryptographic Engine & Auditor Inclusion Verification", () => {
  it("computes official NIST FIPS 180-2 SHA-256 test vectors and matches fallbackSha256 across all input lengths", async () => {
    // Official NIST FIPS 180-2 test vectors:
    // 1. Empty string
    const emptyHash = await sha256Hex("");
    expect(emptyHash).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
    expect(fallbackSha256(new Uint8Array(0))).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );

    // 2. "abc"
    const abcHash = await sha256Hex("abc");
    expect(abcHash).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    expect(fallbackSha256(new TextEncoder().encode("abc"))).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );

    // 3. 55-byte boundary (1 byte before 56-byte SHA-256 padding boundary)
    const str55 = "a".repeat(55);
    const hash55 = await sha256Hex(str55);
    expect(fallbackSha256(new TextEncoder().encode(str55))).toBe(hash55);

    // 4. 56-byte boundary (Exact 56-byte padding boundary)
    const str56 = "a".repeat(56);
    const hash56 = await sha256Hex(str56);
    expect(fallbackSha256(new TextEncoder().encode(str56))).toBe(hash56);

    // 5. 64-byte block boundary (Exact 64-byte single block)
    const str64 = "a".repeat(64);
    const hash64 = await sha256Hex(str64);
    expect(fallbackSha256(new TextEncoder().encode(str64))).toBe(hash64);

    // Test hashOrderLeaf and hashPair
    const order = SAMPLE_SETTLEMENT_BATCHES[0].orders[0];
    const leafHash = await hashOrderLeaf(order);
    expect(leafHash).toMatch(/^[a-f0-9]{64}$/);

    const combined = await hashPair(leafHash, leafHash);
    expect(combined).toMatch(/^[a-f0-9]{64}$/);
  });

  it("validates all sample batch Stellar keys (56-char G... and C... StrKeys)", () => {
    for (const batch of SAMPLE_SETTLEMENT_BATCHES) {
      expect(StrKey.isValidContract(batch.campaignAddress)).toBe(true);
      expect(batch.campaignAddress).toMatch(/^C[A-Z0-9]{55}$/);

      for (const order of batch.orders) {
        expect(StrKey.isValidEd25519PublicKey(order.affiliateAddress)).toBe(true);
        expect(order.affiliateAddress).toMatch(/^G[A-Z0-9]{55}$/);
      }
    }
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
    expect(tree.root.hash).toBe(batch.contractRootHash);
  });

  it("handles odd numbers of conversion orders via odd-node promotion and prevents duplicate-node collisions", async () => {
    const ordersA = SAMPLE_SETTLEMENT_BATCHES[0].orders.slice(0, 3);
    const treeA = await buildMerkleTree(ordersA);

    expect(treeA.leafCount).toBe(3);
    expect(treeA.levels[0].length).toBe(3);
    expect(treeA.levels[1].length).toBe(2); // Pair (0, 1) + Promoted 2
    expect(treeA.levels[2].length).toBe(1); // Root

    // Construct [A, B, C, C] (duplicated 4th leaf)
    const ordersB = [...ordersA, ordersA[2]];
    const treeB = await buildMerkleTree(ordersB);

    // Root of [A, B, C] MUST differ from root of [A, B, C, C]
    expect(treeA.root.hash).not.toBe(treeB.root.hash);
  });

  it("generates and verifies cryptographic inclusion proofs against independent trusted roots", async () => {
    const batch = SAMPLE_SETTLEMENT_BATCHES[0];
    const tree = await buildMerkleTree(batch.orders);

    for (let i = 0; i < tree.leaves.length; i++) {
      const proof = await generateMerkleProof(tree, i, batch.contractRootHash);

      expect(proof.leafIndex).toBe(i);
      expect(proof.leafHash).toBe(tree.leaves[i].hash);
      expect(proof.rootHash).toBe(batch.contractRootHash);
      expect(proof.steps.length).toBe(tree.height);
      expect(proof.isValid).toBe(true);

      // Verify against independent trusted root
      const verification = await verifyMerkleProofStepByStep(proof, batch.contractRootHash);
      expect(verification.isValid).toBe(true);
      expect(verification.computedRoot).toBe(batch.contractRootHash);
      expect(verification.verifiedSteps.every((s) => s.isVerified)).toBe(true);
    }
  });

  it("identifies sibling positions correctly (left vs right) along verification path", async () => {
    const batch = SAMPLE_SETTLEMENT_BATCHES[0];
    const tree = await buildMerkleTree(batch.orders);

    // Leaf 0 (even) should have sibling at index 1 on right
    const proof0 = await generateMerkleProof(tree, 0, batch.contractRootHash);
    expect(proof0.steps[0].siblingPosition).toBe("right");
    expect(proof0.steps[0].siblingHash).toBe(tree.levels[0][1].hash);

    // Leaf 1 (odd) should have sibling at index 0 on left
    const proof1 = await generateMerkleProof(tree, 1, batch.contractRootHash);
    expect(proof1.steps[0].siblingPosition).toBe("left");
    expect(proof1.steps[0].siblingHash).toBe(tree.levels[0][0].hash);
  });

  it("detects cryptographic tampering and rejects forged siblings, roots, and empty leaf inputs", async () => {
    const batch = SAMPLE_SETTLEMENT_BATCHES[0];
    const tree = await buildMerkleTree(batch.orders);
    const proof = await generateMerkleProof(tree, 0, batch.contractRootHash);

    // 1. Tampered leaf hash
    const tamperedLeafHash = "0000000000000000000000000000000000000000000000000000000000000000";
    const resultTamperedLeaf = await verifyMerkleProofStepByStep(
      proof,
      batch.contractRootHash,
      tamperedLeafHash,
    );
    expect(resultTamperedLeaf.isValid).toBe(false);

    // 2. Explicit empty string leaf hash does NOT fall back to proof.leafHash
    const resultEmptyLeaf = await verifyMerkleProofStepByStep(proof, batch.contractRootHash, "");
    expect(resultEmptyLeaf.isValid).toBe(false);

    // 3. Forged sibling hash
    const forgedProof = JSON.parse(JSON.stringify(proof));
    forgedProof.steps[0].siblingHash =
      "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff";
    const resultForgedSibling = await verifyMerkleProofStepByStep(
      forgedProof,
      batch.contractRootHash,
    );
    expect(resultForgedSibling.isValid).toBe(false);

    // 4. Verification against wrong / untrusted root
    const wrongRoot = "1111111111111111111111111111111111111111111111111111111111111111";
    const resultWrongRoot = await verifyMerkleProofStepByStep(proof, wrongRoot);
    expect(resultWrongRoot.isValid).toBe(false);

    // 5. Tampered leafOrder metadata fails verification even if sibling path is valid
    const tamperedOrderProof = JSON.parse(JSON.stringify(proof));
    tamperedOrderProof.leafOrder.amountXlm = 999999;
    const resultTamperedOrder = await verifyMerkleProofStepByStep(
      tamperedOrderProof,
      batch.contractRootHash,
    );
    expect(resultTamperedOrder.isValid).toBe(false);
  });

  it("locates leaf position by transaction hash ignoring case and 0x prefix", async () => {
    const batch = SAMPLE_SETTLEMENT_BATCHES[0];
    const tree = await buildMerkleTree(batch.orders);

    const targetTx = batch.orders[3].txHash;
    const result = findLeafByTxHash(tree, targetTx);

    expect(result).not.toBeNull();
    expect(result?.index).toBe(3);
    expect(result?.node.order?.orderId).toBe("ORD-9404");

    const rawUpper = targetTx.replace(/^0x/, "").toUpperCase();
    const result2 = findLeafByTxHash(tree, rawUpper);
    expect(result2?.index).toBe(3);

    const notFound = findLeafByTxHash(tree, "0x1111111111111111111111111111111111111111");
    expect(notFound).toBeNull();
  });

  it("verifies all sample batches construct valid trees matching precomputed on-chain roots", async () => {
    for (const batch of SAMPLE_SETTLEMENT_BATCHES) {
      const tree = await buildMerkleTree(batch.orders);
      expect(tree.leafCount).toBe(batch.orders.length);
      expect(tree.root.hash).toBe(batch.contractRootHash);

      for (let i = 0; i < tree.leaves.length; i++) {
        const proof = await generateMerkleProof(tree, i, batch.contractRootHash);
        expect(proof.isValid).toBe(true);

        const verification = await verifyMerkleProofStepByStep(proof, batch.contractRootHash);
        expect(verification.isValid).toBe(true);
        expect(verification.computedRoot).toBe(batch.contractRootHash);
      }
    }
  });

  it("generates an exportable audit proof JSON payload with full sibling metadata", async () => {
    const batch = SAMPLE_SETTLEMENT_BATCHES[0];
    const tree = await buildMerkleTree(batch.orders);
    const proof = await generateMerkleProof(tree, 2, batch.contractRootHash);

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
    expect(parsed.rootHash).toBe(batch.contractRootHash);
  });
});
