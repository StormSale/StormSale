import React, { useState } from "react";
import { AlertTriangle, X, ShieldAlert, ArrowDownLeft } from "lucide-react";
import {
  type BatchSaleState,
  calculateBatchRefund,
  validateCancellationConfirmation,
} from "../../lib/batchCancelRefund";

export interface BatchCancelConfirmationModalProps {
  isOpen: boolean;
  batch: BatchSaleState | null;
  onClose: () => void;
  onConfirmCancel: (batch: BatchSaleState, typedName: string) => Promise<void>;
  isSubmitting?: boolean;
}

export const BatchCancelConfirmationModal: React.FC<BatchCancelConfirmationModalProps> = ({
  isOpen,
  batch,
  onClose,
  onConfirmCancel,
  isSubmitting = false,
}) => {
  const [typedName, setTypedName] = useState("");
  const [error, setError] = useState<string | null>(null);

  if (!isOpen || !batch) {
    return null;
  }

  const { refundedEscrowXlm, unsoldTokens } = calculateBatchRefund(batch);
  const isMatch = typedName.trim() === batch.campaignName.trim();

  const handleConfirm = async (e: React.FormEvent) => {
    e.preventDefault();
    const validation = validateCancellationConfirmation(typedName, batch.campaignName);
    if (!validation.isConfirmed) {
      setError(validation.error!);
      return;
    }

    try {
      setError(null);
      await onConfirmCancel(batch, typedName);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200"
    >
      <div className="relative w-full max-w-md p-6 rounded-3xl bg-zinc-950 border border-red-500/30 text-white shadow-2xl space-y-5">
        {/* Close Button */}
        <button
          type="button"
          onClick={onClose}
          disabled={isSubmitting}
          className="absolute top-5 right-5 p-1.5 rounded-full text-zinc-400 hover:text-white hover:bg-zinc-900 transition-colors"
          aria-label="Close cancellation modal"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-2xl bg-red-500/20 border border-red-500/30 text-red-400">
            <ShieldAlert className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-lg font-black tracking-tight text-white">
              Cancel Batch Sale & Refund Escrow
            </h3>
            <p className="text-xs text-zinc-400">
              Campaign: <strong className="text-zinc-200">{batch.campaignName}</strong>
            </p>
          </div>
        </div>

        {/* Warning Callout */}
        <div className="p-3.5 rounded-2xl border border-amber-500/30 bg-amber-500/10 text-amber-200 text-xs space-y-1">
          <div className="flex items-center gap-2 font-bold text-amber-300">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>Irreversible Action</span>
          </div>
          <p>
            Cancelling this batch sale will abort all remaining unlogged sales. Unsold inventory and
            unspent escrow will be refunded back to your wallet immediately.
          </p>
        </div>

        {/* Refund Preview */}
        <div className="grid grid-cols-2 gap-3 p-3.5 rounded-2xl bg-zinc-900/80 border border-zinc-800 text-xs">
          <div>
            <span className="text-zinc-400 block text-[11px]">Unspent Escrow Refund</span>
            <span className="text-sm font-bold text-emerald-400 flex items-center gap-1 mt-0.5">
              <ArrowDownLeft className="w-3.5 h-3.5" />
              {refundedEscrowXlm.toLocaleString(undefined, { minimumFractionDigits: 2 })} XLM
            </span>
          </div>
          <div>
            <span className="text-zinc-400 block text-[11px]">Unsold Tokens Refund</span>
            <span className="text-sm font-bold text-white block mt-0.5">
              {unsoldTokens.toLocaleString()} Tokens
            </span>
          </div>
        </div>

        {/* Confirmation Input Form */}
        <form onSubmit={handleConfirm} className="space-y-4">
          <div className="space-y-1.5">
            <label
              htmlFor="campaign-name-input"
              className="block text-xs font-medium text-zinc-300"
            >
              To confirm cancellation, type{" "}
              <strong className="text-white select-all">"{batch.campaignName}"</strong> below:
            </label>
            <input
              id="campaign-name-input"
              type="text"
              value={typedName}
              onChange={(e) => {
                setTypedName(e.target.value);
                setError(null);
              }}
              placeholder={batch.campaignName}
              disabled={isSubmitting}
              className="w-full px-3.5 py-2.5 text-xs rounded-xl bg-zinc-900 border border-zinc-700 text-white placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-red-500/50"
            />
            {error && <p className="text-[11px] text-red-400 mt-1">{error}</p>}
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 text-xs font-semibold rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition-colors"
            >
              Abort & Keep Active
            </button>
            <button
              type="submit"
              disabled={!isMatch || isSubmitting}
              className="px-5 py-2 text-xs font-bold rounded-xl bg-red-600 hover:bg-red-500 disabled:opacity-40 disabled:cursor-not-allowed text-white transition-all shadow-lg"
            >
              {isSubmitting ? "Refunding on Soroban..." : "Confirm & Refund Escrow"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
