/**
 * Account balance and state types
 */

export interface AccountBalanceData {
  publicKey: string;
  nativeBalance: string;
  trustlines: Record<string, string>;
  sequenceNumber: string;
  isActive: boolean;
  lastUpdated: string;
}

export interface TrustlineBalance {
  assetCode: string;
  balance: string;
  limit: string;
  authorized: boolean;
}

export interface AccountMergeEvent {
  sourceAccount: string;
  destinationAccount: string;
  timestamp: string;
}

export interface BalanceUpdateEvent {
  publicKey: string;
  asset: string;
  previousBalance: string;
  newBalance: string;
  timestamp: string;
}
