/**
 * src/components/b2b/EnterpriseSlaWidget.tsx
 *
 * Enterprise SLA Monitoring Widget & Real-time RPC Status Indicator (Issue #441)
 *
 * Features:
 * 1. SLA Status Pill with three distinct operational tiers:
 *    - Green (<200ms): Optimal network latency
 *    - Amber (200-800ms): Elevated latency warning
 *    - Red (>800ms / offline): Critical latency / RPC offline alert
 * 2. Real-time infrastructure metrics: Current latency, P50 & P95 percentiles, Ledger block height.
 * 3. Interactive, accessible tooltip rendering 30-day daily uptime history and aggregate SLA percentage.
 */

import React, { useState, useEffect } from "react";
import { ShieldCheck, RefreshCw } from "lucide-react";
import {
  type SlaInfrastructureState,
  determineSlaStatusTier,
  calculate30DayUptime,
  generate30DayUptimeHistory,
} from "../../lib/slaMonitoring";
import { cn } from "../../lib/utils";

export interface EnterpriseSlaWidgetProps {
  initialState?: Partial<SlaInfrastructureState>;
  defaultTooltipOpen?: boolean;
  className?: string;
  showP50P95?: boolean;
  showBlockHeight?: boolean;
  showTooltipOnHover?: boolean;
  onRefresh?: () => void;
}

