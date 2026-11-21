import React, { useState } from "react";
import { useEscrowBalance, type EscrowTokenBalance } from "../../hooks/useEscrow";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../ui/card";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import {
  Coins,
  RefreshCw,
  Play,
  Pause,
  ExternalLink,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  Activity,
  Layers,
} from "lucide-react";
import { CONTRACT_ADDRESSES } from "../../config/contracts";
import { STELLAR_CONFIG } from "../../config/stellar";
import { formatStellarAddress } from "../../lib/stellar";

interface EscrowBalanceMonitorProps {
  contractAddress?: string;
  pollingIntervalMs?: number;
  className?: string;
  showContractSelector?: boolean;
}

const PRESET_CONTRACTS = [
  {
    name: "Primary Campaign Escrow",
    address: CONTRACT_ADDRESSES.CAMPAIGN_ESCROW,
  },
  {
    name: "Summer Sale 2026 Escrow",
    address: "CB9E88LMNPQR5TUV2WXY4444ESCROW8888STORMTESTNET2",
  },
  {
    name: "NFT Drop Alpha Escrow",
    address: "CD4M11STORM22ESCROW33SOROBAN44AFFILIATE55XLM6",
  },
];

export const EscrowBalanceMonitor: React.FC<EscrowBalanceMonitorProps> = ({
  contractAddress: initialAddress,
  pollingIntervalMs = 5000,
  className = "",
  showContractSelector = true,
}) => {
  const [selectedAddress, setSelectedAddress] = useState<string>(
    initialAddress || CONTRACT_ADDRESSES.CAMPAIGN_ESCROW,
  );

  const {
    balanceList,
    isLoading,
    isRefreshing,
    isReady,
    lastUpdated,
    error,
    isPolling,
    refetch,
    pause,
    resume,
  } = useEscrowBalance({
    contractAddress: selectedAddress,
    pollingIntervalMs,
    enabled: true,
  });

  const getAssetColor = (code: string) => {
    switch (code) {
      case "XLM":
        return {
          bg: "bg-indigo-500/10 border-indigo-500/20 text-indigo-600 dark:text-indigo-400",
          dot: "bg-indigo-500",
        };
      case "USDC":
        return {
          bg: "bg-blue-500/10 border-blue-500/20 text-blue-600 dark:text-blue-400",
          dot: "bg-blue-500",
        };
      case "EURC":
        return {
          bg: "bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-400",
          dot: "bg-emerald-500",
        };
      default:
        return {
          bg: "bg-zinc-500/10 border-zinc-500/20 text-zinc-600 dark:text-zinc-400",
          dot: "bg-zinc-500",
        };
    }
  };

  return (
    <Card
      data-testid="escrow-balance-monitor"
      className={`bg-white/90 dark:bg-zinc-900/90 backdrop-blur-xl border border-slate-200 dark:border-zinc-800 rounded-3xl shadow-md overflow-hidden ${className}`}
    >
      <CardHeader className="p-6 border-b border-slate-100 dark:border-zinc-800/80">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-indigo-500/10 rounded-2xl flex items-center justify-center border border-indigo-500/20 text-indigo-600 dark:text-indigo-400 shadow-sm">
              <Coins className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <CardTitle className="text-xl font-black text-zinc-900 dark:text-white tracking-tight">
                  Escrow Balance Contract Monitor
                </CardTitle>
                <Badge
                  variant={isPolling ? "emerald" : "amber"}
                  className="text-[10px] uppercase font-bold py-0.5 px-2 flex items-center gap-1.5"
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${isPolling ? "bg-emerald-500 animate-pulse" : "bg-zinc-400"}`}
                  />
                  {isPolling ? `Polling ${pollingIntervalMs / 1000}s` : "Paused"}
                </Badge>
              </div>
              <CardDescription className="text-xs text-muted-foreground mt-0.5">
                Real-time on-chain Soroban contract balance synchronization with multi-token
                tracking.
              </CardDescription>
            </div>
          </div>

          {/* Action Controls */}
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={isPolling ? pause : resume}
              className="rounded-xl h-9 px-3 text-xs font-semibold"
              title={isPolling ? "Pause real-time synchronization" : "Resume real-time polling"}
            >
              {isPolling ? (
                <>
                  <Pause className="w-3.5 h-3.5 mr-1.5 text-amber-500" />
                  Pause
                </>
              ) : (
                <>
                  <Play className="w-3.5 h-3.5 mr-1.5 text-emerald-500" />
                  Resume
                </>
              )}
            </Button>

            <Button
              size="sm"
              variant="outline"
              disabled={isRefreshing}
              onClick={() => void refetch()}
              className="rounded-xl h-9 px-3 text-xs font-semibold text-indigo-600 dark:text-indigo-400 border-indigo-500/30 hover:bg-indigo-50 dark:hover:bg-indigo-950/20"
              title="Trigger immediate balance refresh"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 mr-1.5 ${isRefreshing ? "animate-spin text-indigo-500" : ""}`}
              />
              {isRefreshing ? "Syncing..." : "Sync Now"}
            </Button>
          </div>
        </div>

        {/* Contract Selector & Monitored Target */}
        <div className="mt-4 pt-4 border-t border-slate-100 dark:border-zinc-800/60 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-500" />
            <span className="font-semibold text-zinc-700 dark:text-zinc-300">Contract ID:</span>
            <code className="px-2 py-0.5 rounded bg-slate-100 dark:bg-zinc-800 text-indigo-600 dark:text-indigo-400 font-mono text-[11px] font-bold">
              {formatStellarAddress(selectedAddress)}
            </code>
            <a
              href={`${STELLAR_CONFIG.explorerUrl}/contract/${selectedAddress}`}
              target="_blank"
              rel="noreferrer"
              className="text-zinc-400 hover:text-indigo-500 transition-colors"
              title="View on Stellar Expert Explorer"
            >
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>

          {showContractSelector && (
            <div className="flex items-center gap-1.5">
              <span className="text-zinc-400 text-[11px] font-medium">Switch Target:</span>
              <select
                aria-label="Select Monitored Escrow Contract"
                value={selectedAddress}
                onChange={(e) => setSelectedAddress(e.target.value)}
                className="bg-slate-100 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-lg px-2 py-1 text-[11px] font-medium text-zinc-900 dark:text-zinc-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              >
                {PRESET_CONTRACTS.map((c) => (
                  <option key={c.address} value={c.address}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      </CardHeader>

      <CardContent className="p-6">
        {error && (
          <div className="mb-4 p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>Synchronization Notice: {error}</span>
          </div>
        )}

        {/* Multi-Token Balance Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {balanceList.map((token: EscrowTokenBalance) => {
            const colors = getAssetColor(token.code);
            return (
              <div
                key={token.code}
                data-testid={`token-balance-${token.code}`}
                className="p-5 rounded-2xl border border-slate-200/80 dark:border-zinc-800 bg-slate-50/50 dark:bg-zinc-950/40 hover:border-indigo-500/30 transition-all group"
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span
                      className={`px-2.5 py-1 rounded-lg text-xs font-black border ${colors.bg}`}
                    >
                      {token.code}
                    </span>
                    <span className="text-xs font-semibold text-zinc-600 dark:text-zinc-400 truncate max-w-[110px]">
                      {token.name}
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className={`w-2 h-2 rounded-full ${colors.dot}`} />
                    <span className="text-[10px] uppercase font-bold text-zinc-400">
                      {token.decimals} dec
                    </span>
                  </div>
                </div>

                <div className="mt-2">
                  <div className="text-2xl font-black text-zinc-900 dark:text-white tracking-tight">
                    {isLoading && !isReady ? (
                      <span className="animate-pulse text-zinc-400">Loading...</span>
                    ) : (
                      token.balance
                    )}
                  </div>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1 font-medium">
                    {token.formatted}
                  </p>
                </div>

                <div className="mt-4 pt-3 border-t border-slate-200/60 dark:border-zinc-800/60 flex items-center justify-between text-[11px] text-zinc-400">
                  <span className="font-mono text-[10px] truncate max-w-[120px]">
                    {formatStellarAddress(token.contractAddress)}
                  </span>
                  <div className="flex items-center gap-1 text-emerald-500">
                    <CheckCircle2 className="w-3 h-3" />
                    <span className="text-[10px] font-semibold">Active</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer info: last sync timestamp and network details */}
        <div className="mt-6 pt-4 border-t border-slate-100 dark:border-zinc-800/60 flex flex-wrap items-center justify-between gap-2 text-xs text-zinc-400">
          <div className="flex items-center gap-2">
            <Activity className="w-3.5 h-3.5 text-indigo-500" />
            <span>
              Last synchronized:{" "}
              <strong className="text-zinc-700 dark:text-zinc-300">
                {lastUpdated ? new Date(lastUpdated).toLocaleTimeString() : "Pending"}
              </strong>
            </span>
          </div>

          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-zinc-400" />
              <span>Multi-Token Monitor:</span>
              <span className="font-bold text-zinc-700 dark:text-zinc-300">
                {balanceList.length} Assets
              </span>
            </span>
            <span className="text-zinc-300 dark:text-zinc-700">&bull;</span>
            <span className="font-semibold text-indigo-500 uppercase text-[11px]">
              {STELLAR_CONFIG.network}
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default EscrowBalanceMonitor;
