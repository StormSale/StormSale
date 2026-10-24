import { useWeb3 as useWebContext } from "../context/Web3Context";

export type SorobanResourceConsumption = {
  cpuInstructions: number;
  memoryBytes: number;
  readBytes?: number;
  writeBytes?: number;
  minResourceFee?: string;
};

export type SorobanSimulationResult = {
  success?: boolean;
  minResourceFee?: string;
  cost?: {
    cpuInstructions?: string | number;
    memoryBytes?: string | number;
  };
  result?: {
    returnValue?: unknown;
  };
};

export type ResourceDiagnostic = {
  consumption: SorobanResourceConsumption;
  warnings: string[];
  isOptimized: boolean;
};

const CPU_WARN_THRESHOLD = 100_000_000;
const MEMORY_WARN_THRESHOLD = 40_000_000;
const READ_WARN_THRESHOLD = 100_000;
const WRITE_WARN_THRESHOLD = 100_000;

function toNumber(value: string | number | undefined): number {
  if (value === undefined) {
    return 0;
  }
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function parseSorobanSimulation(
  simulation: SorobanSimulationResult | undefined | null,
): ResourceDiagnostic {
  const consumption: SorobanResourceConsumption = {
    cpuInstructions: toNumber(simulation?.cost?.cpuInstructions),
    memoryBytes: toNumber(simulation?.cost?.memoryBytes),
    readBytes: toNumber(
      (simulation as { readBytes?: string | number } | undefined)?.readBytes,
    ),
    writeBytes: toNumber(
      (simulation as { writeBytes?: string | number } | undefined)?.writeBytes,
    ),
    minResourceFee: simulation?.minResourceFee,
  };

  const warnings: string[] = [];

  if (consumption.cpuInstructions > CPU_WARN_THRESHOLD) {
    warnings.push(
      `CPU usage (${consumption.cpuInstructions.toLocaleString()} instructions) exceeds the recommended threshold of ${CPU_WARN_THRESHOLD.toLocaleString()}. Consider optimizing contract logic.`,
    );
  }

  if (consumption.memoryBytes > MEMORY_WARN_THRESHOLD) {
    warnings.push(
      `Memory usage (${consumption.memoryBytes.toLocaleString()} bytes) exceeds the recommended threshold of ${MEMORY_WARN_THRESHOLD.toLocaleString()}. Consider reducing in-memory data size.`,
    );
  }

  if ((consumption.readBytes ?? 0) > READ_WARN_THRESHOLD) {
    warnings.push(
      `Ledger read volume (${consumption.readBytes?.toLocaleString()} bytes) is high. Consider caching or batching state reads.`,
    );
  }

  if ((consumption.writeBytes ?? 0) > WRITE_WARN_THRESHOLD) {
    warnings.push(
      `Ledger write volume (${consumption.writeBytes?.toLocaleString()} bytes) is high. Consider reducing persistent state writes.`,
    );
  }

  return {
    consumption,
    warnings,
    isOptimized: warnings.length === 0,
  };
}

export const useWeb3 = useWebContext;
