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
    "CDLZFC3SYJYDZT7K67ZV75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC",

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
 * Soroban event streaming configuration.
 * Topic filters that the background polling worker subscribes to.
 */
export const SOROBAN_EVENT_TOPICS = ["create_campaign", "log_sale", "claim_payout"] as const;

export type SorobanEventTopic = (typeof SOROBAN_EVENT_TOPICS)[number];

/**
 * Exponential backoff polling tuning for the Soroban event worker.
 * Backoff grows from `baseIntervalMs` up to `maxIntervalMs`, and the blurred
 * interval is capped at 30s to save CPU and RPC quota.
 */
export const SOROBAN_EVENT_POLLING = {
  baseIntervalMs: 4_000,
  maxIntervalMs: 30_000,
  backoffFactor: 1.5,
  blurredIntervalMs: 30_000,
  pageSize: 25,
  maxPagesPerPoll: 5,
} as const;
