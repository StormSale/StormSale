/*
 * StormSale Soroban Smart Contract Methods & Interface Definitions
 *
 * Unlike EVM contracts which rely on JSON ABI files, Soroban smart contracts
 * define typed symbol invocations and XDR-encoded specifications.
 */
export const STORMSALE_CONTRACT_METHODS = {
  INITIALIZE: "initialize",
  CREATE_CAMPAIGN: "create_campaign",
  DEPOSIT_COMMISSION: "deposit_commission",
  LOG_SALE: "log_sale",
  CLAIM_COMMISSION: "claim_commission",
  GRANT_AUDIT_ACCESS: "grant_audit_access",
  GET_CAMPAIGN: "get_campaign",
  GET_SALE: "get_sale",
  GET_SALES_BY_CAMPAIGN: "get_sales_by_campaign",
  // Admin emergency controls
  PAUSE: "pause",
  UNPAUSE: "unpause",
  IS_PAUSED: "is_paused",
} as const;

export const STORMSALE_ADMIN_METHODS = {
  PAUSE: STORMSALE_CONTRACT_METHODS.PAUSE,
  UNPAUSE: STORMSALE_CONTRACT_METHODS.UNPAUSE,
  IS_PAUSED: STORMSALE_CONTRACT_METHODS.IS_PAUSED,
} as const;

export type SorobanAdminMethod =
  (typeof STORMSALE_ADMIN_METHODS)[keyof typeof STORMSALE_ADMIN_METHODS];

export type SorobanContractMethod =
  (typeof STORMSALE_CONTRACT_METHODS)[keyof typeof STORMSALE_CONTRACT_METHODS];

export type UserRole = "ADMIN" | "ADVERTISER" | "AFFILIATE" | "AUDITOR" | "NONE";
