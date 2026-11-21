// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import {
  validateMerkleRootFormat,
  formatMerkleRootForHorizonMemo,
  verifyHorizonMerklePublication,
  buildAuditCertificate,
  normalizeHorizonMemoToHex,
  type HorizonTransactionResponse,
} from "../lib/horizonMerkleAudit";
import { AuditCertificateBadge } from "../components/auditor/AuditCertificateBadge";

describe("Batch Sales Merkle Root Publication & Horizon Audit Suite (#470)", () => {
  const SAMPLE_VALID_ROOT = "a3f5b7c8901234567890abcdef1234567890abcdef1234567890abcdef123456";
  const SAMPLE_PREFIXED_ROOT = `0x${SAMPLE_VALID_ROOT}`;
  const SAMPLE_TX_HASH = "8f3d82a1b4c7e90f234567890abcdef1234567890abcdef1234567890abcdef1";

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe("1. 32-Byte Hex Merkle Root Formatting & Normalization", () => {
    it("accepts canonical 64-character lowercase hex string as valid 32-byte root", () => {
      const result = validateMerkleRootFormat(SAMPLE_VALID_ROOT);
      expect(result.isValid).toBe(true);
      expect(result.normalizedRoot).toBe(SAMPLE_VALID_ROOT);
      expect(result.byteLength).toBe(32);
      expect(result.error).toBeUndefined();
    });

    it("accepts 0x-prefixed and uppercase hex root and normalizes to clean lowercase", () => {
      const uppercasePrefixed = "0X" + SAMPLE_VALID_ROOT.toUpperCase();
      const result = validateMerkleRootFormat(uppercasePrefixed);
      expect(result.isValid).toBe(true);
      expect(result.normalizedRoot).toBe(SAMPLE_VALID_ROOT.toLowerCase());
      expect(result.byteLength).toBe(32);
    });

    it("rejects roots with invalid lengths (< 64 or > 64 hex characters)", () => {
      // 62 chars (31 bytes)
      const shortRoot = SAMPLE_VALID_ROOT.slice(0, 62);
      const shortResult = validateMerkleRootFormat(shortRoot);
      expect(shortResult.isValid).toBe(false);
      expect(shortResult.error).toContain("Invalid Merkle root length");

      // 66 chars (33 bytes) without 0x
      const longRoot = SAMPLE_VALID_ROOT + "abcd";
      const longResult = validateMerkleRootFormat(longRoot);
      expect(longResult.isValid).toBe(false);
      expect(longResult.error).toContain("Invalid Merkle root length");
    });

    it("rejects non-hexadecimal characters, empty strings, and non-string inputs", () => {
      const invalidChars = "g".repeat(64);
      expect(validateMerkleRootFormat(invalidChars).isValid).toBe(false);
      expect(validateMerkleRootFormat(invalidChars).error).toContain("non-hexadecimal");

      expect(validateMerkleRootFormat("").isValid).toBe(false);
      expect(validateMerkleRootFormat("   ").isValid).toBe(false);
      expect(validateMerkleRootFormat(null).isValid).toBe(false);
      expect(validateMerkleRootFormat(undefined).isValid).toBe(false);
      expect(validateMerkleRootFormat(12345 as any).isValid).toBe(false);
    });

    it("formats 32-byte root into Stellar Horizon memo format (MemoHash hex & base64)", () => {
      const memoFormat = formatMerkleRootForHorizonMemo(SAMPLE_PREFIXED_ROOT);
      expect(memoFormat.memoType).toBe("hash");
      expect(memoFormat.memoHex).toBe(SAMPLE_VALID_ROOT);
      expect(typeof memoFormat.memoBase64).toBe("string");
      expect(memoFormat.memoBase64.length).toBeGreaterThanOrEqual(43);

      // Verify round-trip conversion from base64 back to hex
      const roundTripHex = normalizeHorizonMemoToHex(memoFormat.memoBase64);
      expect(roundTripHex).toBe(SAMPLE_VALID_ROOT);
    });
  });

  describe("2. Horizon Ledger Verification Tool", () => {
    it("successfully verifies published Merkle root against Horizon transaction memo", async () => {
      const mockHorizonResponse: HorizonTransactionResponse = {
        id: SAMPLE_TX_HASH,
        hash: SAMPLE_TX_HASH,
        ledger: 48912044,
        created_at: "2026-11-20T14:32:00Z",
        memo_type: "hash",
        memo: SAMPLE_VALID_ROOT,
        successful: true,
        source_account: "GBBD111122223333444455556666777788889999AAAABBBBCCCC5678",
      };

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockHorizonResponse,
      });

      const verification = await verifyHorizonMerklePublication({
        horizonUrl: "https://horizon-testnet.stellar.org",
        txHash: SAMPLE_TX_HASH,
        expectedRoot: SAMPLE_PREFIXED_ROOT,
        fetchFn: mockFetch as any,
      });

      expect(verification.verified).toBe(true);
      expect(verification.isFinalized).toBe(true);
      expect(verification.matched).toBe(true);
      expect(verification.ledgerSequence).toBe(48912044);
      expect(verification.txHash).toBe(SAMPLE_TX_HASH);
      expect(verification.publishedRoot).toBe(SAMPLE_VALID_ROOT);
      expect(verification.certificateId).toContain("CERT-HRZ-48912044");

      // Verify certificate generation
      const certificate = buildAuditCertificate(verification, {
        batchId: "BATCH-2026-11-01",
        network: "Testnet",
      });
      expect(certificate.verificationStatus).toBe("FINALIZED_ON_CHAIN");
      expect(certificate.ledgerSequence).toBe(48912044);
      expect(certificate.merkleRoot).toBe(SAMPLE_VALID_ROOT);
    });

    it("verifies base64 encoded Horizon memo correctly against hex expected root", async () => {
      const { memoBase64 } = formatMerkleRootForHorizonMemo(SAMPLE_VALID_ROOT);

      const mockHorizonResponse: HorizonTransactionResponse = {
        id: SAMPLE_TX_HASH,
        hash: SAMPLE_TX_HASH,
        ledger: 48912050,
        created_at: "2026-11-20T14:35:00Z",
        memo_type: "hash",
        memo: memoBase64,
        successful: true,
      };

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockHorizonResponse,
      });

      const verification = await verifyHorizonMerklePublication({
        txHash: SAMPLE_TX_HASH,
        expectedRoot: SAMPLE_VALID_ROOT,
        fetchFn: mockFetch as any,
      });

      expect(verification.verified).toBe(true);
      expect(verification.matched).toBe(true);
      expect(verification.publishedRoot).toBe(SAMPLE_VALID_ROOT);
    });

    it("detects cryptographic tampering and rejects mismatched root memo", async () => {
      const forgedMemo = "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff";

      const mockHorizonResponse: HorizonTransactionResponse = {
        id: SAMPLE_TX_HASH,
        hash: SAMPLE_TX_HASH,
        ledger: 48912060,
        created_at: "2026-11-20T14:40:00Z",
        memo_type: "hash",
        memo: forgedMemo,
        successful: true,
      };

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockHorizonResponse,
      });

      const verification = await verifyHorizonMerklePublication({
        txHash: SAMPLE_TX_HASH,
        expectedRoot: SAMPLE_VALID_ROOT,
        fetchFn: mockFetch as any,
      });

      expect(verification.verified).toBe(false);
      expect(verification.isFinalized).toBe(false);
      expect(verification.matched).toBe(false);
      expect(verification.tampered).toBe(true);
      expect(verification.error).toContain("Audit mismatch");
    });

    it("handles failed transactions, missing memos, and Horizon 404 responses cleanly", async () => {
      // 1. Failed transaction on-chain
      const failedFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          id: SAMPLE_TX_HASH,
          ledger: 48912070,
          successful: false,
        }),
      });

      const failedVerif = await verifyHorizonMerklePublication({
        txHash: SAMPLE_TX_HASH,
        expectedRoot: SAMPLE_VALID_ROOT,
        fetchFn: failedFetch as any,
      });
      expect(failedVerif.verified).toBe(false);
      expect(failedVerif.error).toContain("failed execution");

      // 2. Transaction has no memo
      const noMemoFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          id: SAMPLE_TX_HASH,
          ledger: 48912075,
          successful: true,
        }),
      });

      const noMemoVerif = await verifyHorizonMerklePublication({
        txHash: SAMPLE_TX_HASH,
        expectedRoot: SAMPLE_VALID_ROOT,
        fetchFn: noMemoFetch as any,
      });
      expect(noMemoVerif.verified).toBe(false);
      expect(noMemoVerif.error).toContain("does not contain a published Merkle root memo");

      // 3. 404 Not Found from Horizon
      const notFoundFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        statusText: "Not Found",
      });

      const notFoundVerif = await verifyHorizonMerklePublication({
        txHash: SAMPLE_TX_HASH,
        expectedRoot: SAMPLE_VALID_ROOT,
        fetchFn: notFoundFetch as any,
      });
      expect(notFoundVerif.verified).toBe(false);
      expect(notFoundVerif.error).toContain("404");
    });
  });

  describe("3. Audit Certificate Badge Display", () => {
    it("renders finalized audit certificate badge with ledger sequence and verified pill", () => {
      const handleDownload = vi.fn();

      render(
        React.createElement(AuditCertificateBadge, {
          isFinalized: true,
          ledgerSequence: 48912044,
          merkleRoot: SAMPLE_VALID_ROOT,
          network: "Stellar Testnet",
          certificateId: "CERT-HRZ-48912044-8F3D82A1",
          onDownloadCertificate: handleDownload,
        }),
      );

      // Verify certificate badge container
      const badge = screen.getByTestId("audit-certificate-badge");
      expect(badge).toBeDefined();

      // Verify text contents
      expect(screen.getByText("Horizon Audit Finalized")).toBeDefined();
      expect(screen.getByText("Verified")).toBeDefined();
      expect(screen.getByText("Ledger #48912044")).toBeDefined();
      expect(screen.getByText("Stellar Testnet")).toBeDefined();
      expect(screen.getByText("CERT-HRZ-48912044-8F3D82A1")).toBeDefined();

      // Verify download certificate action
      const downloadBtn = screen.getByRole("button", { name: /Download Audit Certificate/i });
      fireEvent.click(downloadBtn);
      expect(handleDownload).toHaveBeenCalledTimes(1);

      // Verify copy Merkle root action
      const copyBtn = screen.getByRole("button", { name: /Copy Merkle Root/i });
      expect(copyBtn).toBeDefined();
    });

    it("renders pending badge when Merkle root has not yet achieved irreversible ledger consensus", () => {
      render(React.createElement(AuditCertificateBadge, { isFinalized: false }));

      expect(screen.getByTestId("audit-pending-badge")).toBeDefined();
      expect(screen.getByText("Pending Horizon Finalization")).toBeDefined();
      expect(screen.queryByTestId("audit-certificate-badge")).toBeNull();
    });

    it("renders tampered warning badge when cryptographic integrity check fails", () => {
      render(
        React.createElement(AuditCertificateBadge, {
          isFinalized: false,
          tampered: true,
          merkleRoot: SAMPLE_VALID_ROOT,
        }),
      );

      expect(screen.getByTestId("audit-tampered-badge")).toBeDefined();
      expect(screen.getByText("Integrity Violation: Root Mismatch")).toBeDefined();
      expect(screen.queryByTestId("audit-certificate-badge")).toBeNull();
    });
  });
});
