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
};

export const STELLAR_NETWO:K = {
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

/**
 * Soroban resource budget thresholds used by the Resource Diagnostic profiler.
 * These are conservative defaults based on typical testnet simulation output for well-optimized
 * contracts. Values above these thresholds trigger "unoptimized footprint" warnings in the UI.
 */
export const SOROBAN_RESOURCE_THRESHOLDS = {
  // CPU instructions consumed during simulation
  cpuInstructionsWarn: 50_000_000,
  cpuInstructionsCritical: 100_000_000,

  // Memory bytes allocated during simulation
  memoryBytesWarn: 5_000_000,
  memoryBytesCritical: 10_000_000,

  // Ledger read/write bytes reported by simulateTransaction
  ledgerReadBytesWarn: 5_000,
  ledgerWriteBytesWarn: 5_000,

  // Minimum resource fee in stroops (1e7 stroops = 1 XLM)
  minResourceFeeWarn: 1_000_000,
  minResourceFeeCritical: 10_000_000,
} as const;

export type SorobanResourceThresholds = typeof SOROBAN_RESOURCE_THRESHOLDS;
