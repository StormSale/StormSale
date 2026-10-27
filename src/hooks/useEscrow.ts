import { useState, useEffect, useCallback, useRef } from "react";
import { STELLAR_CONFIG } from "../config/stellar";

export interface UseEscrowBalanceOptions {
  /** Escrow contract address or account address to monitor */
  escrowAddress?: string;
  /** Token asset codes to query (defaults to ["XLM", "USDC", "EURC"]) */
  tokens?: string[];
  /** Polling interval in milliseconds (defaults to 5000ms) */
  pollIntervalMs?: number;
  /** Whether polling is enabled (defaults to true if escrowAddress is present) */
  enabled?: boolean;
}

export interface UseEscrowBalanceResult {
  /** Map of token symbol to balance string (e.g. { XLM: "100.00", USDC: "50.00" }) */
  balances: Record<string, string>;
  /** Whether the initial or manual fetch is in progress */
  isLoading: boolean;
  /** Error object if the latest query failed */
  error: Error | null;
  /** Timestamp in ms of the last successful balance refresh */
  lastUpdated: number | null;
  /** Function to manually trigger an immediate refetch */
  refetch: () => Promise<void>;
}

/**
 * Fetches balances for an account across specified tokens from the Stellar Horizon API.
 * Supports multiple assets (native XLM as well as issued assets like USDC, EURC).
 */
export async function fetchAccountBalances(
  address: string,
  tokens: string[] = ["XLM", "USDC", "EURC"],
  horizonUrl: string = STELLAR_CONFIG.horizonUrl,
): Promise<Record<string, string>> {
  const result: Record<string, string> = {};
  tokens.forEach((t) => {
    result[t] = "0.0000";
  });

  if (!address || typeof address !== "string") {
    return result;
  }

  try {
    const response = await fetch(`${horizonUrl}/accounts/${address}`);
    if (!response.ok) {
      if (response.status === 404) {
        tokens.forEach((t) => {
          result[t] = "0.0000";
        });
        return result;
      }
      throw new Error(`Horizon API error: HTTP ${response.status}`);
    }

    const data = (await response.json()) as {
      balances?: Array<{
        asset_type: string;
        asset_code?: string;
        balance: string;
      }>;
    };

    const rawBalances = data.balances || [];

    for (const token of tokens) {
      if (token.toUpperCase() === "XLM") {
        const native = rawBalances.find((b) => b.asset_type === "native");
        result["XLM"] = native ? parseFloat(native.balance).toFixed(4) : "0.0000";
      } else {
        const match = rawBalances.find(
          (b) => b.asset_code?.toUpperCase() === token.toUpperCase(),
        );
        result[token] = match ? parseFloat(match.balance).toFixed(4) : "0.0000";
      }
    }
    return result;
  } catch (err: unknown) {
    throw err instanceof Error ? err : new Error(String(err));
  }
}

/**
 * React hook to monitor escrow contract balances on an interval with multi-token support.
 * Automatically cleans up polling timers on unmount.
 *
 * Implements Issue #71.
 */
export function useEscrowBalance({
  escrowAddress,
  tokens = ["XLM", "USDC", "EURC"],
  pollIntervalMs = 5000,
  enabled = true,
}: UseEscrowBalanceOptions = {}): UseEscrowBalanceResult {
  const [balances, setBalances] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    tokens.forEach((t) => {
      initial[t] = "0.0000";
    });
    return initial;
  });
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<Error | null>(null);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);

  const isMountedRef = useRef(true);
  const isFetchingRef = useRef(false);
  const tokensKey = tokens.slice().sort().join(",");

  const targetAddress = escrowAddress || STELLAR_CONFIG.contractId;

  const fetchBalances = useCallback(async () => {
    if (!targetAddress || isFetchingRef.current) return;
    isFetchingRef.current = true;
    setIsLoading(true);
    setError(null);

    try {
      const newBalances = await fetchAccountBalances(targetAddress, tokens);
      if (isMountedRef.current) {
        setBalances(newBalances);
        setLastUpdated(Date.now());
        setError(null);
      }
    } catch (err: unknown) {
      if (isMountedRef.current) {
        setError(err instanceof Error ? err : new Error(String(err)));
      }
    } finally {
      isFetchingRef.current = false;
      if (isMountedRef.current) {
        setIsLoading(false);
      }
    }
  }, [targetAddress, tokensKey]);

  useEffect(() => {
    isMountedRef.current = true;

    if (!enabled || !targetAddress) {
      return () => {
        isMountedRef.current = false;
      };
    }

    // Initial fetch on mount / dependencies change
    void fetchBalances();

    // Periodic polling on configured interval
    const intervalId = setInterval(() => {
      void fetchBalances();
    }, Math.max(50, pollIntervalMs));

    // Cleanup interval on unmount
    return () => {
      isMountedRef.current = false;
      clearInterval(intervalId);
    };
  }, [enabled, targetAddress, pollIntervalMs, fetchBalances]);

  return {
    balances,
    isLoading,
    error,
    lastUpdated,
    refetch: fetchBalances,
  };
}
