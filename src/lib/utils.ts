import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export interface SorobanResourceDiagnostics {
  minResourceFee: string;
  cpuInstructions: string;
  memoryBytes: string;
  ledgerReadBytes?: string;
  ledgerWriteBytes?: string;
  warnings: string[];
}

const CPU_WARN_THRESHOLD = 100_000_000n;
const MEMORY_WARN_THRESHOLD = 40n * 1024n * 1024n;

type SimulationResponse = {
  minResourceFee?: string | number;
  cost?: { cpuInsns?: string | number; memBytes?: string | number };
  transactionData?: unknown;
  results?: Array<{ cost?: { cpuInsns?: string | number; memBytes?: string | number } }>;
  error?: string;
};

function extractLedgerBytes(transactionData: unknown): {
  ledgerReadBytes?: string;
  ledgerWriteBytes?: string;
} {
  if (!transactionData || typeof transactionData !== "object") return {};
  const data = transactionData as Record<string, unknown>;
  const resources = (data.resources ?? data) as Record<string, unknown>;
  const read = resources.readBytes ?? resources.diskReadBytes;
  const write = resources.writeBytes ?? resources.diskWriteBytes;
  return {
    ledgerReadBytes: read === undefined ? undefined : toBigIntString(read as string | number),
    ledgerWriteBytes: write === undefined ? undefined : toBigIntString(write as string | number),
  };
}

function toBigIntString(value: string | number | undefined): string {
  if (value === undefined || value === null) return "0";
  try {
    return BigInt(value).toString();
  } catch {
    return "0";
  }
}

/**
 * Parses a Soroban RPC `simulateTransaction` response into a granular
 * resource diagnostic breakdown for display in confirmation modals.
 */
export function parseSorobanSimulation(
  response: SimulationResponse | null | undefined,
): SorobanResourceDiagnostics | null {
  if (!response || response.error) return null;

  const cost = response.cost ?? response.results?.[0]?.cost;
  const cpuInstructions = toBigIntString(cost?.cpuInsns);
  const memoryBytes = toBigIntString(cost?.memBytes);
  const minResourceFee = toBigIntString(response.minResourceFee);


  const warnings: string[] = [];
  if (BigInt(cpuInstructions) > CPU_WARN_THRESHOLD) {
    warnings.push(
      "High CPU instruction count detected — contract footprint may be unoptimized.",
    );
  }
  if (BigInt(memoryBytes) > MEMORY_WARN_THRESHOLD) {
    warnings.push(
      "High memory usage detected — consider reducing contract state or allocations.",
    );
  }

  const { ledgerReadBytes, ledgerWriteBytes } = extractLedgerBytes(
    response.transactionData,
  );

  return {
    minResourceFee,
    cpuInstructions,
    memoryBytes,
    ledgerReadBytes,
    ledgerWriteBytes,
    warnings,
  };
}