export const EnterpriseSlaWidget: React.FC<EnterpriseSlaWidgetProps> = ({
  initialState,
  defaultTooltipOpen = false,
  className,
  showP50P95 = true,
  showBlockHeight = true,
  showTooltipOnHover = true,
  onRefresh,
}) => {
  const [isTooltipVisible, setIsTooltipVisible] = useState(defaultTooltipOpen);

  const [state, setState] = useState<SlaInfrastructureState>(() => {
    const defaultHistory = initialState?.dailyUptimeHistory ?? generate30DayUptimeHistory(99.98);
    const latency = initialState?.currentLatencyMs !== undefined ? initialState.currentLatencyMs : 145;
    const isOffline = initialState?.isOffline ?? false;
    const tierConfig = determineSlaStatusTier(latency, isOffline);

    return {
      currentLatencyMs: latency,
      blockHeight: initialState?.blockHeight ?? 1284560,
      statusTier: initialState?.statusTier ?? tierConfig.tier,
      statusLabel: initialState?.statusLabel ?? tierConfig.label,
      p50: initialState?.p50 ?? 135,
      p95: initialState?.p95 ?? 185,
      sampleCount: initialState?.sampleCount ?? 20,
      isOffline,
      uptime30DaysPercent: initialState?.uptime30DaysPercent ?? calculate30DayUptime(defaultHistory),
      dailyUptimeHistory: defaultHistory,
      activeEndpoint: initialState?.activeEndpoint ?? "https://soroban-testnet.stellar.org",
      lastCheckedAt: initialState?.lastCheckedAt ?? Date.now(),
    };
  });

  useEffect(() => {
    if (initialState) {
      setState((prev) => {
        const history = initialState.dailyUptimeHistory ?? prev.dailyUptimeHistory;
        const latency = initialState.currentLatencyMs !== undefined ? initialState.currentLatencyMs : prev.currentLatencyMs;
        const isOffline = initialState.isOffline !== undefined ? initialState.isOffline : prev.isOffline;
        const tier = determineSlaStatusTier(latency, isOffline);

        return {
          ...prev,
          ...initialState,
          statusTier: initialState.statusTier ?? tier.tier,
          statusLabel: initialState.statusLabel ?? tier.label,
          dailyUptimeHistory: history,
          uptime30DaysPercent: initialState.uptime30DaysPercent ?? calculate30DayUptime(history),
        };
      });
    }
  }, [initialState]);

  const tier = determineSlaStatusTier(state.currentLatencyMs, state.isOffline);

  return (
    <div
      className={cn("relative inline-flex items-center", className)}
      onMouseEnter={() => showTooltipOnHover && setIsTooltipVisible(true)}
      onMouseLeave={() => showTooltipOnHover && setIsTooltipVisible(false)}
    >
      {/* SLA STATUS PILL */}
      <button
        type="button"
        data-testid="sla-status-pill"
        data-tier={state.statusTier}
        aria-label={`Infrastructure SLA Status: ${state.statusLabel} (${state.isOffline ? "Offline" : `${state.currentLatencyMs}ms`})`}
        aria-describedby="sla-uptime-tooltip"
        onClick={() => setIsTooltipVisible((prev) => !prev)}
        className={cn(
          "inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold border shadow-xs transition-all duration-200 cursor-pointer focus:outline-none focus:ring-2 focus:ring-indigo-500/40",
          tier.bgClass,
          tier.borderClass,
          tier.colorClass,
        )}
      >
        {/* Pulsing Dot */}
        <span className="relative flex h-2 w-2 shrink-0">
          {state.statusTier === "green" && (
            <span
              className={cn(
                "animate-ping absolute inline-flex h-full w-full rounded-full opacity-75",
                tier.dotClass,
              )}
            />
          )}
          <span className={cn("relative inline-flex rounded-full h-2 w-2", tier.dotClass)} />
        </span>

        {/* Status Label & Current Latency */}
        <span className="font-bold tracking-tight">
          {state.isOffline ? "RPC Offline" : `${state.currentLatencyMs}ms`}
        </span>

        <span className="text-[10px] uppercase tracking-wider font-mono opacity-80 border-l border-current/20 pl-1.5">
          {state.statusLabel}
        </span>

        {/* Block Height HUD */}
        {showBlockHeight && state.blockHeight > 0 && (
          <span
            data-testid="sla-block-height"
            className="text-[10px] font-mono opacity-75 border-l border-current/20 pl-1.5 hidden sm:inline"
            title={`Latest Soroban / Horizon Block Ledger: #${state.blockHeight}`}
          >
            L#{state.blockHeight}
          </span>
        )}

        {/* P50 / P95 Micro Metrics */}
        {showP50P95 && !state.isOffline && (
          <span
            data-testid="sla-p50-p95"
            className="text-[10px] font-mono opacity-85 border-l border-current/20 pl-1.5 hidden md:inline"
            title={`Rolling Latency Distribution: P50=${state.p50}ms, P95=${state.p95}ms`}
          >
            P50:{state.p50}m P95:{state.p95}m
          </span>
        )}

        {/* 30D Uptime Pill Badge */}
        <span
          data-testid="sla-30d-badge"
          className="text-[10px] font-mono bg-white/40 dark:bg-black/20 px-1.5 py-0.5 rounded-md text-zinc-700 dark:text-zinc-300 ml-0.5"
        >
          {state.uptime30DaysPercent.toFixed(2)}%
        </span>
      </button>

      {/* 30-DAY HISTORICAL UPTIME TOOLTIP */}
      {isTooltipVisible && (
        <div
          id="sla-uptime-tooltip"
          role="tooltip"
          data-testid="sla-uptime-tooltip"
          className="absolute top-full left-0 mt-2 z-50 w-72 sm:w-80 p-4 rounded-2xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 shadow-xl text-zinc-900 dark:text-white space-y-3"
        >
          {/* Header */}
          <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-zinc-800">
            <div className="flex items-center space-x-2">
              <ShieldCheck className="w-4 h-4 text-emerald-500" />
              <span className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-zinc-300">
                Enterprise SLA Overview
              </span>
              {onRefresh && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onRefresh();
                  }}
                  aria-label="Refresh SLA metrics"
                  className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-zinc-200 transition-colors"
                >
                  <RefreshCw className="w-3 h-3" />
                </button>
              )}
            </div>
            <span
              data-testid="sla-30d-summary"
              className={cn(
                "text-xs font-bold font-mono px-2 py-0.5 rounded-full",
                state.uptime30DaysPercent >= 99.9
                  ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                  : "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
              )}
            >
              {state.uptime30DaysPercent.toFixed(3)}% 30d
            </span>
          </div>

          {/* Infrastructure Metrics Overview */}
          <div className="grid grid-cols-3 gap-2 text-center py-1">
            <div className="p-2 rounded-xl bg-slate-50 dark:bg-zinc-800/60 border border-slate-100 dark:border-zinc-700/40">
              <div className="text-[10px] text-slate-500 dark:text-zinc-400">Current P50</div>
              <div className="text-xs font-bold font-mono text-indigo-600 dark:text-indigo-400">
                {state.p50}ms
              </div>
            </div>
            <div className="p-2 rounded-xl bg-slate-50 dark:bg-zinc-800/60 border border-slate-100 dark:border-zinc-700/40">
              <div className="text-[10px] text-slate-500 dark:text-zinc-400">Tail P95</div>
              <div className="text-xs font-bold font-mono text-purple-600 dark:text-purple-400">
                {state.p95}ms
              </div>
            </div>
            <div className="p-2 rounded-xl bg-slate-50 dark:bg-zinc-800/60 border border-slate-100 dark:border-zinc-700/40">
              <div className="text-[10px] text-slate-500 dark:text-zinc-400">Ledger Block</div>
              <div className="text-xs font-bold font-mono text-emerald-600 dark:text-emerald-400">
                #{state.blockHeight}
              </div>
            </div>
          </div>

          {/* 30-Day Timeline Visualizer */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-zinc-400 font-medium">
              <span>30 Days Ago</span>
              <span className="font-semibold text-slate-700 dark:text-zinc-300">
                Uptime: {state.uptime30DaysPercent.toFixed(2)}%
              </span>
              <span>Today</span>
            </div>

            {/* 30 Uptime Day Bars */}
            <div
              data-testid="sla-30d-timeline"
              className="flex items-center gap-[2px] h-6 w-full p-1 rounded-lg bg-slate-100 dark:bg-zinc-800"
            >
              {state.dailyUptimeHistory.slice(-30).map((day, idx) => {
                const isOptimal = day.uptimePercent >= 99.9;
                const isWarning = day.uptimePercent >= 98.0 && day.uptimePercent < 99.9;
                const barColor = isOptimal
                  ? "bg-emerald-500 hover:bg-emerald-400"
                  : isWarning
                    ? "bg-amber-500 hover:bg-amber-400"
                    : "bg-rose-500 hover:bg-rose-400";

                return (
                  <div
                    key={day.date}
                    data-testid={`sla-day-bar-${idx}`}
                    title={`${day.date}: ${day.uptimePercent.toFixed(2)}% uptime (${day.incidentCount} incidents)`}
                    className={cn(
                      "flex-1 h-full rounded-[2px] transition-all cursor-help",
                      barColor,
                    )}
                  />
                );
              })}
            </div>
          </div>

          {/* Active Endpoint & SLA Tier Description */}
          <div className="text-[11px] text-slate-500 dark:text-zinc-400 pt-1 space-y-1 border-t border-slate-100 dark:border-zinc-800">
            <div className="flex items-center justify-between">
              <span>Active Endpoint:</span>
              <span className="font-mono text-slate-700 dark:text-zinc-300 truncate max-w-[170px]" title={state.activeEndpoint}>
                {state.activeEndpoint.replace("https://", "")}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span>SLA Target:</span>
              <span className="text-emerald-600 dark:text-emerald-400 font-semibold">&gt; 99.9% Uptime</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
