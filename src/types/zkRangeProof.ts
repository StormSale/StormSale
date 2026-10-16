/**
 * Types for Zero-Knowledge Range Proofs and Compliance Verification
 * under Bulletproofs / ZK-SNARK inner-product arguments.
 */

export interface ApprovedRangeThresholds {
  min: number;
  max: number;
  currency: string;
}

export interface BulletproofInnerProductProof {
  L: string[]; // log2(n) vector commitments L_k
  R: string[]; // log2(n) vector commitments R_k
  a: string; // final scalar a
  b: string; // final scalar b
}

export interface BulletproofRangeProof {
  version: "bulletproofs-v1";
  commitment: string; // Pedersen commitment C = vG + rH
  A: string; // Vector commitment to bit vector
  S: string; // Vector commitment to blinding vector
  T1: string; // Polynomial commitment T1
  T2: string; // Polynomial commitment T2
  taux: string; // Blinding evaluation scalar tau_x
  mu: string; // Blinding scalar mu
  that: string; // Polynomial evaluation t_hat
  innerProductProof: BulletproofInnerProductProof;
  range: ApprovedRangeThresholds;
  transcriptHash: string;
}

export interface OnChainConversionMetadata {
  saleId: string;
  campaignAddress: string;
  campaignName: string;
  advertiserAddress: string;
  affiliateAddress: string;
  ledgerSequence: number;
  ledgerTimestamp: string;
  ledgerTxHash: string;
  stateRoot: string;
  encryptedPayloadHash: string;
  pedersenCommitment: string;
  rangeProof: BulletproofRangeProof;
  approvedRange: ApprovedRangeThresholds;
  expectedInRange: boolean;
}

export interface LedgerStateRecord {
  contractAddress: string;
  saleId: string;
  ledgerSequence: number;
  stateHash: string;
  registeredCommitment: string;
  isSettled: boolean;
  timestamp: string;
}

export interface ZKVerificationRequest {
  saleId: string;
  campaignAddress: string;
  customThresholds?: ApprovedRangeThresholds;
  conversionMetadata?: OnChainConversionMetadata;
  ledgerState?: LedgerStateRecord;
}

export interface ZKVerificationResult {
  isValid: boolean;
  badgeText: string; // e.g. "Cryptographically Proven in Range: $10 - $5,000"
  verifiedRange: ApprovedRangeThresholds;
  executionTimeMs: number;
  engine: "WebAssembly Worker" | "WebAssembly Core";
  proofType: "Bulletproofs-ZK-Range-Proof-v1";
  ledgerVerified: boolean;
  ledgerSequence: number;
  contractAddress: string;
  saleId: string;
  commitmentHash: string;
  amountDisclosed: false; // Explicit mathematical assurance of zero disclosure
  verificationTimestamp: string;
  cryptographicDetails: {
    innerProductRounds: number;
    transcriptValid: boolean;
    polynomialCommitmentValid: boolean;
    ledgerStateMatch: boolean;
    fiatShamirChallenge: string;
  };
  complianceNotice: string;
}

export type WorkerMessageIn = {
  id: string;
  type: "VERIFY_RANGE_PROOF";
  payload: ZKVerificationRequest;
};

export type WorkerMessageOut = {
  id: string;
  type: "VERIFY_RANGE_PROOF_RESULT";
  result?: ZKVerificationResult;
  error?: string;
};
