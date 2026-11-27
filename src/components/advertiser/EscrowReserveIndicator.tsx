import React from "react";
import { type EscrowReserveStatus } from "../../lib/escrowAutoRefill";
import { AlertCircle, AlertTriangle, CheckCircle2, Coins, Sparkles } from "lucide-react";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";

interface EscrowReserveIndicatorProps {
  status: EscrowReserveStatus;
  onOpenSettings?: () => void;
  onQuickRefill?: () => void;
  isRefilling?: boolean;
  className?: string;
}

export const EscrowReserveIndicator: React.FC<EscrowReserveIndicatorProps> = ({
  status,
  onOpenSettings,
  onQuickRefill,
  isRefilling = false,
  className = "",
}) => {
  const {
    remainingPercent,
    thresholdPercent,
    currentBalanceXlm,
    initialBudgetXlm,
    isLowReserve,
    warningLevel,
  } = status;

  const getStatusBadge = () => {
    if (warningLevel === "critical") {
      return {
        bg: "bg-rose-500/10 border-rose-500/30 text-rose-600 dark:text-rose-400 animate-pulse",
        dot: "bg-rose-500",
        icon: AlertCircle,
        label: "Critical Reserve",
      };
    }
    if (warningLevel === "warning") {
      return {
        bg: "bg-amber-500/10 border-amber-500/30 text-amber-600 dark:text-amber-400",
        dot: "bg-amber-500",
        icon: AlertTriangle,
        label: "Low Reserve (< " + thresholdPercent + "%)",
      };
    }
    return {
      bg: "bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400",
      dot: "bg-emerald-500",
      icon: CheckCircle2,
      label: "Escrow Healthy",
    };
  };

  const badge = getStatusBadge();
  const Icon = badge.icon;

  return (
    <div
      className={`p-4 rounded-2xl border bg-slate-50/80 dark:bg-zinc-950/60 border-slate-200 dark:border-zinc-800 ${className}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2.5">
        <div className="flex items-center gap-2">
          <Coins className="w-4 h-4 text-indigo-500" />
          <span className="text-xs font-bold text-zinc-900 dark:text-white">Escrow Balance:</span>
          <span className="text-xs font-mono font-semibold text-zinc-700 dark:text-zinc-300">
            {currentBalanceXlm.toLocaleString()} / {initialBudgetXlm.toLocaleString()} XLM
          </span>
        </div>

        <Badge
          variant={
            warningLevel === "critical" ? "rose" : warningLevel === "warning" ? "amber" : "emerald"
          }
          icon={Icon}
          role={onOpenSettings ? undefined : "status"}
          aria-label={`Escrow status: ${badge.label}`}
          tooltip={
            onOpenSettings
              ? undefined
              : `${badge.label}: ${currentBalanceXlm.toLocaleString()} XLM remaining (${remainingPercent}%).`
          }
          popoverContent={
            onOpenSettings ? (
              <div className="space-y-2">
                <p className="font-semibold">{badge.label}</p>
                <p>
                  {currentBalanceXlm.toLocaleString()} XLM remaining ({remainingPercent}%).
                </p>
                <button
                  type="button"
                  onClick={onOpenSettings}
                  className="rounded-md bg-indigo-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-indigo-500"
                >
                  Configure refill threshold
                </button>
              </div>
            ) : undefined
          }
          className={`px-2.5 py-0.5 text-[11px] ${badge.bg}`}
        >
          <span className="font-mono">({remainingPercent}%)</span>
        </Badge>
      </div>

      {/* Progress Bar with Threshold Marker */}
      <div className="relative w-full h-2 rounded-full bg-slate-200 dark:bg-zinc-800 overflow-hidden mb-3">
        <div
          role="progressbar"
          aria-valuenow={remainingPercent}
          aria-valuemin={0}
          aria-valuemax={100}
          style={{ width: `${Math.min(100, Math.max(0, remainingPercent))}%` }}
          className={`h-full rounded-full transition-all duration-500 ${
            warningLevel === "critical"
              ? "bg-rose-500"
              : warningLevel === "warning"
                ? "bg-amber-500"
                : "bg-emerald-500"
          }`}
        />
        {/* Threshold indicator line */}
        <div
          style={{ left: `${thresholdPercent}%` }}
          title={`Refill Trigger: ${thresholdPercent}%`}
          className="absolute top-0 bottom-0 w-0.5 bg-indigo-500 z-10 opacity-75"
        />
      </div>

      {/* Action / Warning Notice */}
      <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-xs">
        <span className="text-muted-foreground text-[11px]">
          Trigger threshold: <strong className="text-foreground">{thresholdPercent}%</strong> (
          {status.thresholdBalanceXlm.toLocaleString()} XLM)
        </span>

        <div className="flex items-center gap-2">
          {isLowReserve && onQuickRefill && (
            <Button
              size="sm"
              disabled={isRefilling}
              onClick={onQuickRefill}
              className="h-6 text-[10px] px-2.5 bg-amber-600 hover:bg-amber-500 text-white rounded-lg font-bold flex items-center gap-1 shadow-sm shadow-amber-600/20"
            >
              <Sparkles className="w-2.5 h-2.5" />
              <span>1-Click Refill</span>
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};
