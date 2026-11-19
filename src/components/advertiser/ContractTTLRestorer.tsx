import React, { useState, useEffect } from "react";
import {
  fetchContractInstanceTTL,
  extendContractInstanceTTL,
  simulateExtendContractTTL,
  DEFAULT_EXTEND_LEDGERS,
  WARNING_TTL_THRESHOLD_LEDGERS,
  type ContractTTLInfo,
} from "../../lib/contractTTL";
import { ContractTTLBadge } from "./ContractTTLBadge";
import { Button } from "../ui/button";
import { Card, CardContent } from "../ui/card";
import { useWeb3 } from "../../hooks/useWeb3";
import { useNotification } from "../../context/NotificationContext";
import { Clock, Sparkles, Loader2, RefreshCw, AlertOctagon } from "lucide-react";

interface ContractTTLRestorerProps {
  contractAddress: string;
  campaignName?: string;
  onExtended?: (newTTL: ContractTTLInfo) => void;
  className?: string;
}

export const ContractTTLRestorer: React.FC<ContractTTLRestorerProps> = ({
  contractAddress,
  campaignName,
  onExtended,
  className = "",
}) => {
  const { userAddress, connectorType } = useWeb3();
  const { showNotification } = useNotification();
  const [ttlInfo, setTtlInfo] = useState<ContractTTLInfo | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [extending, setExtending] = useState<boolean>(false);
  const [simulationStatus, setSimulationStatus] = useState<string | null>(null);
  const [extendTargetLedgers, setExtendTargetLedgers] = useState<number>(DEFAULT_EXTEND_LEDGERS);

  const refreshTTL = () => {
    setLoading(true);
    fetchContractInstanceTTL(contractAddress)
      .then((info) => {
        setTtlInfo(info);
      })
      .catch((err: unknown) => {
        console.error("Failed to load contract TTL:", err);
      })
      .finally(() => {
        setLoading(false);
      });
  };

  useEffect(() => {
    let isMounted = true;
    fetchContractInstanceTTL(contractAddress)
      .then((info) => {
        if (isMounted) {
          setTtlInfo(info);
          setLoading(false);
        }
      })
      .catch((err: unknown) => {
        console.error("Failed to load contract TTL:", err);
        if (isMounted) {
          setLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [contractAddress]);

  const handleExtendTTL = async () => {
    if (!contractAddress) return;
    setExtending(true);
    setSimulationStatus("Simulating Soroban state rent extension...");

    try {
      const sim = await simulateExtendContractTTL(
        contractAddress,
        userAddress || "GDX7...MOCK",
        extendTargetLedgers,
      );
      if (!sim.canExtend && sim.error) {
        throw new Error(`Simulation failed: ${sim.error}`);
      }
      setSimulationStatus(
        `Simulation verified (Est. Fee: ${sim.estimatedFeeXlm} XLM). Submitting...`,
      );

      showNotification({
        type: "info",
        title: "Submitting TTL Extension",
        message: `Extending state rent for ${campaignName || "contract"} by ${extendTargetLedgers.toLocaleString()} ledgers (Simulated Fee: ${sim.estimatedFeeXlm} XLM)...`,
      });

      const result = await extendContractInstanceTTL({
        contractId: contractAddress,
        callerAddress: userAddress || "GDX7...MOCK",
        extendToLedgers: extendTargetLedgers,
        walletType: (connectorType as any) || "freighter",
      });

      if (result.success) {
        showNotification({
          type: "success",
          title: "Contract State Rent Extended!",
          message: `Successfully extended TTL to ledger #${result.newLiveUntil.toLocaleString()}.`,
        });

        const refreshed = await fetchContractInstanceTTL(contractAddress);
        setTtlInfo(refreshed);
        if (onExtended) onExtended(refreshed);
      }
    } catch (err: any) {
      showNotification({
        type: "error",
        title: "Extension Failed",
        message: err?.message || "Failed to extend contract state rent.",
      });
    } finally {
      setExtending(false);
      setSimulationStatus(null);
    }
  };

  if (loading && !ttlInfo) {
    return (
      <div className="flex items-center gap-2 p-3 text-sm text-muted-foreground animate-pulse">
        <Loader2 className="w-4 h-4 animate-spin" />
        <span>Checking Soroban contract state rent...</span>
      </div>
    );
  }

  if (!ttlInfo) return null;

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Alert Banner when TTL requires restoration (< 10,000 ledgers) */}
      {ttlInfo.requiresRestoration && (
        <div
          role="alert"
          aria-live="assertive"
          className="relative overflow-hidden bg-rose-500/10 border border-rose-500/30 rounded-2xl p-4 sm:p-5 text-rose-700 dark:text-rose-300 backdrop-blur-sm"
        >
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-xl bg-rose-500/20 text-rose-500 flex-shrink-0 mt-0.5">
                <AlertOctagon className="w-5 h-5 animate-pulse" />
              </div>
              <div>
                <h4 className="font-bold text-sm sm:text-base flex items-center gap-2">
                  Action Required: Contract State Rent Low
                  <span className="text-xs px-2 py-0.5 rounded-full bg-rose-500/20 font-mono">
                    {ttlInfo.remainingLedgers.toLocaleString()} ledgers left
                  </span>
                </h4>
                <p className="text-xs sm:text-sm text-rose-600/90 dark:text-rose-300/90 mt-1 max-w-xl">
                  Contract instance {campaignName ? `for "${campaignName}"` : ""} has dropped below
                  the 10,000 ledgers threshold (~{ttlInfo.estimatedHumanDuration}). Without
                  restoration, state will be archived by the Soroban network.
                </p>
              </div>
            </div>

            <Button
              onClick={handleExtendTTL}
              disabled={extending}
              className="w-full sm:w-auto bg-rose-600 hover:bg-rose-500 text-white font-bold rounded-xl shadow-lg shadow-rose-600/20 px-5 py-2.5 flex items-center justify-center gap-2 flex-shrink-0 transition-transform active:scale-95"
            >
              {extending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Restoring...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  <span>Restore Lifetime (+500k ledgers)</span>
                </>
              )}
            </Button>
          </div>
        </div>
      )}

      {/* Warning Banner when TTL dips below 50,000 ledgers but not yet critical */}
      {!ttlInfo.requiresRestoration && ttlInfo.remainingLedgers < WARNING_TTL_THRESHOLD_LEDGERS && (
        <div
          role="alert"
          aria-live="polite"
          className="relative overflow-hidden bg-amber-500/10 border border-amber-500/30 rounded-2xl p-4 sm:p-5 text-amber-800 dark:text-amber-300 backdrop-blur-sm"
        >
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-xl bg-amber-500/20 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5">
                <Clock className="w-5 h-5 animate-pulse" />
              </div>
              <div>
                <h4 className="font-bold text-sm sm:text-base flex items-center gap-2">
                  TTL Warning: Extension Recommended
                  <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/20 font-mono">
                    {ttlInfo.remainingLedgers.toLocaleString()} ledgers remaining
                  </span>
                </h4>
                <p className="text-xs sm:text-sm text-amber-700/90 dark:text-amber-300/90 mt-1 max-w-xl">
                  Contract storage lifetime has dropped below 50,000 ledgers (~
                  {ttlInfo.estimatedHumanDuration}). Trigger a 1-click extension now to guarantee
                  uninterrupted escrow operations.
                </p>
              </div>
            </div>

            <Button
              onClick={handleExtendTTL}
              disabled={extending}
              data-testid="btn-extend-warning-ttl"
              className="w-full sm:w-auto bg-amber-600 hover:bg-amber-500 text-white font-bold rounded-xl shadow-lg shadow-amber-600/20 px-5 py-2.5 flex items-center justify-center gap-2 flex-shrink-0"
            >
              {extending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Extending...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  <span>Extend TTL Now (+500k ledgers)</span>
                </>
              )}
            </Button>
          </div>
        </div>
      )}
      <Card className="border border-slate-200 dark:border-zinc-800 bg-white/70 dark:bg-zinc-900/70 backdrop-blur-md rounded-2xl overflow-hidden shadow-sm">
        <CardContent className="p-5">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-indigo-500" />
                <h4 className="text-sm font-bold text-zinc-900 dark:text-white">
                  Contract State Archival & Rent (TTL)
                </h4>
                <ContractTTLBadge
                  status={ttlInfo.status}
                  remainingLedgers={ttlInfo.remainingLedgers}
                  durationText={ttlInfo.estimatedHumanDuration}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Soroban Network Ledger #{ttlInfo.latestLedger.toLocaleString()} &bull; Live until
                Ledger #{ttlInfo.liveUntilLedgerSeq.toLocaleString()} (~
                {ttlInfo.estimatedHumanDuration})
              </p>
            </div>

            <div className="flex items-center gap-2 w-full md:w-auto">
              <select
                aria-label="Extension duration"
                value={extendTargetLedgers}
                onChange={(e) => setExtendTargetLedgers(Number(e.target.value))}
                className="bg-slate-100 dark:bg-zinc-800 border border-slate-300 dark:border-zinc-700 rounded-xl px-3 py-2 text-xs font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value={100000}>+100,000 ledgers (~5.8 days)</option>
                <option value={250000}>+250,000 ledgers (~14.5 days)</option>
                <option value={500000}>+500,000 ledgers (~28.9 days)</option>
              </select>

              <Button
                onClick={handleExtendTTL}
                disabled={extending}
                data-testid="btn-1click-extend"
                variant="outline"
                className="border-indigo-500/30 hover:bg-indigo-50 dark:hover:bg-indigo-950/30 text-indigo-600 dark:text-indigo-400 font-semibold rounded-xl text-xs px-4 py-2 flex items-center gap-1.5"
              >
                {extending ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Sparkles className="w-3.5 h-3.5" />
                )}
                <span>1-Click Extend</span>
              </Button>

              <Button
                onClick={refreshTTL}
                disabled={loading || extending}
                variant="ghost"
                size="sm"
                className="p-2 h-8 w-8 text-muted-foreground hover:text-foreground rounded-lg"
                title="Refresh TTL"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
              </Button>
            </div>
          </div>

          {simulationStatus && (
            <div
              data-testid="ttl-simulation-feedback"
              className="mt-3 p-2.5 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800 text-xs text-indigo-700 dark:text-indigo-300 flex items-center gap-2"
            >
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              <span>{simulationStatus}</span>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
