/**
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
} as const;

export type SorobanContractMethod =
  (typeof STORMSALE_CONTRACT_METHODS)[keyof typeof STORMSALE_CONTRACT_METHODS];

export type UserRole = "ADMIN" | "ADVERTISER" | "AFFILIATE" | "AUDITOR" | "NONE";
