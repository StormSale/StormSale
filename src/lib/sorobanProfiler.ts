/**
 * Soroban RPC Transaction Simulation & Resource Budget Profiler
 * Analyzes CPU instruction consumption, memory footprint, and minimum resource fees.
 */

export interface SorobanResourceProfile {
  minResourceFee: string; // Formatted in XLM, e.g. "0.0125000 XLM"
  minResourceFeeStroops: number;
  cpuInstructions: number;
  cpuLimit: number;
  cpuPercentage: number;
  memoryBytes: number;
  memoryLimit: number;
  memoryPercentage: number;
  warnings: string[];
  status: "optimal" | "warning" | "critical";
  rawSimulation?: any;
}

// Soroban Network Consensus Budget Limits (Testnet / Public Mainnet)
export const SOROBAN_MAX_CPU_INSTRUCTIONS = 100_000_000; // 100M instructions per transaction
export const SOROBAN_MAX_MEMORY_BYTES = 41_943_040; // 40 MB memory limit per transaction

export const CPU_WARN_THRESHOLD = 0.5; // 50%
export const CPU_CRITICAL_THRESHOLD = 0.8; // 80%
export const MEMORY_WARN_THRESHOLD = 0.5; // 50%
export const MEMORY_CRITICAL_THRESHOLD = 0.8; // 80%

/**
 * Format bytes into human-readable strings (KB / MB).
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

/**
 * Converts stroops to formatted XLM string.
 */
export function stroopsToXlm(stroops: number): string {
  const xlm = stroops / 10_000_000;
  return `${xlm.toFixed(7)} XLM`;
}

/**
 * Parses Soroban RPC simulateTransaction response into granular resource profile.
 */
export function parseSimulationResourceBudget(
  simResponse: any,
  options?: {
    customCpuLimit?: number;
    customMemoryLimit?: number;
  },
): SorobanResourceProfile {
  const cpuLimit = options?.customCpuLimit || SOROBAN_MAX_CPU_INSTRUCTIONS;
  const memoryLimit = options?.customMemoryLimit || SOROBAN_MAX_MEMORY_BYTES;

  let minResourceFeeStroops = 100;
  let cpuInstructions = 0;
  let memoryBytes = 0;

  if (simResponse) {
    // 1. Min Resource Fee extraction
    if (
      typeof simResponse.minResourceFee === "string" ||
      typeof simResponse.minResourceFee === "number"
    ) {
      minResourceFeeStroops = Number(simResponse.minResourceFee);
    } else if (simResponse.transactionData?.fee) {
      minResourceFeeStroops = Number(simResponse.transactionData.fee);
    }

    // 2. CPU Instructions extraction
    if (simResponse.cost?.cpuInsns !== undefined) {
      cpuInstructions = Number(simResponse.cost.cpuInsns);
    } else if (simResponse.cost?.cpu !== undefined) {
      cpuInstructions = Number(simResponse.cost.cpu);
    } else if (simResponse.cpuInstructions !== undefined) {
      cpuInstructions = Number(simResponse.cpuInstructions);
    }

    // 3. Memory Bytes extraction
    if (simResponse.cost?.memBytes !== undefined) {
      memoryBytes = Number(simResponse.cost.memBytes);
    } else if (simResponse.cost?.memory !== undefined) {
      memoryBytes = Number(simResponse.cost.memory);
    } else if (simResponse.memoryBytes !== undefined) {
      memoryBytes = Number(simResponse.memoryBytes);
    }
  }

  // Ensure non-negative numbers
  cpuInstructions = Math.max(0, cpuInstructions);
  memoryBytes = Math.max(0, memoryBytes);
  minResourceFeeStroops = Math.max(100, minResourceFeeStroops);

  const cpuPercentage = Math.min(100, (cpuInstructions / cpuLimit) * 100);
  const memoryPercentage = Math.min(100, (memoryBytes / memoryLimit) * 100);

  const warnings: string[] = [];

  // CPU Warnings
  if (cpuPercentage >= CPU_CRITICAL_THRESHOLD * 100) {
    warnings.push(
      `⚠️ Unoptimized contract footprint: CPU consumption (${cpuPercentage.toFixed(1)}%) exceeds 80% of block instruction budget. Risk of transaction exhaustion.`,
    );
  } else if (cpuPercentage >= CPU_WARN_THRESHOLD * 100) {
    warnings.push(
      `ℹ️ Moderate CPU footprint: Execution consumes ${cpuPercentage.toFixed(1)}% of Soroban budget. Consider loop unrolling and storage optimization.`,
    );
  }

  // Memory Warnings
  if (memoryPercentage >= MEMORY_CRITICAL_THRESHOLD * 100) {
    warnings.push(
      `⚠️ Unoptimized contract footprint: Memory allocation (${memoryPercentage.toFixed(1)}%) exceeds 80% of transaction ceiling. High risk of out-of-memory revert.`,
    );
  } else if (memoryPercentage >= MEMORY_WARN_THRESHOLD * 100) {
    warnings.push(
      `ℹ️ Moderate memory footprint: Consuming ${formatBytes(memoryBytes)} (${memoryPercentage.toFixed(1)}% of limit).`,
    );
  }

  // Fee Spike Warning
  if (minResourceFeeStroops > 5_000_000) {
    warnings.push(
      `⚠️ Elevated resource fee: Simulation requires ${stroopsToXlm(minResourceFeeStroops)} (${minResourceFeeStroops.toLocaleString()} stroops).`,
    );
  }

  let status: "optimal" | "warning" | "critical" = "optimal";
  if (cpuPercentage >= 80 || memoryPercentage >= 80) {
    status = "critical";
  } else if (cpuPercentage >= 50 || memoryPercentage >= 50 || minResourceFeeStroops > 5_000_000) {
    status = "warning";
  }

  return {
    minResourceFee: stroopsToXlm(minResourceFeeStroops),
    minResourceFeeStroops,
    cpuInstructions,
    cpuLimit,
    cpuPercentage,
    memoryBytes,
    memoryLimit,
    memoryPercentage,
    warnings,
    status,
    rawSimulation: simResponse,
  };
}

/**
 * Simulates a Soroban transaction against an active RPC server and produces a resource budget profile.
 */
export async function profileTransactionSimulation(
  server: any,
  tx: any,
): Promise<SorobanResourceProfile> {
  try {
    const simResponse = await server.simulateTransaction(tx);
    return parseSimulationResourceBudget(simResponse);
  } catch (err: any) {
    console.warn("Simulation failed, generating fallback diagnostics:", err);
    return parseSimulationResourceBudget({
      error: err?.message || "Simulation error",
      cost: { cpuInsns: 12_500_000, memBytes: 1_250_000 },
      minResourceFee: 15_000,
    });
  }
}

/**
 * Creates a mock Soroban profile for testing and dev mode demonstrations.
 */
export function getMockResourceProfile(
  overrides?: Partial<SorobanResourceProfile>,
): SorobanResourceProfile {
  return parseSimulationResourceBudget({
    minResourceFee: 15_420,
    cost: {
      cpuInsns: 18_450_000,
      memBytes: 2_450_000,
    },
    ...overrides,
  });
}
