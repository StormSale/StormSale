import React from "react";
import { Button } from "../ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import {
  ShieldCheck,
  AlertTriangle,
  RotateCcw,
  Clock,
  Coins,
  CheckCircle2,
  Lock,
} from "lucide-react";
import {
  type EscrowRefundCampaign,
  canConcludeAndRefundEscrow,
  getRefundBreakdown,
} from "../../lib/escrowRefund";
import { formatStellarAddress } from "../../lib/stellar";

interface ConcludeRefundModalProps {
  isOpen: boolean;
  onClose: () => void;
  campaign: EscrowRefundCampaign | null;
  treasuryAddress: string | null;
  onConfirm: (campaign: EscrowRefundCampaign) => Promise<void>;
  isSubmitting?: boolean;
}

export const ConcludeRefundModal: React.FC<ConcludeRefundModalProps> = ({
  isOpen,
  onClose,
  campaign,
  treasuryAddress,
  onConfirm,
  isSubmitting = false,
}) => {
  if (!campaign) return null;

  const validation = canConcludeAndRefundEscrow(campaign);
  const { refundableAmount, pendingClaims, outstandingLiabilities } = getRefundBreakdown(campaign);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !isSubmitting && !open && onClose()}>
      <DialogContent className="max-w-md w-full bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-3xl p-6 sm:p-8 shadow-2xl">
        <DialogHeader className="space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
            <RotateCcw className="w-6 h-6" />
          </div>
          <DialogTitle className="text-xl font-extrabold text-zinc-900 dark:text-white">
            Conclude & Refund Escrow
          </DialogTitle>
          <DialogDescription className="text-sm text-zinc-600 dark:text-zinc-400">
            Finalize campaign <span className="font-semibold text-zinc-900 dark:text-white">"{campaign.name}"</span> and return all unallocated escrow back to your treasury wallet via on-chain contract call.
          </DialogDescription>
        </DialogHeader>

        <div className="my-5 space-y-4">
          {/* Exact Refundable XLM Amount */}
          <div className="bg-slate-50 dark:bg-zinc-950/50 p-4 rounded-2xl border border-slate-100 dark:border-zinc-800/80">
            <div className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1 flex items-center gap-1.5">
              <Coins className="w-3.5 h-3.5 text-indigo-500" />
              Exact Refundable Amount
            </div>
            <div className="text-2xl font-black text-indigo-600 dark:text-indigo-400">
              {refundableAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}{" "}
              <span className="text-sm font-bold text-zinc-500">XLM</span>
            </div>
          </div>

          {/* Validation Checklist / Liabilities Verification */}
          <div className="space-y-2.5 text-xs font-medium">
            <div
              className={`flex items-center justify-between p-3 rounded-xl border ${
                validation.isClearingExpired
                  ? "bg-emerald-50/60 border-emerald-200 text-emerald-800 dark:bg-emerald-950/20 dark:border-emerald-800 dark:text-emerald-300"
                  : "bg-amber-50/60 border-amber-200 text-amber-800 dark:bg-amber-950/20 dark:border-amber-800 dark:text-amber-300"
              }`}
            >
              <div className="flex items-center gap-2">
                {validation.isClearingExpired ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                ) : (
                  <Clock className="w-4 h-4 text-amber-600 shrink-0" />
                )}
                <span>Clearing Period Expiration</span>
              </div>
              <span className="font-semibold">
                {validation.isClearingExpired ? "Expired / Concluded" : `${validation.remainingClearingSeconds}s remaining`}
              </span>
            </div>

            <div
              className={`flex items-center justify-between p-3 rounded-xl border ${
                validation.hasClearedAllClaims
                  ? "bg-emerald-50/60 border-emerald-200 text-emerald-800 dark:bg-emerald-950/20 dark:border-emerald-800 dark:text-emerald-300"
                  : "bg-rose-50/60 border-rose-200 text-rose-800 dark:bg-rose-950/20 dark:border-rose-800 dark:text-rose-300"
              }`}
            >
              <div className="flex items-center gap-2">
                {validation.hasClearedAllClaims ? (
                  <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                ) : (
                  <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                )}
                <span>Zero Outstanding Liabilities</span>
              </div>
              <span className="font-semibold">
                {outstandingLiabilities.toFixed(2)} XLM ({pendingClaims} pending)
              </span>
            </div>

            {/* Treasury Destination */}
            <div className="flex items-center justify-between p-3 rounded-xl border bg-slate-50 border-slate-200 dark:bg-zinc-800/40 dark:border-zinc-700/60 text-zinc-700 dark:text-zinc-300">
              <div className="flex items-center gap-2">
                <Lock className="w-4 h-4 text-zinc-400 shrink-0" />
                <span>Treasury Wallet Destination</span>
              </div>
              <span className="font-mono font-semibold">
                {treasuryAddress ? formatStellarAddress(treasuryAddress) : "Advertiser Signer"}
              </span>
            </div>
          </div>

          {!validation.canRefund && validation.reason && (
            <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 text-xs text-amber-900 dark:text-amber-200 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
              <span>{validation.reason}</span>
            </div>
          )}
        </div>

        <DialogFooter className="flex flex-col sm:flex-row gap-2.5 sm:gap-0">
          <Button
            type="button"
            variant="outline"
            disabled={isSubmitting}
            onClick={onClose}
            className="rounded-xl font-semibold"
          >
            Cancel
          </Button>
          <Button
            type="button"
            disabled={!validation.canRefund || isSubmitting}
            onClick={() => onConfirm(campaign)}
            className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow-md transition-all flex items-center justify-center space-x-2"
          >
            {isSubmitting ? (
              <div className="flex items-center space-x-2">
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                <span>Submitting Contract Refund...</span>
              </div>
            ) : (
              <span>Confirm & Refund {refundableAmount.toLocaleString()} XLM</span>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
