import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "../ui/dialog";
import { Button } from "../ui/button";
import {
  ShieldCheck,
  ShieldAlert,
  AlertTriangle,
  ExternalLink,
  Copy,
  Check,
  RotateCcw,
} from "lucide-react";
import type { ContractIntegrityResult } from "../../lib/contractIntegrity";
import { getStellarExplorerLink } from "../../utils/network";

interface ContractIntegrityModalProps {
  isOpen: boolean;
  onClose: () => void;
  integrity: ContractIntegrityResult | null;
  onReset?: () => void;
}

export const ContractIntegrityModal = ({
  isOpen,
  onClose,
  integrity,
  onReset,
}: ContractIntegrityModalProps) => {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  if (!integrity) return null;

  const isVerified = integrity.isVerified;
  const isMismatch = integrity.status === "mismatch";
  const isInvalid = integrity.status === "invalid_format";

  const handleCopy = (text: string, key: string) => {
    void navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const explorerLink = getStellarExplorerLink(
    "contract",
    isVerified ? integrity.configuredAddress : integrity.expectedAddress,
  );

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        size="lg"
        data-testid="contract-integrity-modal"
        className="border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-6 sm:rounded-2xl"
      >
        <DialogHeader className="text-left space-y-3">
          <div className="flex items-center gap-3">
            <div
              className={`w-10 h-10 rounded-2xl flex items-center justify-center ${
                isVerified
                  ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20"
                  : "bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20"
              }`}
            >
              {isVerified ? (
                <ShieldCheck className="w-5 h-5" />
              ) : (
                <ShieldAlert className="w-5 h-5" />
              )}
            </div>
            <div>
              <DialogTitle className="text-base font-bold text-zinc-900 dark:text-white">
                {isVerified ? "Contract Integrity Verified" : "Warning: Contract Address Mismatch"}
              </DialogTitle>
              <DialogDescription className="text-xs text-zinc-500 dark:text-zinc-400">
                {isVerified
                  ? "Frontend interacts with the verified Soroban escrow smart contract."
                  : "Runtime contract address differs from the authoritative registry."}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* Warning Banner when mismatch / invalid */}
        {!isVerified && (
          <div
            data-testid="contract-mismatch-warning"
            className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 flex gap-3 text-rose-700 dark:text-rose-400 text-xs leading-relaxed"
          >
            <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
            <div>
              <span className="font-bold">Security Alert: </span>
              {integrity.reason ||
                "The application is interacting with an unverified contract address. Interacting with untrusted contracts may compromise escrow funds or redirect referral rewards."}
            </div>
          </div>
        )}

        {/* Verified Banner */}
        {isVerified && (
          <div
            data-testid="contract-verified-banner"
            className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex gap-3 text-emerald-700 dark:text-emerald-400 text-xs items-center"
          >
            <ShieldCheck className="w-4 h-4 shrink-0" />
            <span>
              Authoritative smart contract validated against the official StormSale Stellar{" "}
              <strong>{integrity.network}</strong> registry.
            </span>
          </div>
        )}

        {/* Contract Details Table / Grid */}
        <div className="space-y-3 pt-2">
          {/* Configured Address */}
          <div className="p-3 bg-slate-50 dark:bg-zinc-900/60 rounded-xl border border-slate-200 dark:border-zinc-800">
            <div className="flex justify-between items-center mb-1">
              <span className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider">
                Configured Runtime Address
              </span>
              <button
                type="button"
                onClick={() => handleCopy(integrity.configuredAddress, "configured")}
                className="text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 flex items-center gap-1 text-[11px]"
              >
                {copiedKey === "configured" ? (
                  <Check className="w-3 h-3 text-emerald-500" />
                ) : (
                  <Copy className="w-3 h-3" />
                )}
                <span>{copiedKey === "configured" ? "Copied" : "Copy"}</span>
              </button>
            </div>
            <div
              className={`font-mono text-xs break-all ${
                isVerified
                  ? "text-zinc-900 dark:text-zinc-100 font-bold"
                  : "text-rose-600 dark:text-rose-400 font-bold"
              }`}
            >
              {integrity.configuredAddress || "(None)"}
            </div>
          </div>

          {/* Expected Address (if mismatch) */}
          {(!isVerified || isMismatch || isInvalid) && (
            <div className="p-3 bg-emerald-50 dark:bg-emerald-950/20 rounded-xl border border-emerald-200 dark:border-emerald-800/40">
              <div className="flex justify-between items-center mb-1">
                <span className="text-[11px] font-bold text-emerald-700 dark:text-emerald-400 uppercase tracking-wider">
                  Authoritative Verified Registry
                </span>
                <button
                  type="button"
                  onClick={() => handleCopy(integrity.expectedAddress, "expected")}
                  className="text-emerald-700 dark:text-emerald-400 hover:opacity-80 flex items-center gap-1 text-[11px]"
                >
                  {copiedKey === "expected" ? (
                    <Check className="w-3 h-3 text-emerald-500" />
                  ) : (
                    <Copy className="w-3 h-3" />
                  )}
                  <span>{copiedKey === "expected" ? "Copied" : "Copy"}</span>
                </button>
              </div>
              <div className="font-mono text-xs font-bold text-emerald-900 dark:text-emerald-300 break-all">
                {integrity.expectedAddress}
              </div>
            </div>
          )}

          {/* Metadata */}
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="p-2.5 rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
              <span className="text-[10px] text-zinc-400 block font-bold uppercase">
                Target Network
              </span>
              <span className="font-semibold text-zinc-800 dark:text-zinc-200 font-mono">
                {integrity.network}
              </span>
            </div>
            <div className="p-2.5 rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
              <span className="text-[10px] text-zinc-400 block font-bold uppercase">Status</span>
              <span
                className={`font-bold uppercase text-[11px] ${
                  isVerified
                    ? "text-emerald-600 dark:text-emerald-400"
                    : "text-rose-600 dark:text-rose-400"
                }`}
              >
                {integrity.status}
              </span>
            </div>
          </div>
        </div>

        <DialogFooter className="flex flex-col sm:flex-row gap-2 pt-3 border-t border-slate-100 dark:border-zinc-800">
          <a
            href={explorerLink}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center gap-1.5 h-9 px-4 rounded-xl text-xs font-semibold border border-slate-200 dark:border-zinc-800 hover:bg-slate-100 dark:hover:bg-zinc-850 text-zinc-700 dark:text-zinc-300 transition-colors"
          >
            <span>Stellar Expert</span>
            <ExternalLink className="w-3 h-3" />
          </a>

          {!isVerified && onReset && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                onReset();
                onClose();
              }}
              data-testid="reset-contract-button"
              className="h-9 px-3 rounded-xl border-emerald-500/30 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 text-xs font-bold flex items-center gap-1.5"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset to Verified Address</span>
            </Button>
          )}

          <Button
            type="button"
            size="sm"
            onClick={onClose}
            className={`h-9 px-4 rounded-xl text-xs font-bold ${
              isVerified
                ? "bg-zinc-900 hover:bg-zinc-800 text-white dark:bg-indigo-600 dark:hover:bg-indigo-500"
                : "bg-rose-600 hover:bg-rose-500 text-white"
            }`}
          >
            {isVerified ? "Close" : "Acknowledge Warning"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
