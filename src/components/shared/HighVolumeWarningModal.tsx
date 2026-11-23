import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { AlertTriangle, ShieldAlert } from "lucide-react";
import { evaluateTransactionVolume } from "../../lib/transactionVolumeThreshold";

export interface HighVolumeWarningModalProps {
  isOpen: boolean;
  amount: number;
  baselineVolume?: number;
  asset?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export const HighVolumeWarningModal: React.FC<HighVolumeWarningModalProps> = ({
  isOpen,
  amount,
  baselineVolume,
  asset = "XLM",
  onConfirm,
  onCancel,
}) => {
  const [isAcknowledged, setIsAcknowledged] = useState(false);

  const evaluation = evaluateTransactionVolume(amount, baselineVolume);

  const handleCancel = () => {
    setIsAcknowledged(false);
    onCancel();
  };

  const handleConfirm = () => {
    if (!isAcknowledged) return;
    setIsAcknowledged(false);
    onConfirm();
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
        <motion.div
          role="dialog"
          aria-modal="true"
          aria-labelledby="volume-warning-title"
          aria-describedby="volume-warning-desc"
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          className="relative w-full max-w-lg bg-white dark:bg-zinc-900 border border-amber-300 dark:border-amber-800/60 rounded-2xl shadow-2xl p-6 z-10 space-y-4"
        >
          <div className="flex items-start space-x-3 pb-3 border-b border-slate-100 dark:border-zinc-800">
            <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400">
              <ShieldAlert className="w-6 h-6" />
            </div>
            <div>
              <h3 id="volume-warning-title" className="text-lg font-bold text-zinc-900 dark:text-zinc-100">
                High-Value Transaction Warning
              </h3>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Fraud & Anomaly Detection Guard
              </p>
            </div>
          </div>

          <div
            id="volume-warning-desc"
            className="p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/40 text-amber-800 dark:text-amber-300 text-sm space-y-2"
          >
            <div className="flex items-center space-x-2 font-semibold">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>Unusual Transaction Volume Detected</span>
            </div>
            <p className="text-xs leading-relaxed">
              {evaluation.warningMessage ||
                `You are attempting to submit a transaction of ${amount.toLocaleString()} ${asset}, which exceeds standard safety limits.`}
            </p>
          </div>

          <div className="bg-slate-50 dark:bg-zinc-800/50 p-3 rounded-lg border border-slate-200 dark:border-zinc-700/60 space-y-1 text-xs">
            <div className="flex justify-between text-zinc-600 dark:text-zinc-400">
              <span>Attempted Amount:</span>
              <strong className="text-zinc-900 dark:text-zinc-100 font-mono">
                {amount.toLocaleString()} {asset}
              </strong>
            </div>
            {baselineVolume && (
              <div className="flex justify-between text-zinc-600 dark:text-zinc-400">
                <span>Baseline Normal Volume:</span>
                <span className="text-zinc-900 dark:text-zinc-100 font-mono">
                  {baselineVolume.toLocaleString()} {asset}
                </span>
              </div>
            )}
            <div className="flex justify-between text-zinc-600 dark:text-zinc-400">
              <span>Threshold Standard:</span>
              <span className="text-zinc-900 dark:text-zinc-100 font-mono">50,000 XLM or 10x baseline</span>
            </div>
          </div>

          {/* Required Checkbox Confirmation */}
          <div className="pt-2">
            <label className="flex items-start space-x-3 cursor-pointer group">
              <input
                type="checkbox"
                checked={isAcknowledged}
                onChange={(e) => setIsAcknowledged(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-slate-300 text-amber-600 focus:ring-amber-500 cursor-pointer"
                aria-label="I understand this is a high-value transaction"
              />
              <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200 select-none">
                I understand this is a high-value transaction
              </span>
            </label>
          </div>

          <div className="pt-4 border-t border-slate-100 dark:border-zinc-800 flex items-center justify-end space-x-3">
            <button
              type="button"
              onClick={handleCancel}
              className="px-4 py-2 text-sm font-medium rounded-lg text-zinc-700 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-800 transition"
            >
              Cancel Transaction
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={!isAcknowledged}
              className="px-4 py-2 text-sm font-semibold rounded-lg text-white bg-amber-600 hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
            >
              Confirm &amp; Proceed
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
