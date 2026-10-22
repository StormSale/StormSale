import { describe, it, expect, beforeEach } from "vitest";
import { verifyRangeProofWasm, formatCurrencyAmount, formatCurrencyRange } from "./bulletproofWasm";
import {
  createMockRangeProof,
  verifyConversionRangeProof,
  buildRangeProofCertificate,
  SAMPLE_CONVERSION_METADATA,
  fetchConversionMetadata,
} from "./rangeProofService";
import { readAuditLedger } from "../auditLedger";

describe("Issue #175: Zero-Knowledge Range Proof Verification for Private Sale Amounts", () => {
  beforeEach(() => {
    // Clear in-memory ledger storage if present
    if (typeof localStorage !== "undefined") {
      localStorage.clear();
    }
  });

  describe("WebAssembly Verification Kernel & Currency Formatting", () => {
    it("formats cents accurately with dollar symbols and commas", () => {
      expect(formatCurrencyAmount(1000)).toBe("$10");
      expect(formatCurrencyAmount(500000)).toBe("$5,000");
      expect(formatCurrencyAmount(123456)).toBe("$1,234.56");
      expect(formatCurrencyRange(1000, 500000)).toBe("$10 - $5,000");
    });

    it("satisfies Acceptance Criteria 3: verification completes in < 500ms client-side", async () => {
      const proof = createMockRangeProof(25000, 1000, 500000);
      const startTime = performance.now();
      const res = await verifyRangeProofWasm(proof);
      const elapsed = performance.now() - startTime;

      expect(res.valid).toBe(true);
      expect(res.verificationTimeMs).toBeLessThan(500);
      expect(res.meetsPerformanceTarget).toBe(true);
      expect(elapsed).toBeLessThan(500);
    });

    it("satisfies Acceptance Criteria 2: output confirms compliance without disclosing exact purchase amount", async () => {
      const proof = createMockRangeProof(34900, 1000, 500000);
      const res = await verifyRangeProofWasm(proof);

      expect(res.valid).toBe(true);
      expect(res.disclosedAmount).toBeNull();
      // Required badge text
      expect(res.badgeText).toBe("Cryptographically Proven in Range: $10 - $5,000");
      expect(res.formattedRange).toBe("$10 - $5,000");
    });

    it("rejects proof with budget minimum violation", async () => {
      const proof = createMockRangeProof(500, 500, 500000); // $5 min
      const res = await verifyRangeProofWasm(proof, {
        expectedBudgetMin: 1000, // Policy requires >= $10 min
      });

      expect(res.valid).toBe(false);
      expect(res.message).toContain("below required policy threshold");
    });

    it("rejects proof with budget cap violation", async () => {
      const proof = createMockRangeProof(600000, 1000, 600000); // $6,000 max
      const res = await verifyRangeProofWasm(proof, {
        expectedBudgetMax: 500000, // Policy requires <= $5,000 cap
      });

      expect(res.valid).toBe(false);
      expect(res.message).toContain("exceeds approved budget cap");
    });

    it("rejects malformed Pedersen commitment", async () => {
      const proof = {
        commitment: "INVALID_POINT_!@#",
        proof: "abcd".repeat(100),
        minAmountCents: 1000,
        maxAmountCents: 500000,
        bitLength: 64,
      };

      const res = await verifyRangeProofWasm(proof);
      expect(res.valid).toBe(false);
      expect(res.message).toContain("Invalid Pedersen commitment");
    });

    it("rejects tampered or corrupted proof bytes", async () => {
      const tamperedProof = createMockRangeProof(25000, 1000, 500000, true);
      const res = await verifyRangeProofWasm(tamperedProof);
      expect(res.valid).toBe(false);
      expect(res.diagnostics.rangeIntegrity).toBe(false);
    });
  });

  describe("Acceptance Criteria 1: Verification console validates range proof against ledger state", () => {
    it("validates valid on-chain conversion order with ledger binding", async () => {
      const metadata = SAMPLE_CONVERSION_METADATA[0]; // Sale #1042
      const res = await verifyConversionRangeProof(metadata, {
        expectedBudgetMin: 1000,
        expectedBudgetMax: 500000,
        forceDirect: true,
      });

      expect(res.valid).toBe(true);
      expect(res.ledgerVerified).toBe(true);
      expect(res.diagnostics.ledgerSequence).toBe(metadata.ledgerSequence);
      expect(res.diagnostics.txHash).toBe(metadata.txHash);
      expect(res.badgeText).toBe("Cryptographically Proven in Range: $10 - $5,000");
    });

    it("fails verification if ledger state has missing transaction hash or sequence", async () => {
      const invalidLedgerMeta = {
        ...SAMPLE_CONVERSION_METADATA[0],
        txHash: "",
        ledgerSequence: 0,
      };

      const res = await verifyConversionRangeProof(invalidLedgerMeta, {
        forceDirect: true,
      });
      expect(res.valid).toBe(false);
      expect(res.ledgerVerified).toBe(false);
    });

    it("records verification action into transparent audit ledger", async () => {
      const metadata = SAMPLE_CONVERSION_METADATA[0];
      await verifyConversionRangeProof(metadata, {
        auditorKey: "GAUDITORTEST1234567890STORMCOMPLIANCEKEY",
        forceDirect: true,
      });

      const events = readAuditLedger();
      const last = events[events.length - 1];
      expect(last).toBeDefined();
      expect(last.action).toBe("access_granted");
      expect(last.saleId).toBe(metadata.saleId);
      expect(last.detail).toContain("ZK Range Proof Verified");
    });
  });

  describe("Compliance Attestation Report & Presets", () => {
    it("generates complete SOC 2 attestation text certificate with privacy guarantees", async () => {
      const metadata = SAMPLE_CONVERSION_METADATA[0];
      const res = await verifyConversionRangeProof(metadata, { forceDirect: true });

      const cert = buildRangeProofCertificate({
        organization: "Stellar Foundation Compliance",
        auditorKey: "GAUDITORTEST123",
        metadata,
        result: res,
      });

      expect(cert).toContain("ZERO-KNOWLEDGE RANGE PROOF ATTESTATION");
      expect(cert).toContain("Cryptographically Proven in Range: $10 - $5,000");
      expect(cert).toContain("[WITHHELD BY ZERO-KNOWLEDGE PROTOCOL]");
      expect(cert).toContain("STRICTLY NULL (0 PII DISCLOSED)");
      expect(cert).toContain(`Sale ID:                 ${metadata.saleId}`);
      expect(cert).toContain(`Transaction Hash:        ${metadata.txHash}`);
    });

    it("fetches metadata dynamically for new sale IDs", async () => {
      const meta = await fetchConversionMetadata("9999");
      expect(meta).not.toBeNull();
      expect(meta?.saleId).toBe("9999");
      expect(meta?.rangeProof.minAmountCents).toBe(1000);
      expect(meta?.rangeProof.maxAmountCents).toBe(500000);
    });
  });
});
