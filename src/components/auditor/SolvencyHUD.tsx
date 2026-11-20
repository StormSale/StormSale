/**
 * src/components/auditor/SolvencyHUD.tsx
 *
 * Real-Time Protocol Solvency Proof & Total Value Locked (TVL) Oracle HUD (Issue #81).
 */
import React, { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import {
  ShieldCheck,
  ShieldAlert,
  Coins,
  Activity,
  Lock,
  Layers,
  CheckCircle2,
} from "lucide-react";
import {
  fetchProtocolSolvencyProof,
  subscribeToLedgerSolvencyUpdates,
  type SolvencyProofResult,
} from "../../lib/solvencyOracle";
import { SkeletonMetric, SkeletonWidget } from "../ui/skeleton";

export interface SolvencyHUDProps {
  className?: string;
  autoRefresh?: boolean;
}

export const SolvencyHUD: React.FC<SolvencyHUDProps> = ({ className, autoRefresh = true }) => {
  const [proof, setProof] = useState<SolvencyProofResult | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());
  const [pulse, setPulse] = useState(false);

  useEffect(() => {
    if (!autoRefresh) {
      setProof(fetchProtocolSolvencyProof());
      return;
    }

    const unsubscribe = subscribeToLedgerSolvencyUpdates((updated) => {
      setProof(updated);
      setLastUpdate(new Date());
      setPulse(true);
      const timer = setTimeout(() => setPulse(false), 800);
      return () => clearTimeout(timer);
    }, 5000);

    return unsubscribe;
  }, [autoRefresh]);

  if (!proof) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <SkeletonMetric />
          <SkeletonMetric />
          <SkeletonMetric />
          <SkeletonMetric />
        </div>
        <SkeletonWidget height="h-64" />
      </div>
    );
  }

  return (
    <div className={`space-y-6 ${className || ""}`}>
      {/* Real-time Ledger Header Status */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-xl border border-slate-200 dark:border-zinc-800 bg-white/70 dark:bg-zinc-900/70 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="relative">
            <span
              className={`w-3 h-3 rounded-full inline-block ${
                pulse ? "bg-indigo-400 scale-125" : "bg-emerald-500"
              } transition-all duration-300`}
            />
            <span className="animate-ping absolute inset-0 w-3 h-3 rounded-full bg-emerald-400 opacity-75" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-zinc-900 dark:text-zinc-100 uppercase tracking-wider">
                Live Soroban Protocol Solvency Proof
              </span>
              <span className="text-[11px] font-mono text-zinc-500 dark:text-zinc-400">
                Ledger #{proof.ledgerSequence}
              </span>
            </div>
            <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
              Synced with Soroban contract storage. Closed at {lastUpdate.toLocaleTimeString()}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div
            className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-extrabold border ${
              proof.isSolvent
                ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30"
                : "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/30"
            }`}
          >
            {proof.isSolvent ? (
              <ShieldCheck className="w-4 h-4 text-emerald-500" />
            ) : (
              <ShieldAlert className="w-4 h-4 text-rose-500" />
            )}
            <span>{proof.isSolvent ? "SOLVENT (Reserves >= Liabilities)" : "DEFICIT WARNING"}</span>
          </div>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Value Locked (TVL in USD & XLM) */}
        <Card className="border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-xs">
          <CardHeader className="pb-2">
            <CardDescription className="text-xs font-medium flex items-center justify-between">
              <span>Total Value Locked (TVL)</span>
              <Coins className="w-4 h-4 text-indigo-500" />
            </CardDescription>
            <CardTitle className="text-2xl font-black text-zinc-900 dark:text-zinc-100">
              ${proof.tvlUsd.toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <p className="text-xs font-mono text-zinc-500 dark:text-zinc-400">
              {proof.tvlXlm.toLocaleString()} XLM
            </p>
          </CardContent>
        </Card>

        {/* Total Escrow Reserves (Assets) */}
        <Card className="border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-xs">
          <CardHeader className="pb-2">
            <CardDescription className="text-xs font-medium flex items-center justify-between">
              <span>Escrow Vault Reserves</span>
              <Lock className="w-4 h-4 text-emerald-500" />
            </CardDescription>
            <CardTitle className="text-2xl font-black text-emerald-600 dark:text-emerald-400">
              {proof.totalEscrowReservesXlm.toLocaleString()} XLM
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Active campaign escrow storage
            </p>
          </CardContent>
        </Card>

        {/* Total Outstanding Claims (Liabilities) */}
        <Card className="border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-xs">
          <CardHeader className="pb-2">
            <CardDescription className="text-xs font-medium flex items-center justify-between">
              <span>Pending Affiliate Claims</span>
              <Layers className="w-4 h-4 text-amber-500" />
            </CardDescription>
            <CardTitle className="text-2xl font-black text-amber-600 dark:text-amber-400">
              {proof.totalOutstandingClaimsXlm.toLocaleString()} XLM
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Clearing window settlement claims
            </p>
          </CardContent>
        </Card>

        {/* Solvency Ratio */}
        <Card className="border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-xs">
          <CardHeader className="pb-2">
            <CardDescription className="text-xs font-medium flex items-center justify-between">
              <span>Solvency Ratio</span>
              <Activity className="w-4 h-4 text-indigo-500" />
            </CardDescription>
            <CardTitle className="text-2xl font-black text-indigo-600 dark:text-indigo-400">
              {proof.solvencyRatioPercentage}%
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <p className="text-xs text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5" /> +{proof.netSurplusXlm.toLocaleString()} XLM
              Reserve Buffer
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Proof Hash & Campaign Breakdown Table */}
      <Card className="border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-xs">
        <CardHeader className="pb-3 border-b border-slate-200 dark:border-zinc-800">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <CardTitle className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                Audited Escrow Vaults vs. Clearing Windows
              </CardTitle>
              <CardDescription className="text-xs">
                Verifiable cryptographic state snapshot from contract balance keys.
              </CardDescription>
            </div>
            <div className="text-[11px] font-mono text-zinc-500 dark:text-zinc-400 bg-slate-100 dark:bg-zinc-800/60 px-2.5 py-1 rounded">
              Proof Hash: {proof.cryptographicProofHash}
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 dark:bg-zinc-950/60 text-zinc-500 dark:text-zinc-400 uppercase font-semibold border-b border-slate-200 dark:border-zinc-800">
                <tr>
                  <th className="px-4 py-3">Campaign</th>
                  <th className="px-4 py-3">Vault Address</th>
                  <th className="px-4 py-3 text-right">Escrow Reserves</th>
                  <th className="px-4 py-3 text-right">Pending Claims</th>
                  <th className="px-4 py-3 text-right">Clearing Window</th>
                  <th className="px-4 py-3 text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-zinc-800/60">
                {proof.campaignBreakdown.map((row) => (
                  <tr
                    key={row.campaignId}
                    className="hover:bg-slate-50/50 dark:hover:bg-zinc-800/30"
                  >
                    <td className="px-4 py-3 font-medium text-zinc-900 dark:text-zinc-100">
                      {row.campaignName}
                    </td>
                    <td className="px-4 py-3 font-mono text-zinc-500">{row.escrowAddress}</td>
                    <td className="px-4 py-3 text-right font-mono text-emerald-600 dark:text-emerald-400 font-bold">
                      {row.escrowReserveXlm.toLocaleString()} XLM
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-amber-600 dark:text-amber-400 font-medium">
                      {row.pendingClaimsXlm.toLocaleString()} XLM
                    </td>
                    <td className="px-4 py-3 text-right text-zinc-500">
                      {row.clearingWindowDays} days
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-500">
                        {row.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
