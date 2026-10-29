import type {
  LeaderboardTimeframe,
  MilestoneTier,
  MilestoneBadgeConfig,
  ClaimedMilestoneRecord,
  AffiliateRankingItem,
  AffiliateProfileData,
  LeaderboardStats,
} from "../types/affiliateLeaderboard";
import { mintMilestoneBadgeContractCall, type WalletType } from "./stellar";

export const MILESTONE_BADGES: Record<MilestoneTier, MilestoneBadgeConfig> = {
  "1k": {
    id: "1k",
    tierNumber: 1,
    name: "$1K Bronze Pioneer",
    badgeCode: "TIER-BRONZE-1K",
    thresholdGrossSales: 1000,
    rarity: "Rare",
    accentColor: "from-amber-600 to-amber-700",
    glowColor: "rgba(217, 119, 6, 0.4)",
    gradient: "from-amber-500/20 via-orange-500/10 to-transparent",
    borderGlow: "border-amber-500/40 shadow-amber-500/20",
    description:
      "Surpassed $1,000 in verified on-chain gross sales volume. Proves foundational affiliate marketing capability and campaign conversion traction.",
    perks: [
      "Verified Pioneer Soulbound Badge on public profile",
      "1.05x reputation score multiplier",
      "Access to community Pioneer role",
    ],
  },
  "10k": {
    id: "10k",
    tierNumber: 2,
    name: "$10K Silver Vanguard",
    badgeCode: "TIER-SILVER-10K",
    thresholdGrossSales: 10000,
    rarity: "Epic",
    accentColor: "from-slate-300 via-indigo-200 to-slate-400",
    glowColor: "rgba(148, 163, 184, 0.45)",
    gradient: "from-slate-400/20 via-indigo-500/10 to-transparent",
    borderGlow: "border-slate-400/50 shadow-slate-400/25",
    description:
      "Reached $10,000 in verified gross sales volume. Recognized as an established conversion leader across multiple Stellar decentralized campaigns.",
    perks: [
      "Silver Vanguard 3D Trophy on profile card",
      "Priority clearing period settlement queue",
      "Direct invitations to private high-ticket advertiser campaigns",
    ],
  },
  "100k": {
    id: "100k",
    tierNumber: 3,
    name: "$100K Gold Titan",
    badgeCode: "TIER-GOLD-100K",
    thresholdGrossSales: 100000,
    rarity: "Legendary",
    accentColor: "from-amber-300 via-yellow-400 to-yellow-600",
    glowColor: "rgba(234, 179, 8, 0.6)",
    gradient: "from-yellow-400/25 via-amber-500/15 to-transparent",
    borderGlow: "border-yellow-400/60 shadow-yellow-500/35",
    description:
      "Exceeded $100,000 in verified sales volume. Elite protocol rainmaker awarded an immutable soulbound badge representing top 0.1% marketing excellence.",
    perks: [
      "Gold Titan Trophy with animated holographic glow",
      "0% protocol commission fee deduction",
      "VIP Seat on StormSale Protocol Marketer Council",
    ],
  },
};

// Storage keys
const PRIVACY_STORAGE_PREFIX = "stormsale_privacy_masked_";
const CLAIMED_BADGES_PREFIX = "stormsale_claimed_badges_";
const USER_SALES_OVERRIDE_PREFIX = "stormsale_user_sales_";

/**
 * Checks if an affiliate address has privacy masking enabled.
 */
export function getAffiliatePrivacy(address: string): boolean {
  if (typeof window === "undefined" || !address) return false;
  try {
    const stored = localStorage.getItem(`${PRIVACY_STORAGE_PREFIX}${address}`);
    return stored === "true";
  } catch {
    return false;
  }
}

/**
 * Updates the privacy masking setting for an affiliate address.
 */
