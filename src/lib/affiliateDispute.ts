/**
 * Dispute Submission & Evidence Encryption Engine (Issue #171)
 *
 * Enables affiliates with contested or rejected conversions to submit
 * evidence (order receipts, click logs, screenshots) for independent
 * protocol auditor review. All evidence is encrypted client-side using
 * AES-GCM-256 and wrapped for assigned protocol auditors.
 */

import {
  generateAESKey,
  encryptPayload,
  wrapAESKey,
  unwrapAESKey,
  getPublicKeyForAddress,
} from "./crypto";
import { appendAuditAccessEvent } from "./auditLedger";

export const DISPUTES_STORAGE_KEY = "stormsale_affiliate_disputes_v1";

/** Designated protocol auditor public keys eligible for dispute adjudication */
export const DEFAULT_PROTOCOL_AUDITOR_KEYS: string[] = [
  "GAUDITOR17NORTHWIND7ASSURANCE7PROTOCOL7AUDIT7POOL7777777777",
  "GAUDITOR27HELIX7COMPLIANCE7GROUP7PROTOCOL7AUDIT777777777777",
];

export interface EvidenceFile {
  name: string;
  size: number;
  type: string;
  data: string; // Base64 encoded file content
}

export interface DisputeFormData {
  saleId: number;
  txHash: string;
  orderIds: string;
  description: string;
  files: EvidenceFile[];
  affiliateAddress?: string;
}

export interface DisputeRecord {
  docketId: string;
  saleId: number;
  txHash: string;
  orderIds: string;
  description: string;
  fileCount: number;
  fileNames: string[];
  encryptedEnvelope: string;
  wrappedKeys: Record<string, string>;
  status: "under_review";
  submittedAt: number;
  affiliateAddress?: string;
}

/**
 * Generates a unique, human-readable dispute tracking docket ID.
 * Format: DKT-<timestamp_base36>-<txHash_prefix>
 */
export function generateDocketId(txHash: string, timestamp: number = Date.now()): string {
  const timePart = timestamp.toString(36).toUpperCase().slice(-5);
  const cleanHash = (txHash || "").replace(/^0x/, "").trim();
  const hashPart = (cleanHash.slice(0, 6) || Math.random().toString(36).slice(2, 8)).toUpperCase();
  return `DKT-${timePart}-${hashPart}`;
}

/**
 * Storage abstraction for persisting dispute dockets across sessions.
 */
function getStorage(): Storage | null {
  if (typeof localStorage !== "undefined") return localStorage;
  return null;
}

export function getAllDisputeRecords(): DisputeRecord[] {
  try {
    const storage = getStorage();
    if (!storage) return [];
    const raw = storage.getItem(DISPUTES_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as DisputeRecord[]) : [];
  } catch {
    return [];
  }
}

export function getDisputeRecord(saleId: number): DisputeRecord | null {
  const records = getAllDisputeRecords();
  return records.find((r) => r.saleId === saleId) ?? null;
}

export function saveDisputeRecord(record: DisputeRecord): void {
  try {
    const records = getAllDisputeRecords();
    const existingIdx = records.findIndex((r) => r.saleId === record.saleId);
    if (existingIdx >= 0) {
      records[existingIdx] = record;
    } else {
      records.push(record);
    }
    const storage = getStorage();
    if (storage) {
      storage.setItem(DISPUTES_STORAGE_KEY, JSON.stringify(records));
    }
  } catch {
    // Ignore storage write issues
  }
}

/**
 * Helper to convert an uploaded browser File into Base64 for encrypted transmission.
 */
export async function readFileAsBase64(file: File | Blob): Promise<string> {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Validates and encrypts dispute evidence files & metadata,
 * generates a tracking docket ID, wraps the symmetric key for protocol auditors,
 * and appends an audit event to the tamper-evident ledger.
 */
export async function createEncryptedDispute(
  data: DisputeFormData,
  auditorKeys: string[] = DEFAULT_PROTOCOL_AUDITOR_KEYS,
): Promise<DisputeRecord> {
  if (!data.description || !data.description.trim()) {
    throw new Error("Dispute evidence description is required.");
  }
  if (!data.orderIds || !data.orderIds.trim()) {
    throw new Error("Merchant order ID reference is required.");
  }
  if (!data.txHash || !data.txHash.trim()) {
    throw new Error("Conversion transaction hash is required.");
  }

  const submittedAt = Date.now();
  const docketId = generateDocketId(data.txHash, submittedAt);

  // Canonical payload containing plaintext evidence details before encryption
  const evidenceBundle = {
    docketId,
    saleId: data.saleId,
    txHash: data.txHash.trim(),
    orderIds: data.orderIds.trim(),
    description: data.description.trim(),
    affiliateAddress: data.affiliateAddress?.trim(),
    files: data.files.map((f) => ({
      name: f.name,
      size: f.size,
      type: f.type,
      data: f.data,
    })),
    submittedAt,
  };

  // 1. Generate session AES-256-GCM key and encrypt payload
  const aesKey = await generateAESKey();
  const encryptedEnvelope = await encryptPayload(evidenceBundle, aesKey);

  // 2. Wrap the session key for each designated protocol auditor
  const wrappedKeys: Record<string, string> = {};
  for (const auditorKey of auditorKeys) {
    const pubKey = await getPublicKeyForAddress(auditorKey);
    wrappedKeys[auditorKey] = await wrapAESKey(aesKey, pubKey);
  }

  const record: DisputeRecord = {
    docketId,
    saleId: data.saleId,
    txHash: data.txHash.trim(),
    orderIds: data.orderIds.trim(),
    description: data.description.trim(),
    fileCount: data.files.length,
    fileNames: data.files.map((f) => f.name),
    encryptedEnvelope,
    wrappedKeys,
    status: "under_review",
    submittedAt,
    affiliateAddress: data.affiliateAddress?.trim(),
  };

  // 3. Persist record locally
  saveDisputeRecord(record);

  // 4. Notify protocol auditors via tamper-evident audit ledger
  try {
    const auditorKey = auditorKeys[0] || DEFAULT_PROTOCOL_AUDITOR_KEYS[0];
    await appendAuditAccessEvent({
      action: "dispute_opened",
      auditorPublicKey: auditorKey,
      saleId: String(data.saleId),
      campaignAddress: data.txHash.trim(),
      detail: `Dispute docket ${docketId} opened for conversion tx ${data.txHash.trim().slice(0, 10)}... (evidence items: ${data.files.length})`,
      timestamp: new Date(submittedAt).toISOString(),
    });
  } catch (err) {
    console.warn("Could not append dispute to audit ledger (continuing):", err);
  }

  return record;
}

/**
 * Unwraps the AES evidence key using the auditor's key identifier.
 */
export async function unwrapDisputeEvidenceKey(
  wrappedKey: string,
  auditorKey: string,
): Promise<CryptoKey> {
  const pubKey = await getPublicKeyForAddress(auditorKey);
  return unwrapAESKey(wrappedKey, pubKey);
}
