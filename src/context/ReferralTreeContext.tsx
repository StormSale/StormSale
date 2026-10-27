/**
 * Referral Tree Context & State Management Provider (#157)
 */

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from "react";
import type { ReactNode } from "react";
import type {
  AffiliateReferralRelation,
  ReferralTreeNode,
  ReferralTreeSummary,
  TwoTierCommissionSplit,
} from "../types/referral";
import {
  loadReferralRelations,
  saveReferralRelations,
  registerSubAffiliate,
  buildReferralTree,
  getReferralTreeSummary,
  generateRecruiterInviteLink,
  recordReferralSale,
  generateMockReferralRelations,
} from "../lib/referralTree";
import { useSafeWeb3 } from "../hooks/useWeb3";
import { useNotification } from "./NotificationContext";

export interface ReferralTreeContextType {
  relations: AffiliateReferralRelation[];
  tree: ReferralTreeNode;
  summary: ReferralTreeSummary;
  recruiterLink: string;
  selectedNode: ReferralTreeNode | null;
  setSelectedNode: (node: ReferralTreeNode | null) => void;
  bindRecruiter: (
    childAddress: string,
    parentAddress: string,
    options?: {
      childName?: string;
      overrideRatePercent?: number;
      recruiterTag?: string;
    },
  ) => { success: boolean; error?: string };
  recordSaleAction: (params: {
    saleAmountXlm: number;
    sellingAffiliateAddress: string;
    campaignId?: number;
    txHash?: string;
  }) => TwoTierCommissionSplit;
  refreshTree: () => void;
  generateCustomInviteLink: (tag?: string, overrideRate?: number) => string;
}

const ReferralTreeContext = createContext<ReferralTreeContextType | undefined>(undefined);

export interface ReferralTreeProviderProps {
  readonly children: ReactNode;
  readonly initialRelations?: AffiliateReferralRelation[];
  readonly masterAddressOverride?: string;
  readonly allowDemoSeed?: boolean;
}

