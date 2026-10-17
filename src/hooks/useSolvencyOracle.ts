import { useState, useEffect, useCallback } from "react";
import {
  type ProtocolSolvencyProof,
  type LedgerInfo,
  computeProtocolSolvencyProof,
  fetchXlmUsdPrice,
  subscribeToLedgerCloses,
} from "../lib/solvencyOracle";

export function useSolvencyOracle(pollIntervalMs: number = 5000) {
  const [proof, setProof] = useState<ProtocolSolvencyProof | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [isLiveStreaming, setIsLiveStreaming] = useState<boolean>(true);
  const [secondsSinceClose, setSecondsSinceClose] = useState<number>(0);

  const refreshProof = useCallback(async (ledgerInfo?: LedgerInfo) => {
    try {
      setError(null);
      const priceResult = await fetchXlmUsdPrice();
      const updatedProof = await computeProtocolSolvencyProof({
        xlmUsdRate: priceResult.rate,
        rateSource: priceResult.source,
        ledgerInfo,
      });

      setProof(updatedProof);
      setSecondsSinceClose(0);
    } catch (err: unknown) {
      console.warn("Solvency proof recalculation note:", err);
      setError((err as Error)?.message || "Failed to recalculate protocol solvency proof.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Subscribe to real-time Stellar ledger closes
  useEffect(() => {
    if (!isLiveStreaming) return;

    const unsubscribe = subscribeToLedgerCloses((ledger: LedgerInfo) => {
      refreshProof(ledger);
    }, pollIntervalMs);

    return () => {
      unsubscribe();
    };
  }, [isLiveStreaming, pollIntervalMs, refreshProof]);

  // Relative second timer since last ledger close
  useEffect(() => {
    const timer = setInterval(() => {
      setSecondsSinceClose((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const toggleLiveStreaming = useCallback(() => {
    setIsLiveStreaming((prev) => !prev);
  }, []);

  return {
    proof,
    isLoading,
    error,
    isLiveStreaming,
    secondsSinceClose,
    refreshProof,
    toggleLiveStreaming,
  };
}
