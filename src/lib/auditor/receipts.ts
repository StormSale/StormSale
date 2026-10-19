/**
 * Cryptographic Verification Receipts Generator
 * Issues individual verification receipts for each evidence file and the aggregated bundle.
 */

import { sha256Hex } from "./hasher";
import type { EvidenceReceipt, Soc2Category } from "./types";

const GENERATOR_VERSION = "StormSale SOC 2 Evidence Packager v1.0.0";

/**
 * Generates a standard UUID v4 string (Web Crypto or math fallback).
 */
export function generateReceiptId(): string {
  if (typeof globalThis !== "undefined" && globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Creates a verification receipt for a specific evidence file.
 */
export async function createEvidenceReceipt(
  targetPath: string,
  content: string | Uint8Array,
  category: Soc2Category | "Bundle Root",
  timestamp: string = new Date().toISOString(),
): Promise<EvidenceReceipt> {
  const hash = await sha256Hex(content);
  const sizeBytes =
    typeof content === "string" ? new TextEncoder().encode(content).length : content.byteLength;

  return {
    receiptId: generateReceiptId(),
    targetPath,
    sha256: hash,
    algorithm: "SHA-256",
    sizeBytes,
    category,
    timestamp,
    generator: GENERATOR_VERSION,
  };
}

export interface BundleReceipt {
  receiptId: string;
  bundleTitle: string;
  rootDigest?: string;
  rootAlgorithm: "SHA-256";
  generator: string;
  timestamp: string;
  totalEvidenceFiles: number;
  totalSizeBytes: number;
  signerKeyId: string;
  signatureAlgorithm: string;
  fileReceiptsSummary: Array<{
    targetPath: string;
    sha256: string;
    category: string;
  }>;
}

export interface CreateBundleReceiptOptions {
  fileReceipts: EvidenceReceipt[];
  signerKeyId?: string;
  timestamp?: string;
  rootDigest?: string;
}

/**
 * Creates the bundle-level root verification receipt.
 * Supports being constructed without root-dependent fields so it can be included in the hashed set.
 */
export function createBundleReceipt(
  optionsOrArg1: CreateBundleReceiptOptions | string | EvidenceReceipt[],
  arg2?: EvidenceReceipt[] | string,
  arg3?: string,
  arg4?: string,
): BundleReceipt {
  let rootDigest: string | undefined;
  let fileReceipts: EvidenceReceipt[];
  let signerKeyId: string;
  let timestamp: string = new Date().toISOString();

  if (
    typeof optionsOrArg1 === "object" &&
    !Array.isArray(optionsOrArg1) &&
    "fileReceipts" in optionsOrArg1
  ) {
    const opts = optionsOrArg1 as CreateBundleReceiptOptions;
    fileReceipts = opts.fileReceipts || [];
    signerKeyId = opts.signerKeyId || "UNKNOWN";
    if (opts.timestamp) timestamp = opts.timestamp;
    if (opts.rootDigest) rootDigest = opts.rootDigest;
  } else if (typeof optionsOrArg1 === "string" && Array.isArray(arg2)) {
    rootDigest = optionsOrArg1;
    fileReceipts = arg2;
    signerKeyId = (arg3 as string) || "UNKNOWN";
    if (arg4) timestamp = arg4;
  } else if (Array.isArray(optionsOrArg1)) {
    fileReceipts = optionsOrArg1;
    signerKeyId = (arg2 as string) || "UNKNOWN";
    if (arg3) timestamp = arg3;
    if (arg4) rootDigest = arg4;
  } else {
    fileReceipts = [];
    signerKeyId = "UNKNOWN";
  }

  const totalSizeBytes = fileReceipts.reduce((acc, r) => acc + r.sizeBytes, 0);

  const receipt: BundleReceipt = {
    receiptId: generateReceiptId(),
    bundleTitle: "StormSale SOC 2 Type II Root Verification Receipt",
    rootAlgorithm: "SHA-256",
    generator: GENERATOR_VERSION,
    timestamp,
    totalEvidenceFiles: fileReceipts.length,
    totalSizeBytes,
    signerKeyId,
    signatureAlgorithm: "Ed25519",
    fileReceiptsSummary: fileReceipts.map((r) => ({
      targetPath: r.targetPath,
      sha256: r.sha256,
      category: r.category,
    })),
  };

  if (rootDigest) {
    receipt.rootDigest = rootDigest;
  }

  return receipt;
}
