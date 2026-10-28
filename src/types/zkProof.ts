/**
 * Zero-Knowledge Conversion Proof & Private Affiliate Portfolio Types (#174)
 *
 * Facilitates privacy-preserving revenue attestation:
 * - Proves an affiliate has generated >= $50K (or specified threshold) in verified volume
 * - Hides customer identities, transaction amounts, and sensitive campaign data
 * - Provides shareable verification link with cryptographic attestation
 */

export type RevenueTier = "BRONZE" | "SILVER" | "GOLD" | "DIAMOND" | "ELITE";

export interface RevenueTierConfig {
  tier: RevenueTier;
  label: string;
  minThresholdUsd: number;
  badgeColor: string;
  badgeBorder: string;
  iconName: string;
}

/**
 * Raw conversion record compiled from historic on-chain/escrow ledger events.
 * Kept private on the affiliate's client; never shared in the public proof.
 */
export interface HistoricConversionRecord {
  conversionId: string;
  txHash: string;
  campaignId: string;
  campaignName: string;
  amountUsd: number;
  amountXlm: number;
  timestamp: string;
  buyerHash: string; // Private buyer identity hash
  clearingStatus: "Settled" | "Released";
}

/**
 * A blinded leaf commitment in the Merkle tree.
 * Leaf = SHA-256(txHash || campaignId || amountUsd || salt)
 */
export interface BlindedConversionCommitment {
  leafHash: string;
  index: number;
}

/**
 * Verifiable Zero-Knowledge Revenue Proof Payload.
 * This object is safe to share publicly or embed in a URL.
 * It contains zero buyer addresses, zero customer IDs, and zero individual sale amounts.
 */
export interface ZKRevenueProof {
  proofId: string;
  version: "1.0.0-zk";
  createdAt: string;
  expiresAt?: string;

  // Public Claim
  affiliateAddress: string;
  claimedThresholdUsd: number;
  revenueTier: RevenueTier;
  totalConversionsCount: number;
  dateRange: {
    earliest: string;
    latest: string;
  };

  // Cryptographic Commitments (Zero Knowledge)
  merkleRoot: string;
  nullifierHash: string;
  saltCommitment: string;
  attestationDigest: string;

  // Cryptographic Signature / Attestation
  issuer: "StormSale-ZK-Engine";
  signature: string;

  // Metadata for Verifiers
  privacyGuarantees: {
    individualAmountsHidden: boolean;
    customerIdentitiesMasked: boolean;
    campaignMetricsAggregated: boolean;
  };
}

/**
 * Result of executing the 1-click cryptographic verification algorithm.
 */
export interface ZKVerificationResult {
  isValid: boolean;
  verifiedAt: string;
  affiliateAddress: string;
  claimedThresholdUsd: number;
  revenueTier: RevenueTier;
  conversionsCount: number;
  verificationSteps: {
    step: string;
    description: string;
    passed: boolean;
    details?: string;
  }[];
  failureReason?: string;
}
