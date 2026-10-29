/**
 * Fraud Risk Scoring & Click-to-Conversion Anomaly Detection Types (#152)
 */

export type RiskScoreLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export interface RiskFactor {
  code:
    | "BURST_VELOCITY_ANOMALY"
    | "CLICK_DELTA_INSTANT"
    | "IP_HASH_CONCENTRATION"
    | "REPETITIVE_SUB_ID"
    | "UNNATURAL_CONVERSION_RATE";
  title: string;
  description: string;
  severity: RiskScoreLevel;
  value?: string | number;
}

export interface ClickToConversionRecord {
  id: string;
  campaignId: string;
  campaignName: string;
  affiliateAddress: string;
  affiliateName: string;
  clickTimestamp: string; // ISO date string
  conversionTimestamp: string; // ISO date string
  timeDeltaSeconds: number; // conversionTimestamp - clickTimestamp in seconds
  ipHash: string; // Anonymized/hashed client IP
  subId: string; // Affiliate sub-campaign / traffic source identifier
  amount: number; // In USD or XLM
  customerRef: string;
}

export interface AffiliateRiskProfile {
  affiliateAddress: string;
  affiliateName: string;
  campaignId: string;
  campaignName?: string;
  totalConversions: number;
  // Velocity metrics
  peakVelocityPerMinute: number;
  averageVelocityPerHour: number;
  campaignMeanVelocity: number;
  velocityStdDev: number;
  velocityZScore: number;
  isVelocityAnomaly: boolean; // velocity > 3 standard deviations above campaign mean (Z > 3.0)

  // Click-to-conversion metrics
  medianTimeDeltaSeconds: number;
  meanTimeDeltaSeconds: number;
  minTimeDeltaSeconds: number;
  instantConversionCount: number; // delta < 2.0s
  isInstantConversionAnomaly: boolean;

  // Pattern metrics
  ipHashBurstCount: number; // max conversions in 1-min from same IP hash
  ipConcentrationRate: number; // percentage of conversions from top IP hash (0 - 100)
  topIpHash?: string;
  repetitiveSubIdRate: number; // percentage of conversions from top subId (0 - 100)
  topSubId?: string;

  // Composite risk scoring
  riskScore: number; // 0 - 100
  riskLevel: RiskScoreLevel;
  riskFactors: RiskFactor[];

  // Review & Pause status
  isPaused: boolean;
  pausedAt?: string;
  pausedBy?: string;
  pauseReason?: string;
}

export interface PausedAffiliateRecord {
  affiliateAddress: string;
  affiliateName?: string;
  campaignId?: string;
  pausedAt: string; // ISO date string
  pausedBy: string; // Advertiser wallet address
  reason: string;
}

export interface CampaignAnomalySummary {
  campaignId: string;
  totalAffiliates: number;
  meanVelocity: number;
  velocityStdDev: number;
  flaggedAnomaliesCount: number;
  criticalAffiliatesCount: number;
  frozenAffiliatesCount: number;
}
