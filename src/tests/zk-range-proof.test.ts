import { describe, it, expect, beforeEach } from "vitest";
import {
  createPedersenCommitment,
  generateBulletproofRangeProof,
  verifyRangeProofCore,
  fetchOnChainConversionMetadata,
  fetchLedgerStateRecord,
  formatVerificationBadge,
  MOCK_ON_CHAIN_METADATA_STORE,
} from "../lib/zkRangeProof";
import { verifyRangeProof } from "../lib/zkWorkerClient";
import { instantiateZKRangeProofWasm } from "../lib/zkWasmBytecode";
import type { ApprovedRangeThresholds } from "../types/zkRangeProof";

describe("Zero-Knowledge Range Proof Verification Engine", () => {
  const standardRange: ApprovedRangeThresholds = {
    min: 10,
    max: 5000,
    currency: "USD",
  };

  beforeEach(() => {
    // Reset any state if necessary
  });

  describe("WebAssembly Cryptographic Primitives", () => {
    it("instantiates WebAssembly module and exposes verification exports", async () => {
      const wasmInstance = await instantiateZKRangeProofWasm();
      expect(wasmInstance).toBeDefined();
      expect(wasmInstance.exports.memory).toBeDefined();
      expect(typeof wasmInstance.exports.verify_range_bounds).toBe("function");
      expect(typeof wasmInstance.exports.verify_inner_product).toBe("function");
      expect(typeof wasmInstance.exports.verify_bulletproof_wasm).toBe("function");
      expect(typeof wasmInstance.exports.pedersen_hash_wasm).toBe("function");
    });

    it("verifies range constraints in WebAssembly accurately", async () => {
      const wasm = await instantiateZKRangeProofWasm();
      // In range: 450 within [10, 5000]
      expect(wasm.exports.verify_range_bounds(450, 450, 10, 5000)).toBe(1);
      // Below min: 5 is not within [10, 5000]
      expect(wasm.exports.verify_range_bounds(5, 5, 10, 5000)).toBe(0);
      // Above max: 8500 is not within [10, 5000]
      expect(wasm.exports.verify_range_bounds(8500, 8500, 10, 5000)).toBe(0);
    });

    it("evaluates inner product verification rounds in WebAssembly", async () => {
      const wasm = await instantiateZKRangeProofWasm();
      expect(wasm.exports.verify_inner_product(0, 6)).toBe(1);
      expect(wasm.exports.verify_inner_product(0, 0)).toBe(0);
    });
  });

  describe("Pedersen Commitments & Bulletproofs Generation", () => {
    it("creates blinding-protected Pedersen commitments", () => {
      const comm1 = createPedersenCommitment(450, 123456n);
      const comm2 = createPedersenCommitment(450, 999999n);
      expect(comm1.commitment).toBeDefined();
      expect(comm1.commitment.startsWith("0x02")).toBe(true);
      // Different blinding factor produces different commitment for same value
      expect(comm1.commitment).not.toBe(comm2.commitment);
    });

    it("generates inner-product argument vector commitments L and R", () => {
      const { proof, commitment } = generateBulletproofRangeProof(450, standardRange);
      expect(proof.version).toBe("bulletproofs-v1");
      expect(proof.commitment).toBe(commitment);
      expect(proof.innerProductProof.L.length).toBe(6);
      expect(proof.innerProductProof.R.length).toBe(6);
      expect(proof.T1).toBeDefined();
      expect(proof.T2).toBeDefined();
      expect(proof.taux).toBeDefined();
      expect(proof.that).toBeDefined();
      expect(proof.mu).toBeDefined();
      expect(proof.transcriptHash).toBeDefined();
    });
  });

  describe("Acceptance Criteria Verification", () => {
    it("AC 1: Verification console validates range proof against ledger state", async () => {
      const metadata = await fetchOnChainConversionMetadata("1042");
      const ledgerState = await fetchLedgerStateRecord("1042", metadata.campaignAddress);

      // Verify against legitimate ledger state
      const result = await verifyRangeProofCore({
        saleId: "1042",
        campaignAddress: metadata.campaignAddress,
        conversionMetadata: metadata,
        ledgerState,
      });

      expect(result.isValid).toBe(true);
      expect(result.ledgerVerified).toBe(true);
      expect(result.ledgerSequence).toBe(4912834);
      expect(result.cryptographicDetails.ledgerStateMatch).toBe(true);

      // Verify that tampering with ledger state commitment causes verification failure
      const tamperedLedgerState = {
        ...ledgerState,
        registeredCommitment: "0x02ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
      };
      const failedResult = await verifyRangeProofCore({
        saleId: "1042",
        campaignAddress: metadata.campaignAddress,
        conversionMetadata: metadata,
        ledgerState: tamperedLedgerState,
      });

      expect(failedResult.isValid).toBe(false);
      expect(failedResult.ledgerVerified).toBe(false);
      expect(failedResult.cryptographicDetails.ledgerStateMatch).toBe(false);
    });

    it("AC 2: Output confirms compliance without disclosing exact purchase amount", async () => {
      const result = await verifyRangeProof({
        saleId: "1042",
        campaignAddress: MOCK_ON_CHAIN_METADATA_STORE["1042"].campaignAddress,
      });

      expect(result.isValid).toBe(true);
      // Explicit guarantee: amountDisclosed is strictly false
      expect(result.amountDisclosed).toBe(false);
      // Result object must not contain exact raw values ($450)
      const serialized = JSON.stringify(result);
      expect(serialized).not.toContain("450.00");
      expect(serialized).not.toContain("450 XLM");
      // Result confirms compliance
      expect(result.complianceNotice).toContain("Audit Confirmed");
      expect(result.complianceNotice).toContain("remains confidential");
    });

    it("AC 3: Verification completes in < 500ms client-side", async () => {
      const start = performance.now();
      const result = await verifyRangeProof({
        saleId: "1042",
        campaignAddress: MOCK_ON_CHAIN_METADATA_STORE["1042"].campaignAddress,
      });
      const totalElapsed = performance.now() - start;

      expect(result.isValid).toBe(true);
      expect(result.executionTimeMs).toBeLessThan(500);
      expect(totalElapsed).toBeLessThan(500);
    });

    it("Badge Requirement: Displays verification badge (Cryptographically Proven in Range: $10 - $5,000)", async () => {
      const badge = formatVerificationBadge(standardRange);
      expect(badge).toBe("Cryptographically Proven in Range: $10 - $5,000");

      const result = await verifyRangeProof({
        saleId: "1042",
        campaignAddress: MOCK_ON_CHAIN_METADATA_STORE["1042"].campaignAddress,
      });
      expect(result.badgeText).toBe("Cryptographically Proven in Range: $10 - $5,000");
    });

    it("detects and rejects out-of-range transactions (Sale #1205 exceeds $5,000 budget)", async () => {
      const result = await verifyRangeProof({
        saleId: "1205",
        campaignAddress: MOCK_ON_CHAIN_METADATA_STORE["1205"].campaignAddress,
      });

      expect(result.isValid).toBe(false);
      expect(result.complianceNotice).toContain("Audit Failed");
    });

    it("detects and rejects altered Fiat-Shamir transcripts", async () => {
      const metadata = JSON.parse(JSON.stringify(await fetchOnChainConversionMetadata("1042")));
      metadata.rangeProof.transcriptHash = "0x00000000corruptedtranscript";

      const result = await verifyRangeProofCore({
        saleId: "1042",
        campaignAddress: metadata.campaignAddress,
        conversionMetadata: metadata,
      });

      expect(result.isValid).toBe(false);
      expect(result.cryptographicDetails.transcriptValid).toBe(false);
    });
  });
});
