import { describe, it, expect, beforeEach, vi } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";

import {
  generateMockHistoricConversions,
  compileHistoricConversions,
  computeBlindedLeafHash,
  computeMerkleRoot,
  generateZKRevenueProof,
  verifyZKRevenueProof,
  serializeProofToUrlSafe,
  deserializeProofFromUrlSafe,
  generateProofVerificationUrl,
  parseProofFromUrl,
  loadStoredZKProofs,
  saveStoredZKProof,
  getActiveBadgeProof,
  setActiveBadgeProof,
  sha256Sync,
} from "../lib/zkProofEngine";
import type { HistoricConversionRecord, ZKRevenueProof } from "../types/zkProof";
import { ZKProofProvider } from "../context/ZKProofContext";
import { NotificationProvider } from "../context/NotificationContext";
import { Web3Provider } from "../context/Web3Context";
import { VerifiedRevenueBadge } from "../components/affiliate/VerifiedRevenueBadge";
import { ZKProofVerifierModal } from "../components/affiliate/ZKProofVerifierModal";
import { ZKProofGenerator } from "../components/affiliate/ZKProofGenerator";
import { AffiliateOverview } from "../components/affiliate/AffiliateOverview";
import { getLocalStorage } from "../lib/storage";

describe("Zero-Knowledge Conversion Proof Generator & Private Affiliate Portfolios (#174)", () => {
  const storage = getLocalStorage();
  const TEST_AFFILIATE = "GASTORMSALE7ZKPROOFAFFILIATE0000000000000000000000000000001";

  beforeEach(() => {
    storage.clear();
    vi.restoreAllMocks();
  });

  const renderWithProviders = (ui: React.ReactNode, affiliateAddr: string = TEST_AFFILIATE) => {
    return renderToString(
      <Web3Provider overrideAddress={affiliateAddr}>
        <NotificationProvider>
          <ZKProofProvider masterAddressOverride={affiliateAddr}>{ui}</ZKProofProvider>
        </NotificationProvider>
      </Web3Provider>,
    );
  };

  describe("1. Historic Conversion Compilation & Cryptographic Leaf Commitments", () => {
    it("compiles realistic historic conversions with total volume exceeding $50K", () => {
      const records = compileHistoricConversions(TEST_AFFILIATE);
      expect(records.length).toBeGreaterThanOrEqual(20);

      const totalUsd = records.reduce((s, r) => s + r.amountUsd, 0);
      expect(totalUsd).toBeGreaterThanOrEqual(50_000);

      const first = records[0];
      expect(first.conversionId).toBeDefined();
      expect(first.txHash).toBeDefined();
      expect(first.buyerHash).toBeDefined(); // Kept strictly local
      expect(first.clearingStatus).toBe("Settled");
    });

    it("computes blinded leaf commitments and ensures secret salt prevents reconstruction", async () => {
      const mockRecord: HistoricConversionRecord = {
        conversionId: "conv_001",
        txHash: "0xabcdef123456",
        campaignId: "CAMP_EXCLUSIVE_DEFI",
        campaignName: "Exclusive Brand",
        amountUsd: 1500,
        amountXlm: 12000,
        timestamp: "2026-08-15T12:00:00Z",
        buyerHash: "PRIVATE_BUYER_SECRET_WALLET_99",
        clearingStatus: "Settled",
      };

      const saltA = "salt_alpha_987654321";
      const saltB = "salt_beta_123456789";

      const leafA = await computeBlindedLeafHash(mockRecord, saltA);
      const leafB = await computeBlindedLeafHash(mockRecord, saltB);

      expect(leafA).toHaveLength(64);
      expect(leafB).toHaveLength(64);
      // Different salts produce distinct commitments, preserving zero knowledge
      expect(leafA).not.toBe(leafB);
    });

    it("computes binary Merkle tree root over blinded commitments", async () => {
      const leaves = [
        "a".repeat(64),
        "b".repeat(64),
        "c".repeat(64),
        "d".repeat(64),
      ];

      const root = await computeMerkleRoot(leaves);
      expect(root).toHaveLength(64);

      // Deterministic root
      const rootAgain = await computeMerkleRoot(leaves);
      expect(rootAgain).toBe(root);
    });
  });

  describe("2. Zero-Knowledge Proof of Revenue Generation ($50K+ Threshold)", () => {
    it("generates a valid Gold Tier ($50K+) ZK Revenue Proof without leaking customer PII", async () => {
      const conversions = generateMockHistoricConversions(TEST_AFFILIATE, 65000);
      const { proof, totalVerifiedRevenueUsd, privateSalt } = await generateZKRevenueProof({
        affiliateAddress: TEST_AFFILIATE,
        conversions,
        targetThresholdUsd: 50_000,
      });

      expect(totalVerifiedRevenueUsd).toBeGreaterThanOrEqual(50_000);
      expect(privateSalt).toContain("zk_salt_");

      // Verify Proof Schema
      expect(proof.version).toBe("1.0.0-zk");
      expect(proof.affiliateAddress).toBe(TEST_AFFILIATE);
      expect(proof.claimedThresholdUsd).toBe(50_000);
      expect(proof.revenueTier).toBe("GOLD");
      expect(proof.totalConversionsCount).toBe(conversions.length);

      // Verify Cryptographic Commitments
      expect(proof.merkleRoot).toHaveLength(64);
      expect(proof.nullifierHash).toHaveLength(64);
      expect(proof.saltCommitment).toHaveLength(64);
      expect(proof.attestationDigest).toHaveLength(64);
      expect(proof.signature).toHaveLength(64);
      expect(proof.issuer).toBe("StormSale-ZK-Engine");

      // CRITICAL ACCEPTANCE CRITERIA: ZERO CUSTOMER IDENTITIES OR INDIVIDUAL AMOUNTS LEAKED
      expect((proof as unknown as Record<string, unknown>).conversions).toBeUndefined();
      expect((proof as unknown as Record<string, unknown>).buyerAddresses).toBeUndefined();
      expect((proof as unknown as Record<string, unknown>).buyerHash).toBeUndefined();
      expect((proof as unknown as Record<string, unknown>).orderAmounts).toBeUndefined();
      expect(proof.privacyGuarantees.customerIdentitiesMasked).toBe(true);
      expect(proof.privacyGuarantees.individualAmountsHidden).toBe(true);
    });

    it("rejects proof generation when verified volume is below requested threshold", async () => {
      // Mock dataset totaling only $15,000
      const smallConversions: HistoricConversionRecord[] = [
        {
          conversionId: "c1",
          txHash: "0x1111",
          campaignId: "c",
          campaignName: "c",
          amountUsd: 5000,
          amountXlm: 40000,
          timestamp: new Date().toISOString(),
          buyerHash: "b1",
          clearingStatus: "Settled",
        },
        {
          conversionId: "c2",
          txHash: "0x2222",
          campaignId: "c",
          campaignName: "c",
          amountUsd: 10000,
          amountXlm: 80000,
          timestamp: new Date().toISOString(),
          buyerHash: "b2",
          clearingStatus: "Settled",
        },
      ];

      await expect(
        generateZKRevenueProof({
          affiliateAddress: TEST_AFFILIATE,
          conversions: smallConversions,
          targetThresholdUsd: 50_000,
        }),
      ).rejects.toThrow("Insufficient verified revenue volume");
    });
  });

  describe("3. Independent 1-Click Verification Algorithm", () => {
    it("successfully validates an authentic ZK revenue proof through all 5 audit steps", async () => {
      const conversions = generateMockHistoricConversions(TEST_AFFILIATE, 60000);
      const { proof } = await generateZKRevenueProof({
        affiliateAddress: TEST_AFFILIATE,
        conversions,
        targetThresholdUsd: 50_000,
      });

      const verification = await verifyZKRevenueProof(proof);

      expect(verification.isValid).toBe(true);
      expect(verification.affiliateAddress).toBe(TEST_AFFILIATE);
      expect(verification.claimedThresholdUsd).toBe(50_000);
      expect(verification.revenueTier).toBe("GOLD");
      expect(verification.failureReason).toBeUndefined();

      expect(verification.verificationSteps).toHaveLength(5);
      expect(verification.verificationSteps.every((s) => s.passed)).toBe(true);
    });

    it("detects and rejects a tampered claimed threshold", async () => {
      const conversions = generateMockHistoricConversions(TEST_AFFILIATE, 60000);
      const { proof } = await generateZKRevenueProof({
        affiliateAddress: TEST_AFFILIATE,
        conversions,
        targetThresholdUsd: 50_000,
      });

      // Attacker attempts to change claimed threshold from $50K to $100K (Diamond)
      const tamperedProof: ZKRevenueProof = {
        ...proof,
        claimedThresholdUsd: 100_000,
        revenueTier: "DIAMOND",
      };

      const verification = await verifyZKRevenueProof(tamperedProof);
      expect(verification.isValid).toBe(false);
      expect(verification.failureReason).toBeDefined();

      const digestStep = verification.verificationSteps.find(
        (s) => s.step === "ATTESTATION_DIGEST",
      );
      expect(digestStep?.passed).toBe(false);
    });

    it("detects and rejects a forged proof where threshold is inflated and signature recomputed using public formulas", async () => {
      const conversions = generateMockHistoricConversions(TEST_AFFILIATE, 60000);
      const { proof } = await generateZKRevenueProof({
        affiliateAddress: TEST_AFFILIATE,
        conversions,
        targetThresholdUsd: 50_000,
      });

      // Attacker changes claimedThresholdUsd to 250_000, recomputes both attestationDigest
      // and signature using sha256Sync and public formulas
      const forgedThresholdUsd = 250_000;
      const forgedDigest = sha256Sync(
        `${TEST_AFFILIATE}:${proof.merkleRoot}:${forgedThresholdUsd}:${proof.totalConversionsCount}:${proof.saltCommitment}`,
      );
      const forgedSignature = sha256Sync(
        `SIG_STORMSALE_ZK_ATTESTATION_${forgedDigest}_${TEST_AFFILIATE}`,
      );

      const forgedProof: ZKRevenueProof = {
        ...proof,
        claimedThresholdUsd: forgedThresholdUsd,
        revenueTier: "ELITE",
        attestationDigest: forgedDigest,
        signature: forgedSignature,
      };

      const verification = await verifyZKRevenueProof(forgedProof);
      expect(verification.isValid).toBe(false);
      const sigStep = verification.verificationSteps.find((s) => s.step === "ISSUER_SIGNATURE");
      expect(sigStep?.passed).toBe(false);
    });

    it("detects and rejects a tampered Merkle root or affiliate address", async () => {
      const conversions = generateMockHistoricConversions(TEST_AFFILIATE, 60000);
      const { proof } = await generateZKRevenueProof({
        affiliateAddress: TEST_AFFILIATE,
        conversions,
        targetThresholdUsd: 50_000,
      });

      const tamperedProof: ZKRevenueProof = {
        ...proof,
        merkleRoot: "f".repeat(64),
      };

      const verification = await verifyZKRevenueProof(tamperedProof);
      expect(verification.isValid).toBe(false);
    });

    it("rejects an expired proof", async () => {
      const conversions = generateMockHistoricConversions(TEST_AFFILIATE, 60000);
      const { proof } = await generateZKRevenueProof({
        affiliateAddress: TEST_AFFILIATE,
        conversions,
        targetThresholdUsd: 50_000,
      });

      const expiredProof: ZKRevenueProof = {
        ...proof,
        expiresAt: new Date(Date.now() - 3600000).toISOString(), // 1 hour ago
      };

      const verification = await verifyZKRevenueProof(expiredProof);
      expect(verification.isValid).toBe(false);
      expect(verification.failureReason).toContain("expired");
    });
  });

  describe("4. Shareable Verification Links & Base64 Serialization", () => {
    it("serializes and deserializes ZK proof to and from URL-safe Base64 without data loss", async () => {
      const conversions = generateMockHistoricConversions(TEST_AFFILIATE, 55000);
      const { proof } = await generateZKRevenueProof({
        affiliateAddress: TEST_AFFILIATE,
        conversions,
        targetThresholdUsd: 50_000,
      });

      const encoded = serializeProofToUrlSafe(proof);
      expect(encoded).not.toContain("+");
      expect(encoded).not.toContain("/");
      expect(encoded).not.toContain("=");

      const decoded = deserializeProofFromUrlSafe(encoded);
      expect(decoded).not.toBeNull();
      expect(decoded?.proofId).toBe(proof.proofId);
      expect(decoded?.merkleRoot).toBe(proof.merkleRoot);
      expect(decoded?.claimedThresholdUsd).toBe(proof.claimedThresholdUsd);
      expect(decoded?.signature).toBe(proof.signature);
    });

    it("generates shareable verification URL and correctly parses proof parameter from query string", async () => {
      const conversions = generateMockHistoricConversions(TEST_AFFILIATE, 55000);
      const { proof } = await generateZKRevenueProof({
        affiliateAddress: TEST_AFFILIATE,
        conversions,
        targetThresholdUsd: 50_000,
      });

      const verificationUrl = generateProofVerificationUrl(proof, "https://stormsale.xyz");
      expect(verificationUrl).toContain("https://stormsale.xyz/affiliate?verify_proof=");

      const parsed = parseProofFromUrl(verificationUrl);
      expect(parsed).not.toBeNull();
      expect(parsed?.proofId).toBe(proof.proofId);
      expect(parsed?.affiliateAddress).toBe(TEST_AFFILIATE);
    });
  });

  describe("5. Persistent Storage & Public Badge Management", () => {
    it("stores generated proofs and manages active public profile badge", async () => {
      const conversions = generateMockHistoricConversions(TEST_AFFILIATE, 55000);
      const { proof } = await generateZKRevenueProof({
        affiliateAddress: TEST_AFFILIATE,
        conversions,
        targetThresholdUsd: 50_000,
      });

      saveStoredZKProof(proof);

      const stored = loadStoredZKProofs(TEST_AFFILIATE);
      expect(stored).toHaveLength(1);
      expect(stored[0].proofId).toBe(proof.proofId);

      // Verify active badge retrieval
      const activeBadge = getActiveBadgeProof(TEST_AFFILIATE);
      expect(activeBadge).not.toBeNull();
      expect(activeBadge?.claimedThresholdUsd).toBe(50_000);

      // Switch active badge
      const { proof: diamondProof } = await generateZKRevenueProof({
        affiliateAddress: TEST_AFFILIATE,
        conversions: generateMockHistoricConversions(TEST_AFFILIATE, 110000),
        targetThresholdUsd: 100_000,
      });
      saveStoredZKProof(diamondProof);
      setActiveBadgeProof(TEST_AFFILIATE, diamondProof.proofId);

      const updatedBadge = getActiveBadgeProof(TEST_AFFILIATE);
      expect(updatedBadge?.claimedThresholdUsd).toBe(100_000);
      expect(updatedBadge?.revenueTier).toBe("DIAMOND");
    });
  });

  describe("6. VerifiedRevenueBadge Component UI", () => {
    it("renders Gold Verified $50K+ Vol badge with cryptographic indicators", () => {
      const html = renderWithProviders(
        <VerifiedRevenueBadge customTier="GOLD" customThresholdUsd={50_000} />,
      );

      expect(html).toContain("GOLD VERIFIED");
      expect(html).toContain("$50K+ Vol");
      expect(html).toContain("ZK-Proof");
      expect(html).toContain("data-testid=\"verified-revenue-badge\"");
    });

    it("renders Diamond Verified tier badge accurately", () => {
      const html = renderWithProviders(
        <VerifiedRevenueBadge customTier="DIAMOND" customThresholdUsd={100_000} />,
      );

      expect(html).toContain("DIAMOND VERIFIED");
      expect(html).toContain("$100K+ Vol");
    });
  });

  describe("7. ZKProofVerifierModal Component UI (1-Click Verifier)", () => {
    it("renders independent verification view, status banner, and cryptographic audit steps", async () => {
      const conversions = generateMockHistoricConversions(TEST_AFFILIATE, 55000);
      const { proof } = await generateZKRevenueProof({
        affiliateAddress: TEST_AFFILIATE,
        conversions,
        targetThresholdUsd: 50_000,
      });

      const html = renderWithProviders(
        <ZKProofVerifierModal isOpen={true} onClose={() => {}} proof={proof} portalled={false} />,
      );

      expect(html).toContain("Verifiable Proof of Revenue Attestation");
      expect(html).toContain("Cryptographically Verified: $50,000+ USD");
      expect(html).toContain("btn-reverify-proof");
      expect(html).toContain("Merkle Commitment Root");
      expect(html).toContain("Nullifier Hash");
      expect(html).toContain("input-verification-url");
      expect(html).toContain("btn-download-cert");
    });
  });

  describe("8. ZKProofGenerator Component UI", () => {
    it("renders bento statistics, threshold selection buttons, and privacy safeguards", () => {
      const html = renderWithProviders(<ZKProofGenerator />);

      expect(html).toContain("Proof of Revenue Generator");
      expect(html).toContain("Zero-Knowledge Private Affiliate Portfolio");
      expect(html).toContain("Total Compiled Volume");
      expect(html).toContain("Verified On-Chain Sales");
      expect(html).toContain("btn-threshold-50000");
      expect(html).toContain("Zero-Knowledge Privacy Safeguards");
      expect(html).toContain("btn-generate-proof");
      expect(html).toContain("tab-zk-generator");
      expect(html).toContain("tab-zk-proofs");
      expect(html).toContain("tab-zk-conversions");
    });
  });

  describe("9. AffiliateOverview Public Profile Badge Integration", () => {
    it("embeds VerifiedRevenueBadge in the Affiliate Dashboard Header and highlight card", () => {
      const html = renderWithProviders(<AffiliateOverview />);

      expect(html).toContain("Affiliate Dashboard");
      expect(html).toContain("data-testid=\"verified-revenue-badge\"");
      expect(html).toContain("Proof of Revenue ($50K+)");
      expect(html).toContain("ZK Verified");
    });
  });
});
