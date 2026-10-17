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
    "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC",

  nativeAsset: "XLM",
  nativeDecimals: 7,
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

/**
 * Soroban Asset Contract (SAC) token definitions supported by StormSale
 */
export const SAC_TOKENS = {
  USDC: {
    symbol: "USDC" as const,
    name: "USD Coin",
    decimals: 7,
    contractId:
      import.meta.env.VITE_SAC_USDC_CONTRACT_ID ||
      "CACQKBIFAUCQKBIFAUCQKBIFAUCQKBIFAUCQKBIFAUCQKBIFAUCQLC2U",
  },
  EURC: {
    symbol: "EURC" as const,
    name: "Euro Coin",
    decimals: 7,
    contractId:
      import.meta.env.VITE_SAC_EURC_CONTRACT_ID ||
      "CADAMBQGAYDAMBQGAYDAMBQGAYDAMBQGAYDAMBQGAYDAMBQGAYDAMSST",
  },
  XLM: {
    symbol: "XLM" as const,
    name: "Native XLM (SAC Wrapped)",
    decimals: 7,
    contractId:
      import.meta.env.VITE_SAC_XLM_CONTRACT_ID ||
      "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC",
  },
};

export type SACTokenSymbol = keyof typeof SAC_TOKENS;

/**
 * Soroban State Storage TTL Configuration
 */
export const TTL_CONFIG = {
  // Threshold below which a warning indicator and auto/manual extension is triggered (~2.8 days at 5s/ledger)
  WARNING_THRESHOLD_LEDGERS: 50000,
  // Critical threshold where contract is dangerously close to archival (~13.8 hours)
  CRITICAL_THRESHOLD_LEDGERS: 10000,
  // Default amount of ledgers to extend when trigger runs (~100,000 ledgers ~ 5.7 days)
  DEFAULT_EXTEND_LEDGERS: 100000,
  // Average seconds per Stellar ledger
  SECONDS_PER_LEDGER: 5,
};
