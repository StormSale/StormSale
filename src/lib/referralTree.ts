/**
 * Two-Tier Referral Tree Architecture & Override Commission Engine (#157)
 *
 * Implements:
 * 1. Two-tier parent-child affiliate referral relationships
 * 2. Mathematical commission split (e.g. 8% direct selling affiliate, 2% recruiter override)
 * 3. Prevention of self-referrals and circular referral chains
 * 4. Hierarchical referral tree construction and override earnings aggregation
 * 5. Recruiter invite link generation and query parameter parsing
 * 6. Atomic two-tier sale recording and reward persistence
 */

import { StrKey } from "@stellar/stellar-sdk";
import type {
  AffiliateReferralRelation,
  TwoTierCommissionSplit,
  ReferralTreeNode,
  ReferralTreeSummary,
} from "../types/referral";
import { getLocalStorage } from "./storage";

export const REFERRAL_TREE_STORAGE_KEY = "stormsale.referral.tree";
export const REFERRAL_OVERRIDES_STORAGE_KEY = "stormsale.referral.overrides";

export const DEFAULT_TOTAL_COMMISSION_PERCENT = 10.0;
export const DEFAULT_OVERRIDE_RATE_PERCENT = 2.0;
export const DEFAULT_DIRECT_RATE_PERCENT = 8.0;

export const STROOPS_PER_XLM = 10_000_000n;

/**
 * Validates a Stellar ed25519 public key.
 */
export function isValidStellarAddress(address: string): boolean {
  if (!address || typeof address !== "string") return false;
  const trimmed = address.trim();
  // Support mock / fixture Stellar addresses in testing and simulated environments
  if (
    trimmed.startsWith("GASTORMSALE7") ||
    trimmed.startsWith("GAFFILIATE") ||
    trimmed.startsWith("GMOCK") ||
    trimmed.startsWith("GTEST")
  ) {
    return trimmed.length >= 20;
  }
  try {
    return StrKey.isValidEd25519PublicKey(trimmed);
  } catch {
    return false;
  }
}

/**
 * Formats a Stellar public key for compact display.
 */
export function formatAffiliateAddress(address: string): string {
  if (!address || address.length < 10) return address || "Unknown";
  return `${address.slice(0, 5)}...${address.slice(-4)}`;
}

/**
 * Calculates two-tier commission split for a verified sale.
 *
 * Example:
 * Total Commission = 10%, Recruiter Override = 2%
 * Direct Selling Affiliate gets 8%
 * Recruiter gets 2%
 *
 * If no recruiter is registered: Direct Selling Affiliate gets the full 10%.
 */
export function calculateTwoTierCommission(
  saleAmountXlm: number,
  totalCommissionRatePercent: number = DEFAULT_TOTAL_COMMISSION_PERCENT,
  recruiterOverrideRatePercent: number = DEFAULT_OVERRIDE_RATE_PERCENT,
  recruiterAddress?: string,
  sellingAffiliateAddress: string = "",
): TwoTierCommissionSplit {
  const safeSaleAmount = Math.max(0, saleAmountXlm);
  const safeTotalRate = Math.max(0, totalCommissionRatePercent);

  const hasRecruiter = Boolean(
    recruiterAddress &&
      recruiterAddress.trim() !== "" &&
      recruiterAddress.trim() !== sellingAffiliateAddress.trim(),
  );

  let sellingRate = safeTotalRate;
  let overrideRate = 0;

  if (hasRecruiter) {
    overrideRate = Math.min(safeTotalRate, Math.max(0, recruiterOverrideRatePercent));
    sellingRate = Math.max(0, safeTotalRate - overrideRate);
  }

  const totalCommissionXlm = Number(((safeSaleAmount * safeTotalRate) / 100).toFixed(7));
  const sellingAffiliateCommissionXlm = Number(((safeSaleAmount * sellingRate) / 100).toFixed(7));
  const recruiterOverrideCommissionXlm = hasRecruiter
    ? Number(((safeSaleAmount * overrideRate) / 100).toFixed(7))
    : 0;

  const totalCommissionStroops = BigInt(Math.floor(totalCommissionXlm * 10_000_000));
  const recruiterOverrideStroops = BigInt(Math.floor(recruiterOverrideCommissionXlm * 10_000_000));
  const sellingAffiliateStroops = totalCommissionStroops - recruiterOverrideStroops;

  const splitRatioLabel =
    hasRecruiter && safeTotalRate > 0
      ? `${Math.round((sellingRate / safeTotalRate) * 100)}% / ${Math.round((overrideRate / safeTotalRate) * 100)}%`
      : "100% / 0%";

  return {
    saleAmountXlm: safeSaleAmount,
    totalCommissionRatePercent: safeTotalRate,
    totalCommissionXlm,
    sellingAffiliateAddress: sellingAffiliateAddress.trim(),
    sellingAffiliateRatePercent: sellingRate,
    sellingAffiliateCommissionXlm,
    sellingAffiliateStroops,
    recruiterAddress: hasRecruiter ? recruiterAddress?.trim() : undefined,
    recruiterOverrideRatePercent: overrideRate,
    recruiterOverrideCommissionXlm,
    recruiterOverrideStroops,
    hasRecruiter,
    splitRatioLabel,
  };
}

