/**
 * Stellar & Soroban Network Configuration for StormSale
 */
export const STELLAR_CONFIG = {
  network: (import.meta.env.VITE_STELLAR_NETWORK as "TESTNET" | "PUBLIC") || "TESTNET",
  networkPassphrase:
    import.meta.env.VITE_STELLAR_NETWORK_PASSPHRASE || "Test SDF Network ; September 2015",
  rpcUrl: import.meta.env.VITE_STELLAR_RPC_URL || "https://soroban-testnet.stellar.org",
  horizonUrl: import.meta.env.VITE_STELLAR_HORIZON_URL || "https://horizon-testnet.stellar.org",
  explorerUrl: "https://stellar.expert/explorer/testnet",

  // Deployed Soroban Contract ID on Stellar Testnet
  contractId:
    import.meta.env.VITE_STORMSALE_CONTRACT_ID ||
    "CDLZFC3SYJYDZT7K67ZV75HPJVIEUVNIXF47ZG2FB2RMQUVU2HHGCYSC",

  nativeAsset: "XLM",
  nativeDecimals: 7,

  // Soroban resource budget thresholds used by the Resource Diagnostic profiler.
  // Values are conservative defaults for typical StormSale contract invocations
  // and can be overridden via environment variables for auditor tuning.
  resourceThresholds: {
    cpuInstructionsWarn:
      Number(import.meta.env.VITE_SOROBAN_CPU_WARN_THRESHOLD) || 100_000_000,
    cpuInstructionsCritical:
      Number(import.meta.env.VITE_SOROBAN_CPU_CRITICAL_THRESHOLD) || 250_000_000,
    memoryBytesWarn:
      Number(import.meta.env.VITE_SOROBAN_MEMORY_WARN_THRESHOLD) || 5_000_000,
    memoryBytesCritical:
      Number(import.meta.env.VITE_SOROBAN_MEMORY_CRITICAL_THRESHOLD) || 20_000_000,
    ledgerReadBytesWarn:
      Number(import.meta.env.VITE_SOROBAN_LEDGER_READ_WARN_THRESHOLD) || 100_000,
    ledgerWriteBytesWarn:
      Number(import.meta.env.VITE_SOROBAN_LEDGER_WRITE_WARN_THRESHOLD) || 100_000,
  },
};

export const STELLAR_NETWORKS = {
  TESTNET: {
    name: "Testnet",
    passphrase: "Test SDF Network ; September 2015",
    rpcUrl: "https://soroban-testnet.stellar.org",
    horizonUrl: "https://horizon-testnet.stellar.org",
  },
  PUBLIC: {
    name: "Public (Mainnet)",
    passphrase: "Public Global Stellar Network ; September 2015",
    rpcUrl: "https://soroban-rpc.mainnet.stellar.org",
    horizonUrl: "https://horizon.stellar.org",
  },
};

export type StellarNetworkKey = keyof typeof STELLAR_NETWORKS;

export interface SorobanResourceThresholds {
  cpuInstructionsWarn: number;
  cpuInstructionsCritical: number;
  memoryBytesWarn: number;
  memoryBytesCritical: number;
  ledgerReadBytesWarn: number;
  ledgerWriteBytesWarn: number;
}

export const isDevModeEnabled = (): boolean =>
  import.meta.env.VITE_DEV_MODE === "true" || import.meta.env.MODE === "development";
