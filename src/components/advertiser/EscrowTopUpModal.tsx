import React, { useState, useEffect, useCallback, useRef } from "react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Card, CardContent } from "../ui/card";
import { useWeb3 } from "../../hooks/useWeb3";
import { useNotification } from "../../context/NotificationContext";
import { SAC_TOKENS } from "../../config/stellar";
import type { SACTokenSymbol } from "../../config/stellar";
import type { SACSimulationFeedback, AllowanceCheckResult } from "../../lib/stellar";
import {
  ShieldCheck,
  ArrowRight,
  Zap,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Coins,
  Cpu,
  Database,
  X,
  FileCheck,
} from "lucide-react";

interface EscrowTopUpModalProps {
  campaignId: number;
  campaignName: string;
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export const EscrowTopUpModal: React.FC<EscrowTopUpModalProps> = ({
  campaignId,
  campaignName,
  isOpen,
  onClose,
  onSuccess,
}) => {
  const { checkTopUpAllowance, simulateApprove, approveTokenAllowance, topUpCampaignEscrow } =
    useWeb3();
  const { showNotification } = useNotification();

  const [selectedToken, setSelectedToken] = useState<SACTokenSymbol>("USDC");
  const [topUpAmount, setTopUpAmount] = useState<string>("500");
  const [allowanceCheck, setAllowanceCheck] = useState<AllowanceCheckResult | null>(null);
  const [simulationFeedback, setSimulationFeedback] = useState<SACSimulationFeedback | null>(null);

  const [isCheckingAllowance, setIsCheckingAllowance] = useState(false);
  const [isSimulating, setIsSimulating] = useState(false);
  const [isApproving, setIsApproving] = useState(false);
  const [isSubmittingTopUp, setIsSubmittingTopUp] = useState(false);
  const checkCounterRef = useRef(0);

  // Automated allowance verification with debouncing and discarding superseded results
  const runAllowanceCheck = useCallback(async () => {
    const checkId = ++checkCounterRef.current;
    const amountNum = parseFloat(topUpAmount);
    if (!amountNum || amountNum <= 0) {
      setAllowanceCheck(null);
      setSimulationFeedback(null);
      return;
    }

    setIsCheckingAllowance(true);
    try {
      const result = await checkTopUpAllowance(amountNum, selectedToken);
      if (checkId !== checkCounterRef.current) return;
      setAllowanceCheck(result);

      // If allowance insufficient, automatically simulate approval so user sees simulation feedback upfront!
      if (!result.isSufficient) {
        setIsSimulating(true);
        try {
          const sim = await simulateApprove(amountNum, selectedToken);
          if (checkId !== checkCounterRef.current) return;
          setSimulationFeedback(sim);
        } finally {
          if (checkId === checkCounterRef.current) {
            setIsSimulating(false);
          }
        }
      } else {
        setSimulationFeedback(null);
      }
    } catch (err) {
      console.warn("Could not check allowance:", err);
    } finally {
      if (checkId === checkCounterRef.current) {
        setIsCheckingAllowance(false);
      }
    }
  }, [topUpAmount, selectedToken, checkTopUpAllowance, simulateApprove]);

  useEffect(() => {
    if (!isOpen) return;

    const timer = setTimeout(() => {
      runAllowanceCheck();
    }, 300);

    return () => {
      clearTimeout(timer);
    };
  }, [isOpen, runAllowanceCheck]);

  if (!isOpen) return null;

  // Execute SAC Approve Delegation
  const handleApproveDelegation = async () => {
    const amountNum = parseFloat(topUpAmount);
    if (!amountNum || amountNum <= 0) return;

    setIsApproving(true);
    try {
      showNotification({
        type: "info",
        title: "Approving SAC Delegation",
        message: `Submitting approval for ${amountNum} ${selectedToken} to StormSale Escrow...`,
      });

      const res = await approveTokenAllowance(amountNum, selectedToken);
      setSimulationFeedback(res.simulationFeedback);

      showNotification({
        type: "success",
        title: "Allowance Approved!",
        message: `Escrow contract authorized to spend ${amountNum} ${selectedToken}. Tx: ${res.txHash.slice(0, 10)}...`,
      });

      // Re-verify allowance
      await runAllowanceCheck();
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : "Failed to approve SAC delegation.";
      console.error("SAC approval error:", err);
      showNotification({
        type: "error",
        title: "Approval Failed",
        message: errorMsg,
      });
    } finally {
      setIsApproving(false);
    }
  };

  // Execute Escrow Top-Up
  const handleConfirmTopUp = async () => {
    const amountNum = parseFloat(topUpAmount);
    if (!amountNum || amountNum <= 0) return;

    setIsSubmittingTopUp(true);
    try {
      showNotification({
        type: "info",
        title: "Executing Escrow Top-Up",
        message: `Depositing ${amountNum} ${selectedToken} into Campaign #${campaignId}...`,
      });

      const res = await topUpCampaignEscrow(campaignId, amountNum, selectedToken);

      showNotification({
        type: "success",
        title: "Escrow Top-Up Complete!",
        message: `Added ${amountNum} ${selectedToken} to escrow budget. Tx: ${res.txHash.slice(0, 10)}...`,
      });

      if (onSuccess) onSuccess();
      onClose();
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : "Failed to top up campaign escrow.";
      console.error("Top-up error:", err);
      showNotification({
        type: "error",
        title: "Top-Up Failed",
        message: errorMsg,
      });
    } finally {
      setIsSubmittingTopUp(false);
    }
  };

  const amountNum = parseFloat(topUpAmount) || 0;
  const isAllowanceSufficient = allowanceCheck ? allowanceCheck.isSufficient : false;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-3xl shadow-2xl overflow-hidden p-6 md:p-8">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-6 right-6 p-2 rounded-full text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Modal Header */}
        <div className="flex items-center gap-3 mb-6">
          <div className="w-12 h-12 rounded-2xl bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-100 dark:border-indigo-500/20 flex items-center justify-center text-indigo-600 dark:text-indigo-400 shadow-sm">
            <Coins className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-xl font-extrabold text-zinc-900 dark:text-white">
              Top Up Campaign Escrow
            </h3>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 font-medium">
              Campaign #{campaignId}: {campaignName}
            </p>
          </div>
        </div>

        {/* Token Selector & Amount Form */}
        <div className="space-y-4 mb-6">
          <div>
            <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider mb-2">
              Select Soroban Asset Contract (SAC)
            </label>
            <div className="grid grid-cols-3 gap-2">
              {(Object.keys(SAC_TOKENS) as SACTokenSymbol[]).map((sym) => (
                <button
                  key={sym}
                  type="button"
                  onClick={() => setSelectedToken(sym)}
                  className={`flex flex-col items-center justify-center py-2.5 px-3 rounded-xl border text-xs font-bold transition-all ${
                    selectedToken === sym
                      ? "border-indigo-600 dark:border-indigo-500 bg-indigo-50/50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 shadow-xs"
                      : "border-slate-200 dark:border-zinc-800 bg-slate-50/50 dark:bg-zinc-950/50 text-zinc-600 dark:text-zinc-400 hover:border-slate-300"
                  }`}
                >
                  <span className="text-sm font-black">{sym}</span>
                  <span className="text-[10px] opacity-70 font-normal">
                    {sym === "XLM" ? "Native SAC" : SAC_TOKENS[sym].name}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="flex justify-between items-center mb-1.5">
              <label className="text-xs font-bold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider">
                Top-Up Amount
              </label>
              {allowanceCheck && (
                <span className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
                  Current Allowance:{" "}
                  <strong className="text-zinc-800 dark:text-zinc-200">
                    {allowanceCheck.currentAllowanceFormatted} {selectedToken}
                  </strong>
                </span>
              )}
            </div>
            <div className="relative">
              <Input
                type="number"
                min="1"
                step="any"
                value={topUpAmount}
                onChange={(e) => setTopUpAmount(e.target.value)}
                placeholder="e.g. 500"
                className="h-12 text-base font-bold pl-4 pr-16 rounded-xl border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-950 text-zinc-900 dark:text-white"
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 font-bold text-xs text-zinc-400">
                {selectedToken}
              </span>
            </div>
          </div>
        </div>

        {/* Automated Allowance Verification Status & Simulation Feedback */}
        <div className="mb-6 space-y-3">
          {isCheckingAllowance ? (
            <div className="flex items-center gap-2 p-3.5 rounded-xl bg-slate-50 dark:bg-zinc-950/60 border border-slate-200 dark:border-zinc-800 text-xs text-zinc-500">
              <RefreshCw className="w-4 h-4 animate-spin text-indigo-500" />
              <span>Verifying SAC token allowance on Soroban ledger...</span>
            </div>
          ) : isAllowanceSufficient ? (
            <div className="flex items-center gap-2.5 p-3.5 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 text-emerald-800 dark:text-emerald-300 text-xs">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <div>
                <span className="font-bold">Allowance Verified & Sufficient</span>
                <p className="text-[11px] text-emerald-700/80 dark:text-emerald-400/80 mt-0.5">
                  StormSale Escrow is authorized to transfer {topUpAmount} {selectedToken}.
                </p>
              </div>
            </div>
          ) : (
            <div className="p-4 rounded-2xl bg-amber-50/70 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-500/30">
              <div className="flex items-start gap-2.5 mb-3">
                <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <h5 className="font-bold text-xs text-amber-900 dark:text-amber-300">
                    SAC Allowance Delegation Required
                  </h5>
                  <p className="text-[11px] text-amber-700 dark:text-amber-400/90 mt-0.5">
                    Before escrow top-up, you must grant delegation to the StormSale Escrow
                    contract.
                  </p>
                </div>
              </div>

              {/* Transaction Simulation Feedback */}
              {isSimulating ? (
                <div className="flex items-center gap-2 text-xs text-amber-700 dark:text-amber-400 p-2 animate-pulse">
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  Simulating SAC approve transaction footprint & fee...
                </div>
              ) : simulationFeedback ? (
                <Card className="bg-white/80 dark:bg-zinc-900/80 border border-amber-200/80 dark:border-amber-500/20 rounded-xl overflow-hidden shadow-2xs mb-3">
                  <div className="px-3.5 py-2 bg-amber-100/50 dark:bg-amber-500/10 border-b border-amber-200/50 dark:border-amber-500/10 flex items-center justify-between text-[11px]">
                    <span className="font-bold text-amber-900 dark:text-amber-300 flex items-center gap-1.5">
                      <FileCheck className="w-3.5 h-3.5 text-amber-600" />
                      Transaction Simulation Feedback
                    </span>
                    {simulationFeedback.success ? (
                      <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300 font-bold text-[10px]">
                        Simulation Passed
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-full bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300 font-bold text-[10px]">
                        Simulation Failed
                      </span>
                    )}
                  </div>

                  {simulationFeedback.error && (
                    <div className="px-3.5 py-1.5 bg-rose-50 dark:bg-rose-950/20 text-rose-700 dark:text-rose-300 text-[10px] font-medium border-b border-rose-200 dark:border-rose-800/40">
                      {simulationFeedback.error}
                    </div>
                  )}

                  <CardContent className="p-3 grid grid-cols-2 gap-2 text-[11px]">
                    <div className="flex items-center gap-2">
                      <Zap className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                      <div>
                        <div className="text-zinc-400 text-[10px]">Resource Fee</div>
                        <div className="font-mono font-bold text-zinc-800 dark:text-zinc-200">
                          {simulationFeedback.minResourceFee}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <Cpu className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                      <div>
                        <div className="text-zinc-400 text-[10px]">CPU Instructions</div>
                        <div className="font-mono font-bold text-zinc-800 dark:text-zinc-200">
                          {simulationFeedback.cpuInstructions}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <Database className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                      <div>
                        <div className="text-zinc-400 text-[10px]">Memory Footprint</div>
                        <div className="font-mono font-bold text-zinc-800 dark:text-zinc-200">
                          {simulationFeedback.memoryBytes}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <ShieldCheck className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                      <div>
                        <div className="text-zinc-400 text-[10px]">Approval Amount</div>
                        <div className="font-bold text-zinc-800 dark:text-zinc-200">
                          {simulationFeedback.amountAuthorized}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ) : null}

              {/* Approve Delegation Button */}
              <Button
                onClick={handleApproveDelegation}
                disabled={isApproving || amountNum <= 0}
                className="w-full h-10 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs shadow-md shadow-amber-500/20"
              >
                {isApproving ? (
                  <>
                    <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                    Authorizing in Wallet...
                  </>
                ) : (
                  <>
                    <Zap className="w-4 h-4 mr-2" />
                    Authorize SAC Delegation ({topUpAmount} {selectedToken})
                  </>
                )}
              </Button>
            </div>
          )}
        </div>

        {/* Modal Action Buttons */}
        <div className="flex gap-3">
          <Button
            variant="outline"
            onClick={onClose}
            className="flex-1 h-12 rounded-xl border border-slate-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 font-semibold"
          >
            Cancel
          </Button>

          <Button
            onClick={handleConfirmTopUp}
            disabled={!isAllowanceSufficient || isSubmittingTopUp || amountNum <= 0}
            className="flex-1 h-12 rounded-xl bg-zinc-900 hover:bg-zinc-800 dark:bg-indigo-600 dark:hover:bg-indigo-500 text-white font-bold shadow-md shadow-indigo-500/20 disabled:opacity-50"
          >
            {isSubmittingTopUp ? (
              <>
                <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                Executing Top-Up...
              </>
            ) : (
              <>
                Confirm Escrow Top-Up
                <ArrowRight className="w-4 h-4 ml-2" />
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
};
