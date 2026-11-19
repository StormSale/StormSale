/**
 * Fraud Risk Context & State Management Provider (#152)
 */

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from "react";
import type { ReactNode } from "react";
import type {
  ClickToConversionRecord,
  AffiliateRiskProfile,
  RiskScoreLevel,
  PausedAffiliateRecord,
  CampaignAnomalySummary,
} from "../types/fraud";
import {
  calculateAllAffiliateRiskProfiles,
  summarizeCampaignAnomalies,
  loadPausedAffiliates,
  pauseAffiliate as persistPauseAffiliate,
  unpauseAffiliate as persistUnpauseAffiliate,
  isAffiliatePaused as checkIsAffiliatePaused,
  generateMockClickToConversionRecords,
} from "../lib/fraudRiskEngine";
import { useNotification } from "./NotificationContext";

export interface FraudRiskContextType {
  records: ClickToConversionRecord[];
  riskProfiles: Record<string, AffiliateRiskProfile>;
  campaignSummary: CampaignAnomalySummary;
  pausedAffiliates: Record<string, PausedAffiliateRecord>;
  getRiskProfile: (affiliateAddress: string) => AffiliateRiskProfile | undefined;
  pauseAffiliateAction: (
    affiliateAddress: string,
    reason?: string,
    affiliateName?: string,
  ) => boolean;
  unpauseAffiliateAction: (affiliateAddress: string) => boolean;
  isAffiliatePaused: (affiliateAddress: string) => boolean;
  filterRiskLevel: RiskScoreLevel | "ALL" | "FROZEN";
  setFilterRiskLevel: (level: RiskScoreLevel | "ALL" | "FROZEN") => void;
  selectedCampaignId: string;
  setSelectedCampaignId: (campaignId: string) => void;
  addCustomRecords: (newRecords: ClickToConversionRecord[]) => void;
}

const FraudRiskContext = createContext<FraudRiskContextType | undefined>(undefined);

export interface FraudRiskProviderProps {
  readonly children: ReactNode;
  readonly initialRecords?: ClickToConversionRecord[];
  readonly initialCampaignId?: string;
}