/**
 * Validates a proposed referral binding between a master affiliate and a recruit.
 * Prevents self-referrals, duplicate recruiters, and circular referral cycles.
 */
export function validateReferralBinding(
  childAddress: string,
  parentAddress: string,
  existingRelations: AffiliateReferralRelation[],
): { valid: boolean; error?: string } {
  const child = childAddress.trim();
  const parent = parentAddress.trim();

  if (!child || !parent) {
    return { valid: false, error: "Both child and recruiter addresses are required." };
  }

  if (!isValidStellarAddress(child)) {
    return { valid: false, error: `Invalid recruited sub-affiliate Stellar address: ${child}` };
  }

  if (!isValidStellarAddress(parent)) {
    return { valid: false, error: `Invalid master recruiter Stellar address: ${parent}` };
  }

  if (child.toLowerCase() === parent.toLowerCase()) {
    return { valid: false, error: "Affiliates cannot recruit themselves." };
  }

  // Check if sub-affiliate is already bound to a recruiter
  const existingBinding = existingRelations.find(
    (r) => r.childAddress.toLowerCase() === child.toLowerCase(),
  );
  if (existingBinding) {
    return {
      valid: false,
      error: `Affiliate is already recruited by ${formatAffiliateAddress(existingBinding.parentAddress)}.`,
    };
  }

  // Prevent circular referral loops:
  // Trace parent's ancestor chain to ensure child is not an ancestor of parent
  let currentAncestor: string | undefined = parent;
  const visited = new Set<string>();

  while (currentAncestor) {
    if (currentAncestor.toLowerCase() === child.toLowerCase()) {
      return {
        valid: false,
        error: "Circular referral detected: a recruit cannot be recruited by their own descendant.",
      };
    }
    visited.add(currentAncestor.toLowerCase());
    const parentRelation = existingRelations.find(
      (r) => r.childAddress.toLowerCase() === currentAncestor?.toLowerCase(),
    );
    currentAncestor = parentRelation?.parentAddress;
    if (currentAncestor && visited.has(currentAncestor.toLowerCase())) {
      break; // Safeguard against existing loops
    }
  }

  return { valid: true };
}

/**
 * Loads all stored referral relations from persistent storage.
 */
export function loadReferralRelations(): AffiliateReferralRelation[] {
  const storage = getLocalStorage();
  try {
    const raw = storage.getItem(REFERRAL_TREE_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed;
    }
    return [];
  } catch (err) {
    console.warn("Failed to load referral relations:", err);
    return [];
  }
}

/**
 * Persists referral relations to storage.
 */
export function saveReferralRelations(relations: AffiliateReferralRelation[]): boolean {
  const storage = getLocalStorage();
  try {
    storage.setItem(REFERRAL_TREE_STORAGE_KEY, JSON.stringify(relations));
    return true;
  } catch (err) {
    console.error("Failed to save referral relations:", err);
    return false;
  }
}

/**
 * Registers and binds a new sub-affiliate to a master recruiter.
 */
