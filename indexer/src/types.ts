export interface CampaignRecord {
  campaignId: number;
  advertiser: string;
  commissionBps: number;
  clearingPeriodSecs: number;
  budgetStroops: string;
  createdAt: string;
  txHash: string;
}

export interface SaleRecord {
  id: string;
  campaignId: number;
  affiliate: string;
  amountStroops: string;
  /** Commission from the on-chain event, or null if the event didn't include it. */
  commissionStroops: string | null;
  loggedAt: string;
  txHash: string;
}

export interface ClaimRecord {
  id: string;
  campaignId: number;
  affiliate: string;
  amountStroops: string;
  claimedAt: string;
  txHash: string;
}

export interface IndexerState {
  lastIndexedLedger: number;
  eventCount: number;
  lastPollAt: string | null;
  cursor: string | null;
}