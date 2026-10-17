import { describe, it, expect, beforeEach } from "vitest";
import {
  validateMasterKey,
  decryptAndVerifySale,
  getDecryptionAuditLogs,
  exportAuditLogsAsCSV,
  resetDecryptionAuditLogs,
  PRESET_KEYS_SECRET_MAP,
  PRESET_MASTER_KEYS,
} from "../lib/masterDecryptionService";

describe("Authorized Master Decryption Portal - Key Validation", () => {
  it("rejects empty master key", () => {
    const result = validateMasterKey("");
    expect(result.isValid).toBe(false);
    expect(result.error).toContain("Master Decryption Key is required");
  });

  it("rejects revoked or expired master keys", () => {
    const result = validateMasterKey("SREVOKED_KEY_EXPIRED_ON_CHAIN_GOVERNANCE_000");
    expect(result.isValid).toBe(false);
    expect(result.error).toContain("revoked");
  });

  it("rejects malformed or short keys", () => {
    const result = validateMasterKey("short-key");
    expect(result.isValid).toBe(false);
    expect(result.error).toContain("Invalid key format");
  });

  it("validates Enterprise Master Auditor Key preset successfully", () => {
    const result = validateMasterKey(PRESET_KEYS_SECRET_MAP.ENTERPRISE_MASTER);
    expect(result.isValid).toBe(true);
    expect(result.key).toBeDefined();
    expect(result.key?.role).toBe("Lead Regulatory Auditor");
    expect(result.key?.fingerprint).toBe("0x7f4e92a831b0c95f");
    expect(result.key?.permissions).toBe("all_sales");
  });

  it("validates ISO Regulatory Compliance Hex Key preset successfully", () => {
    const result = validateMasterKey(PRESET_KEYS_SECRET_MAP.REGULATORY_COMPLIANCE);
    expect(result.isValid).toBe(true);
    expect(result.key).toBeDefined();
    expect(result.key?.role).toBe("Master Compliance Officer");
    expect(result.key?.keyFormat).toBe("ed25519_hex");
  });

  it("validates valid 56-character Stellar secret key format (S...)", () => {
    // 56 char Base32 Stellar Secret format
    const mockStellarSecret = "SBV4KW4R3P5J6Q7L8M9N0B1C2D3E4F5G6H7J8K9L0M1N2P3Q4R5S6T7U";
    const result = validateMasterKey(mockStellarSecret);
    expect(result.isValid).toBe(true);
    expect(result.key?.keyFormat).toBe("stellar_secret");
    expect(result.key?.fingerprint).toContain("0x");
  });

  it("validates 64-character cryptographic hex key format", () => {
    const mockHexKey = "0x11223344556677889900aabbccddeeff11223344556677889900aabbccddeeff";
    const result = validateMasterKey(mockHexKey);
    expect(result.isValid).toBe(true);
    expect(result.key?.keyFormat).toBe("ed25519_hex");
  });
});

describe("Authorized Master Decryption Portal - Sale Envelope Decryption", () => {
  const validMasterKey = PRESET_MASTER_KEYS.ENTERPRISE_MASTER;

  it("throws error when attempting decryption without valid key", async () => {
    await expect(
      decryptAndVerifySale("1042", undefined, undefined),
    ).rejects.toThrow("Valid Master Decryption Key is required");
  });

  it("throws error when sale ID is empty", async () => {
    await expect(
      decryptAndVerifySale("", undefined, validMasterKey),
    ).rejects.toThrow("Sale ID is required");
  });

  it("decrypts known sale #1042 and produces accurate payload", async () => {
    const { envelope, auditLog } = await decryptAndVerifySale(
      "1042",
      "CA7QW5KXGPTR4N2K9J2L77XLMESCROW9999STORMTESTNET1",
      validMasterKey,
    );

    expect(envelope.saleId).toBe("#1042");
    expect(envelope.campaign).toBe("Tech Gadgets Pro");
    expect(envelope.grossConversion).toBe(450.0);
    expect(envelope.currency).toBe("XLM");
    expect(envelope.commissionRate).toBe(10);
    expect(envelope.commissionAmount).toBe(45.0);
    expect(envelope.settlementStatus).toBe("Escrow Cleared & Released");
    expect(envelope.decryptedByFingerprint).toBe(validMasterKey.fingerprint);
    expect(envelope.nistComplianceProof).toContain("NIST-SP800-38D");

    // Must generate audit log
    expect(auditLog).toBeDefined();
    expect(auditLog.saleId).toBe("#1042");
    expect(auditLog.auditorKeyFingerprint).toBe(validMasterKey.fingerprint);
    expect(auditLog.status).toBe("Verified");
  });

  it("decrypts any arbitrary custom sale ID dynamically", async () => {
    const customSaleId = "99999";
    const { envelope, auditLog } = await decryptAndVerifySale(
      customSaleId,
      "CC_CUSTOM_CONTRACT_999",
      validMasterKey,
    );

    expect(envelope.saleId).toBe("#99999");
    expect(envelope.grossConversion).toBeGreaterThan(0);
    expect(envelope.integrityHash).toBeDefined();
    expect(auditLog.saleId).toBe("#99999");
  });
});

describe("Authorized Master Decryption Portal - Immutable Audit Logging", () => {
  beforeEach(() => {
    resetDecryptionAuditLogs();
  });

  it("generates an immutable audit log entry for every decryption", async () => {
    const { auditLog } = await decryptAndVerifySale(
      "1100",
      undefined,
      PRESET_MASTER_KEYS.REGULATORY_COMPLIANCE,
    );

    expect(auditLog.id).toMatch(/^AUD-DEC-/);
    expect(auditLog.saleId).toBe("#1100");
    expect(auditLog.action).toBe("MASTER_DECRYPT_AND_VERIFY");
    expect(auditLog.auditorRole).toBe("Master Compliance Officer");
    expect(auditLog.timestamp).toBeDefined();
    expect(auditLog.verificationNotes).toContain("Master decryption authorized");
  });

  it("retrieves audit logs and includes recorded decryptions", async () => {
    const initialLogs = getDecryptionAuditLogs();
    const countBefore = initialLogs.length;

    await decryptAndVerifySale("1089", undefined, PRESET_MASTER_KEYS.ENTERPRISE_MASTER);

    const logsAfter = getDecryptionAuditLogs();
    expect(logsAfter.length).toBe(countBefore + 1);
    expect(logsAfter[0].saleId).toBe("#1089");
  });

  it("exports audit logs to CSV formatted text", () => {
    const mockLogs = [
      {
        id: "AUD-001",
        saleId: "#1042",
        campaign: "Tech Gadgets Pro",
        campaignAddress: "CA7Q1234",
        auditorKeyFingerprint: "0x7f4e92a8",
        auditorRole: "Lead Regulatory Auditor",
        action: "MASTER_DECRYPT_AND_VERIFY" as const,
        status: "Verified" as const,
        timestamp: "2026-05-16T08:12:04.000Z",
        integrityHash: "0x9f4a1c",
        verificationNotes: "Verified ok",
      },
    ];

    const csv = exportAuditLogsAsCSV(mockLogs);
    expect(csv).toContain("Audit Log ID,Sale ID,Campaign");
    expect(csv).toContain('"AUD-001","#1042"');
    expect(csv).toContain('"Tech Gadgets Pro"');
  });
});