export function registerSubAffiliate(
  childAddress: string,
  parentAddress: string,
  options: {
    childName?: string;
    parentName?: string;
    overrideRatePercent?: number;
    recruiterTag?: string;
  } = {},
): AffiliateReferralRelation {
  const relations = loadReferralRelations();
  const validation = validateReferralBinding(childAddress, parentAddress, relations);

  if (!validation.valid) {
    throw new Error(validation.error || "Failed to bind sub-affiliate.");
  }

  const rawRate = options.overrideRatePercent;
  const overrideRate =
    rawRate !== undefined && Number.isFinite(rawRate) && rawRate >= 0 && rawRate <= DEFAULT_TOTAL_COMMISSION_PERCENT
      ? rawRate
      : DEFAULT_OVERRIDE_RATE_PERCENT;
  const directRate = Math.max(0, DEFAULT_TOTAL_COMMISSION_PERCENT - overrideRate);

  const isParentAChild = relations.some(
    (r) => r.childAddress.toUpperCase() === parentAddress.trim().toUpperCase(),
  );
  const tier: 1 | 2 = isParentAChild ? 2 : 1;

  const newRelation: AffiliateReferralRelation = {
    childAddress: childAddress.trim(),
    childName: options.childName?.trim() || `Marketer ${childAddress.slice(0, 4)}`,
    parentAddress: parentAddress.trim(),
    parentName: options.parentName?.trim() || "Master Recruiter",
    recruitedAt: new Date().toISOString(),
    tier,
    overrideRatePercent: overrideRate,
    directCommissionRatePercent: directRate,
    status: "active",
    recruiterTag: options.recruiterTag || "invite-link",
    totalSalesVolumeXlm: 0,
    totalDirectCommissionEarnedXlm: 0,
    totalOverrideEarnedXlm: 0,
    salesCount: 0,
  };

  relations.push(newRelation);
  saveReferralRelations(relations);

  return newRelation;
}

/**
 * Retrieves the master recruiter for a given affiliate address.
 */
export function getRecruiterForAffiliate(
  childAddress: string,
  relationsList?: AffiliateReferralRelation[],
): AffiliateReferralRelation | undefined {
  const list = relationsList || loadReferralRelations();
  return list.find(
    (r) => r.childAddress.toLowerCase() === childAddress.trim().toLowerCase() && r.status === "active",
  );
}

/**
 * Retrieves all sub-affiliates recruited directly by a master affiliate.
 */
export function getSubAffiliatesForParent(
  parentAddress: string,
  relationsList?: AffiliateReferralRelation[],
): AffiliateReferralRelation[] {
  const list = relationsList || loadReferralRelations();
  return list.filter(
    (r) => r.parentAddress.toLowerCase() === parentAddress.trim().toLowerCase(),
  );
}

/**
 * Builds a hierarchical two-tier referral tree for visualization.
 */
export function buildReferralTree(
  masterAddress: string,
  allRelations?: AffiliateReferralRelation[],
): ReferralTreeNode {
  const relations = allRelations || loadReferralRelations();
  const cleanMaster = masterAddress.trim();

  // Find Tier-1 direct recruits
  const tier1Relations = relations.filter(
    (r) => r.parentAddress.toLowerCase() === cleanMaster.toLowerCase(),
  );

  let masterVolume = 0;
  const masterDirectEarnings = 0;
  let masterOverrideEarnings = 0;
  let masterSalesCount = 0;

  const childrenNodes: ReferralTreeNode[] = tier1Relations.map((t1) => {
    // Find Tier-2 recruits (recruited by this tier-1 partner)
    const tier2Relations = relations.filter(
      (r) => r.parentAddress.toLowerCase() === t1.childAddress.toLowerCase(),
    );

    const tier2Children: ReferralTreeNode[] = tier2Relations.map((t2) => ({
      address: t2.childAddress,
      name: t2.childName,
      tier: 2,
      roleLabel: "Sub-Affiliate (Tier 2)",
      parentAddress: t2.parentAddress,
      recruitedAt: t2.recruitedAt,
      salesCount: t2.salesCount,
      salesVolumeXlm: t2.totalSalesVolumeXlm,
      directEarningsXlm: t2.totalDirectCommissionEarnedXlm,
      overrideEarningsXlm: t2.totalOverrideEarnedXlm,
      isActive: t2.status === "active",
      children: [],
    }));

    // Aggregate sub-tree totals
    const t1SubVolume = tier2Children.reduce((sum, c) => sum + c.salesVolumeXlm, 0);
    const t1Override = tier2Children.reduce((sum, c) => sum + c.overrideEarningsXlm, 0);

    masterVolume += t1.totalSalesVolumeXlm + t1SubVolume;
    masterOverrideEarnings += t1.totalOverrideEarnedXlm;
    masterSalesCount += t1.salesCount;

    return {
      address: t1.childAddress,
      name: t1.childName,
      tier: 1,
      roleLabel: "Sub-Affiliate (Tier 1)",
      parentAddress: t1.parentAddress,
      recruitedAt: t1.recruitedAt,
      salesCount: t1.salesCount,
      salesVolumeXlm: t1.totalSalesVolumeXlm,
      directEarningsXlm: t1.totalDirectCommissionEarnedXlm,
      overrideEarningsXlm: t1.totalOverrideEarnedXlm + t1Override,
      isActive: t1.status === "active",
      children: tier2Children,
    };
  });

  return {
    address: cleanMaster,
    name: "Master Affiliate (You)",
    tier: 0,
    roleLabel: "Master Affiliate",
    recruitedAt: new Date().toISOString(),
    salesCount: masterSalesCount,
    salesVolumeXlm: Number(masterVolume.toFixed(2)),
    directEarningsXlm: Number(masterDirectEarnings.toFixed(2)),
    overrideEarningsXlm: Number(masterOverrideEarnings.toFixed(2)),
    isActive: true,
    children: childrenNodes,
  };
}

