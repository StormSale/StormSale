/*
 * Stellar & Soroban Network Configuration for StormSale
 */
export const STELLAR_CONFIG = {
  network: (import.meta.env.VITE_STELLAR_NETWORK as "TESTNET" | "PUBLIC") || "TESTNET",
  networkPassphrase:
    import.meta.env.VITE_STELLAR_NETWORK_PASSPHRASE || "Test DF Network ; September 2015",
  rpcUrl: import.meta.env.VITE_STELLAR_RPC_URL || "https://soroban-testnet.stellar.org",
  horizonUrl: import.meta.env.VITE_STELLAR_HORIZON_URL || "https://horizon-testnet.stellar.org",
  explorerUrl: "https://stellar.expert/explorer/testnet",

  // Deployed Soroban Contract ID on Stellar Testnet
  contractId:
    import.meta.env.VITE_STORMSALE_CONTRACT_ID ||
    "CDLZFC3SYJYDZT7K67ZV75HPJVIEUVNIXF47ZG2FB2RMQQHU2HHGCYSC",

  nativeAsset: "XLM",
  nativeDecimals: 7,

  // Real-time Soroban event streaming (server.getEvents polling worker)
  events: {
    // Topic filter strings the worker subscribes to.
    topics: ["create_campaign", "log_sale", "claim_payout"],
    // How many ledgers to scan per poll window.
    ledgerLookback: 50,
    // Base delay between polls when the tab is visible (ms).
    basePollIntervalMs: 5_000,
    // Maximum backoff delay when the tab is blurred (ms).
    maxBackoffMs: 30_000,
    // Multiplier applied on each reconnect attempt.
    backoffMultiplier: 2,
    // Maximum number of events returned per getEvents call.
    eventsPerPoll: 100,
  },
} as const;

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
} as const;

export type StellarEventTopic = "create_campaign" | "log_sale" | "claim_payout";
