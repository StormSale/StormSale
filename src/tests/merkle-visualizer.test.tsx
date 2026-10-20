import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderToString } from "react-dom/server";
import { NotificationProvider } from "../context/NotificationContext";
import { MerkleTreeVisualizer } from "../components/auditor/MerkleTreeVisualizer";
import {
  SAMPLE_SETTLEMENT_BATCHES,
  buildMerkleTree,
  generateMerkleProof,
  verifyMerkleProofStepByStep,
  findLeafByTxHash,
  parseTransactionHashFromReceipt,
  calculateCommissionPercentage,
  filterBatchesForOrg,
} from "../utils/merkle";
import { Auditor } from "../pages/Auditor";
import { Web3Provider } from "../context/Web3Context";

describe("MerkleTreeVisualizer Component & Cryptographic Engine Suite", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("renders the MerkleTreeVisualizer component inside NotificationProvider with default batch", () => {
    const html = renderToString(
      <NotificationProvider>
        <MerkleTreeVisualizer />
      </NotificationProvider>,
    );

    // Title and audit headers
    expect(html).toContain("Interactive Merkle Tree Proof Visualizer");
    expect(html).toContain("Auditor Enterprise");
    expect(html).toContain("Soroban Verified");

    // Default batch 0 campaign
    expect(html).toContain("BATCH-2026-05-16-01");
    expect(html).toContain("Tech Gadgets Pro");
    expect(html).toContain("Leaves (Binary Tree)");
    expect(html).toContain("On-Chain Merkle Root (Soroban Escrow State)");

    // Search and upload controls
    expect(html).toContain("Enter or paste Transaction Hash");
    expect(html).toContain("Upload Tx Hash / Receipt");

    // Stepper controls
    expect(html).toContain("Step-by-Step SHA-256 Inclusion Proof Validation");
    expect(html).toContain("Export Audit Proof JSON");
  });

  it("renders unmatched error state cleanly when an unknown initialSaleId is provided", () => {
    const html = renderToString(
      <NotificationProvider>
        <MerkleTreeVisualizer initialSaleId="NONEXISTENT-SALE-999" />
      </NotificationProvider>,
    );

    expect(html).toContain("No Settlement Batch Found");
    expect(html).toContain("NONEXISTENT-SALE-999");
    expect(html).toContain("This audit record has not yet been committed to an on-chain settlement Merkle Tree batch");
    expect(html).toContain("Browse Batch 0");
  });

  it("renders matched batch when initialSaleId or initialTxHash matches an order", () => {
    // Sale #988 belongs to Batch 1 (Web3 Masterclass)
    const htmlSale = renderToString(
      <NotificationProvider>
        <MerkleTreeVisualizer initialSaleId="988" />
      </NotificationProvider>,
    );

    expect(htmlSale).not.toContain("No Settlement Batch Found");
    expect(htmlSale).toContain(`#${SAMPLE_SETTLEMENT_BATCHES[1].ledgerSequence.toLocaleString()}`);

    // Matching by transaction hash in Batch 2
    const targetTx = SAMPLE_SETTLEMENT_BATCHES[2].orders[0].txHash;
    const htmlTx = renderToString(
      <NotificationProvider>
        <MerkleTreeVisualizer initialTxHash={targetTx} />
      </NotificationProvider>,
    );

    expect(htmlTx).toContain(`#${SAMPLE_SETTLEMENT_BATCHES[2].ledgerSequence.toLocaleString()}`);
  });

  it("renders explicit initialBatchIndex cleanly", () => {
    const html = renderToString(
      <NotificationProvider>
        <MerkleTreeVisualizer initialBatchIndex={2} />
      </NotificationProvider>,
    );

    expect(html).toContain(`#${SAMPLE_SETTLEMENT_BATCHES[2].ledgerSequence.toLocaleString()}`);
  });

  it("disables Export Audit Proof JSON button and shows neutral prompt when verificationResult is null", () => {
    // When rendered without precomputed verificationResult (SSR initial render)
    const html = renderToString(
      <NotificationProvider>
        <MerkleTreeVisualizer />
      </NotificationProvider>,
    );

    expect(html).toContain("Select a Leaf to Verify Inclusion Proof");
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>(?:(?!<\/button>).)*Export Audit Proof JSON/s);
  });

  it("parses transaction hash uploads across JSON receipts, CSV rows, and plain text using parseTransactionHashFromReceipt", async () => {
    const targetTx = SAMPLE_SETTLEMENT_BATCHES[0].orders[2].txHash;
    const tree = await buildMerkleTree(SAMPLE_SETTLEMENT_BATCHES[0].orders);

    // 1. JSON receipt with txHash
    const jsonReceipt = JSON.stringify({
      orderId: "ORD-9403",
      txHash: targetTx,
      status: "Settled",
    });
    const candidateFromJson = parseTransactionHashFromReceipt(jsonReceipt, true);
    expect(candidateFromJson).toBe(targetTx);
    expect(findLeafByTxHash(tree, candidateFromJson!)?.index).toBe(2);

    // 2. CSV line
    const csvLine = `ORD-9403,${targetTx},450,2026-05-16`;
    const candidateFromCsv = parseTransactionHashFromReceipt(csvLine, false);
    expect(candidateFromCsv).toBe(targetTx);
    expect(findLeafByTxHash(tree, candidateFromCsv!)?.index).toBe(2);

    // 3. Plaintext without 0x
    const raw64 = targetTx.replace(/^0x/, "");
    const candidateFromRaw = parseTransactionHashFromReceipt(raw64, false);
    expect(candidateFromRaw).toBe(targetTx);
    expect(findLeafByTxHash(tree, candidateFromRaw!)?.index).toBe(2);
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

  it("calculates commission percentage dynamically per order using calculateCommissionPercentage", () => {
    expect(calculateCommissionPercentage(450, 45)).toBe("10");
    expect(calculateCommissionPercentage(750, 112.5)).toBe("15");
    expect(calculateCommissionPercentage(0, 0)).toBe("0");
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

  it("filters batches by organization tenancy using filterBatchesForOrg", () => {
    // Northwind has sales 1042 and 1100 -> Batch 0 & Batch 2
    const northwindBatches = filterBatchesForOrg("northwind-assurance");
    expect(northwindBatches.some((b) => b.campaignName === "Tech Gadgets Pro")).toBe(true);
    expect(northwindBatches.some((b) => b.campaignName === "Summer Sale 2026")).toBe(true);
    expect(northwindBatches.some((b) => b.campaignName === "Web3 Masterclass")).toBe(false);

    // Helix has sale 988 -> Batch 1
    const helixBatches = filterBatchesForOrg("helix-compliance");
    expect(helixBatches.some((b) => b.campaignName === "Web3 Masterclass")).toBe(true);
    expect(helixBatches.some((b) => b.campaignName === "Tech Gadgets Pro")).toBe(false);

    // When no organizationId is passed, returns all batches
    const allBatches = filterBatchesForOrg(undefined);
    expect(allBatches.length).toBe(SAMPLE_SETTLEMENT_BATCHES.length);
  });

  it("renders MerkleTreeVisualizer scoped to organizationId", () => {
    const html = renderToString(
      <NotificationProvider>
        <MerkleTreeVisualizer organizationId="helix-compliance" />
      </NotificationProvider>,
    );

    // Only Helix's batch should be in the select options
    expect(html).toContain("Web3 Masterclass");
    expect(html).not.toContain("Tech Gadgets Pro (8 Conversions)");
  });

  it("renders Auditor root component including tenancy selector and merkle navigation", () => {
    const html = renderToString(
      <Web3Provider>
        <Auditor onBack={() => {}} />
      </Web3Provider>,
    );
    expect(html).toContain("Organization scope");
    expect(html).toContain("Northwind");
    expect(html).toContain("Helix");
    expect(html).toContain("Meridian");
    expect(html).toContain("Interactive Merkle Tree Proof Explorer");
  });
});

