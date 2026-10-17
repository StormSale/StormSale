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
    "CDLZFC3SYJYDZT7K67ZV75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC",

  nativeAsset: "XLM",
  nativeDecimals: 7,

  // Real-time Soroban event streaming settings
  events: {
    // Topic filter strings the polling worker subscribes to.
    topics: ["create_campaign", "log_sale", "claim_payout"] as const,
    // Base polling interval when the tab is visible (ms).
    pollIntervalMs: 5_000,
    // Maximum backoff delay when the tab is blurred or on error (ms).
    maxBackoffMs: 30_000,
    // Minimum backoff delay (ms).
    minBackoffMs: 1_000,
    // Number of ledgers to scan back on the first poll.
    initialLedgerLookback: 1_000,
    // Maximum number of events returned per page.
    pageLimit: 100,
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
