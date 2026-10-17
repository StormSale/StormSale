/**
 * Master Decryption Portal Types
 * Cryptographic key validation, decrypted sale envelopes, and audit log records.
 */

export type AuditorKeyFormat = "stellar_secret" | "ed25519_hex" | "rsa_pem" | "cert_token";

export interface AuditorMasterKey {
  keyId: string;
  keyFormat: AuditorKeyFormat;
  fingerprint: string;
  label: string;
  role: "Lead Regulatory Auditor" | "Master Compliance Officer" | "System Inspector";
  permissions: "all_sales" | "assigned_sales_only";
  authorizedAddress: string;
  expiresAt: string;
  isValid: boolean;
  algorithm: string;
}

export interface KeyValidationResult {
  isValid: boolean;
  error?: string;
  key?: AuditorMasterKey;
}

export interface DecryptedSaleEnvelope {
  saleId: string;
  campaign: string;
  campaignAddress: string;
  advertiserAddress: string;
  affiliateAddress: string;
  buyerWallet: string;
  buyerHash: string;
  grossConversion: number;
  currency: "XLM" | "USDC";
  commissionRate: number; // e.g. 10%
  commissionAmount: number;
  settlementStatus: "Escrow Cleared & Released" | "Pending Clearing Window" | "Disputed" | "Flagged";
  ledgerTimestamp: string;
  decryptedAt: string;
  integrityHash: string;
  onChainSignature: string;
  nistComplianceProof: string;
  decryptedByFingerprint: string;
  decryptedByRole: string;
}

export interface DecryptionAuditLogEntry {
  id: string;
  saleId: string;
  campaign: string;
  campaignAddress: string;
  auditorKeyFingerprint: string;
  auditorRole: string;
  action: "MASTER_DECRYPT_AND_VERIFY";
  status: "Verified" | "Integrity Warning";
  timestamp: string;
  integrityHash: string;
  verificationNotes: string;
}
