export type LeaderboardTimeframe = "weekly" | "monthly" | "all-time";

export type MilestoneTier = "1k" | "10k" | "100k";

export interface MilestoneBadgeConfig {
  id: MilestoneTier;
  tierNumber: number;
  name: string;
  badgeCode: string;
  thresholdGrossSales: number; // 1,000, 10,000, 100,000
  rarity: "Rare" | "Epic" | "Legendary";
  accentColor: string;
  glowColor: string;
  gradient: string;
  borderGlow: string;
  description: string;
  perks: string[];
}

export interface ClaimedMilestoneRecord {
  tier: MilestoneTier;
  tokenId: string;
  txHash: string;
  claimedAt: string;
  nonTransferable: true;
  tokenUri: string;
  contractAddress: string;
  affiliateAddress: string;
}

export interface AffiliateRankingItem {
  rank: number;
  address: string;
  maskedAddress: string;
  pseudonym: string;
  isPrivacyMasked: boolean;
  avatarSeed: string;
  weeklyGrossSales: number;
  monthlyGrossSales: number;
  allTimeGrossSales: number;
  verifiedSalesCount: number;
  conversionRate: number;
  commissionEarnedXlm: number;
  activeCampaigns: number;
  claimedBadges: ClaimedMilestoneRecord[];
  joinedAt: string;
}

export interface AffiliateProfileData extends AffiliateRankingItem {
  unlockedTiers: MilestoneTier[];
  nextMilestoneProgress: {
    nextTier: MilestoneTier | null;
    nextTierName: string | null;
    targetSales: number;
    currentSales: number;
    remainingSales: number;
    progressPercentage: number;
  };
}

export interface LeaderboardStats {
  totalMonthlyVolume: number;
  activeAffiliatesCount: number;
  totalBadgesClaimed: number;
  topAffiliateMonthlyVolume: number;
}
