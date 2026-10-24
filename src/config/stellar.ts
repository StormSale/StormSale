import { Asset, Networks } from "@stellar/stellar-sdk";

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
    "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",

  nativeAsset: "XLM",
  nativeDecimals: 7,

  // Timeout for stellar.toml discovery and federation server lookups (ms).
  federationTimeoutMs: 8000,
};

export interface EscrowAsset {
  code: "XLM" | "USDC" | "EURC";
  name: string;
  decimals: number;
  contractAddress: string;
  issuer?: string;
}

/**
 * Authoritative Circle stablecoin issuer addresses on Stellar (Mainnet & Testnet).
 * Sourced directly from Circle's official documentation:
 * https://developers.circle.com/stablecoins/docs/stellar
 *
 * TESTNET:
 * - USDC Issuer: GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5
 * - EURC Issuer: GB3Q6QDZYTHWT7E5PVS3W7FUT5GVAFC5KSZFFLPU25GO7VTC3NM2ZTVO
 *
 * PUBLIC (Mainnet):
 * - USDC Issuer: GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN
 * - EURC Issuer: GDHU6WRG4IEQXM5NZ4BMPKOXHW76MZM4Y2IEMFDVXBSDP6SJY4ITNPP2
 */
export const ISSUERS = {
  TESTNET: {
    USDC: "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
    EURC: "GB3Q6QDZYTHWT7E5PVS3W7FUT5GVAFC5KSZFFLPU25GO7VTC3NM2ZTVO",
  },
  PUBLIC: {
    USDC: "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN",
    EURC: "GDHU6WRG4IEQXM5NZ4BMPKOXHW76MZM4Y2IEMFDVXBSDP6SJY4ITNPP2",
  },
} as const;

export const NETWORK_ESCROW_ASSETS = {
  TESTNET: {
    USDC: {
      contractAddress: new Asset("USDC", ISSUERS.TESTNET.USDC).contractId(Networks.TESTNET),
      issuer: ISSUERS.TESTNET.USDC,
    },
    EURC: {
      contractAddress: new Asset("EURC", ISSUERS.TESTNET.EURC).contractId(Networks.TESTNET),
      issuer: ISSUERS.TESTNET.EURC,
    },
  },
  PUBLIC: {
    USDC: {
      contractAddress: new Asset("USDC", ISSUERS.PUBLIC.USDC).contractId(Networks.PUBLIC),
      issuer: ISSUERS.PUBLIC.USDC,
    },
    EURC: {
      contractAddress: new Asset("EURC", ISSUERS.PUBLIC.EURC).contractId(Networks.PUBLIC),
      issuer: ISSUERS.PUBLIC.EURC,
    },
  },
} as const;

export function getSupportedEscrowAssets(
  network: "TESTNET" | "PUBLIC" = STELLAR_CONFIG.network,
): Record<"XLM" | "USDC" | "EURC", EscrowAsset> {
  const net = network === "PUBLIC" ? "PUBLIC" : "TESTNET";
  const passphrase = net === "PUBLIC" ? Networks.PUBLIC : Networks.TESTNET;
  return {
    XLM: {
      code: "XLM",
      name: "Stellar Lumens",
      decimals: 7,
      contractAddress: Asset.native().contractId(passphrase),
    },
    USDC: {
      code: "USDC",
      name: "USD Coin (Circle SAC)",
      decimals: 7,
      contractAddress: new Asset("USDC", ISSUERS[net].USDC).contractId(passphrase),
      issuer: ISSUERS[net].USDC,
    },
    EURC: {
      code: "EURC",
      name: "Euro Coin (Circle SAC)",
      decimals: 7,
      contractAddress: new Asset("EURC", ISSUERS[net].EURC).contractId(passphrase),
      issuer: ISSUERS[net].EURC,
    },
  };
}

export const SUPPORTED_ESCROW_ASSETS: Record<"XLM" | "USDC" | "EURC", EscrowAsset> =
  getSupportedEscrowAssets(STELLAR_CONFIG.network);

