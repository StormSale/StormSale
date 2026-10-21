/**
 * Zero-Knowledge Revenue Proof Context Provider (#174)
 */

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from "react";
import type {
  HistoricConversionRecord,
  ZKRevenueProof,
  ZKVerificationResult,
  RevenueTierConfig,
} from "../types/zkProof";
import {
  compileHistoricConversions,
  generateZKRevenueProof,
  verifyZKRevenueProof,
  loadStoredZKProofs,
  saveStoredZKProof,
  getActiveBadgeProof,
  setActiveBadgeProof,
  generateProofVerificationUrl,
  parseProofFromUrl,
  REVENUE_TIERS,
  getTierForRevenue,
} from "../lib/zkProofEngine";
import { useWeb3 } from "../hooks/useWeb3";
import { useNotification } from "./NotificationContext";

export interface ZKProofContextType {
  conversions: HistoricConversionRecord[];
  totalCompiledRevenueUsd: number;
  qualifiedTier: RevenueTierConfig;
  proofs: ZKRevenueProof[];
  activeBadgeProof: ZKRevenueProof | null;
  activeBadgeTier: RevenueTierConfig | null;
  isGenerating: boolean;
  verifierModalOpen: boolean;
  selectedProofForVerification: ZKRevenueProof | null;
  latestVerificationResult: ZKVerificationResult | null;
  isVerifying: boolean;

  // Actions
  generateProof: (targetThresholdUsd?: number) => Promise<ZKRevenueProof | null>;
  verifyProof: (proof: ZKRevenueProof) => Promise<ZKVerificationResult>;
  setActiveBadge: (proofId: string) => boolean;
  openVerifierModal: (proof?: ZKRevenueProof) => void;
  closeVerifierModal: () => void;
  getVerificationUrl: (proof: ZKRevenueProof) => string;
  refreshProofs: () => void;
}

export const ZKProofContext = createContext<ZKProofContextType | null>(null);

export interface ZKProofProviderProps {
  children: React.ReactNode;
  masterAddressOverride?: string;
}