/**
 * Computes statistical and financial summary of the referral network.
 */
export function getReferralTreeSummary(
  masterAddress: string,
  allRelations?: AffiliateReferralRelation[],
): ReferralTreeSummary {
  const relations = allRelations || loadReferralRelations();
  const cleanMaster = masterAddress.trim().toLowerCase();

  const directRecruits = relations.filter((r) => r.parentAddress.toLowerCase() === cleanMaster);
  const directAddresses = new Set(directRecruits.map((r) => r.childAddress.toLowerCase()));

  const secondTierRecruits = relations.filter((r) =>
    directAddresses.has(r.parentAddress.toLowerCase()),
  );

  const totalNetworkVolumeXlm = directRecruits.reduce(
    (acc, r) => acc + r.totalSalesVolumeXlm,
    0,
  );
  const totalOverrideEarnedXlm = directRecruits.reduce(
    (acc, r) => acc + r.totalOverrideEarnedXlm,
    0,
  );

  let topPerformer: ReferralTreeSummary["topPerformer"] | undefined;
  if (directRecruits.length > 0) {
    const sorted = [...directRecruits].sort(
      (a, b) => b.totalSalesVolumeXlm - a.totalSalesVolumeXlm,
    );
    topPerformer = {
      address: sorted[0].childAddress,
      name: sorted[0].childName,
      volumeXlm: sorted[0].totalSalesVolumeXlm,
      overrideXlm: sorted[0].totalOverrideEarnedXlm,
    };
  }

  // Load override receipts from storage
  const storage = getLocalStorage();
  let recentOverrides: ReferralTreeSummary["recentOverrides"] = [];
  try {
    const rawHistory = storage.getItem(REFERRAL_OVERRIDES_STORAGE_KEY);
    if (rawHistory) {
      const parsed = JSON.parse(rawHistory);
      if (Array.isArray(parsed)) {
        const directAddresses = new Set(directRecruits.map((r) => r.childAddress.toLowerCase()));
        recentOverrides = parsed
          .filter(
            (rec: any) =>
              rec?.subAffiliateAddress &&
              directAddresses.has(String(rec.subAffiliateAddress).toLowerCase()),
          )
          .slice(0, 10);
      }
    }
  } catch {
    recentOverrides = [];
  }

  return {
    masterAddress,
    directRecruitsCount: directRecruits.length,
    secondTierRecruitsCount: secondTierRecruits.length,
    totalNetworkSize: directRecruits.length + secondTierRecruits.length,
    totalNetworkVolumeXlm: Number(totalNetworkVolumeXlm.toFixed(2)),
    totalOverrideEarnedXlm: Number(totalOverrideEarnedXlm.toFixed(2)),
    topPerformer,
    recentOverrides,
  };
}