export type SupportedEscrowAssetCode = keyof typeof SUPPORTED_ESCROW_ASSETS;

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
 * Soroban resource budget thresholds used by the Resource Diagnostic profiler.
 * Values are expressed in the units returned by `simulateTransaction`:
 * - cpuInstructions: total CPU instructions (u64 as string)
 * - memoryBytes: total memory bytes (u64 as string)
 * - minResourceFee: minimum resource fee in stroops (i64 as string)
 */
export interface SorobanResourceBudget {
  /** Soft ceiling for CPU instructions before a warning is raised. */
  cpuInstructionsWarn: bigint;
  /** Hard ceiling for CPU instructions before an error is raised. */
  cpuInstructionsMax: bigint;
  /** Soft ceiling for memory bytes before a warning is raised. */
  memoryBytesWarn: bigint;
  /** Hard ceiling for memory bytes before an error is raised. */
  memoryBytesMax: bigint;
  /** Soft ceiling for minResourceFee (stroops) before a warning is raised. */
  minResourceFeeWarn: bigint;
  /** Hard ceiling for minResourceFee (stroops) before an error is raised. */
  minResourceFeeMax: bigint;
}

/**
 * Default Soroban resource budgets. These are conservative defaults aligned
 * with typical testnet simulation headroom and can be overridden per-network
 * via environment variables for advanced auditing workflows.
 */
export const SOROBAN_RESOURCE_BUDGET: SorobanResourceBudget = {
  cpuInstructionsWarn: BigInt(
    import.meta.env.VITE_SOROBAN_CPU_WARN || "100000000",
  ),
  cpuInstructionsMax: BigInt(
    import.meta.env.VITE_SOROBAN_CPU_MAX || "400000000",
  ),
  memoryBytesWarn: BigInt(import.meta.env.VITE_SOROBAN_MEM_WARN || "41943040"),
  memoryBytesMax: BigInt(import.meta.env.VITE_SOROBAN_MEM_MAX || "419430400"),
  minResourceFeeWarn: BigInt(
    import.meta.env.VITE_SOROBAN_FEE_WARN || "1000000",
  ),
  minResourceFeeMax: BigInt(
    import.meta.env.VITE_SOROBAN_FEE_MAX || "10000000",
  ),
};

/**
 * Feature flag gating the Resource Diagnostic accordion in confirmation modals.
 * Enabled by default in dev builds, opt-in in production via env var.
 */
export const RESOURCE_DIAGNOSTIC_ENABLED: boolean =
  import.meta.env.VITE_RESOURCE_DIAGNOSTIC === "true" ||
  (import.meta.env.DEV === true &&
    import.meta.env.VITE_RESOURCE_DIAGNOSTIC !== "false");

/**
 * Returns the effective resource budget for the active network, allowing
 * per-network overrides without mutating the shared default.
 */
export function getSorobanResourceBudget(
  network: "TESTNET" | "PUBLIC" = STELLAR_CONFIG.network,
): SorobanResourceBudget {
  const prefix = network === "PUBLIC" ? "VITE_SOROBAN_PUBLIC" : "VITE_SOROBAN_TESTNET";
  return {
    cpuInstructionsWarn: BigInt(
      import.meta.env[`${prefix}_CPU_WARN`] || SOROBAN_RESOURCE_BUDGET.cpuInstructionsWarn.toString(),
    ),
    cpuInstructionsMax: BigInt(
      import.meta.env[`${prefix}_CPU_MAX`] || SOROBAN_RESOURCE_BUDGET.cpuInstructionsMax.toString(),
    ),
    memoryBytesWarn: BigInt(
      import.meta.env[`${prefix}_MEM_WARN`] || SOROBAN_RESOURCE_BUDGET.memoryBytesWarn.toString(),
    ),
    memoryBytesMax: BigInt(
      import.meta.env[`${prefix}_MEM_MAX`] || SOROBAN_RESOURCE_BUDGET.memoryBytesMax.toString(),
    ),
    minResourceFeeWarn: BigInt(
      import.meta.env[`${prefix}_FEE_WARN`] || SOROBAN_RESOURCE_BUDGET.minResourceFeeWarn.toString(),
    ),
    minResourceFeeMax: BigInt(
      import.meta.env[`${prefix}_FEE_MAX`] || SOROBAN_RESOURCE_BUDGET.minResourceFeeMax.toString(),
    ),
  };
}
