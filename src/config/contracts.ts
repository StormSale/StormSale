/*
 * StormSale Soroban Smart Contract Configuration
 * Networks: Stellar Testnet / Public
 */
import { STELLAR_CONFIG } from "./stellar";

export const CONTRACT_ADDRESSES = {
  // Campaign Escrow Soroban Contract ID
  CAMPAIGN_ESCROW: STELLAR_CONFIG.contractId,
  // Native XLM SAC (Stellar Asset Contract) representation in Soroban
  NATIVE_XLM_SAC: "CDLZFC3SYJYDZT7K67ZV75HPJVIEUVNIXF47ZG2FB2RMQUVU2HHGCYSC",
  // Admin emergency kill-switch controller contract ID (pauses campaign escrow)
  ADMIN_KILL_SWITCH: (STELLAR_CONFIG as { adminKillSwitchContractId?: string }).adminKillSwitchContractId ?? STELLAR_CONFIG.contractId,
};

export const STELLAR_NETWORK = {
  network: STELLAR_CONFIG.network,
  passphrase: STELLAR_CONFIG.networkPassphrase,
  rpcUrl: STELLAR_CONFIG.rpcUrl,
  horizonUrl: STELLAR_CONFIG.horizonUrl,
  explorerUrl: STELLAR_CONFIG.explorerUrl,
  nativeCurrency: {
    name: "Lumen",
    symbol: "XLM",
    decimals: 7,
  },
};
