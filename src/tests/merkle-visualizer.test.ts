import { describe, it, expect } from "vitest";
import {
  SAMPLE_SETTLEMENT_BATCHES,
  buildMerkleTree,
  generateMerkleProof,
  verifyMerkleProofStepByStep,
  findLeafByTxHash,
} from "../utils/merkle";

describe("MerkleTreeVisualizer Component Logic & State Machine Suite", () => {
  it("resolves initial batch index and leaf selection from initialSaleId prop", async () => {
    // When an auditor clicks "Merkle Proof" on Sale #988 (Web3 Masterclass),
    // the visualizer should identify Batch 1 (Web3 Masterclass) and select that leaf
    const targetSaleId = "988";
    let matchedBatchIndex = -1;
    let matchedOrderIndex = -1;

    for (let bIdx = 0; bIdx < SAMPLE_SETTLEMENT_BATCHES.length; bIdx++) {
      const batch = SAMPLE_SETTLEMENT_BATCHES[bIdx];
      const orderIdx = batch.orders.findIndex(
        (o) =>
          o.orderId.toLowerCase().includes(targetSaleId) ||
          o.campaignId.toLowerCase().includes(targetSaleId),
      );
      if (orderIdx >= 0) {
        matchedBatchIndex = bIdx;
        matchedOrderIndex = orderIdx;
        break;
      }
    }

    expect(matchedBatchIndex).toBe(1); // Web3 Masterclass batch
    expect(matchedOrderIndex).toBeGreaterThanOrEqual(0);

    const targetBatch = SAMPLE_SETTLEMENT_BATCHES[matchedBatchIndex];
    expect(targetBatch.campaignName).toBe("Web3 Masterclass");

    const tree = await buildMerkleTree(targetBatch.orders);
    expect(tree.leaves[matchedOrderIndex].order?.campaignId).toBe("CAMP-988");
  });

  it("handles batch switching and updates trusted on-chain root and leaves", async () => {
    // Batch 0: Tech Gadgets Pro (8 orders)
    const batch0 = SAMPLE_SETTLEMENT_BATCHES[0];
    const tree0 = await buildMerkleTree(batch0.orders);
    expect(tree0.leaves.length).toBe(8);
    expect(tree0.root.hash).toBe(batch0.contractRootHash);

    // Switch to Batch 2: Summer Sale (2 orders)
    const batch2 = SAMPLE_SETTLEMENT_BATCHES[2];
    const tree2 = await buildMerkleTree(batch2.orders);
    expect(tree2.leaves.length).toBe(2);
    expect(tree2.root.hash).toBe(batch2.contractRootHash);
    expect(tree2.root.hash).not.toBe(tree0.root.hash);
  });

  it("parses transaction hash uploads across JSON receipts, CSV rows, and plain text", async () => {
    const targetTx = SAMPLE_SETTLEMENT_BATCHES[0].orders[2].txHash;
    const tree = await buildMerkleTree(SAMPLE_SETTLEMENT_BATCHES[0].orders);

    // 1. JSON receipt with txHash
    const jsonReceipt = JSON.stringify({
      orderId: "ORD-9403",
      txHash: targetTx,
      status: "Settled",
    });
    const parsedJson = JSON.parse(jsonReceipt);
    const candidateFromJson = parsedJson.txHash;
    expect(candidateFromJson).toBe(targetTx);
    expect(findLeafByTxHash(tree, candidateFromJson)?.index).toBe(2);

    // 2. CSV line
    const csvLine = `ORD-9403,${targetTx},450,2026-05-16`;
    const matchCsv = csvLine.match(/0x[a-fA-F0-9]{64}/);
    expect(matchCsv?.[0]).toBe(targetTx);
    expect(findLeafByTxHash(tree, matchCsv?.[0] || "")?.index).toBe(2);

    // 3. Plaintext without 0x
    const raw64 = targetTx.replace(/^0x/, "");
    const matchRaw = raw64.match(/[a-fA-F0-9]{64}/);
    expect(`0x${matchRaw?.[0]}`).toBe(targetTx);
    expect(findLeafByTxHash(tree, `0x${matchRaw?.[0]}`)?.index).toBe(2);
  });

  it("validates that simulated tamper mode genuinely alters computed root and fails verification", async () => {
    const batch = SAMPLE_SETTLEMENT_BATCHES[0];
    const tree = await buildMerkleTree(batch.orders);
    const proof = await generateMerkleProof(tree, 0, batch.contractRootHash);

    // Untampered verification succeeds
    const untamperedResult = await verifyMerkleProofStepByStep(proof, batch.contractRootHash);
    expect(untamperedResult.isValid).toBe(true);
    expect(untamperedResult.computedRoot).toBe(batch.contractRootHash);
    expect(untamperedResult.verifiedSteps.every((s) => s.isVerified)).toBe(true);

    // Tampered leaf hash (simulating flipped bit in tamper test mode)
    const originalLeaf = proof.leafHash;
    const flippedFirstChar =
      originalLeaf[0] === "a" ? `b${originalLeaf.slice(1)}` : `a${originalLeaf.slice(1)}`;

    const tamperedResult = await verifyMerkleProofStepByStep(
      proof,
      batch.contractRootHash,
      flippedFirstChar,
    );

    // Tampered verification fails step 1 and final root match
    expect(tamperedResult.isValid).toBe(false);
    expect(tamperedResult.computedRoot).not.toBe(batch.contractRootHash);
    expect(tamperedResult.verifiedSteps[0].isVerified).toBe(false);
  });

  it("calculates commission percentage dynamically per order", () => {
    const order10Pct = { amountXlm: 450, commissionXlm: 45 };
    const pct10 = ((order10Pct.commissionXlm / order10Pct.amountXlm) * 100).toFixed(0);
    expect(pct10).toBe("10");

    const order15Pct = { amountXlm: 750, commissionXlm: 112.5 };
    const pct15 = ((order15Pct.commissionXlm / order15Pct.amountXlm) * 100).toFixed(0);
    expect(pct15).toBe("15");

    const orderZero = { amountXlm: 0, commissionXlm: 0 };
    const pctZero =
      orderZero.amountXlm > 0
        ? ((orderZero.commissionXlm / orderZero.amountXlm) * 100).toFixed(0)
        : "0";
    expect(pctZero).toBe("0");
  });

  it("formats audit proof export payload with full cryptographic verification details", async () => {
    const batch = SAMPLE_SETTLEMENT_BATCHES[1]; // Web3 Masterclass
    const tree = await buildMerkleTree(batch.orders);
    const proof = await generateMerkleProof(tree, 1, batch.contractRootHash);
    const verification = await verifyMerkleProofStepByStep(proof, batch.contractRootHash);

    const payload = {
      batchId: batch.batchId,
      ledgerSequence: batch.ledgerSequence,
      contractRootHash: batch.contractRootHash,
      leafIndex: proof.leafIndex,
      leafHash: proof.leafHash,
      orderMetadata: proof.leafOrder,
      computedRoot: verification.computedRoot,
      isValid: verification.isValid,
      siblings: proof.steps.map((s) => ({
        level: s.level,
        position: s.siblingPosition,
        siblingHash: s.siblingHash,
      })),
      verifiedAt: new Date().toISOString(),
    };

    expect(payload.batchId).toBe("BATCH-2026-05-15-02");
    expect(payload.isValid).toBe(true);
    expect(payload.computedRoot).toBe(batch.contractRootHash);
    expect(payload.siblings.length).toBe(2);
  });
});
