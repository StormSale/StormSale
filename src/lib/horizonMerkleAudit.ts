/**
 * Horizon Merkle Audit Publication & Verification Tool (Issue #470)
 *
 * Implements:
 * 1. 32-byte hex Merkle root validation and normalization.
 * 2. Horizon transaction memo formatting (Stellar MemoHash representation).
 * 3. Horizon ledger query and verification of published Merkle root against local batch roots.
 * 4. Audit certificate metadata generation upon ledger finalization.
 */

export interface MerkleRootValidationResult {
  isValid: boolean;
  normalizedRoot?: string;
  byteLength?: number;
  error?: string;
}

export interface HorizonMemoFormat {
  memoType: "hash";
  memoHex: string;
  memoBase64: string;
}

export interface HorizonTransactionResponse {
  id: string;
  hash: string;
  ledger: number;
  created_at: string;
  memo_type?: string;
  memo?: string;
  memo_bytes?: string;
  successful: boolean;
  source_account?: string;
}

export interface HorizonAuditVerificationResult {
  verified: boolean;
  isFinalized: boolean;
  ledgerSequence?: number;
  finalizedAt?: string;
  txHash?: string;
  expectedRoot: string;
  publishedRoot?: string;
  matched: boolean;
  tampered?: boolean;
  certificateId?: string;
  error?: string;
}

export interface AuditCertificate {
  certificateId: string;
  batchId?: string;
  campaignAddress?: string;
  ledgerSequence: number;
  txHash: string;
  merkleRoot: string;
  finalizedAt: string;
  network: "Public Global" | "Testnet" | "Local";
  verifiedBy: string;
  verificationStatus: "FINALIZED_ON_CHAIN" | "PENDING_CONSENSUS" | "TAMPERED";
}

/**
 * Validates that a Merkle root is a strictly valid 32-byte (64 hex characters) string.
 * Accepts optional "0x" prefix and is case-insensitive.
 */
export function validateMerkleRootFormat(rawRoot: unknown): MerkleRootValidationResult {
  if (typeof rawRoot !== "string") {
    return {
      isValid: false,
      error: "Merkle root must be a string",
    };
  }

  const trimmed = rawRoot.trim();
  if (trimmed.length === 0) {
    return {
      isValid: false,
      error: "Merkle root cannot be empty",
    };
  }

  // Remove leading 0x if present
  const cleanHex = trimmed.startsWith("0x") || trimmed.startsWith("0X")
    ? trimmed.slice(2)
    : trimmed;

  // 32 bytes = 64 hexadecimal characters
  if (cleanHex.length !== 64) {
    return {
      isValid: false,
      error: `Invalid Merkle root length: expected 64 hex characters (32 bytes), received ${cleanHex.length}`,
    };
  }

  // Validate only hex characters [0-9a-fA-F]
  if (!/^[0-9a-fA-F]{64}$/.test(cleanHex)) {
    return {
      isValid: false,
      error: "Merkle root contains non-hexadecimal characters",
    };
  }

  return {
    isValid: true,
    normalizedRoot: cleanHex.toLowerCase(),
    byteLength: 32,
  };
}

/**
 * Converts a 32-byte hex Merkle root into Stellar Horizon memo format:
 * - memoType: "hash"
 * - memoHex: 64-char lowercase hex
 * - memoBase64: 44-char base64 string
 */
export function formatMerkleRootForHorizonMemo(root: string): HorizonMemoFormat {
  const validation = validateMerkleRootFormat(root);
  if (!validation.isValid || !validation.normalizedRoot) {
    throw new Error(`Cannot format invalid Merkle root: ${validation.error}`);
  }

  const hex = validation.normalizedRoot;
  // Convert hex to byte array
  const bytes = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }

  // Convert bytes to base64
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  const memoBase64 = typeof btoa === "function" ? btoa(binary) : Buffer.from(bytes).toString("base64");

  return {
    memoType: "hash",
    memoHex: hex,
    memoBase64,
  };
}

/**
 * Normalizes a Horizon transaction memo into a 64-character lowercase hex string.
 * Horizon may return the memo as raw hex or base64.
 */
export function normalizeHorizonMemoToHex(memo: string): string {
  const trimmed = memo.trim();
  // If already 64 hex characters
  if (/^[0-9a-fA-F]{64}$/.test(trimmed)) {
    return trimmed.toLowerCase();
  }

  // Attempt base64 decode to hex
  try {
    let binary = "";
    if (typeof atob === "function") {
      binary = atob(trimmed);
    } else {
      binary = Buffer.from(trimmed, "base64").toString("binary");
    }

    if (binary.length === 32) {
      const hex = Array.from(binary)
        .map((c) => c.charCodeAt(0).toString(16).padStart(2, "0"))
        .join("");
      return hex.toLowerCase();
    }
  } catch {
    // Not valid base64
  }

  return trimmed.toLowerCase();
}

