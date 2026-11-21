import React from "react";
import { X, Send, ShieldCheck } from "lucide-react";
import { Button } from "../ui/button";
import { ResourceDiagnosticAccordion } from "./ResourceDiagnosticAccordion";
import type { SorobanResourceProfile } from "../../lib/sorobanProfiler";

export interface TransactionConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  title: string;
  description?: string;
  contractCallName?: string;
  targetContractAddress?: string;
  estimatedAmount?: string;
  resourceProfile?: SorobanResourceProfile | null;
  isSubmitting?: boolean;
}

export const TransactionConfirmModal: React.FC<TransactionConfirmModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  description,
  contractCallName,
  targetContractAddress,
  estimatedAmount,
  resourceProfile,
  isSubmitting = false,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="max-w-lg w-full bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in-95">
        <div className="flex items-center justify-between pb-2 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">{title}</h3>
              <p className="text-xs text-slate-400">Soroban Transaction Confirmation</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {description && <p className="text-xs text-slate-300">{description}</p>}

        {/* Transaction Details */}
        <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800 space-y-2 text-xs">
          {contractCallName && (
            <div className="flex justify-between items-center">
              <span className="text-slate-400">Contract Method:</span>
              <span className="font-mono font-bold text-indigo-300">{contractCallName}</span>
            </div>
          )}
          {targetContractAddress && (
            <div className="flex justify-between items-center">
              <span className="text-slate-400">Target Contract:</span>
              <span className="font-mono text-slate-200">
                {targetContractAddress.length > 16
                  ? `${targetContractAddress.slice(0, 8)}...${targetContractAddress.slice(-6)}`
                  : targetContractAddress}
              </span>
            </div>
          )}
          {estimatedAmount && (
            <div className="flex justify-between items-center">
              <span className="text-slate-400">Amount:</span>
              <span className="font-mono font-bold text-emerald-400">{estimatedAmount}</span>
            </div>
          )}
        </div>

        {/* Resource Budget Diagnostic Accordion */}
        <ResourceDiagnosticAccordion
          profile={resourceProfile}
          defaultOpen={false}
          initialDevMode={false}
        />

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-800">
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            disabled={isSubmitting}
            className="text-slate-400 hover:text-white"
          >
            Cancel
          </Button>
          <Button
            variant="default"
            size="sm"
            onClick={onConfirm}
            disabled={isSubmitting}
            className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold"
          >
            {isSubmitting ? (
              "Signing Transaction..."
            ) : (
              <>
                <Send className="w-3.5 h-3.5 mr-1.5" />
                Confirm & Sign
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
};
