import React, { useState, useEffect, useCallback } from "react";
import { Card, CardContent } from "../ui/card";
import { Button } from "../ui/button";
import { useWeb3 } from "../../hooks/useWeb3";
import { useNotification } from "../../context/NotificationContext";
import {
  ShieldAlert,
  ShieldCheck,
  RefreshCw,
  Sparkles,
  Zap,
  Info,
  CheckCircle2,
} from "lucide-react";
import type { StorageTTLInfo } from "../../lib/stellar";

interface StorageTTLHealthIndicatorProps {
  contractId?: string;
  onExtended?: (newTTL: StorageTTLInfo) => void;
  compact?: boolean;
}

export const StorageTTLHealthIndicator: React.FC<StorageTTLHealthIndicatorProps> = ({
  contractId,
  onExtended,
  compact = false,
}) => {
  const { getStorageTTL, extendStorageTTL } = useWeb3();
  const { showNotification } = useNotification();

  const [ttlInfo, setTtlInfo] = useState<StorageTTLInfo | null>(null);
  const [isExtending, setIsExtending] = useState(false);
  const [autoExtendEnabled, setAutoExtendEnabled] = useState(true);
  const [lastExtendedTx, setLastExtendedTx] = useState<string | null>(null);

  const fetchTTL = useCallback(async () => {
    try {
      const info = await getStorageTTL(contractId);
      setTtlInfo(info);
      return info;
    } catch (err) {
      console.warn("Error fetching storage TTL:", err);
      return null;
    }
  }, [getStorageTTL, contractId]);

  useEffect(() => {
    fetchTTL();
    const interval = setInterval(fetchTTL, 15000);
    return () => clearInterval(interval);
  }, [fetchTTL]);

  // Handle one-click manual or automated TTL extension
  const handleExtendTTL = useCallback(
    async (isAutomated = false) => {
      setIsExtending(true);
      try {
        if (!isAutomated) {
          showNotification({
            type: "info",
            title: "Extending Soroban Storage TTL",
            message: "Simulating and submitting extend_ttl invocation (+100,000 ledgers)...",
          });
        }

        const res = await extendStorageTTL(contractId, 100000);
        setTtlInfo(res.ttlInfo);
        setLastExtendedTx(res.txHash);
        if (onExtended) onExtended(res.ttlInfo);

        showNotification({
          type: "success",
          title: "Storage TTL Extended Successfully!",
          message: `Campaign storage live until ledger #${res.ttlInfo.liveUntilLedger.toLocaleString()} (+${res.ttlInfo.remainingLedgers.toLocaleString()} ledgers remaining).`,
        });
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : "Could not extend storage TTL.";
        console.error("Failed to extend storage TTL:", err);
        showNotification({
          type: "error",
          title: "TTL Extension Failed",
          message: errorMsg,
        });
      } finally {
        setIsExtending(false);
      }
    },
    [contractId, extendStorageTTL, onExtended, showNotification],
  );

  // Automated trigger check: when autoExtendEnabled and remainingLedgers < threshold
  useEffect(() => {
    if (
      autoExtendEnabled &&
      ttlInfo &&
      ttlInfo.remainingLedgers < ttlInfo.threshold &&
      !isExtending &&
      !lastExtendedTx
    ) {
      console.log(
        "[Soroban] Storage TTL below threshold (50k ledgers). Auto-triggering extend_ttl...",
      );
      handleExtendTTL(true);
    }
  }, [autoExtendEnabled, ttlInfo, isExtending, lastExtendedTx, handleExtendTTL]);

  if (!ttlInfo) {
    return (
      <div className="flex items-center gap-2 text-xs text-zinc-400 p-2 animate-pulse">
        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
        Loading Soroban storage TTL...
      </div>
    );
  }

  const isWarning = ttlInfo.status === "warning";
  const isCritical = ttlInfo.status === "critical";
  const isHealthy = ttlInfo.status === "healthy";

  // Compact badge rendering (for lists and tables)
  if (compact) {
    return (
      <div className="inline-flex items-center gap-2">
        <span
          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${
            isHealthy
              ? "bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20"
              : isWarning
                ? "bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20"
                : "bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-500/10 dark:text-rose-400 dark:border-rose-500/20"
          }`}
        >
          {isHealthy ? (
            <ShieldCheck className="w-3.5 h-3.5" />
          ) : (
            <ShieldAlert className="w-3.5 h-3.5 animate-pulse" />
          )}
          <span>{ttlInfo.remainingLedgers.toLocaleString()} Ledgers</span>
        </span>

        {(isWarning || isCritical) && (
          <Button
            size="sm"
            onClick={() => handleExtendTTL(false)}
            disabled={isExtending}
            className="h-7 px-2.5 text-[11px] rounded-lg bg-amber-600 hover:bg-amber-500 text-white font-medium shadow-xs"
          >
            {isExtending ? (
              <RefreshCw className="w-3 h-3 animate-spin mr-1" />
            ) : (
              <Zap className="w-3 h-3 mr-1" />
            )}
            Extend
          </Button>
        )}
      </div>
    );
  }

  // Full command center widget
  const maxVisualLedgers = 150000;
  const progressPercent = Math.min(
    100,
    Math.max(5, (ttlInfo.remainingLedgers / maxVisualLedgers) * 100),
  );

  return (
    <Card
      className={`border rounded-2xl shadow-sm transition-all overflow-hidden ${
        isHealthy
          ? "border-slate-200 dark:border-zinc-800 bg-white/90 dark:bg-zinc-900/90"
          : isWarning
            ? "border-amber-300 dark:border-amber-500/40 bg-amber-50/40 dark:bg-amber-950/20 shadow-amber-500/5"
            : "border-rose-400 dark:border-rose-500/50 bg-rose-50/40 dark:bg-rose-950/20 shadow-rose-500/5"
      }`}
    >
      <CardContent className="p-5 md:p-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          {/* Header & Status Indicator */}
          <div className="flex items-start gap-3.5">
            <div
              className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 shadow-sm ${
                isHealthy
                  ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400"
                  : isWarning
                    ? "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400 animate-pulse"
                    : "bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-400 animate-bounce"
              }`}
            >
              {isHealthy ? (
                <ShieldCheck className="w-6 h-6" />
              ) : (
                <ShieldAlert className="w-6 h-6" />
              )}
            </div>

            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h4 className="font-bold text-zinc-900 dark:text-white text-base">
                  Soroban Escrow State TTL
                </h4>
                <span
                  className={`text-[11px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full ${
                    isHealthy
                      ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300"
                      : isWarning
                        ? "bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300"
                        : "bg-rose-100 text-rose-800 dark:bg-rose-500/20 dark:text-rose-300"
                  }`}
                >
                  {isHealthy
                    ? "Healthy State"
                    : isWarning
                      ? "Threshold Warning (< 50k ledgers)"
                      : "Critical TTL"}
                </span>
              </div>

              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                Stellar ledger countdown before contract storage keys require state restoration.
              </p>
            </div>
          </div>

          {/* Quick Actions & Auto-toggle */}
          <div className="flex items-center gap-3 self-end md:self-center">
            <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-zinc-600 dark:text-zinc-300 bg-slate-100 dark:bg-zinc-800/70 hover:bg-slate-200 dark:hover:bg-zinc-800 px-3 py-2 rounded-xl border border-slate-200 dark:border-zinc-700 transition-colors">
              <input
                type="checkbox"
                checked={autoExtendEnabled}
                onChange={(e) => setAutoExtendEnabled(e.target.checked)}
                className="w-4 h-4 text-indigo-600 rounded-sm focus:ring-indigo-500 border-zinc-300 dark:border-zinc-700"
              />
              <span className="flex items-center gap-1">
                <Sparkles className="w-3.5 h-3.5 text-indigo-500" />
                Auto-extend &lt; 50k
              </span>
            </label>

            <Button
              onClick={() => handleExtendTTL(false)}
              disabled={isExtending}
              className={`rounded-xl font-bold text-xs h-9 px-4 shadow-sm transition-transform active:scale-95 ${
                isHealthy
                  ? "bg-zinc-900 hover:bg-zinc-800 dark:bg-indigo-600 dark:hover:bg-indigo-500 text-white"
                  : isWarning
                    ? "bg-amber-600 hover:bg-amber-500 text-white shadow-amber-500/20"
                    : "bg-rose-600 hover:bg-rose-500 text-white shadow-rose-500/20"
              }`}
            >
              {isExtending ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                  Extending TTL...
                </>
              ) : (
                <>
                  <Zap className="w-3.5 h-3.5 mr-1.5" />
                  Extend TTL (+100k)
                </>
              )}
            </Button>
          </div>
        </div>

        {/* Real-time Ledger Countdown Meter */}
        <div className="mt-5 pt-4 border-t border-slate-100 dark:border-zinc-800/60">
          <div className="flex justify-between items-end mb-2 text-xs">
            <div>
              <span className="text-zinc-400 font-medium">Remaining TTL: </span>
              <span
                className={`font-black text-sm tracking-tight ${
                  isHealthy
                    ? "text-zinc-900 dark:text-white"
                    : isWarning
                      ? "text-amber-600 dark:text-amber-400"
                      : "text-rose-600 dark:text-rose-400"
                }`}
              >
                {ttlInfo.remainingLedgers.toLocaleString()} Ledgers
              </span>
              <span className="text-zinc-500 dark:text-zinc-400 ml-1.5 font-medium">
                (~{ttlInfo.estimatedHoursRemaining} hrs)
              </span>
            </div>

            <div className="text-right text-[11px] font-mono text-zinc-400">
              Current: #{ttlInfo.currentLedger.toLocaleString()} · Live Until: #
              {ttlInfo.liveUntilLedger.toLocaleString()}
            </div>
          </div>

          {/* Progress bar */}
          <div className="w-full bg-slate-100 dark:bg-zinc-800 h-2.5 rounded-full overflow-hidden">
            <div
              className={`h-full transition-all duration-700 ease-out rounded-full ${
                isHealthy
                  ? "bg-gradient-to-r from-emerald-500 to-indigo-500"
                  : isWarning
                    ? "bg-gradient-to-r from-amber-500 to-amber-400"
                    : "bg-gradient-to-r from-rose-600 to-rose-400 animate-pulse"
              }`}
              style={{ width: `${progressPercent}%` }}
            />
          </div>

          {/* Footer note */}
          <div className="flex items-center justify-between mt-2.5 text-[11px] text-zinc-400">
            <span className="flex items-center gap-1">
              <Info className="w-3 h-3 text-zinc-400" />
              Threshold: {ttlInfo.threshold.toLocaleString()} ledgers
            </span>
            {lastExtendedTx && (
              <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-medium">
                <CheckCircle2 className="w-3 h-3" />
                Extended (Tx: {lastExtendedTx.slice(0, 8)}...)
              </span>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
