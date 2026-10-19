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
    "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",

  nativeAsset: "XLM",
  nativeDecimals: 7,
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
 * - USDC Issuer: GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPPPRE34K4KZVN
 * - EURC Issuer: GDHU6WRG4IEQXM5NZ4BMPKOXHW76MZM4Y2IEMFDVXBSDP6SJY4ITNPP2
 */
export const ISSUERS = {
  TESTNET: {
    USDC: "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
    EURC: "GB3Q6QDZYTHWT7E5PVS3W7FUT5GVAFC5KSZFFLPU25GO7VTC3NM2ZTVO",
  },
  PUBLIC: {
    USDC: "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPPPRE34K4KZVN",
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
 * Soroban resource budget configuration.
 *
 * These thresholds are used by the Resource Diagnostic profiler to flag
 * transactions whose simulated footprint looks unoptimized. Values are
 * intentionally conservative and can be tuned per-network.
 */
export interface SorobanResourceBudget {
  /** Maximum acceptable CPU instructions for a single invocation. */
  maxCpuInstructions: number;
  /** Maximum acceptable memory footprint in bytes. */
  maxMemoryBytes: number;
  /** Maximum acceptable ledger read bytes. */
  maxReadBytes: number;
  /** Maximum acceptable ledger write bytes. */
  maxWriteBytes: number;
  /** Maximum acceptable min resource fee in stroops. */
  maxMinResourceFee: number;
}

export const SOROBAN_RESOURCE_BUDGETS: Record<"TESTNET" | "PUBLIC", SorobanResourceBudget> = {
  TESTNET: {
    maxCpuInstructions: 100_000_000,
    maxMemoryBytes: 40 * 1024 * 1024,
    maxReadBytes: 200_000,
    maxWriteBytes: 100_000,
    maxMinResourceFee: 10_000_000,
  },
  PUBLIC: {
    maxCpuInstructions: 100_000_000,
    maxMemoryBytes: 40 * 1024 * 1024,
    maxReadBytes: 200_000,
    maxWriteBytes: 100_000,
    maxMinResourceFee: 10_000_000,
  },
} as const;

export function getSorobanResourceBudget(
  network: "TESTNET" | "PUBLIC" = STELLAR_CONFIG.network,
): SorobanResourceBudget {
  return SOROBAN_RESOURCE_BUDGETS[network === "PUBLIC" ? "PUBLIC" : "TESTNET"];
}

/**
 * Normalized shape of the resource data extracted from a Soroban RPC
 * `simulateTransaction` response. All numeric fields are optional because
 * simulation may fail or return partial data.
 */
export interface SorobanResourceUsage {
  minResourceFee?: number;
  cpuInstructions?: number;
  memoryBytes?: number;
  readBytes?: number;
  writeBytes?: number;
}

export type SorobanResourceSeverity = "ok" | "warning" | "critical";

export interface SorobanResourceDiagnostic {
  metric: keyof SorobanResourceBudget;
  label: string;
  value?: number;
  limit: number;
  /** Ratio of value to limit (0..1+). Undefined when value is missing. */
  ratio: number | undefined;
  severity: SorobanResourceSeverity;
  message: string;
}

export interface SorobanResourceReport {
  usage: SorobanResourceUsage;
  budget: SorobanResourceBudget;
  diagnostics: SorobanResourceDiagnostic[];
  /** True when any diagnostic is "warning" or "critical". */
  hasWarnings: boolean;
  /** True when any diagnostic is "critical". */
  hasCritical: boolean;
}

const RESOURCE_METRIC_LABELS: Record<keyof SorobanResourceBudget, string> = {
  maxCpuInstructions: "CPU Instructions",
  maxMemoryBytes: "Memory Bytes",
  maxReadBytes: "Ledger Read Bytes",
  maxWriteBytes: "Ledger Write Bytes",
  maxMinResourceFee: "Min Resource Fee (stroops)",
};

const RESOURCE_USAGE_KEYS: Record<keyof SorobanResourceBudget, keyof SorobanResourceUsage> = {
  maxCpuInstructions: "cpuInstructions",
  maxMemoryBytes: "memoryBytes",
  maxReadBytes: "readBytes",
  maxWriteBytes: "writeBytes",
  maxMinResourceFee: "minResourceFee",
};

function classifyRatio(ratio: number): SorobanResourceSeverity {
  if (ratio >= 1) return "critical";
  if (ratio >= 0.8) return "warning";
  return "ok";
}

/**
 * Build a per-metric diagnostic report from a normalized resource usage
 * object. This is a pure function so it can be unit-tested without a live
 * RPC connection.
 */
export function buildSorobanResourceReport(
  usage: SorobanResourceUsage,
  budget: SorobanResourceBudget = getSorobanResourceBudget(),
): SorobanResourceReport {
  const diagnostics: SorobanResourceDiagnostic[] = (
    Object.keys(RESOURCE_METRIC_LABELS) as (keyof SorobanResourceBudget)[]
  ).map((metric) => {
    const limit = budget[metric];
    const value = usage[RESOURCE_USAGE_KEYS[metric]];
    const label = RESOURCE_METRIC_LABELS[metric];

    if (value === undefined || value === null) {
      return {
        metric,
        label,
        value,
        limit,
        severity: "ok" as const,
        message: `${label}: not reported by simulation`,
      };
    }

    const ratio = limit > 0 ? value / limit : 0;
    const severity = classifyRatio(ratio);
    const pct = (ratio * 100).toFixed(1);
    const message =
      severity === "critical"
        ? `${label} exceeds budget (${pct}% of ${limit})`
        : severity === "warning"
          ? `${label} approaching budget (${pct}% of ${limit})`
          : `${label} within budget (${pct}% of ${limit})`;

    return { metric, label, value, limit, ratio, severity, message };
  });

  return {
    usage,
    budget,
    diagnostics,
    hasWarnings: diagnostics.some((d) => d.severity !== "ok"),
    hasCritical: diagnostics.some((d) => d.severity === "critical"),
  };
}

/**
 * Extract a normalized resource usage object from a raw Soroban RPC
 * `simulateTransaction` response. Handles both the legacy `cost` shape and
 * the newer `transactionData`/`minResourceFee` shape returned by testnet.
 */
export function extractSorobanResourceUsage(simulation: unknown): SorobanResourceUsage {
  const usage: SorobanResourceUsage = {};
  if (!simulation || typeof simulation !== "object") return usage;

  const sim = simulation as Record<string, unknown>;

  const minFee = sim.minResourceFee;
  if (typeof minFee === "string" && minFee.length > 0) {
    const parsed = Number(minFee);
    if (Number.isFinite(parsed)) usage.minResourceFee = parsed;
  } else if (typeof minFee === "number" && Number.isFinite(minFee)) {
    usage.minResourceFee = minFee;
  }

  const cost = sim.cost as Record<string, unknown> | undefined;
  if (cost && typeof cost === "object") {
    const cpu = cost.cpuIns;
    const mem = cost.memBytes;
    if (typeof cpu === "string" && cpu.length > 0) {
      const parsed = Number(cpu);
      if (Number.isFinite(parsed)) usage.cpuInstructions = parsed;
    } else if (typeof cpu === "number" && Number.isFinite(cpu)) {
      usage.cpuInstructions = cpu;
    }
    if (typeof mem === "string" && mem.length > 0) {
      const parsed = Number(mem);
      if (Number.isFinite(parsed)) usage.memoryBytes = parsed;
    } else if (typeof mem === "number" && Number.isFinite(mem)) {
      usage.memoryBytes = mem;
    }
  }

  const txData = sim.transactionData as Record<string, unknown> | undefined;
  if (txData && typeof txData === "object") {
    const readBytes = txData.readBytes;
    const writeBytes = txData.writeBytes;
    if (typeof readBytes === "string" && readBytes.length > 0) {
      const parsed = Number(readBytes);
      if (Number.isFinite(parsed)) usage.readBytes = parsed;
    } else if (typeof readBytes === "number" && Number.isFinite(readBytes)) {
      usage.readBytes = readBytes;
    }
    if (typeof writeBytes === "string" && writeBytes.length > 0) {
      const parsed = Number(writeBytes);
      if (Number.isFinite(parsed)) usage.writeBytes = parsed;
    } else if (typeof writeBytes === "number" && Number.isFinite(writeBytes)) {
      usage.writeBytes = writeBytes;
    }
  }

  return usage;
}

/**
 * Convenience helper: extract usage from a simulation response and build a
 * full diagnostic report in one call.
 */
export function profileSorobanSimulation(
  simulation: unknown,
  network: "TESTNET" | "PUBLIC" = STELLAR_CONFIG.network,
): SorobanResourceReport {
  return buildSorobanResourceReport(
    extractSorobanResourceUsage(simulation),
    getSorobanResourceBudget(network),
  );
}

/**
 * Dev-mode toggle used by the Resource Diagnostic accordion. Reads from
 * `VITE_STELLAR_DEV_MODE` and defaults to off in production builds.
 */
export const STELLAR_DEV_MODE: boolean =
  import.meta.env.VITE_STELLAR_DEV_MODE === "true" ||
  (import.meta.env.DEV === true && import.meta.env.VITE_STELLAR_DEV_MODE !== "false");