export const FraudRiskProvider: React.FC<FraudRiskProviderProps> = ({
  children,
  initialRecords,
  initialCampaignId = "all",
}) => {
  const { showNotification } = useNotification();

  const [records, setRecords] = useState<ClickToConversionRecord[]>(() => {
    return initialRecords || generateMockClickToConversionRecords();
  });

  const [selectedCampaignId, setSelectedCampaignId] = useState<string>(initialCampaignId);
  const [filterRiskLevel, setFilterRiskLevel] = useState<RiskScoreLevel | "ALL" | "FROZEN">("ALL");
  const [pausedAffiliates, setPausedAffiliates] = useState<Record<string, PausedAffiliateRecord>>(
    () => loadPausedAffiliates(),
  );

  // Sync paused affiliates on mount and storage events
  useEffect(() => {
    const handleStorageChange = () => {
      setPausedAffiliates(loadPausedAffiliates());
    };
    window.addEventListener("storage", handleStorageChange);
    return () => window.removeEventListener("storage", handleStorageChange);
  }, []);

  // Compute risk profiles across conversion stream
  const riskProfiles = useMemo(() => {
    return calculateAllAffiliateRiskProfiles(records, pausedAffiliates);
  }, [records, pausedAffiliates]);

  // Compute campaign anomaly summary
  const campaignSummary = useMemo(() => {
    return summarizeCampaignAnomalies(riskProfiles, selectedCampaignId);
  }, [riskProfiles, selectedCampaignId]);

  const getRiskProfile = useCallback(
    (affiliateAddress: string): AffiliateRiskProfile | undefined => {
      return riskProfiles[affiliateAddress];
    },
    [riskProfiles],
  );

  const isAffiliatePaused = useCallback((affiliateAddress: string): boolean => {
    return checkIsAffiliatePaused(affiliateAddress);
  }, []);

  const pauseAffiliateAction = useCallback(
    (
      affiliateAddress: string,
      reason: string = "Conversion velocity anomaly & click injection investigation",
      affiliateName?: string,
    ): boolean => {
      try {
        const name = affiliateName || riskProfiles[affiliateAddress]?.affiliateName || "Partner";
        const record = persistPauseAffiliate(
          affiliateAddress,
          reason,
          "Advertiser Admin",
          name,
          selectedCampaignId,
        );
        setPausedAffiliates((prev) => ({
          ...prev,
          [affiliateAddress]: record,
        }));

        showNotification({
          type: "warning",
          title: "Affiliate Frozen Pending Review",
          message: `${name} (${affiliateAddress.slice(0, 6)}...${affiliateAddress.slice(-4)}) has been paused from claiming Soroban escrow payouts.`,
          duration: 6000,
        });

        return true;
      } catch (err: unknown) {
        console.error("Failed to pause affiliate:", err);
        return false;
      }
    },
    [riskProfiles, selectedCampaignId, showNotification],
  );

  const unpauseAffiliateAction = useCallback(
    (affiliateAddress: string): boolean => {
      try {
        const name = riskProfiles[affiliateAddress]?.affiliateName || "Partner";
        persistUnpauseAffiliate(affiliateAddress);
        setPausedAffiliates((prev) => {
          const next = { ...prev };
          delete next[affiliateAddress];
          return next;
        });

        showNotification({
          type: "success",
          title: "Affiliate Restored",
          message: `${name} (${affiliateAddress.slice(0, 6)}...${affiliateAddress.slice(-4)}) has been unpaused. Payout claiming is re-enabled.`,
          duration: 5000,
        });

        return true;
      } catch (err: unknown) {
        console.error("Failed to unpause affiliate:", err);
        return false;
      }
    },
    [riskProfiles, showNotification],
  );

  const addCustomRecords = useCallback((newRecords: ClickToConversionRecord[]) => {
    setRecords((prev) => [...prev, ...newRecords]);
  }, []);

  const value = useMemo(
    () => ({
      records,
      riskProfiles,
      campaignSummary,
      pausedAffiliates,
      getRiskProfile,
      pauseAffiliateAction,
      unpauseAffiliateAction,
      isAffiliatePaused,
      filterRiskLevel,
      setFilterRiskLevel,
      selectedCampaignId,
      setSelectedCampaignId,
      addCustomRecords,
    }),
    [
      records,
      riskProfiles,
      campaignSummary,
      pausedAffiliates,
      getRiskProfile,
      pauseAffiliateAction,
      unpauseAffiliateAction,
      isAffiliatePaused,
      filterRiskLevel,
      setFilterRiskLevel,
      selectedCampaignId,
      setSelectedCampaignId,
      addCustomRecords,
    ],
  );

  return <FraudRiskContext.Provider value={value}>{children}</FraudRiskContext.Provider>;
};

// Fallback context for non-provider renders
const fallbackFraudContext: FraudRiskContextType = {
  records: [],
  riskProfiles: {},
  campaignSummary: {
    campaignId: "all",
    totalAffiliates: 0,
    meanVelocity: 0,
    velocityStdDev: 0,
    flaggedAnomaliesCount: 0,
    criticalAffiliatesCount: 0,
    frozenAffiliatesCount: 0,
  },
  pausedAffiliates: {},
  getRiskProfile: () => undefined,
  pauseAffiliateAction: () => false,
  unpauseAffiliateAction: () => false,
  isAffiliatePaused: (addr: string) => checkIsAffiliatePaused(addr),
  filterRiskLevel: "ALL",
  setFilterRiskLevel: () => {},
  selectedCampaignId: "all",
  setSelectedCampaignId: () => {},
  addCustomRecords: () => {},
};

export function useFraudRisk(): FraudRiskContextType {
  const context = useContext(FraudRiskContext);
  return context || fallbackFraudContext;
}
