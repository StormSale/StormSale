/**
 * Sybil Attack Defense & Restricted Mode Registry (Issue #473)
 *
 * Implements:
 * 1. Sybil cluster detection heuristics (multiple accounts sharing IP hash or funding source).
 * 2. In-memory & persisted registry of restricted affiliate accounts.
 * 3. High-risk action gating (disabling instant payout claims).
 * 4. Structured dispute metadata linking for appeal and review.
 */

export interface SybilClusterAccount {
  address: string;
  ipHash: string;
  fundingParent?: string;
  createdAt: string;
}

export interface SybilClusterTelemetry {
  clusterId: string;
  affiliateAddress: string;
  clusterSize: number;
  sharedIpHash: string;
  sharedFundingSource?: string;
  riskLevel: "high" | "critical";
  detectedAt: string;
  associatedAccounts: string[];
  disputeId?: string;
}

export interface SybilDetectionResult {
  isSybilCluster: boolean;
  clusterSize: number;
  flaggedAddresses: string[];
  sharedIpHash?: string;
  sharedFundingSource?: string;
  reason?: string;
}

const SYBIL_RESTRICTION_STORAGE_KEY = "stormsale.fraud.sybil_restrictions";

// In-memory registry for rapid test isolation & reactive state
const activeSybilClusters: Map<string, SybilClusterTelemetry> = new Map();

/**
 * Normalizes a Stellar address for key comparison.
 */
function normalizeAddress(addr: string): string {
  return addr.trim().toUpperCase();
}

/**
 * Registers an affiliate under Sybil restricted mode based on backend telemetry.
 */
export function recordSybilTelemetry(telemetry: SybilClusterTelemetry): void {
  const norm = normalizeAddress(telemetry.affiliateAddress);
  activeSybilClusters.set(norm, {
    ...telemetry,
    affiliateAddress: norm,
    disputeId: telemetry.disputeId || `DISPUTE-SYBIL-${norm.slice(0, 8)}`,
  });

  // Also flag associated addresses in the same cluster
  for (const assoc of telemetry.associatedAccounts || []) {
    const assocNorm = normalizeAddress(assoc);
    if (!activeSybilClusters.has(assocNorm)) {
      activeSybilClusters.set(assocNorm, {
        ...telemetry,
        affiliateAddress: assocNorm,
        disputeId: `DISPUTE-SYBIL-${assocNorm.slice(0, 8)}`,
      });
    }
  }

  try {
    const entries = Array.from(activeSybilClusters.entries());
    localStorage.setItem(SYBIL_RESTRICTION_STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // localStorage unavailable in pure unit test environments
  }
}

/**
 * Checks whether an affiliate address is currently in Sybil restricted mode.
 */
export function isAffiliateSybilRestricted(address?: string | null): boolean {
  if (!address) return false;
  const norm = normalizeAddress(address);
  if (activeSybilClusters.has(norm)) {
    return true;
  }

  try {
    const raw = localStorage.getItem(SYBIL_RESTRICTION_STORAGE_KEY);
    if (raw) {
      const entries: Array<[string, SybilClusterTelemetry]> = JSON.parse(raw);
      for (const [key, val] of entries) {
        if (normalizeAddress(key) === norm) {
          activeSybilClusters.set(norm, val);
          return true;
        }
      }
    }
  } catch {
    // Ignore parse errors
  }

  return false;
}

/**
 * Retrieves Sybil cluster telemetry details for a flagged affiliate.
 */
export function getSybilClusterDetails(address?: string | null): SybilClusterTelemetry | null {
  if (!address) return null;
  const norm = normalizeAddress(address);
  return activeSybilClusters.get(norm) || null;
}

/**
 * Clears all active Sybil telemetry (useful for test isolation).
 */
export function clearSybilTelemetry(): void {
  activeSybilClusters.clear();
  try {
    localStorage.removeItem(SYBIL_RESTRICTION_STORAGE_KEY);
  } catch {
    // Ignore
  }
}

/**
 * Analyzes a collection of affiliate referral accounts to detect Sybil clusters.
 * Triggers when threshold (e.g. >= 3 accounts) share the same IP hash or funding parent.
 */
export function detectSybilCluster(
  accounts: SybilClusterAccount[],
  threshold: number = 3,
): SybilDetectionResult {
  if (accounts.length < threshold) {
    return {
      isSybilCluster: false,
      clusterSize: accounts.length,
      flaggedAddresses: [],
    };
  }

  // 1. Group by IP Hash
  const ipGroups = new Map<string, string[]>();
  for (const acc of accounts) {
    const list = ipGroups.get(acc.ipHash) || [];
    list.push(acc.address);
    ipGroups.set(acc.ipHash, list);
  }

  for (const [ipHash, addrs] of ipGroups.entries()) {
    if (addrs.length >= threshold) {
      return {
        isSybilCluster: true,
        clusterSize: addrs.length,
        flaggedAddresses: addrs,
        sharedIpHash: ipHash,
        reason: `Sybil cluster detected: ${addrs.length} accounts share IP hash ${ipHash.slice(0, 10)}...`,
      };
    }
  }

  // 2. Group by Funding Parent
  const fundingGroups = new Map<string, string[]>();
  for (const acc of accounts) {
    if (acc.fundingParent) {
      const list = fundingGroups.get(acc.fundingParent) || [];
      list.push(acc.address);
      fundingGroups.set(acc.fundingParent, list);
    }
  }

  for (const [funder, addrs] of fundingGroups.entries()) {
    if (addrs.length >= threshold) {
      return {
        isSybilCluster: true,
        clusterSize: addrs.length,
        flaggedAddresses: addrs,
        sharedFundingSource: funder,
        reason: `Sybil cluster detected: ${addrs.length} accounts funded by common parent ${funder.slice(0, 8)}...`,
      };
    }
  }

  return {
    isSybilCluster: false,
    clusterSize: 0,
    flaggedAddresses: [],
  };
}
