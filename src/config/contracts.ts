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

/**
 * Soroban event streaming configuration.
 *
 * These values drive the exponential-backoff polling worker that
 * subscribes to contract events via `server.getEvents()`.
 */
export const SOROBAN_EVENT_CONFIG = {
  // Topic filter strings to subscribe to on the campaign escrow contract.
  topics: ["create_campaign", "log_sale", "claim_payout"] as const,
  // Base polling interval when the tab is visible and healthy (ms).
  pollIntervalMs: 5_000,
  // Minimum backoff delay after a failure (ms).
  minBackoffMs: 1_000,
  // Maximum backoff delay; also caps the blurred-tab interval (ms).
  maxBackoffMs: 30_000,
  // Backoff multiplier applied on each consecutive failure.
  backoffMultiplier: 2,
  // Maximum number of events requested per poll call.
  pageSize: 100,
  // How far back (ledgers) to start streaming on first connect.
  initialLookbackLedgers: 100,
  // Backoff cap applied when the document is hidden/blurred (ms).
  blurredIntervalMs: 30_000,
} as const;

export type SorobanEventTopic = (typeof SOROBAN_EVENT_CONFIG)["topics"][number];