export interface VerifyHorizonOptions {
  horizonUrl?: string;
  txHash: string;
  expectedRoot: string;
  fetchFn?: typeof fetch;
  campaignAddress?: string;
  batchId?: string;
}

/**
 * Queries the Horizon ledger for a published batch sale transaction and verifies that
 * the on-chain recorded Merkle root exactly matches the expected root.
 */
export async function verifyHorizonMerklePublication(
  options: VerifyHorizonOptions,
): Promise<HorizonAuditVerificationResult> {
  const {
    horizonUrl = "https://horizon-testnet.stellar.org",
    txHash,
    expectedRoot,
    fetchFn = fetch,
  } = options;

  // Validate expected root format
  const expectedValidation = validateMerkleRootFormat(expectedRoot);
  if (!expectedValidation.isValid || !expectedValidation.normalizedRoot) {
    return {
      verified: false,
      isFinalized: false,
      expectedRoot,
      matched: false,
      error: `Invalid expected Merkle root: ${expectedValidation.error}`,
    };
  }

  const cleanExpectedRoot = expectedValidation.normalizedRoot;

  try {
    const url = `${horizonUrl.replace(/\/+$/, "")}/transactions/${encodeURIComponent(txHash.trim())}`;
    const response = await fetchFn(url);

    if (!response.ok) {
      return {
        verified: false,
        isFinalized: false,
        txHash,
        expectedRoot: cleanExpectedRoot,
        matched: false,
        error: `Horizon transaction query failed with HTTP status ${response.status} (${response.statusText})`,
      };
    }

    const txData: HorizonTransactionResponse = await response.json();

    if (!txData.successful) {
      return {
        verified: false,
        isFinalized: false,
        txHash,
        ledgerSequence: txData.ledger,
        expectedRoot: cleanExpectedRoot,
        matched: false,
        error: "Transaction failed execution on Stellar ledger",
      };
    }

    if (!txData.memo) {
      return {
        verified: false,
        isFinalized: false,
        txHash,
        ledgerSequence: txData.ledger,
        expectedRoot: cleanExpectedRoot,
        matched: false,
        error: "Transaction does not contain a published Merkle root memo",
      };
    }

    const publishedRootHex = normalizeHorizonMemoToHex(txData.memo);
    const matched = publishedRootHex === cleanExpectedRoot;

    if (!matched) {
      return {
        verified: false,
        isFinalized: false,
        ledgerSequence: txData.ledger,
        finalizedAt: txData.created_at,
        txHash,
        expectedRoot: cleanExpectedRoot,
        publishedRoot: publishedRootHex,
        matched: false,
        tampered: true,
        error: `Audit mismatch: published Horizon memo (${publishedRootHex}) does not match expected batch root (${cleanExpectedRoot})`,
      };
    }

    const certificateId = `CERT-HRZ-${txData.ledger}-${txHash.slice(0, 8).toUpperCase()}`;

    return {
      verified: true,
      isFinalized: true,
      ledgerSequence: txData.ledger,
      finalizedAt: txData.created_at,
      txHash,
      expectedRoot: cleanExpectedRoot,
      publishedRoot: publishedRootHex,
      matched: true,
      certificateId,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      verified: false,
      isFinalized: false,
      txHash,
      expectedRoot: cleanExpectedRoot,
      matched: false,
      error: `Network or fetch error querying Horizon: ${message}`,
    };
  }
}

/**
 * Builds an immutable AuditCertificate object from a verified Horizon publication.
 */
export function buildAuditCertificate(
  verification: HorizonAuditVerificationResult,
  metadata?: {
    batchId?: string;
    campaignAddress?: string;
    network?: "Public Global" | "Testnet" | "Local";
  },
): AuditCertificate {
  if (!verification.verified || !verification.ledgerSequence || !verification.txHash) {
    throw new Error("Cannot issue certificate for unverified or unfinalized Merkle root");
  }

  return {
    certificateId: verification.certificateId || `CERT-HRZ-${verification.ledgerSequence}`,
    batchId: metadata?.batchId,
    campaignAddress: metadata?.campaignAddress,
    ledgerSequence: verification.ledgerSequence,
    txHash: verification.txHash,
    merkleRoot: verification.expectedRoot,
    finalizedAt: verification.finalizedAt || new Date().toISOString(),
    network: metadata?.network || "Testnet",
    verifiedBy: "Horizon Ledger Consensus Protocol",
    verificationStatus: "FINALIZED_ON_CHAIN",
  };
}
