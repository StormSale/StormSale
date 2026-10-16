/**
 * StormSale Soroban Smart Contract Configuration
 * Networks: Stellar Testnet / Public
 */
import { STELLAR_CONFIG } from "./stellar";

export const CONTRACT_ADDRESSES = {
  // Campaign Escrow Soroban Contract ID
  CAMPAIGN_ESCROW: STELLAR_CONFIG.contractId,
  // Native XLM SAC (Stellar Asset Contract) representation in Soroban
  NATIVE_XLM_SAC: "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC",
};

/**
 * Admin role configuration for the Emergency Kill-Switch UI.
 * Only addresses listed here may view and operate the Emergency Pause controls.
 */
export const ADMIN_CONFIG = {
  // Comma-separated list of admin public keys (G...), sourced from env at build time.
  adminAddresses: (import.meta.env.VITE_ADMIN_ADDRESSES ?? "")
    .split(",")
    .map((address: string) => address.trim())
    .filter(Boolean),
  // Whether the emergency pause feature is enabled at all.
  emergencyPauseEnabled: import.meta.env.VITE_EMERGENCY_PAUSE_ENABLED !== "false",
};

/**
 * Returns true when the given address is a platform admin.
 * Comparison is case-insensitive to tolerate casing differences in Stellar keys.
 */
export function isAdminAddress(address?: string | null): boolean {
  if (!address) return false;
  const normalized = address.trim().toUpperCase();
  return ADMIN_CONFIG.adminAddresses.some(
    (admin: string) => admin.toUpperCase() === normalized,
  );
}

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
