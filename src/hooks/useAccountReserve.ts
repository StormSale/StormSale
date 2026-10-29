import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  /**
   * True when Horizon could not be reached (as opposed to an unfunded account),
   * so subentries are unknown and spendable XLM may be overstated.
   */
  isUnavailable: boolean;
  /** Native XLM committed to open sell offers; excluded from spendable XLM. */
  sellingLiabilitiesXlm: number;
  isLoading: boolean;
  /**
   * True once a Horizon lookup for the current address has settled. Callers
   * should not trust spendable/reserve figures for validation until then.
   */
  isReady: boolean;
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
  const [loadedAddress, setLoadedAddress] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  // Monotonic request id: only the latest request for the latest address may commit.
  const requestIdRef = useRef(0);

  const refresh = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    if (!address) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    try {
      const result = await fetchStellarAccountDetails(address);
      if (requestId !== requestIdRef.current) return;
      setDetails(result);
      setLoadedAddress(address);
    } finally {
      if (requestId === requestIdRef.current) {
        setIsLoading(false);
      }
    }
  }, [address]);

  // Kick off the initial load off the effect body to avoid cascading renders.
  // On address change/disconnect, invalidate any in-flight request.
  useEffect(() => {
    const timer = setTimeout(() => {
      void refresh();
    }, 0);
    return () => {
      clearTimeout(timer);
      requestIdRef.current += 1;
    };
  }, [refresh]);

  return useMemo<AccountReserveState>(() => {
    const isReady = Boolean(address) && loadedAddress === address && !isLoading;
    const activeDetails = address && loadedAddress === address ? details : null;
    const isFallback = !activeDetails || !activeDetails.exists;
    const breakdown = calculateReserveBreakdown(
      isFallback ? toNumber(fallbackBalanceXlm) : activeDetails.balanceXlm,
      isFallback ? 0 : activeDetails.subentries,
      isFallback
        ? {}
        : {
            numSponsoring: activeDetails.numSponsoring,
            numSponsored: activeDetails.numSponsored,
            sellingLiabilitiesXlm: activeDetails.sellingLiabilitiesXlm,
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
      isUnavailable: activeDetails?.status === "unavailable",
      sellingLiabilitiesXlm: breakdown.sellingLiabilitiesXlm ?? 0,
      isLoading,
      isReady,
      refresh,
    };
  }, [address, details, fallbackBalanceXlm, isLoading, loadedAddress, refresh]);
}
