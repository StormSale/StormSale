import React from "react";
import { ShieldCheck, Clock, AlertTriangle, Award, Copy, Check } from "lucide-react";

export interface AuditCertificateBadgeProps {
  isFinalized: boolean;
  ledgerSequence?: number;
  merkleRoot?: string;
  txHash?: string;
  network?: string;
  tampered?: boolean;
  certificateId?: string;
  onDownloadCertificate?: () => void;
  className?: string;
}

export const AuditCertificateBadge: React.FC<AuditCertificateBadgeProps> = ({
  isFinalized,
  ledgerSequence,
  merkleRoot,
  network = "Stellar Testnet",
  tampered = false,
  certificateId,
  onDownloadCertificate,
  className = "",
}) => {
  const [copied, setCopied] = React.useState(false);

  const handleCopyRoot = () => {
    if (!merkleRoot) return;
    navigator.clipboard?.writeText(merkleRoot);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (tampered) {
    return (
      <div
        data-testid="audit-tampered-badge"
        role="alert"
        className={`inline-flex items-center gap-2.5 px-3.5 py-1.5 rounded-full text-xs font-bold border bg-rose-50 border-rose-300 text-rose-800 dark:bg-rose-950/50 dark:border-rose-800 dark:text-rose-200 shadow-sm ${className}`}
      >
        <AlertTriangle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0" />
        <span>Integrity Violation: Root Mismatch</span>
      </div>
    );
  }

  if (!isFinalized) {
    return (
      <div
        data-testid="audit-pending-badge"
        role="status"
        className={`inline-flex items-center gap-2.5 px-3.5 py-1.5 rounded-full text-xs font-semibold border bg-amber-50 border-amber-300 text-amber-800 dark:bg-amber-950/40 dark:border-amber-800 dark:text-amber-200 ${className}`}
      >
        <Clock className="w-4 h-4 text-amber-600 dark:text-amber-400 animate-spin shrink-0" />
        <span>Pending Horizon Finalization</span>
      </div>
    );
  }

  return (
    <div
      data-testid="audit-certificate-badge"
      role="status"
      className={`flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-3.5 rounded-2xl border bg-emerald-50/80 border-emerald-200 text-emerald-950 dark:bg-emerald-950/40 dark:border-emerald-800 dark:text-emerald-100 shadow-sm ${className}`}
    >
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-md">
          <ShieldCheck className="w-5 h-5" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <span className="font-extrabold text-sm tracking-tight text-emerald-900 dark:text-emerald-100">
              Horizon Audit Finalized
            </span>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-200 text-emerald-900 dark:bg-emerald-800 dark:text-emerald-200">
              Verified
            </span>
          </div>
          <div className="flex items-center gap-2 text-xs text-emerald-700 dark:text-emerald-300 mt-0.5">
            {ledgerSequence && <span>Ledger #{ledgerSequence}</span>}
            {ledgerSequence && network && <span>•</span>}
            {network && <span>{network}</span>}
            {certificateId && (
              <>
                <span>•</span>
                <span className="font-mono">{certificateId}</span>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 self-end sm:self-center">
        {merkleRoot && (
          <button
            type="button"
            onClick={handleCopyRoot}
            title={`Copy Merkle Root: ${merkleRoot}`}
            aria-label="Copy Merkle Root"
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium bg-emerald-100 hover:bg-emerald-200 dark:bg-emerald-900/60 dark:hover:bg-emerald-800 text-emerald-800 dark:text-emerald-200 transition-colors"
          >
            {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
            <span className="font-mono text-[11px]">
              {merkleRoot.slice(0, 6)}...{merkleRoot.slice(-4)}
            </span>
          </button>
        )}

        {onDownloadCertificate && (
          <button
            type="button"
            onClick={onDownloadCertificate}
            aria-label="Download Audit Certificate"
            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm transition-colors"
          >
            <Award className="w-3.5 h-3.5" />
            <span>Audit Certificate</span>
          </button>
        )}
      </div>
    </div>
  );
};
