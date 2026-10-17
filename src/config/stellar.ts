/*
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

  // Real-time Soroban event streaming settings
  events: {
    // Topic filter strings the polling worker subscribes to.
    topics: ["create_campaign", "log_sale", "claim_payout"] as const,
    // Base interval between polls when the tab is visible and healthy.
    pollIntervalMs: 5000,
    // Maximum backoff delay. When the tab is blurred the worker saturates at this value.
    maxBackoffMs: 30_000,
    // Backoff multiplier applied on each consecutive failure.
    backoffMultiplier: 2,
    // Number of ledgers to scan back on the very first poll.
    initialLookbackLedgers: 100,
    // Maximum number of events requested per poll.
    pageSize: 100,
  },
};

export const STELLAR_NETWORKS = {
  TESTNET: {
    name: "Testnet",
    passphrase: "Test DF Network ; September 2015",
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

export type StellarEventTopic = (typeof STELLAR_CONFIG.events.topics)[number];
