/**
 * B2C Two-Tier Referral Network & Sub-Affiliate Tree Engine (#451)
 *
 * Provides:
 * 1. Recursive tree rendering data structures and volume rollups
 * 2. Privacy masking of referee wallet addresses (GAB...392)
 * 3. Search and date filtering across downstream referees
 * 4. High-performance pagination and processing for >500 nodes
 */

import type { AffiliateReferralRelation, ReferralTreeNode } from "../types/referral";
import {
  maskRefereeAddress,
  buildReferralTree,
  buildRecursiveReferralTree,
  aggregateNetworkVolume,
  filterRefereeNetwork,
  paginateReferees,
  generateLargeNetworkMock,
  formatAffiliateAddress,
  type NetworkVolumeAggregation,
  type RefereeFilterOptions,
  type PaginationResult,
} from "./referralTree";

export {
  maskRefereeAddress,
  buildReferralTree,
  buildRecursiveReferralTree,
  aggregateNetworkVolume,
  filterRefereeNetwork,
  paginateReferees,
  generateLargeNetworkMock,
  formatAffiliateAddress,
  type NetworkVolumeAggregation,
  type RefereeFilterOptions,
  type PaginationResult,
  type AffiliateReferralRelation,
  type ReferralTreeNode,
};
