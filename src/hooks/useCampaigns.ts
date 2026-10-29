import { useState, useCallback } from "react";
import { useWeb3 } from "./useWeb3";
import { useNotification } from "../context/NotificationContext";

export interface MarketplaceCampaign {
  id: string;
  name: string;
  advertiser: string;
  advertiserAddress: string;
  category: string;
  tags: string[];
  asset: "XLM" | "USDC" | "EURC";
  rewardAmount: number;
  rewardFormatted: string;
  roi: number; // Estimated ROI in %
  escrowBalance: number;
  escrowMax: number;
  status: "Active" | "Paused" | "Completed";
  description: string;
  contractAddress: string;
  minAffiliateReputation?: number;
  joined?: boolean;
  createdAt: string;
}

export const INITIAL_MARKETPLACE_CAMPAIGNS: MarketplaceCampaign[] = [
  {
    id: "camp-001",
    name: "Stellar USDC Liquid Staking Vault",
    advertiser: "Stellar DeFi Foundation",
    advertiserAddress: "GA7QYNF7SOWQ3GLR2BGMZEHXAVIRZA4KVWLTJJFC7MGXUA74P7UJVSGZ",
    category: "DeFi",
    tags: ["DeFi", "USDC", "Yield", "Staking"],
    asset: "USDC",
    rewardAmount: 15,
    rewardFormatted: "15% Commission",
    roi: 185,
    escrowBalance: 24500,
    escrowMax: 30000,
    status: "Active",
    description:
      "Promote automated USDC liquid staking on Soroban. High retention and daily yield distributions.",
    contractAddress: "CCAMPAIGN_USDC_VAULT_001",
    minAffiliateReputation: 50,
    createdAt: "2026-10-10",
  },
  {
    id: "camp-002",
    name: "Nexus Web3 Cloud Node Pass",
    advertiser: "Nexus Infrastructure Inc.",
    advertiserAddress: "GBA2H7I646K56V4D4W432Q7Z7PXRB3NZW664E3N4VML5VXZ3D7Q2NXUS",
    category: "SaaS",
    tags: ["SaaS", "Infrastructure", "Nodes", "XLM"],
    asset: "XLM",
    rewardAmount: 20,
    rewardFormatted: "20% per Sale",
    roi: 240,
    escrowBalance: 18200,
    escrowMax: 25000,
    status: "Active",
    description:
      "Decentralized RPC endpoints and validator hosting. High recurring commissions for cloud buyers.",
    contractAddress: "CCAMPAIGN_NEXUS_NODES_002",
    minAffiliateReputation: 30,
    createdAt: "2026-10-12",
  },
  {
    id: "camp-003",
    name: "EuroPay Instant Stellar Gateway",
    advertiser: "EuroPay Stellar Rail AG",
    advertiserAddress: "GCDX7N6F4J75H2R2L3B6N7P8Q9R0S1T2U3V4W5X6Y7Z8A9B0C1D2E3F4",
    category: "Fintech",
    tags: ["Fintech", "EURC", "Payments", "Remittance"],
    asset: "EURC",
    rewardAmount: 12,
    rewardFormatted: "12 EURC flat / user",
    roi: 160,
    escrowBalance: 9800,
    escrowMax: 15000,
    status: "Active",
    description:
      "Zero-fee SEPA-to-Stellar EURC on-ramp. Promote fast international payments across Europe.",
    contractAddress: "CCAMPAIGN_EUROPAY_RAIL_003",
    minAffiliateReputation: 40,
    createdAt: "2026-10-14",
  },
  {
    id: "camp-004",
    name: "Aetheria RPG NFT Season Pass",
    advertiser: "Aetheria Studios",
    advertiserAddress: "GDAETHR7SOWQ3GLR2BGMZEHXAVIRZA4KVWLTJJFC7MGXUA74P7UJGAME",
    category: "Gaming",
    tags: ["Gaming", "NFT", "Web3", "XLM"],
    asset: "XLM",
    rewardAmount: 25,
    rewardFormatted: "25% on Mint",
    roi: 310,
    escrowBalance: 34000,
    escrowMax: 40000,
    status: "Active",
    description:
      "Play-and-earn fantasy RPG on Stellar Soroban. Instant payouts upon game asset purchase.",
    contractAddress: "CCAMPAIGN_AETHERIA_MINT_004",
    minAffiliateReputation: 20,
    createdAt: "2026-10-15",
  },
  {
    id: "camp-005",
    name: "LedgerSafe Hardware Key Vault",
    advertiser: "LedgerSafe Security Group",
    advertiserAddress: "GBLDGR7SOWQ3GLR2BGMZEHXAVIRZA4KVWLTJJFC7MGXUA74P7UJSEC1",
    category: "Security",
    tags: ["Security", "Hardware", "E-Commerce", "USDC"],
    asset: "USDC",
    rewardAmount: 18,
    rewardFormatted: "18% per Hardware Key",
    roi: 195,
    escrowBalance: 12500,
    escrowMax: 20000,
    status: "Active",
    description: "Enterprise biometric USB-C hardware wallet for Stellar and Soroban assets.",
    contractAddress: "CCAMPAIGN_LEDGERSAFE_005",
    minAffiliateReputation: 45,
    createdAt: "2026-10-16",
  },
  {
    id: "camp-006",
    name: "StellarAI Predictive Trading Assistant",
    advertiser: "StellarAI Analytics Labs",
    advertiserAddress: "GCAILAB7SOWQ3GLR2BGMZEHXAVIRZA4KVWLTJJFC7MGXUA74P7UJAI06",
    category: "AI",
    tags: ["AI", "Analytics", "Trading", "XLM"],
    asset: "XLM",
    rewardAmount: 30,
    rewardFormatted: "30% Monthly Recurring",
    roi: 380,
    escrowBalance: 42000,
    escrowMax: 50000,
    status: "Active",
    description: "AI-driven orderbook arbitrage and automated liquidity routing for Stellar DEX.",
    contractAddress: "CCAMPAIGN_STELLAR_AI_006",
    minAffiliateReputation: 60,
    createdAt: "2026-10-17",
  },
];

