export const AFFILIATE_NICHES = [
  { id: "defi", label: "DeFi" },
  { id: "gaming", label: "Gaming" },
  { id: "hardware", label: "Hardware" },
  { id: "saas", label: "SaaS" },
  { id: "ecommerce", label: "E-commerce" },
  { id: "finance", label: "Finance" },
  { id: "education", label: "Education" },
  { id: "lifestyle", label: "Lifestyle" },
] as const;

export type AffiliateNiche = (typeof AFFILIATE_NICHES)[number]["id"];

export interface AffiliateCampaign {
  id: string;
  name: string;
  description: string;
  niches: AffiliateNiche[];
  conversionRate: number;
  escrowBalance: number;
  escrowTarget: number;
  commissionRate: number;
  trending: boolean;
}

export interface CampaignRecommendation extends AffiliateCampaign {
  score: number;
}

const MAX_PROFILE_NICHES = 3;
const PROFILE_NICHES_KEY = "stormsale.affiliateNiches";
const VALID_NICHE_IDS = new Set<string>(AFFILIATE_NICHES.map(({ id }) => id));

const isAffiliateNiche = (niche: string): niche is AffiliateNiche => VALID_NICHE_IDS.has(niche);

export const FEATURED_CAMPAIGNS: AffiliateCampaign[] = [
  {
    id: "nebula-yield",
    name: "Nebula Yield Vault",
    description: "DeFi yield tools for on-chain investors.",
    niches: ["defi", "finance"],
    conversionRate: 5.8,
    escrowBalance: 47000,
    escrowTarget: 50000,
    commissionRate: 32,
    trending: true,
  },
  {
    id: "pixel-forge",
    name: "Pixel Forge Studio",
    description: "Creator hardware and gaming peripherals.",
    niches: ["gaming", "hardware"],
    conversionRate: 7.2,
    escrowBalance: 44000,
    escrowTarget: 50000,
    commissionRate: 24,
    trending: true,
  },
  {
    id: "saas-signal",
    name: "SaaS Signal",
    description: "Analytics subscriptions for growing teams.",
    niches: ["saas", "ecommerce"],
    conversionRate: 4.4,
    escrowBalance: 50000,
    escrowTarget: 50000,
    commissionRate: 20,
    trending: false,
  },
  {
    id: "learn-ledger",
    name: "Learn Ledger",
    description: "Practical courses for digital finance.",
    niches: ["education", "finance"],
    conversionRate: 6.1,
    escrowBalance: 36000,
    escrowTarget: 40000,
    commissionRate: 18,
    trending: false,
  },
  {
    id: "everyday-good",
    name: "Everyday Good",
    description: "Sustainable products for everyday living.",
    niches: ["lifestyle", "ecommerce"],
    conversionRate: 3.9,
    escrowBalance: 28000,
    escrowTarget: 40000,
    commissionRate: 15,
    trending: true,
  },
];

export const getAffiliateNiches = (): AffiliateNiche[] => {
  const storedNiches = window.localStorage.getItem(PROFILE_NICHES_KEY);
  if (!storedNiches) return [];

  return [...new Set(storedNiches.split(",").filter(isAffiliateNiche))].slice(
    0,
    MAX_PROFILE_NICHES,
  );
};

export const saveAffiliateNiches = (niches: AffiliateNiche[]) => {
  const allowedNiches = new Set<AffiliateNiche>(AFFILIATE_NICHES.map(({ id }) => id));
  const selectedNiches = [...new Set(niches.filter((niche) => allowedNiches.has(niche)))].slice(
    0,
    MAX_PROFILE_NICHES,
  );
  window.localStorage.setItem(PROFILE_NICHES_KEY, selectedNiches.join(","));
};

export const scoreCampaign = (
  campaign: AffiliateCampaign,
  selectedNiches: AffiliateNiche[],
): number => {
  const selected = new Set(selectedNiches);
  const campaignNiches = new Set(campaign.niches);
  const sharedNiches = [...campaignNiches].filter((niche) => selected.has(niche)).length;
  const nicheUnionSize = new Set([...selected, ...campaignNiches]).size;
  const nicheSimilarity = nicheUnionSize === 0 ? 0 : sharedNiches / nicheUnionSize;
  const conversionScore = Math.min(Math.max(campaign.conversionRate, 0), 10) / 10;
  const escrowSolvency =
    campaign.escrowTarget <= 0
      ? 0
      : Math.min(Math.max(campaign.escrowBalance / campaign.escrowTarget, 0), 1);

  return Math.round((conversionScore * 0.4 + escrowSolvency * 0.3 + nicheSimilarity * 0.3) * 100);
};

export const getCampaignRecommendations = (
  selectedNiches: AffiliateNiche[],
): CampaignRecommendation[] =>
  FEATURED_CAMPAIGNS.map((campaign) => ({
    ...campaign,
    score: scoreCampaign(campaign, selectedNiches),
  })).sort((left, right) => right.score - left.score || right.conversionRate - left.conversionRate);
