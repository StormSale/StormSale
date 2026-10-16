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

  // SEP-0024 hosted deposit/withdrawal anchor discovery.
  // The anchor TOML is fetched from the affiliate's asset issuer home domain.
  anchorHomeDomain:
    import.meta.env.VITE_STELLAR_ANCHOR_HOME_DOMAIN || "",
  // Optional explicit TOML URL override for non-Stellar-exporter assets.
  anchorTomlUrl: import.meta.env.VITE_STELLAR_ANCHOR_TOML_URL || "",
  // Sept-24 asset code to request quotes for (e.g. USDC, EURC, etc).
  anchorAssetCode: import.meta.env.VITE_STORMSALE_PAYOUT_ASSET || "USDC",
};

export const STELLAR_NETWO:KES = {
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