const STORAGE_JOINED_KEY = "stormsale_affiliate_joined_campaigns";

export function getStoredJoinedCampaignIds(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_JOINED_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveStoredJoinedCampaignIds(ids: string[]): void {
  try {
    localStorage.setItem(STORAGE_JOINED_KEY, JSON.stringify(ids));
  } catch (err) {
    console.warn("Failed to persist joined campaign IDs to storage:", err);
  }
}

export interface UseCampaignsReturn {
  campaigns: MarketplaceCampaign[];
  isLoading: boolean;
  error: string | null;
  refreshCampaigns: () => void;
  joinCampaign: (campaignId: string) => Promise<{ success: boolean; referralLink?: string }>;
  checkEligibility: (campaign: MarketplaceCampaign) => { eligible: boolean; reason?: string };
}

export function useCampaigns(): UseCampaignsReturn {
  const [campaigns, setCampaigns] = useState<MarketplaceCampaign[]>(() => {
    try {
      const joinedIds = new Set(getStoredJoinedCampaignIds());
      return INITIAL_MARKETPLACE_CAMPAIGNS.map((c) => ({
        ...c,
        joined: joinedIds.has(c.id),
      }));
    } catch {
      return INITIAL_MARKETPLACE_CAMPAIGNS;
    }
  });
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const { userAddress } = useWeb3();
  const { showNotification } = useNotification();

  const loadCampaigns = useCallback(() => {
    setIsLoading(true);
    setError(null);
    try {
      const joinedIds = new Set(getStoredJoinedCampaignIds());
      const mapped = INITIAL_MARKETPLACE_CAMPAIGNS.map((c) => ({
        ...c,
        joined: joinedIds.has(c.id),
      }));
      setCampaigns(mapped);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load campaigns");
    } finally {
      setIsLoading(false);
    }
  }, []);

  const checkEligibility = useCallback(
    (campaign: MarketplaceCampaign): { eligible: boolean; reason?: string } => {
      if (!userAddress) {
        return { eligible: false, reason: "Connect your Stellar wallet to join" };
      }
      if (campaign.joined) {
        return { eligible: false, reason: "You have already joined this campaign" };
      }
      if (campaign.status !== "Active") {
        return { eligible: false, reason: "Campaign is currently inactive" };
      }
      if (campaign.escrowBalance <= 0) {
        return { eligible: false, reason: "Campaign escrow pool is exhausted" };
      }
      return { eligible: true };
    },
    [userAddress],
  );

  const joinCampaign = useCallback(
    async (campaignId: string): Promise<{ success: boolean; referralLink?: string }> => {
      const target = campaigns.find((c) => c.id === campaignId);
      if (!target) {
        showNotification({
          type: "error",
          title: "Join Error",
          message: "Campaign not found.",
        });
        return { success: false };
      }

      const eligibility = checkEligibility(target);
      if (!eligibility.eligible) {
        showNotification({
          type: "warning",
          title: "Ineligible to Join",
          message: eligibility.reason || "You are not eligible to join this campaign.",
        });
        return { success: false };
      }

      // Show pending status
      showNotification({
        type: "pending",
        title: "Joining Campaign...",
        message: `Registering affiliate link for ${target.name}`,
        duration: 0,
      });

      // Simulate on-chain contract confirmation
      await new Promise((resolve) => setTimeout(resolve, 800));

      const updatedJoined = Array.from(new Set([...getStoredJoinedCampaignIds(), campaignId]));
      saveStoredJoinedCampaignIds(updatedJoined);

      setCampaigns((prev) => prev.map((c) => (c.id === campaignId ? { ...c, joined: true } : c)));

      const refLink = `${window.location.origin}/ref/${campaignId}?aff=${userAddress || "anon"}`;

      showNotification({
        type: "success",
        title: "Successfully Joined!",
        message: `You are now an active affiliate for ${target.name}. Your link is ready to share.`,
      });

      return { success: true, referralLink: refLink };
    },
    [campaigns, checkEligibility, showNotification, userAddress],
  );

  return {
    campaigns,
    isLoading,
    error,
    refreshCampaigns: loadCampaigns,
    joinCampaign,
    checkEligibility,
  };
}