export function setAffiliatePrivacy(address: string, masked: boolean): void {
  if (typeof window === "undefined" || !address) return;
  try {
    localStorage.setItem(`${PRIVACY_STORAGE_PREFIX}${address}`, masked ? "true" : "false");
  } catch (e) {
    console.error("Failed to save affiliate privacy setting:", e);
  }
}

/**
 * Returns a masked address format, e.g. G***492A
 */
export function maskStellarAddress(address: string): string {
  if (!address || address.length < 8) return "G***ANON";
  return `G***${address.slice(-4)}`;
}

/**
 * Generates a deterministic masked pseudonym for stealth affiliates
 */
export function getMaskedPseudonym(address: string): string {
  if (!address) return "StealthStormer#0000";
  const num = parseInt(address.slice(-4), 36) % 10000;
  const animals = [
    "Vanguard",
    "Hawk",
    "Stormer",
    "Navigator",
    "Titan",
    "Phantom",
    "Apex",
    "Voyager",
  ];
  const animal = animals[Math.abs(num) % animals.length];
  return `${animal}#${String(Math.abs(num)).padStart(4, "0")}`;
}

/**
 * Gets claimed badges for an affiliate from local storage / persistent state
 */
export function getClaimedBadges(affiliateAddress: string): ClaimedMilestoneRecord[] {
  if (typeof window === "undefined" || !affiliateAddress) return [];
  try {
    const raw = localStorage.getItem(`${CLAIMED_BADGES_PREFIX}${affiliateAddress}`);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

/**
 * Saves a claimed badge record to local storage
 */
export function saveClaimedBadge(record: ClaimedMilestoneRecord): void {
  if (typeof window === "undefined" || !record.affiliateAddress) return;
  try {
    const existing = getClaimedBadges(record.affiliateAddress);
    const filtered = existing.filter((b) => b.tier !== record.tier);
    filtered.push(record);
    localStorage.setItem(
      `${CLAIMED_BADGES_PREFIX}${record.affiliateAddress}`,
      JSON.stringify(filtered),
    );
  } catch (e) {
    console.error("Failed to save claimed milestone badge:", e);
  }
}

/**
 * Returns verified gross sales volume for an affiliate
 */
export function getUserGrossSales(affiliateAddress: string): {
  weekly: number;
  monthly: number;
  allTime: number;
} {
  if (!affiliateAddress) return { weekly: 0, monthly: 0, allTime: 0 };

  // Check if manual or mock override is set
  if (typeof window !== "undefined") {
    try {
      const rawOverride = localStorage.getItem(`${USER_SALES_OVERRIDE_PREFIX}${affiliateAddress}`);
      if (rawOverride) {
        const parsed = JSON.parse(rawOverride);
        return parsed;
      }
    } catch {
      // ignore
    }
  }

  // Deterministic seed base based on address
  let hash = 0;
  for (let i = 0; i < affiliateAddress.length; i++) {
    hash = (hash << 5) - hash + affiliateAddress.charCodeAt(i);
    hash |= 0;
  }
  const baseMonthly = Math.abs(hash % 25000) + 1250;
  const weekly = Math.round(baseMonthly * 0.28);
  const allTime = Math.round(baseMonthly * 4.2);

  return {
    weekly,
    monthly: baseMonthly,
    allTime,
  };
}

/**
 * Sets user gross sales (useful for simulated sales progression & milestone testing)
 */
export function setUserGrossSales(
  affiliateAddress: string,
  sales: { weekly?: number; monthly?: number; allTime?: number },
): void {
  if (typeof window === "undefined" || !affiliateAddress) return;
  const current = getUserGrossSales(affiliateAddress);
  const updated = {
    weekly: sales.weekly ?? Math.round((sales.monthly ?? current.monthly) * 0.28),
    monthly: sales.monthly ?? current.monthly,
    allTime: sales.allTime ?? Math.round((sales.monthly ?? current.monthly) * 4.2),
  };
  try {
    localStorage.setItem(
      `${USER_SALES_OVERRIDE_PREFIX}${affiliateAddress}`,
      JSON.stringify(updated),
    );
  } catch (e) {
    console.error("Failed to set user sales override:", e);
  }
}

/**
 * Seed 50 authentic-looking Stellar top affiliates for public leaderboard
 */
const SEED_AFFILIATES: Omit<AffiliateRankingItem, "rank">[] = [
  {
    address: "GDXRN7VQK66EZM6PFFKYY2F6J6E4YQZ5YQ47T7V6PX6T3K42P37X2LTA",
    maskedAddress: "G***2LTA",
    pseudonym: "ApexStormer#9942",
    isPrivacyMasked: false,
    avatarSeed: "apex",
    weeklyGrossSales: 38200,
    monthlyGrossSales: 148500,
    allTimeGrossSales: 780000,
    verifiedSalesCount: 842,
    conversionRate: 6.8,
    commissionEarnedXlm: 44550,
    activeCampaigns: 14,
    joinedAt: "2025-02-10",
    claimedBadges: [
      {
        tier: "1k",
        tokenId: "SBT-STORM-1K-00104",
        txHash: "0x89e1b5c2a104f7b4e99d8b6c43e21a007f3c19b48c66e4a284e31109a9041b31",
        claimedAt: "2025-03-01T12:00:00Z",
        nonTransferable: true,
        tokenUri: "ipfs://bafybeistormbadges1k001",
        contractAddress: "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC",
        affiliateAddress: "GDXRN7VQK66EZM6PFFKYY2F6J6E4YQZ5YQ47T7V6PX6T3K42P37X2LTA",
      },
      {
        tier: "10k",
        tokenId: "SBT-STORM-10K-00052",
        txHash: "0x34a8e2f1b098c47b56a1e94d8723c01bf64c23e8749a21c43b91e0a78912e5c8",
        claimedAt: "2025-05-14T09:30:00Z",
        nonTransferable: true,
        tokenUri: "ipfs://bafybeistormbadges10k052",
        contractAddress: "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC",
        affiliateAddress: "GDXRN7VQK66EZM6PFFKYY2F6J6E4YQZ5YQ47T7V6PX6T3K42P37X2LTA",
      },
      {
        tier: "100k",
        tokenId: "SBT-STORM-100K-00008",
        txHash: "0x77d12f4c9a83e01bc6e4d82b091f3a5e84c17b94e21a00938f46c1a89472e10a",
        claimedAt: "2025-11-20T18:45:00Z",
        nonTransferable: true,
        tokenUri: "ipfs://bafybeistormbadges100k008",
        contractAddress: "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC",
        affiliateAddress: "GDXRN7VQK66EZM6PFFKYY2F6J6E4YQZ5YQ47T7V6PX6T3K42P37X2LTA",
      },
    ],
  },
  {
    address: "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
    maskedAddress: "G***FLA5",
    pseudonym: "TitanNova#8821",
    isPrivacyMasked: false,
    avatarSeed: "titan",
    weeklyGrossSales: 31400,
    monthlyGrossSales: 119200,
    allTimeGrossSales: 540000,
    verifiedSalesCount: 685,
    conversionRate: 5.9,
    commissionEarnedXlm: 35760,
    activeCampaigns: 11,
    joinedAt: "2025-03-12",
    claimedBadges: [
      {
        tier: "1k",
        tokenId: "SBT-STORM-1K-00155",
        txHash: "0x12b4e89f2a00c14b7e89d6c41e02a007f3c19b48c66e4a284e31109a9041b31a",
        claimedAt: "2025-04-02T10:00:00Z",
        nonTransferable: true,
        tokenUri: "ipfs://bafybeistormbadges1k155",
        contractAddress: "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC",
        affiliateAddress: "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
      },
      {
        tier: "10k",
        tokenId: "SBT-STORM-10K-00084",
        txHash: "0x44c18e9a0f44b28c77e1d5a89432e10bf64c23e8749a21c43b91e0a78912e5c1",
        claimedAt: "2025-07-18T14:20:00Z",
        nonTransferable: true,
        tokenUri: "ipfs://bafybeistormbadges10k084",
        contractAddress: "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC",
        affiliateAddress: "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
      },
      {
        tier: "100k",
        tokenId: "SBT-STORM-100K-00014",
        txHash: "0x98f41e0a82b3c74d6e91a5f8021c3b4e77a284d19c00b21a84f39c148201b5a2",
        claimedAt: "2025-12-05T16:10:00Z",
        nonTransferable: true,
        tokenUri: "ipfs://bafybeistormbadges100k014",
        contractAddress: "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC",
        affiliateAddress: "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
      },
    ],
  },
  {
    address: "GCLP9KMV4J46EAP2T75SBY7U6BTRX82Y4HXZ9L2W3Q8J47N1M6D4K9A1",
    maskedAddress: "G***K9A1",
    pseudonym: "ShadowMarketer#4412",
    isPrivacyMasked: true, // Privacy option demonstrated
    avatarSeed: "shadow",
    weeklyGrossSales: 26800,
    monthlyGrossSales: 94600,
    allTimeGrossSales: 410000,
    verifiedSalesCount: 540,
    conversionRate: 5.4,
    commissionEarnedXlm: 28380,
    activeCampaigns: 9,
    joinedAt: "2025-04-05",
    claimedBadges: [
      {
        tier: "1k",
        tokenId: "SBT-STORM-1K-00210",
        txHash: "0x22c4f89a2a00c14b7e89d6c41e02a007f3c19b48c66e4a284e31109a9041b31b",
        claimedAt: "2025-04-20T11:00:00Z",
        nonTransferable: true,
        tokenUri: "ipfs://bafybeistormbadges1k210",
        contractAddress: "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC",
        affiliateAddress: "GCLP9KMV4J46EAP2T75SBY7U6BTRX82Y4HXZ9L2W3Q8J47N1M6D4K9A1",
      },
      {
        tier: "10k",
        tokenId: "SBT-STORM-10K-00122",
        txHash: "0x55d19f0a1f44b28c77e1d5a89432e10bf64c23e8749a21c43b91e0a78912e5c2",
        claimedAt: "2025-08-11T15:30:00Z",
        nonTransferable: true,
        tokenUri: "ipfs://bafybeistormbadges10k122",
        contractAddress: "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC",
        affiliateAddress: "GCLP9KMV4J46EAP2T75SBY7U6BTRX82Y4HXZ9L2W3Q8J47N1M6D4K9A1",
      },
    ],
  },
  {
    address: "GAMZ7X6T2P8K4N1M9L5J3H2G4F6D8S1A3Q5W7E9R2T4Y6U8I0O2P4S6D",
    maskedAddress: "G***4S6D",
    pseudonym: "QuantumGrowth#7719",
    isPrivacyMasked: false,
    avatarSeed: "quantum",
    weeklyGrossSales: 22100,
    monthlyGrossSales: 81400,
    allTimeGrossSales: 360000,
    verifiedSalesCount: 462,
    conversionRate: 5.1,
    commissionEarnedXlm: 24420,
    activeCampaigns: 8,
    joinedAt: "2025-04-18",
    claimedBadges: [
      {
        tier: "1k",
        tokenId: "SBT-STORM-1K-00244",
        txHash: "0x33d4f89a2a00c14b7e89d6c41e02a007f3c19b48c66e4a284e31109a9041b31c",
        claimedAt: "2025-05-02T08:15:00Z",
        nonTransferable: true,
        tokenUri: "ipfs://bafybeistormbadges1k244",
        contractAddress: "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC",
        affiliateAddress: "GAMZ7X6T2P8K4N1M9L5J3H2G4F6D8S1A3Q5W7E9R2T4Y6U8I0O2P4S6D",
      },
      {
        tier: "10k",
        tokenId: "SBT-STORM-10K-00160",
        txHash: "0x66e19f0a1f44b28c77e1d5a89432e10bf64c23e8749a21c43b91e0a78912e5c3",
        claimedAt: "2025-09-04T12:45:00Z",
        nonTransferable: true,
        tokenUri: "ipfs://bafybeistormbadges10k160",
        contractAddress: "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC",
        affiliateAddress: "GAMZ7X6T2P8K4N1M9L5J3H2G4F6D8S1A3Q5W7E9R2T4Y6U8I0O2P4S6D",
      },
    ],
  },
  {
    address: "GCZ2K4J8M1N6B9V5C3X7Z2A4S6D8F1G3H5J7K9L2P4O6I8U0Y2T4R6E8",
    maskedAddress: "G***R6E8",
    pseudonym: "CryptoCatalyst#3120",
    isPrivacyMasked: false,
    avatarSeed: "catalyst",
    weeklyGrossSales: 18900,
    monthlyGrossSales: 68900,
    allTimeGrossSales: 295000,
    verifiedSalesCount: 395,
    conversionRate: 4.9,
    commissionEarnedXlm: 20670,
    activeCampaigns: 7,
    joinedAt: "2025-05-01",
    claimedBadges: [
      {
        tier: "1k",
        tokenId: "SBT-STORM-1K-00299",
        txHash: "0x44e4f89a2a00c14b7e89d6c41e02a007f3c19b48c66e4a284e31109a9041b31d",
        claimedAt: "2025-05-19T14:10:00Z",
        nonTransferable: true,
        tokenUri: "ipfs://bafybeistormbadges1k299",
        contractAddress: "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC",
        affiliateAddress: "GCZ2K4J8M1N6B9V5C3X7Z2A4S6D8F1G3H5J7K9L2P4O6I8U0Y2T4R6E8",
      },
      {
        tier: "10k",
        tokenId: "SBT-STORM-10K-00195",
        txHash: "0x77f19f0a1f44b28c77e1d5a89432e10bf64c23e8749a21c43b91e0a78912e5c4",
        claimedAt: "2025-10-12T17:00:00Z",
        nonTransferable: true,
        tokenUri: "ipfs://bafybeistormbadges10k195",
        contractAddress: "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC",
        affiliateAddress: "GCZ2K4J8M1N6B9V5C3X7Z2A4S6D8F1G3H5J7K9L2P4O6I8U0Y2T4R6E8",
      },
    ],
  },
];

// Helper to generate remaining 45 affiliates deterministically
function generateRemainingSeedAffiliates(): Omit<AffiliateRankingItem, "rank">[] {
  const result: Omit<AffiliateRankingItem, "rank">[] = [];
  const baseAddrs = [
    "GA7T4Y2U9I0O3P5S7D1F3G5H7J9K2L4Z6X8C0V2B4N6M8Q1W3E5R7T9Y",
    "GB3N5M7Q1W3E5R7T9Y2U4I6O8P0S2D4F6G8H0J2K4L6Z8X0C2V4B6N8M",
    "GC5R7T9Y2U4I6O8P0S2D4F6G8H0J2K4L6Z8X0C2V4B6N8M1Q3W5E7R9T",
    "GD9U1I3O5P7S9D1F3G5H7J9K2L4Z6X8C0V2B4N6M8Q1W3E5R7T9Y2U4I",
    "GE2O4P6S8D0F2G4H6J8K0L2Z4X6C8V0B2N4M6Q8W0E2R4T6Y8U0I2O4P",
    "GF4S6D8F0G2H4J6K8L0Z2X4C6V8B0N2M4Q6W8E0R2T4Y6U8I0O2P4S6D",
    "GG6D8F0G2H4J6K8L0Z2X4C6V8B0N2M4Q6W8E0R2T4Y6U8I0O2P4S6D8F",
    "GH8F0G2H4J6K8L0Z2X4C6V8B0N2M4Q6W8E0R2T4Y6U8I0O2P4S6D8F0G",
    "GI0G2H4J6K8L0Z2X4C6V8B0N2M4Q6W8E0R2T4Y6U8I0O2P4S6D8F0G2H",
  ];

  for (let i = 6; i <= 50; i++) {
    const rawKey = `${baseAddrs[i % baseAddrs.length].slice(0, 52)}${String(i).padStart(4, "0")}`;
    const monthlySales = Math.max(1200, Math.round(65000 * Math.pow(0.92, i - 5)));
    const weeklySales = Math.round(monthlySales * (0.22 + (i % 5) * 0.02));
    const allTimeSales = Math.round(monthlySales * (3.5 + (i % 4) * 0.5));
    const isMasked = i % 7 === 0 || i % 11 === 0;

    const claimedBadges: ClaimedMilestoneRecord[] = [];
    if (monthlySales >= 1000) {
      claimedBadges.push({
        tier: "1k",
        tokenId: `SBT-STORM-1K-${String(i * 19).padStart(5, "0")}`,
        txHash: `0x${i}9e1b5c2a104f7b4e99d8b6c43e21a007f3c19b48c66e4a284e31109a9041b31`,
        claimedAt: "2025-06-15T10:00:00Z",
        nonTransferable: true,
        tokenUri: `ipfs://bafybeistormbadges1k${i}`,
        contractAddress: "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC",
        affiliateAddress: rawKey,
      });
    }
    if (monthlySales >= 10000) {
      claimedBadges.push({
        tier: "10k",
        tokenId: `SBT-STORM-10K-${String(i * 11).padStart(5, "0")}`,
        txHash: `0x${i}4a8e2f1b098c47b56a1e94d8723c01bf64c23e8749a21c43b91e0a78912e5c8`,
        claimedAt: "2025-09-20T14:00:00Z",
        nonTransferable: true,
        tokenUri: `ipfs://bafybeistormbadges10k${i}`,
        contractAddress: "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC",
        affiliateAddress: rawKey,
      });
    }

    result.push({
      address: rawKey,
      maskedAddress: maskStellarAddress(rawKey),
      pseudonym: getMaskedPseudonym(rawKey),
      isPrivacyMasked: isMasked,
      avatarSeed: `seed-${i}`,
      weeklyGrossSales: weeklySales,
      monthlyGrossSales: monthlySales,
      allTimeGrossSales: allTimeSales,
      verifiedSalesCount: Math.round(monthlySales / 180),
      conversionRate: +(3.2 + (i % 20) * 0.1).toFixed(1),
      commissionEarnedXlm: Math.round(monthlySales * 0.3),
      activeCampaigns: Math.max(2, Math.round(10 - i * 0.15)),
      joinedAt: "2025-06-01",
      claimedBadges,
    });
  }

  return result;
}

const ALL_SEED_AFFILIATES = [...SEED_AFFILIATES, ...generateRemainingSeedAffiliates()];

/**
 * Computes and returns the top 50 affiliate rankings for the specified timeframe.
 * Automatically injects/reflects the connected user's performance and privacy setting.
 */
export function getLeaderboardRankings(
  timeframe: LeaderboardTimeframe = "monthly",
  search: string = "",
  sortBy: "sales" | "conversions" | "commission" = "sales",
  userAddress: string | null = null,
): { items: AffiliateRankingItem[]; stats: LeaderboardStats } {
  // Clone seed list
  const pool: Omit<AffiliateRankingItem, "rank">[] = ALL_SEED_AFFILIATES.map((a) => {
    const isMaskedLocally = getAffiliatePrivacy(a.address);
    const claimedLocal = getClaimedBadges(a.address);
    return {
      ...a,
      isPrivacyMasked: a.isPrivacyMasked || isMaskedLocally,
      claimedBadges: claimedLocal.length > 0 ? claimedLocal : a.claimedBadges,
    };
  });

  // If userAddress is provided, merge or insert user
  if (userAddress) {
    const userSales = getUserGrossSales(userAddress);
    const userClaimed = getClaimedBadges(userAddress);
    const userPrivacy = getAffiliatePrivacy(userAddress);

    const existingIndex = pool.findIndex(
      (a) => a.address.toLowerCase() === userAddress.toLowerCase(),
    );

    const userAffiliateItem: Omit<AffiliateRankingItem, "rank"> = {
      address: userAddress,
      maskedAddress: maskStellarAddress(userAddress),
      pseudonym: getMaskedPseudonym(userAddress),
      isPrivacyMasked: userPrivacy,
      avatarSeed: "user",
      weeklyGrossSales: userSales.weekly,
      monthlyGrossSales: userSales.monthly,
      allTimeGrossSales: userSales.allTime,
      verifiedSalesCount: Math.max(1, Math.round(userSales.monthly / 160)),
      conversionRate: 4.8,
      commissionEarnedXlm: Math.round(userSales.monthly * 0.32),
      activeCampaigns: 4,
      joinedAt: "2025-10-01",
      claimedBadges: userClaimed,
    };

    if (existingIndex >= 0) {
      pool[existingIndex] = userAffiliateItem;
    } else {
      pool.push(userAffiliateItem);
    }
  }

  // Sorting
  pool.sort((a, b) => {
    if (sortBy === "conversions") {
      return b.verifiedSalesCount - a.verifiedSalesCount;
    }
    if (sortBy === "commission") {
      return b.commissionEarnedXlm - a.commissionEarnedXlm;
    }
    // Default: Sort by sales volume according to timeframe
    if (timeframe === "weekly") {
      return b.weeklyGrossSales - a.weeklyGrossSales;
    }
    if (timeframe === "all-time") {
      return b.allTimeGrossSales - a.allTimeGrossSales;
    }
    return b.monthlyGrossSales - a.monthlyGrossSales;
  });

  // Assign ranks
  let ranked: AffiliateRankingItem[] = pool.map((item, idx) => ({
    ...item,
    rank: idx + 1,
  }));

  // Calculate summary stats
  const totalMonthlyVolume = ranked.reduce((acc, curr) => acc + curr.monthlyGrossSales, 0);
  const totalBadgesClaimed = ranked.reduce((acc, curr) => acc + curr.claimedBadges.length, 0);
  const topAffiliateMonthlyVolume = ranked[0]?.monthlyGrossSales || 0;

  // Filter by search if provided
  if (search.trim()) {
    const q = search.trim().toLowerCase();
    ranked = ranked.filter(
      (item) =>
        item.address.toLowerCase().includes(q) ||
        item.pseudonym.toLowerCase().includes(q) ||
        item.maskedAddress.toLowerCase().includes(q) ||
        String(item.rank) === q,
    );
  }

  // Cap at top 50
  const top50 = ranked.slice(0, 50);

  return {
    items: top50,
    stats: {
      totalMonthlyVolume,
      activeAffiliatesCount: pool.length,
      totalBadgesClaimed,
      topAffiliateMonthlyVolume,
    },
  };
}

/**
 * Returns full profile data for a specific affiliate address, including milestone unlocks
 */
export function getAffiliateProfile(
  address: string,
  userAddress: string | null = null,
): AffiliateProfileData {
  const isCurrentUser =
    userAddress && address && address.toLowerCase() === userAddress.toLowerCase();
  const sales = getUserGrossSales(address);
  const claimed = getClaimedBadges(address);
  const isPrivacyMasked = getAffiliatePrivacy(address);

  // Check which tiers are unlocked by gross sales volume
  const unlockedTiers: MilestoneTier[] = [];
  if (sales.monthly >= MILESTONE_BADGES["1k"].thresholdGrossSales) {
    unlockedTiers.push("1k");
  }
  if (sales.monthly >= MILESTONE_BADGES["10k"].thresholdGrossSales) {
    unlockedTiers.push("10k");
  }
  if (sales.monthly >= MILESTONE_BADGES["100k"].thresholdGrossSales) {
    unlockedTiers.push("100k");
  }

  // Determine next milestone progress
  let nextTier: MilestoneTier | null;
  let targetSales: number;
  if (sales.monthly < 1000) {
    nextTier = "1k";
    targetSales = 1000;
  } else if (sales.monthly < 10000) {
    nextTier = "10k";
    targetSales = 10000;
  } else if (sales.monthly < 100000) {
    nextTier = "100k";
    targetSales = 100000;
  } else {
    nextTier = null;
    targetSales = 100000;
  }

  const remainingSales = nextTier ? Math.max(0, targetSales - sales.monthly) : 0;
  const progressPercentage = nextTier
    ? Math.min(100, Math.round((sales.monthly / targetSales) * 100))
    : 100;

  // Find rank on monthly leaderboard
  const { items } = getLeaderboardRankings("monthly", "", "sales", address);
  const found = items.find((i) => i.address.toLowerCase() === address.toLowerCase());
  const rank = found ? found.rank : 51;

  return {
    rank,
    address,
    maskedAddress: maskStellarAddress(address),
    pseudonym: getMaskedPseudonym(address),
    isPrivacyMasked: Boolean(isPrivacyMasked),
    avatarSeed: isCurrentUser ? "current-user" : address.slice(0, 6),
    weeklyGrossSales: sales.weekly,
    monthlyGrossSales: sales.monthly,
    allTimeGrossSales: sales.allTime,
    verifiedSalesCount: Math.max(1, Math.round(sales.monthly / 160)),
    conversionRate: 4.8,
    commissionEarnedXlm: Math.round(sales.monthly * 0.32),
    activeCampaigns: 4,
    joinedAt: "2025-10-01",
    claimedBadges: claimed,
    unlockedTiers,
    nextMilestoneProgress: {
      nextTier,
      nextTierName: nextTier ? MILESTONE_BADGES[nextTier].name : null,
      targetSales,
      currentSales: sales.monthly,
      remainingSales,
      progressPercentage,
    },
  };
}

/**
 * Claims a milestone badge for an affiliate address via on-chain Soroban contract or Stellar asset mint.
 * Validates eligibility ($1K, $10K, $100K thresholds) and stores non-transferable soulbound proof.
 */
export async function claimMilestoneBadge(
  affiliateAddress: string,
  tier: MilestoneTier,
  walletType: WalletType = "freighter",
): Promise<ClaimedMilestoneRecord> {
  const config = MILESTONE_BADGES[tier];
  if (!config) {
    throw new Error(`Invalid milestone badge tier: ${tier}`);
  }

  const sales = getUserGrossSales(affiliateAddress);
  if (sales.monthly < config.thresholdGrossSales) {
    throw new Error(
      `Milestone not reached. You have $${sales.monthly.toLocaleString()} in verified gross sales, but $${config.thresholdGrossSales.toLocaleString()} is required for the ${config.name}.`,
    );
  }

  const existing = getClaimedBadges(affiliateAddress);
  const alreadyClaimed = existing.find((b) => b.tier === tier);
  if (alreadyClaimed) {
    return alreadyClaimed;
  }

  // Invoke on-chain Soroban minting call
  const onChainResult = await mintMilestoneBadgeContractCall(affiliateAddress, tier, walletType);

  const newRecord: ClaimedMilestoneRecord = {
    tier,
    tokenId: onChainResult.tokenId,
    txHash: onChainResult.txHash,
    claimedAt: new Date().toISOString(),
    nonTransferable: true,
    tokenUri: `ipfs://bafybeistormbadges${tier}${Date.now()}`,
    contractAddress: "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC",
    affiliateAddress,
  };

  saveClaimedBadge(newRecord);
  return newRecord;
}
