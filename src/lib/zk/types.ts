/**
 * Zero-Knowledge Range Proof Types & Interfaces (Issue #175)
 *
 * Defines data structures and interfaces for Bulletproofs / ZK-SNARK range proof
 * verification of private sale amounts, on-chain conversion metadata,
 * WebAssembly worker communication, and compliance badges.
 */

export interface RangeProofData {
  /** Pedersen commitment to the private value: C = v*G + gamma*H (hex or base64) */
  commitment: string;
  /** Serialized Bulletproofs / ZK-SNARK range proof bytes (hex or base64) */
  proof: string;
  /** Minimum permissible value in integer cents (e.g., 1000 = $10.00) */
  minAmountCents: number;
  /** Maximum permissible value in integer cents (e.g., 500000 = $5,000.00) */
  maxAmountCents: number;
  /** Bit length of the range proof (e.g., 64) */
  bitLength: number;
  /** Currency denomination (default "USD") */
  currency?: string;
  /** Transcript domain tag (default "StormSale-Bulletproof-v1") */
  domainTag?: string;
}

export interface ConversionLedgerMetadata {
  /** On-chain conversion record ID (e.g., "CONV-1042-ZK") */
  conversionId: string;
  /** Associated sale identifier */
  saleId: string;
  /** Soroban campaign contract address (C...) */
  campaignAddress: string;
  /** Soroban campaign readable name */
  campaignName: string;
  /** Ledger sequence number at settlement */
  ledgerSequence: number;
  /** Transaction hash (64-char hex) */
  txHash: string;
  /** Raw encrypted transaction amount ciphertext (never decrypted by compliance auditor) */
  encryptedAmount: string;
  /** Embedded zero-knowledge range proof */
  rangeProof: RangeProofData;
  /** ISO-8601 timestamp of ledger confirmation */
  timestamp: string;
  /** Organization tenancy identifier */
  organizationId: string;
  /** Settlement clearing status */
  clearingStatus: "Settled" | "Escrowed" | "Released";
  /** Optional cryptographic signature from the merchant / sequencer */
  merchantSignature?: string;
}

export interface VerificationResult {
  /** Cryptographic validity of the range proof against commitment and ledger state */
  valid: boolean;
  /** Proven minimum threshold in integer cents */
  minAmountCents: number;
  /** Proven maximum threshold in integer cents */
  maxAmountCents: number;
  /** Human-readable formatted range (e.g., "$10 - $5,000") */
  formattedRange: string;
  /** Required compliance badge display string (e.g., "Cryptographically Proven in Range: $10 - $5,000") */
  badgeText: string;
  /** Total client-side verification duration in milliseconds (< 500ms requirement) */
  verificationTimeMs: number;
  /** Whether the verification strictly satisfied the < 500ms SLA */
  meetsPerformanceTarget: boolean;
  /** Guarantee of zero knowledge: exact purchase amount is always null */
  disclosedAmount: null;
  /** Ledger confirmation status */
  ledgerVerified: boolean;
  /** Cryptographic sub-check diagnostics */
  diagnostics: {
    commitmentValid: boolean;
    rangeIntegrity: boolean;
    transcriptSoundness: boolean;
    innerProductValid: boolean;
    ledgerSequence: number;
    txHash: string;
    wasmAccelerated: boolean;
    workerThread: boolean;
  };
  /** Status and compliance message */
  message: string;
}

export interface ZKWorkerRequest {
  id: string;
  type: "VERIFY_RANGE_PROOF" | "BATCH_VERIFY_RANGE_PROOFS";
  metadata: ConversionLedgerMetadata | ConversionLedgerMetadata[];
  expectedBudgetMin?: number;
  expectedBudgetMax?: number;
}

export interface ZKWorkerResponse {
  id: string;
  type: "VERIFICATION_SUCCESS" | "VERIFICATION_ERROR";
  result?: VerificationResult | VerificationResult[];
  error?: string;
  executionTimeMs?: number;
}
