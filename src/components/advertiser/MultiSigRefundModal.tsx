import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "../../components/ui/dialog";
import { Button } from "../../components/ui/button";
import { Shield, CheckCircle2, Clock, RotateCcw, KeyRound } from "lucide-react";
import type { MultiSigRefundProposal } from "../../lib/multiSigSafe";
import { coSignMultiSigRefund, executeMultiSigRefund } from "../../lib/multiSigSafe";
import { useNotification } from "../../context/NotificationContext";

interface MultiSigRefundModalProps {
  isOpen: boolean;
  onClose: () => void;
  proposal: MultiSigRefundProposal | null;
  onProposalUpdated: (updated: MultiSigRefundProposal) => void;
  onRefundExecuted: (campaignId: string, txHash: string) => void;
}

export const MultiSigRefundModal = ({
  isOpen,
  onClose,
  proposal,
  onProposalUpdated,
  onRefundExecuted,
}: MultiSigRefundModalProps) => {
  const [isSigning, setIsSigning] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);
  const { showNotification } = useNotification();

  if (!proposal) return null;

  const handleCoSign = async () => {
    setIsSigning(true);
    try {
      // Simulate cryptographic multi-sig co-signing latency
      await new Promise((r) => setTimeout(r, 600));

      const updated = coSignMultiSigRefund(proposal.id);
      onProposalUpdated(updated);

      showNotification({
        type: "success",
        title: "Secondary Signature Confirmed!",
        message: "Gnosis Safe Security Approver signature appended. 2/2 threshold reached.",
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to append secondary signature";
      showNotification({
        type: "error",
        title: "Signing Failed",
        message,
      });
    } finally {
      setIsSigning(false);
    }
  };

  const handleExecute = async () => {
    setIsExecuting(true);
    try {
      await new Promise((r) => setTimeout(r, 800));

      const result = executeMultiSigRefund(proposal.id);
      onProposalUpdated(result.proposal);
      onRefundExecuted(proposal.campaignId, result.txHash);

      showNotification({
        type: "success",
        title: "Multi-Sig Escrow Released!",
        message: `Successfully reclaimed ${proposal.amount.toLocaleString()} XLM from escrow. Tx: ${result.txHash.slice(0, 14)}...`,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to execute multi-sig release";
      showNotification({
        type: "error",
        title: "Execution Error",
        message,
      });
    } finally {
      setIsExecuting(false);
    }
  };

  const isThresholdMet = proposal.currentSignatures >= proposal.threshold;
  const isExecuted = proposal.status === "executed";

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        size="lg"
        className="sm:max-w-2xl bg-white dark:bg-zinc-900 rounded-3xl p-6 md:p-8"
      >
        <DialogHeader>
          <div className="flex items-center gap-2 mb-2">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-extrabold bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300">
              <Shield className="w-3.5 h-3.5" />
              Gnosis Safe / Stellar Multi-Sig
            </span>
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
              {`Threshold: ${proposal.currentSignatures}/${proposal.threshold} Signatures`}
            </span>
          </div>

          <DialogTitle className="text-xl md:text-2xl font-black text-zinc-900 dark:text-white flex items-center gap-2">
            Multi-Sig Escrow Refund Tracker
          </DialogTitle>
          <DialogDescription className="text-zinc-500 dark:text-zinc-400 text-sm">
            High-value escrow refunds exceeding $10,000 require dual-key multi-signature
            authorization before assets can be returned.
          </DialogDescription>
        </DialogHeader>

        {/* Amount & Campaign Overview Card */}
        <div className="mt-4 p-4 rounded-2xl bg-slate-50 dark:bg-zinc-950/60 border border-slate-200 dark:border-zinc-800 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <div className="text-xs font-bold uppercase tracking-wider text-zinc-400">Campaign</div>
            <div className="text-base font-extrabold text-zinc-900 dark:text-white mt-0.5">
              {proposal.campaignName}
            </div>
            <div className="text-xs text-zinc-500 font-mono mt-0.5">
              Contract: {proposal.contractAddress}
            </div>
          </div>
          <div className="sm:text-right">
            <div className="text-xs font-bold uppercase tracking-wider text-zinc-400">
              Escrow Reclaimed
            </div>
            <div className="text-xl font-black text-indigo-600 dark:text-indigo-400 mt-0.5">
              {`${proposal.amount.toLocaleString()} XLM`}
            </div>
            <div className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
              {`${proposal.amountUsd} USD Value (> $10k Policy)`}
            </div>
          </div>
        </div>

        {/* Visual Multi-Sig Stepper */}
        <div className="mt-5 grid grid-cols-3 gap-2">
          <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/50 text-center">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 mx-auto mb-1" />
            <div className="text-xs font-bold text-emerald-900 dark:text-emerald-300">
              1. Initiated
            </div>
            <div className="text-[10px] text-emerald-700/80 dark:text-emerald-400/80">
              Primary Signed
            </div>
          </div>

          <div
            className={`p-3 rounded-xl text-center border ${
              isThresholdMet
                ? "bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800/50"
                : "bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800/50"
            }`}
          >
            {isThresholdMet ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-600 mx-auto mb-1" />
            ) : (
              <Clock className="w-5 h-5 text-amber-600 mx-auto mb-1 animate-pulse" />
            )}
            <div
              className={`text-xs font-bold ${isThresholdMet ? "text-emerald-900 dark:text-emerald-300" : "text-amber-900 dark:text-amber-300"}`}
            >
              2. Safe Co-Sign
            </div>
            <div
              className={`text-[10px] ${isThresholdMet ? "text-emerald-700 dark:text-emerald-400" : "text-amber-700 dark:text-amber-400"}`}
            >
              {isThresholdMet ? "2/2 Approved" : "Awaiting Signature"}
            </div>
          </div>

          <div
            className={`p-3 rounded-xl text-center border ${
              isExecuted
                ? "bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800/50"
                : isThresholdMet
                  ? "bg-indigo-50 dark:bg-indigo-950/30 border-indigo-200 dark:border-indigo-800/50"
                  : "bg-slate-100 dark:bg-zinc-900 border-slate-200 dark:border-zinc-800 opacity-60"
            }`}
          >
            {isExecuted ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-600 mx-auto mb-1" />
            ) : (
              <RotateCcw className="w-5 h-5 text-zinc-500 mx-auto mb-1" />
            )}
            <div className="text-xs font-bold text-zinc-900 dark:text-zinc-200">3. Settlement</div>
            <div className="text-[10px] text-zinc-500">
              {isExecuted ? "Escrow Released" : isThresholdMet ? "Ready to Release" : "Locked"}
            </div>
          </div>
        </div>

        {/* Signers Checklist & Status */}
        <div className="mt-5 space-y-2.5">
          <div className="text-xs font-bold uppercase tracking-wider text-zinc-500 flex items-center justify-between">
            <span>Authorized Multi-Sig Signers</span>
            <span>Requirement: 2 of 3</span>
          </div>

          {proposal.signers.map((signer, i) => (
            <div
              key={i}
              className="p-3.5 rounded-xl bg-slate-50 dark:bg-zinc-950/40 border border-slate-200 dark:border-zinc-800 flex items-center justify-between gap-3 text-xs"
            >
              <div className="flex items-center gap-2.5">
                <div
                  className={`w-7 h-7 rounded-lg flex items-center justify-center font-bold shrink-0 ${
                    signer.hasSigned
                      ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300"
                      : "bg-slate-200 text-slate-600 dark:bg-zinc-800 dark:text-zinc-400"
                  }`}
                >
                  {signer.hasSigned ? (
                    <CheckCircle2 className="w-4 h-4" />
                  ) : (
                    <KeyRound className="w-4 h-4" />
                  )}
                </div>
                <div>
                  <div className="font-extrabold text-zinc-900 dark:text-white flex items-center gap-1.5">
                    <span>{signer.role}</span>
                    {signer.hasSigned && (
                      <span className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
                        (Signed)
                      </span>
                    )}
                  </div>
                  <div className="text-zinc-500 font-mono text-[11px] mt-0.5 truncate max-w-[220px] sm:max-w-xs">
                    {signer.address}
                  </div>
                </div>
              </div>

              <div className="text-right shrink-0">
                {signer.hasSigned ? (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                    <CheckCircle2 className="w-3 h-3" />
                    Confirmed
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                    <Clock className="w-3 h-3" />
                    Pending
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Execution Hash / Success Banner */}
        {isExecuted && proposal.txHash && (
          <div className="mt-5 p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-300 dark:border-emerald-800">
            <div className="flex items-center gap-2 text-emerald-800 dark:text-emerald-200 font-extrabold text-sm">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              <span>Multi-Signature Escrow Refund Successfully Settled</span>
            </div>
            <div className="text-xs text-emerald-700/90 dark:text-emerald-300/90 mt-1 font-mono break-all">
              Tx: {proposal.txHash}
            </div>
          </div>
        )}

        {/* Footer Actions */}
        <div className="mt-6 flex flex-col sm:flex-row gap-3 pt-4 border-t border-slate-200 dark:border-zinc-800">
          {!isExecuted && !isThresholdMet && (
            <Button
              type="button"
              disabled={isSigning}
              onClick={handleCoSign}
              className="flex-1 h-12 bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold rounded-xl shadow-md transition-all flex items-center justify-center gap-2"
            >
              {isSigning ? (
                <span>Co-Signing via Safe...</span>
              ) : (
                <>
                  <KeyRound className="w-4 h-4" />
                  <span>Provide Secondary Signature (Safe Approver)</span>
                </>
              )}
            </Button>
          )}

          {!isExecuted && isThresholdMet && (
            <Button
              type="button"
              disabled={isExecuting}
              onClick={handleExecute}
              className="flex-1 h-12 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold rounded-xl shadow-md transition-all flex items-center justify-center gap-2"
            >
              {isExecuting ? (
                <span>Releasing Escrow on Soroban...</span>
              ) : (
                <>
                  <RotateCcw className="w-4 h-4" />
                  <span>Execute Multi-Sig Escrow Release</span>
                </>
              )}
            </Button>
          )}

          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            className="h-12 px-6 rounded-xl border border-slate-300 dark:border-zinc-700 font-bold"
          >
            Close Tracker
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