export const ZKProofProvider: React.FC<ZKProofProviderProps> = ({
  children,
  masterAddressOverride,
}) => {
  const { userAddress } = useWeb3();
  const { showNotification } = useNotification();

  const effectiveAddress = useMemo(() => {
    return (
      masterAddressOverride ||
      userAddress ||
      "GASTORMSALE7AFFILIATE_DEFAULT_PORTFOLIO_KEY_001"
    );
  }, [masterAddressOverride, userAddress]);

  const [conversions, setConversions] = useState<HistoricConversionRecord[]>([]);
  const [proofs, setProofs] = useState<ZKRevenueProof[]>([]);
  const [activeBadgeProof, setActiveBadgeProofState] = useState<ZKRevenueProof | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [verifierModalOpen, setVerifierModalOpen] = useState(false);
  const [selectedProofForVerification, setSelectedProofForVerification] =
    useState<ZKRevenueProof | null>(null);
  const [latestVerificationResult, setLatestVerificationResult] =
    useState<ZKVerificationResult | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);

  // Load conversions and stored proofs
  const refreshData = useCallback(() => {
    if (!effectiveAddress) return;
    const records = compileHistoricConversions(effectiveAddress);
    setConversions(records);

    const stored = loadStoredZKProofs(effectiveAddress);
    setProofs(stored);

    const active = getActiveBadgeProof(effectiveAddress);
    setActiveBadgeProofState(active);
  }, [effectiveAddress]);

  useEffect(() => {
    refreshData();
  }, [refreshData]);

  // Check URL query parameters for incoming verification link (e.g. ?verify_proof=...)
  useEffect(() => {
    if (typeof window === "undefined") return;
    const parsed = parseProofFromUrl(window.location.href);
    if (parsed) {
      setSelectedProofForVerification(parsed);
      setVerifierModalOpen(true);
      // Automatically trigger 1-click verification
      void verifyZKRevenueProof(parsed).then((res) => {
        setLatestVerificationResult(res);
      });
    }
  }, []);

  const totalCompiledRevenueUsd = useMemo(() => {
    return Number(
      conversions.reduce((sum, c) => sum + (c.amountUsd || 0), 0).toFixed(2),
    );
  }, [conversions]);

  const qualifiedTier = useMemo(() => {
    return getTierForRevenue(totalCompiledRevenueUsd);
  }, [totalCompiledRevenueUsd]);

  const activeBadgeTier = useMemo(() => {
    if (!activeBadgeProof) return null;
    return REVENUE_TIERS[activeBadgeProof.revenueTier] || null;
  }, [activeBadgeProof]);

  const generateProof = useCallback(
    async (targetThresholdUsd: number = 50_000): Promise<ZKRevenueProof | null> => {
      setIsGenerating(true);
      try {
        const { proof, totalVerifiedRevenueUsd } = await generateZKRevenueProof({
          affiliateAddress: effectiveAddress,
          conversions,
          targetThresholdUsd,
        });

        saveStoredZKProof(proof);
        refreshData();

        showNotification({
          type: "success",
          title: "Proof of Revenue Generated",
          message: `Successfully verified $${totalVerifiedRevenueUsd.toLocaleString()} in historic revenue. Cryptographic attestation created.`,
        });

        return proof;
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Failed to generate proof.";
        showNotification({
          type: "error",
          title: "Proof Generation Failed",
          message,
        });
        return null;
      } finally {
        setIsGenerating(false);
      }
    },
    [effectiveAddress, conversions, refreshData, showNotification],
  );

  const verifyProof = useCallback(
    async (proof: ZKRevenueProof): Promise<ZKVerificationResult> => {
      setIsVerifying(true);
      try {
        const result = await verifyZKRevenueProof(proof);
        setLatestVerificationResult(result);
        return result;
      } finally {
        setIsVerifying(false);
      }
    },
    [],
  );

  const setActiveBadgeHandler = useCallback(
    (proofId: string): boolean => {
      const success = setActiveBadgeProof(effectiveAddress, proofId);
      if (success) {
        refreshData();
        showNotification({
          type: "success",
          title: "Verified Revenue Badge Updated",
          message: "Your public affiliate profile badge has been updated.",
        });
      }
      return success;
    },
    [effectiveAddress, refreshData, showNotification],
  );

  const openVerifierModal = useCallback(
    (proof?: ZKRevenueProof) => {
      const target = proof || activeBadgeProof || proofs[0] || null;
      setSelectedProofForVerification(target);
      setVerifierModalOpen(true);
      if (target) {
        void verifyProof(target);
      }
    },
    [activeBadgeProof, proofs, verifyProof],
  );

  const closeVerifierModal = useCallback(() => {
    setVerifierModalOpen(false);
  }, []);

  const getVerificationUrl = useCallback((proof: ZKRevenueProof): string => {
    return generateProofVerificationUrl(proof);
  }, []);

  const contextValue = useMemo<ZKProofContextType>(
    () => ({
      conversions,
      totalCompiledRevenueUsd,
      qualifiedTier,
      proofs,
      activeBadgeProof,
      activeBadgeTier,
      isGenerating,
      verifierModalOpen,
      selectedProofForVerification,
      latestVerificationResult,
      isVerifying,
      generateProof,
      verifyProof,
      setActiveBadge: setActiveBadgeHandler,
      openVerifierModal,
      closeVerifierModal,
      getVerificationUrl,
      refreshProofs: refreshData,
    }),
    [
      conversions,
      totalCompiledRevenueUsd,
      qualifiedTier,
      proofs,
      activeBadgeProof,
      activeBadgeTier,
      isGenerating,
      verifierModalOpen,
      selectedProofForVerification,
      latestVerificationResult,
      isVerifying,
      generateProof,
      verifyProof,
      setActiveBadgeHandler,
      openVerifierModal,
      closeVerifierModal,
      getVerificationUrl,
      refreshData,
    ],
  );

  return <ZKProofContext.Provider value={contextValue}>{children}</ZKProofContext.Provider>;
};

export function useZKProof(): ZKProofContextType {
  const context = useContext(ZKProofContext);
  if (!context) {
    // Return safe fallback for components rendered outside provider
    const fallbackConversions = compileHistoricConversions("FALLBACK_AFFILIATE_ADDR");
    const total = Number(fallbackConversions.reduce((s, c) => s + c.amountUsd, 0).toFixed(2));
    const tier = getTierForRevenue(total);

    return {
      conversions: fallbackConversions,
      totalCompiledRevenueUsd: total,
      qualifiedTier: tier,
      proofs: [],
      activeBadgeProof: null,
      activeBadgeTier: null,
      isGenerating: false,
      verifierModalOpen: false,
      selectedProofForVerification: null,
      latestVerificationResult: null,
      isVerifying: false,
      generateProof: async () => null,
      verifyProof: async () => ({
        isValid: false,
        verifiedAt: new Date().toISOString(),
        affiliateAddress: "",
        claimedThresholdUsd: 0,
        revenueTier: "BRONZE",
        conversionsCount: 0,
        verificationSteps: [],
      }),
      setActiveBadge: () => false,
      openVerifierModal: () => {},
      closeVerifierModal: () => {},
      getVerificationUrl: () => "",
      refreshProofs: () => {},
    };
  }
  return context;
}
