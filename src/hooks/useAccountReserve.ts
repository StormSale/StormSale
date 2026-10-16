import { useCallback, useEffect, useMemo, useState } from "react";
import { calculateReserveBreakdown, fetchStellarAccountDetails } from "../lib/stellar";
import type { StellarAccountDetails } from "../lib/stellar";

export interface AccountReserveState {
  /** Native XLM balance backing the calculation. */
  balanceXlm: number;
  /** Minimum XLM that must stay locked in the account. */
  reserveXlm: number;
  /** Maximum XLM the account can spend, move, or escrow. */
  spendableXlm: number;
  subentries: number;
  baseReserveXlm: number;
  trustlineCount: number;
  exists: boolean;
  /** True when Horizon data was unavailable and the context balance was used. */
  isFallback: boolean;
  isLoading: boolean;
  refresh: () => Promise<void>;
}

function toNumber(value: string | number | null | undefined): number {
  const parsed = typeof value === "number" ? value : parseFloat(String(value ?? ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Resolves the connected account's minimum reserve and spendable balance from
 * Horizon, falling back to the wallet context balance when the account cannot be
 * loaded (for example the demo/mock account).
 */
export function useAccountReserve(
  address: string | null,
  fallbackBalanceXlm: string | number = 0,
): AccountReserveState {
  const [details, setDetails] = useState<StellarAccountDetails | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!address) return;
    setIsLoading(true);
    try {
      const result = await fetchStellarAccountDetails(address);
      setDetails(result);
    } finally {
      setIsLoading(false);
    }
  }, [address]);

  // Kick off the initial load off the effect body to avoid cascading renders.
  useEffect(() => {
    const timer = setTimeout(() => {
      void refresh();
    }, 0);
    return () => clearTimeout(timer);
  }, [refresh]);

  return useMemo<AccountReserveState>(() => {
    const activeDetails = address ? details : null;
    const isFallback = !activeDetails || !activeDetails.exists;
    const breakdown = calculateReserveBreakdown(
      isFallback ? toNumber(fallbackBalanceXlm) : activeDetails.balanceXlm,
      isFallback ? 0 : activeDetails.subentries,
      isFallback
        ? {}
        : {
            numSponsoring: activeDetails.numSponsoring,
            numSponsored: activeDetails.numSponsored,
          },
    );

    return {
      balanceXlm: breakdown.balanceXlm,
      reserveXlm: breakdown.reserveXlm,
      spendableXlm: breakdown.spendableXlm,
      subentries: breakdown.subentries,
      baseReserveXlm: breakdown.baseReserveXlm,
      trustlineCount: isFallback ? 0 : activeDetails.trustlineCount,
      exists: Boolean(activeDetails?.exists),
      isFallback,
      isLoading,
      refresh,
    };
  }, [address, details, fallbackBalanceXlm, isLoading, refresh]);
}
