import { useWeb3 as useWeb3Context } from "../context/Web3Context";

export const useWeb3 = useWeb3Context;

export const useWeb3ResourceDiagnostics = useSorobanResourceDiagnostics;

export interface SorobanResourceDiagnostics {
  minResourceFee: string;
  cpuInstructions: string;
  memoryBytes: string;
  ledgerReadBytes?: string;
  ledgerWriteBytes?: string;
  warnings: string[];
}

export interface SimulateTransactionResponse {
  minResourceFee?: string | number;
  transactionData?: string;
  results?: Array<{
    cost?: {
      cpuInsns?: string | number;
      memBytes?: string | number;
    };
    auth?: unknown[];
  }>;
  cost?: {
    cpuInsns?: string | number;
    memBytes?: string | number;
  };
  latestLedger?: number;
  error?: string;
}

const CPU_WARN_THRESHOLD = 100_000_000;
const MEMORY_WARN_THRESHOLD = 40_000_000;

const toNumericString = (value: string | number | undefined): string => {
  if (value === undefined || value === null) return "0";
  return String(value);
};

const toNumber = (value: string | number | undefined): number => {
  if (value === undefined || value === null) return 0;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

/**
 * Parses a Soroban RPC `simulateTransaction` response into a granular
 * resource diagnostic breakdown suitable for display in confirmation modals.
 */
export const parseSorobanResourceDiagnostics = (
  response: SimulateTransactionResponse | null | undefined
): SorobanResourceDiagnostics | null => {
  if (!response || response.error) return null;

  const cost = response.cost ?? response.results?.[0]?.cost;
  const cpuInstructions = toNumericString(cost?.cpuInsns);
  const memoryBytes = toNumericString(cost?.memBytes);
  const minResourceFee = toNumericString(response.minResourceFee);

  const warnings: string[] = [];
  if (toNumber(cost?.cpuInsns) > CPU_WARN_THRESHOLD) {
    warnings.push(
      "High CPU instruction footprint detected; consider optimizing contract logic."
    );
  }
  if (toNumber(cost?.memBytes) > MEMORY_WARN_THRESHOLD) {
    warnings.push(
      "High memory consumption detected; review contract data structures."
    );
  }

  return {
    minResourceFee,
    cpuInstructions,
    memoryBytes,
    warnings,
  };
};

export const useSorobanResourceDiagnostics = (
  response: SimulateTransactionResponse | null | undefined
): SorobanResourceDiagnostics | null => parseSorobanResourceDiagnostics(response);
