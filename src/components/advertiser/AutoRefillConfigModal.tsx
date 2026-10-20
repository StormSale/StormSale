import React, { useState } from "react";
import {
  getAutoRefillConfig,
  saveAutoRefillConfig,
  depositEscrowRefillContractCall,
  MIN_REFILL_THRESHOLD_PERCENT,
  MAX_REFILL_THRESHOLD_PERCENT,
  type AutoRefillConfig,
} from "../../lib/escrowAutoRefill";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { useWeb3 } from "../../hooks/useWeb3";
import { useNotification } from "../../context/NotificationContext";
import { Sliders, Sparkles, Loader2, X, Coins, ShieldCheck, Zap } from "lucide-react";

interface AutoRefillConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  campaignId: string;
  campaignName: string;
  currentBalanceXlm: number;
  initialBudgetXlm: number;
  onRefillComplete?: (newBalanceXlm: number) => void;
}

export const AutoRefillConfigModal: React.FC<AutoRefillConfigModalProps> = ({
  isOpen,
  onClose,
  campaignId,
  campaignName,
  currentBalanceXlm,
  initialBudgetXlm,
  onRefillComplete,
}) => {
  const { userAddress, connectorType } = useWeb3();
  const { showNotification } = useNotification();
  const [config, setConfig] = useState<AutoRefillConfig>(() => getAutoRefillConfig(campaignId));
  const [refillAmount, setRefillAmount] = useState<number>(500);
  const [isDepositing, setIsDepositing] = useState<boolean>(false);

  if (!isOpen) return null;

  const thresholdBalance = Number(((initialBudgetXlm * config.thresholdPercent) / 100).toFixed(1));

  const handleSave = () => {
    saveAutoRefillConfig(config);
    showNotification({
      type: "success",
      title: "Settings Saved",
      message: `Auto-refill threshold set to ${config.thresholdPercent}% (${thresholdBalance} XLM).`,
    });
    onClose();
  };

  const handleDepositRefill = async () => {
    if (refillAmount <= 0) return;
    setIsDepositing(true);

    try {
      showNotification({
        type: "info",
        title: "Submitting Escrow Refill",
        message: `Depositing ${refillAmount.toLocaleString()} XLM to campaign escrow...`,
      });

      const result = await depositEscrowRefillContractCall({
        campaignId,
        amountXlm: refillAmount,
        callerAddress: userAddress || "GDX7...MOCK",
        walletType: (connectorType as any) || "freighter",
      });

      if (result.success) {
        showNotification({
          type: "success",
          title: "Escrow Refilled!",
          message: `Campaign balance updated to ${result.newBalanceXlm.toLocaleString()} XLM.`,
        });

        if (onRefillComplete) {
          onRefillComplete(result.newBalanceXlm);
        }
        onClose();
      }
    } catch (err: any) {
      showNotification({
        type: "error",
        title: "Deposit Failed",
        message: err?.message || "Failed to submit escrow deposit.",
      });
    } finally {
      setIsDepositing(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
    >
      <div className="relative w-full max-w-lg overflow-hidden bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-3xl shadow-2xl p-6 sm:p-8">
        {/* Close Button */}
        <button
          type="button"
          aria-label="Close modal"
          onClick={onClose}
          className="absolute top-6 right-6 p-2 rounded-xl text-muted-foreground hover:text-foreground hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Modal Header */}
        <div className="flex items-center gap-3 mb-6">
          <div className="p-3 bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 rounded-2xl border border-indigo-500/20">
            <Sliders className="w-6 h-6" />
          </div>
          <div>
            <h3 id="modal-title" className="text-xl font-black text-zinc-900 dark:text-white">
              Escrow Auto-Refill Triggers
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Campaign: <span className="font-semibold text-foreground">{campaignName}</span>
            </p>
          </div>
        </div>

        {/* Current State Summary */}
        <div className="grid grid-cols-2 gap-3 p-4 mb-6 rounded-2xl bg-slate-50 dark:bg-zinc-950/60 border border-slate-100 dark:border-zinc-800/60">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              Current Balance
            </span>
            <p className="text-lg font-black text-foreground mt-0.5">
              {currentBalanceXlm.toLocaleString()}{" "}
              <span className="text-xs text-muted-foreground">XLM</span>
            </p>
          </div>
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              Initial Escrow Budget
            </span>
            <p className="text-lg font-black text-foreground mt-0.5">
              {initialBudgetXlm.toLocaleString()}{" "}
              <span className="text-xs text-muted-foreground">XLM</span>
            </p>
          </div>
        </div>

        {/* Threshold Slider (5% to 30%) */}
        <div className="space-y-4 mb-6">
          <div className="flex justify-between items-center">
            <Label htmlFor="threshold-slider" className="text-sm font-bold text-foreground">
              Low-Balance Warning Trigger
            </Label>
            <span className="text-sm font-black text-indigo-600 dark:text-indigo-400 bg-indigo-500/10 px-2.5 py-0.5 rounded-lg border border-indigo-500/20">
              {config.thresholdPercent}% ({thresholdBalance} XLM)
            </span>
          </div>

          <input
            id="threshold-slider"
            type="range"
            min={MIN_REFILL_THRESHOLD_PERCENT}
            max={MAX_REFILL_THRESHOLD_PERCENT}
            step={1}
            value={config.thresholdPercent}
            onChange={(e) => setConfig({ ...config, thresholdPercent: Number(e.target.value) })}
            className="w-full h-2 bg-slate-200 dark:bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-indigo-600"
          />

          <div className="flex justify-between text-[11px] font-medium text-muted-foreground">
            <span>Min: 5%</span>
            <span>Default: 15%</span>
            <span>Max: 30%</span>
          </div>

          {/* Preset Buttons */}
          <div className="flex gap-2 pt-1">
            {[10, 15, 20, 25, 30].map((pct) => (
              <button
                key={pct}
                type="button"
                onClick={() => setConfig({ ...config, thresholdPercent: pct })}
                className={`flex-1 py-1.5 rounded-xl text-xs font-semibold border transition-all ${
                  config.thresholdPercent === pct
                    ? "bg-indigo-600 border-indigo-600 text-white shadow-sm"
                    : "bg-slate-50 dark:bg-zinc-800/50 border-slate-200 dark:border-zinc-700 text-foreground hover:bg-slate-100 dark:hover:bg-zinc-800"
                }`}
              >
                {pct}%
              </button>
            ))}
          </div>
        </div>

        {/* 1-Click Instant Refill Top-up */}
        <div className="p-4 rounded-2xl border border-indigo-500/20 bg-indigo-50/50 dark:bg-indigo-950/20 space-y-3 mb-6">
          <div className="flex items-center gap-2 text-xs font-bold text-indigo-600 dark:text-indigo-400">
            <Zap className="w-4 h-4" />
            <span>Instant Top-Up Deposit</span>
          </div>

          <div className="flex items-center gap-3">
            <div className="relative flex-1">
              <Coins className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                type="number"
                min={10}
                value={refillAmount}
                onChange={(e) => setRefillAmount(Math.max(1, Number(e.target.value)))}
                placeholder="Amount in XLM"
                className="pl-9 h-11 rounded-xl bg-white dark:bg-zinc-900 font-semibold"
              />
            </div>

            <Button
              type="button"
              disabled={isDepositing || refillAmount <= 0}
              onClick={handleDepositRefill}
              className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold h-11 px-5 rounded-xl flex items-center gap-2 shadow-md shadow-indigo-600/25"
            >
              {isDepositing ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Sparkles className="w-4 h-4" />
              )}
              <span>Deposit Now</span>
            </Button>
          </div>
        </div>

        {/* Modal Action Buttons */}
        <div className="flex gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            className="flex-1 rounded-2xl h-12 font-semibold"
          >
            Cancel
          </Button>

          <Button
            type="button"
            onClick={handleSave}
            className="flex-1 bg-zinc-900 hover:bg-zinc-800 dark:bg-white dark:hover:bg-slate-100 text-white dark:text-zinc-900 font-bold rounded-2xl h-12 shadow-sm"
          >
            <ShieldCheck className="w-4 h-4 mr-2" />
            Save Threshold
          </Button>
        </div>
      </div>
    </div>
  );
};
