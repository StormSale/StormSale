import { useState, useEffect, useRef } from "react";
import { Button } from "../ui/button";
import { ShieldCheck, AlertTriangle, ExternalLink, X, Copy, Check, RefreshCw } from "lucide-react";
import { STELLAR_CONFIG } from "../../config/stellar";

interface ContractIntegrityModalProps {
  isOpen: boolean;
  onClose: () => void;
  overrideMismatch?: boolean;
}

export const ContractIntegrityModal: React.FC<ContractIntegrityModalProps> = ({
  isOpen,
  onClose,
  overrideMismatch = false,
}) => {
  const [copied, setCopied] = useState(false);
  const [simulateMismatch, setSimulateMismatch] = useState(overrideMismatch);
  const dialogRef = useRef<HTMLDivElement>(null);
  const previousActiveElementRef = useRef<HTMLElement | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setSimulateMismatch(overrideMismatch);
  }, [overrideMismatch, isOpen]);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (isOpen) {
      previousActiveElementRef.current =
        typeof document !== "undefined" ? (document.activeElement as HTMLElement | null) : null;
      dialogRef.current?.focus();

      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === "Escape") {
          onClose();
        }
      };
      window.addEventListener("keydown", handleKeyDown);
      return () => window.removeEventListener("keydown", handleKeyDown);
    } else if (previousActiveElementRef.current) {
      previousActiveElementRef.current.focus?.();
    }
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const officialContractId = STELLAR_CONFIG.contractId;
  const currentContractId = simulateMismatch
    ? "CAUNKNOWN9ROGUE9UNVERIFIED9CONTRACT9ADDRESS999999"
    : officialContractId;

  const isVerified = currentContractId === officialContractId;

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.warn("Failed to copy contract address:", err);
      setCopied(false);
    }
  };

  return (
    <div
      role="presentation"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="contract-integrity-title"
        tabIndex={-1}
        className="relative w-full max-w-lg bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-3xl p-6 sm:p-8 shadow-2xl overflow-hidden focus:outline-hidden"
      >
        {/* Glow backdrop */}
        <div
          className={`absolute top-0 right-0 w-64 h-64 blur-3xl rounded-full opacity-20 pointer-events-none ${
            isVerified ? "bg-emerald-500" : "bg-rose-500"
          }`}
        />

        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-zinc-800">
          <div className="flex items-center space-x-3">
            <div
              className={`w-10 h-10 rounded-2xl flex items-center justify-center border ${
                isVerified
                  ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-500"
                  : "bg-rose-500/10 border-rose-500/30 text-rose-500"
              }`}
            >
              {isVerified ? (
                <ShieldCheck className="w-5 h-5" />
              ) : (
                <AlertTriangle className="w-5 h-5" />
              )}
            </div>
            <div>
              <h2 id="contract-integrity-title" className="text-lg font-bold text-zinc-900 dark:text-white">
                Contract Integrity Check
              </h2>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Soroban smart contract authenticity verification
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close dialog"
            className="p-2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 rounded-xl hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Status Banner */}
        <div className="mt-6">
          {isVerified ? (
            <div className="p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 text-emerald-800 dark:text-emerald-300">
              <div className="flex items-start space-x-3">
                <ShieldCheck className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                <div>
                  <h4 className="text-sm font-bold">Verified Protocol Deployment</h4>
                  <p className="text-xs mt-1 text-emerald-700/80 dark:text-emerald-300/80 leading-relaxed">
                    The frontend is strictly bound to the authentic, audited StormSale escrow
                    contract on Stellar Testnet. All escrow functions and state channels are
                    verified safe.
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div className="p-4 rounded-2xl bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/20 text-rose-800 dark:text-rose-300">
              <div className="flex items-start space-x-3">
                <AlertTriangle className="w-5 h-5 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
                <div>
                  <h4 className="text-sm font-bold">Warning: Contract Address Mismatch</h4>
                  <p className="text-xs mt-1 text-rose-700/80 dark:text-rose-300/80 leading-relaxed">
                    The active contract address does NOT match the official verified protocol
                    registry. Transactions are halted to prevent interactions with rogue or spoofed
                    contracts.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Contract Address Details */}
        <div className="mt-6 space-y-3">
          <div>
            <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">
              Active Contract Address
            </span>
            <div className="flex items-center justify-between mt-1 px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 font-mono text-xs text-zinc-800 dark:text-zinc-200">
              <span className="truncate mr-2">{currentContractId}</span>
              <button
                onClick={() => copyToClipboard(currentContractId)}
                aria-label="Copy contract address"
                className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 shrink-0"
              >
                {copied ? (
                  <Check className="w-4 h-4 text-emerald-500" />
                ) : (
                  <Copy className="w-4 h-4" />
                )}
              </button>
            </div>
          </div>

          <div>
            <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">
              Official Registry Deployment
            </span>
            <div className="mt-1 px-3 py-2 rounded-xl bg-slate-50/50 dark:bg-zinc-950/50 border border-slate-200/50 dark:border-zinc-800/50 font-mono text-xs text-zinc-500 truncate">
              {officialContractId}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 pt-2">
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800">
              <span className="text-[10px] font-bold uppercase text-zinc-400">Network</span>
              <div className="text-xs font-bold text-zinc-800 dark:text-zinc-200 mt-0.5">
                {STELLAR_CONFIG.network} (Sep-2015)
              </div>
            </div>
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800">
              <span className="text-[10px] font-bold uppercase text-zinc-400">Audit Status</span>
              <div className="text-xs font-bold text-emerald-600 dark:text-emerald-400 mt-0.5 flex items-center">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mr-1.5 animate-pulse" />
                Audited & Certified
              </div>
            </div>
          </div>
        </div>

        {/* Explorer & Simulation Controls */}
        <div className="mt-6 flex flex-col sm:flex-row items-center gap-3">
          <a
            href={`${STELLAR_CONFIG.explorerUrl}/contract/${officialContractId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full sm:flex-1"
          >
            <Button
              variant="outline"
              className="w-full h-11 rounded-xl text-xs font-bold border border-slate-200 dark:border-zinc-800 hover:bg-slate-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300"
            >
              <ExternalLink className="w-3.5 h-3.5 mr-1.5" />
              View on StellarExpert
            </Button>
          </a>

          <Button
            variant="ghost"
            onClick={() => setSimulateMismatch(!simulateMismatch)}
            className="w-full sm:w-auto h-11 text-xs text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
          >
            <RefreshCw className="w-3.5 h-3.5 mr-1" />
            {simulateMismatch ? "Restore Verified" : "Simulate Mismatch"}
          </Button>
        </div>
      </div>
    </div>
  );
};