export const ReferralTreeProvider: React.FC<ReferralTreeProviderProps> = ({
  children,
  initialRelations,
  masterAddressOverride,
  allowDemoSeed = false,
}) => {
  const web3 = useSafeWeb3();
  const userAddress = web3?.userAddress || null;
  const { showNotification } = useNotification();

  const activeMasterAddress =
    masterAddressOverride || userAddress || "GAFFILIATE_MASTER_ROOT_001";

  const [relations, setRelations] = useState<AffiliateReferralRelation[]>(() => {
    if (initialRelations) return initialRelations;
    const stored = loadReferralRelations();
    if (stored.length > 0) return stored;
    // Pre-seed with sample relations only behind explicit demo or test condition
    if (allowDemoSeed) {
      const mock = generateMockReferralRelations(activeMasterAddress);
      saveReferralRelations(mock);
      return mock;
    }
    return [];
  });

  const [selectedNode, setSelectedNode] = useState<ReferralTreeNode | null>(null);

  // Compute hierarchical tree
  const tree = useMemo(() => {
    return buildReferralTree(activeMasterAddress, relations);
  }, [activeMasterAddress, relations]);

  // Compute summary stats
  const summary = useMemo(() => {
    return getReferralTreeSummary(activeMasterAddress, relations);
  }, [activeMasterAddress, relations]);

  // Recruiter link
  const recruiterLink = useMemo(() => {
    return generateRecruiterInviteLink(activeMasterAddress);
  }, [activeMasterAddress]);

  const refreshTree = useCallback(() => {
    setRelations(loadReferralRelations());
  }, []);

  const generateCustomInviteLink = useCallback(
    (tag?: string, overrideRate?: number): string => {
      return generateRecruiterInviteLink(activeMasterAddress, undefined, {
        tag,
        overrideRate,
      });
    },
    [activeMasterAddress],
  );

  const bindRecruiter = useCallback(
    (
      childAddress: string,
      parentAddress: string,
      options: {
        childName?: string;
        overrideRatePercent?: number;
        recruiterTag?: string;
      } = {},
    ): { success: boolean; error?: string } => {
      try {
        const newRel = registerSubAffiliate(childAddress, parentAddress, options);
        setRelations((prev) => [...prev, newRel]);

        showNotification({
          type: "success",
          title: "Sub-Affiliate Recruited",
          message: `${newRel.childName} (${childAddress.slice(0, 5)}...${childAddress.slice(-4)}) has been bound to recruiter network. ${newRel.overrideRatePercent}% override commission active.`,
          duration: 5000,
        });

        return { success: true };
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : "Failed to bind sub-affiliate.";
        showNotification({
          type: "error",
          title: "Referral Binding Failed",
          message: errorMsg,
          duration: 5000,
        });
        return { success: false, error: errorMsg };
      }
    },
    [showNotification],
  );

  const recordSaleAction = useCallback(
    (params: {
      saleAmountXlm: number;
      sellingAffiliateAddress: string;
      campaignId?: number;
      txHash?: string;
    }): TwoTierCommissionSplit => {
      const split = recordReferralSale(params);
      refreshTree();

      if (split.hasRecruiter && split.recruiterOverrideCommissionXlm > 0) {
        showNotification({
          type: "info",
          title: "Second-Tier Commission Split",
          message: `Sale of ${params.saleAmountXlm} XLM split: ${split.sellingAffiliateCommissionXlm} XLM (${split.sellingAffiliateRatePercent}%) to selling affiliate, +${split.recruiterOverrideCommissionXlm} XLM (${split.recruiterOverrideRatePercent}%) passive override to recruiter.`,
          duration: 6000,
        });
      }

      return split;
    },
    [refreshTree, showNotification],
  );

  // Sync on mount and storage events
  useEffect(() => {
    const handleStorage = () => refreshTree();
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, [refreshTree]);

  const value = useMemo(
    () => ({
      relations,
      tree,
      summary,
      recruiterLink,
      selectedNode,
      setSelectedNode,
      bindRecruiter,
      recordSaleAction,
      refreshTree,
      generateCustomInviteLink,
    }),
    [
      relations,
      tree,
      summary,
      recruiterLink,
      selectedNode,
      bindRecruiter,
      recordSaleAction,
      refreshTree,
      generateCustomInviteLink,
    ],
  );

  return <ReferralTreeContext.Provider value={value}>{children}</ReferralTreeContext.Provider>;
};

// Fallback context for non-provider renders
const fallbackTreeContext: ReferralTreeContextType = {
  relations: [],
  tree: {
    address: "",
    name: "Master Affiliate",
    tier: 0,
    roleLabel: "Master Affiliate",
    recruitedAt: new Date().toISOString(),
    salesCount: 0,
    salesVolumeXlm: 0,
    directEarningsXlm: 0,
    overrideEarningsXlm: 0,
    isActive: true,
    children: [],
  },
  summary: {
    masterAddress: "",
    directRecruitsCount: 0,
    secondTierRecruitsCount: 0,
    totalNetworkSize: 0,
    totalNetworkVolumeXlm: 0,
    totalOverrideEarnedXlm: 0,
    recentOverrides: [],
  },
  recruiterLink: "https://stormsale.xyz/affiliate",
  selectedNode: null,
  setSelectedNode: () => {},
  bindRecruiter: () => ({ success: false, error: "Provider not found" }),
  recordSaleAction: () => ({
    saleAmountXlm: 0,
    totalCommissionRatePercent: 10,
    totalCommissionXlm: 0,
    sellingAffiliateAddress: "",
    sellingAffiliateRatePercent: 10,
    sellingAffiliateCommissionXlm: 0,
    sellingAffiliateStroops: 0n,
    recruiterOverrideRatePercent: 0,
    recruiterOverrideCommissionXlm: 0,
    recruiterOverrideStroops: 0n,
    hasRecruiter: false,
    splitRatioLabel: "100% / 0%",
  }),
  refreshTree: () => {},
  generateCustomInviteLink: () => "https://stormsale.xyz/affiliate",
};

export function useReferralTree(): ReferralTreeContextType {
  const context = useContext(ReferralTreeContext);
  return context || fallbackTreeContext;
}