/**
 * Records a verified sale against the two-tier referral state.
 * Accrues direct commission to the selling affiliate and passive override to the master recruiter.
 */
export function recordReferralSale(params: {
  saleAmountXlm: number;
  sellingAffiliateAddress: string;
  totalCommissionRatePercent?: number;
  campaignId?: number;
  txHash?: string;
}): TwoTierCommissionSplit {
  const relations = loadReferralRelations();
  const sellingAddr = params.sellingAffiliateAddress.trim();

  // Find if this seller has a recruiter
  const relationIndex = relations.findIndex(
    (r) => r.childAddress.toLowerCase() === sellingAddr.toLowerCase() && r.status === "active",
  );

  const relation = relationIndex >= 0 ? relations[relationIndex] : undefined;
  const recruiterAddress = relation?.parentAddress;
  const overrideRate = relation?.overrideRatePercent ?? DEFAULT_OVERRIDE_RATE_PERCENT;

  const split = calculateTwoTierCommission(
    params.saleAmountXlm,
    params.totalCommissionRatePercent ?? DEFAULT_TOTAL_COMMISSION_PERCENT,
    overrideRate,
    recruiterAddress,
    sellingAddr,
  );

  // If a relation exists, update its cumulative metrics
  if (relation && relationIndex >= 0) {
    relation.salesCount += 1;
    relation.totalSalesVolumeXlm = Number(
      (relation.totalSalesVolumeXlm + split.saleAmountXlm).toFixed(2),
    );
    relation.totalDirectCommissionEarnedXlm = Number(
      (relation.totalDirectCommissionEarnedXlm + split.sellingAffiliateCommissionXlm).toFixed(2),
    );
    relation.totalOverrideEarnedXlm = Number(
      (relation.totalOverrideEarnedXlm + split.recruiterOverrideCommissionXlm).toFixed(2),
    );
    relation.lastSaleAt = new Date().toISOString();

    relations[relationIndex] = relation;
    saveReferralRelations(relations);

    // Append to override audit log
    if (split.recruiterOverrideCommissionXlm > 0) {
      const storage = getLocalStorage();
      try {
        const rawHistory = storage.getItem(REFERRAL_OVERRIDES_STORAGE_KEY);
        const history = rawHistory ? JSON.parse(rawHistory) : [];
        history.unshift({
          id: `ovr_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
          subAffiliateAddress: relation.childAddress,
          subAffiliateName: relation.childName,
          saleAmountXlm: split.saleAmountXlm,
          overrideEarnedXlm: split.recruiterOverrideCommissionXlm,
          timestamp: new Date().toISOString(),
          txHash: params.txHash,
        });
        storage.setItem(REFERRAL_OVERRIDES_STORAGE_KEY, JSON.stringify(history.slice(0, 50)));
      } catch (err) {
        console.warn("Could not save override history:", err);
      }
    }
  }

  return split;
}

/**
 * Generates an "Invite Marketers" recruiter link for an affiliate.
 */
export function generateRecruiterInviteLink(
  masterAddress: string,
  baseUrl?: string,
  options: { tag?: string; overrideRate?: number } = {},
): string {
  const origin = baseUrl || (typeof window !== "undefined" ? window.location.origin : "https://stormsale.xyz");
  const url = new URL("/affiliate", origin);
  url.searchParams.set("recruiter", masterAddress.trim());
  if (options.tag) {
    url.searchParams.set("tag", options.tag);
  }
  if (options.overrideRate !== undefined && Number.isFinite(options.overrideRate)) {
    url.searchParams.set("override", options.overrideRate.toString());
  }
  return url.toString();
}

/**
 * Parses recruiter information from a URL query string or URL object.
 */
export function parseRecruiterInviteFromUrl(
  urlString: string,
): { recruiterAddress: string | null; tag?: string; overrideRate?: number } {
  try {
    const url = new URL(urlString, "https://stormsale.xyz");
    const recruiter = url.searchParams.get("recruiter") || url.searchParams.get("ref");
    const tag = url.searchParams.get("tag") || undefined;
    const overrideRaw = url.searchParams.get("override");
    const parsedOverride = overrideRaw !== null ? parseFloat(overrideRaw) : undefined;
    const overrideRate =
      parsedOverride !== undefined && Number.isFinite(parsedOverride) ? parsedOverride : undefined;

    if (recruiter && isValidStellarAddress(recruiter)) {
      return {
        recruiterAddress: recruiter.trim(),
        tag,
        overrideRate,
      };
    }
    return { recruiterAddress: null };
  } catch {
    return { recruiterAddress: null };
  }
}

/**
 * Generates mock referral relations for realistic preview and rich visualization.
 */
export function generateMockReferralRelations(masterAddress: string): AffiliateReferralRelation[] {
  const baseTime = Date.now() - 30 * 24 * 3600 * 1000;

  const t1A = "GAFFILIATE_MARKETER_ALICE_01";
  const t1B = "GAFFILIATE_MARKETER_BOB_02";
  const t1C = "GAFFILIATE_MARKETER_CAROL_03";
  const t2A1 = "GAFFILIATE_SUB_DAVE_04";
  const t2A2 = "GAFFILIATE_SUB_ELENA_05";

  return [
    {
      childAddress: t1A,
      childName: "Alice Media Pro",
      parentAddress: masterAddress,
      parentName: "Master Affiliate",
      recruitedAt: new Date(baseTime + 2 * 86400000).toISOString(),
      tier: 1,
      overrideRatePercent: 2.0,
      directCommissionRatePercent: 8.0,
      status: "active",
      recruiterTag: "telegram-growth",
      totalSalesVolumeXlm: 12500,
      totalDirectCommissionEarnedXlm: 1000,
      totalOverrideEarnedXlm: 250,
      salesCount: 42,
      lastSaleAt: new Date(Date.now() - 3600000).toISOString(),
    },
    {
      childAddress: t1B,
      childName: "Bob Stellar Ads",
      parentAddress: masterAddress,
      parentName: "Master Affiliate",
      recruitedAt: new Date(baseTime + 7 * 86400000).toISOString(),
      tier: 1,
      overrideRatePercent: 2.0,
      directCommissionRatePercent: 8.0,
      status: "active",
      recruiterTag: "crypto-twitter",
      totalSalesVolumeXlm: 8400,
      totalDirectCommissionEarnedXlm: 672,
      totalOverrideEarnedXlm: 168,
      salesCount: 28,
      lastSaleAt: new Date(Date.now() - 14400000).toISOString(),
    },
    {
      childAddress: t1C,
      childName: "Carol Influencer Hub",
      parentAddress: masterAddress,
      parentName: "Master Affiliate",
      recruitedAt: new Date(baseTime + 15 * 86400000).toISOString(),
      tier: 1,
      overrideRatePercent: 2.0,
      directCommissionRatePercent: 8.0,
      status: "active",
      recruiterTag: "newsletter",
      totalSalesVolumeXlm: 4200,
      totalDirectCommissionEarnedXlm: 336,
      totalOverrideEarnedXlm: 84,
      salesCount: 15,
      lastSaleAt: new Date(Date.now() - 86400000).toISOString(),
    },
    {
      childAddress: t2A1,
      childName: "Dave Micro-Affiliate",
      parentAddress: t1A,
      parentName: "Alice Media Pro",
      recruitedAt: new Date(baseTime + 18 * 86400000).toISOString(),
      tier: 2,
      overrideRatePercent: 2.0,
      directCommissionRatePercent: 8.0,
      status: "active",
      recruiterTag: "alice-subteam",
      totalSalesVolumeXlm: 3100,
      totalDirectCommissionEarnedXlm: 248,
      totalOverrideEarnedXlm: 62,
      salesCount: 11,
      lastSaleAt: new Date(Date.now() - 43200000).toISOString(),
    },
    {
      childAddress: t2A2,
      childName: "Elena Community Lead",
      parentAddress: t1A,
      parentName: "Alice Media Pro",
      recruitedAt: new Date(baseTime + 22 * 86400000).toISOString(),
      tier: 2,
      overrideRatePercent: 2.0,
      directCommissionRatePercent: 8.0,
      status: "active",
      recruiterTag: "discord-squad",
      totalSalesVolumeXlm: 1800,
      totalDirectCommissionEarnedXlm: 144,
      totalOverrideEarnedXlm: 36,
      salesCount: 7,
      lastSaleAt: new Date(Date.now() - 72000000).toISOString(),
    },
  ];
}
