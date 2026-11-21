import React from "react";
import { ShieldAlert, Globe, Lock, Eye, X } from "lucide-react";
import {
  getSanctionedCountryName,
  REGULATORY_DISCLOSURE_TEXT,
  setReadOnlyAuditMode,
} from "../../lib/geoFencing";

export interface RestrictedJurisdictionModalProps {
  isOpen: boolean;
  countryCode: string;
  countryName?: string;
  onClose?: () => void;
  onEnterReadOnlyAuditMode?: () => void;
  className?: string;
}

export const RestrictedJurisdictionModal: React.FC<RestrictedJurisdictionModalProps> = ({
  isOpen,
  countryCode,
  countryName: propCountryName,
  onClose,
  onEnterReadOnlyAuditMode,
  className = "",
}) => {
  if (!isOpen) return null;

  const countryName = propCountryName || getSanctionedCountryName(countryCode);

  const handleEnterReadOnly = () => {
    setReadOnlyAuditMode(true);
    if (onEnterReadOnlyAuditMode) {
      onEnterReadOnlyAuditMode();
    }
    if (onClose) {
      onClose();
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="restricted-jurisdiction-title"
      data-testid="modal-restricted-jurisdiction"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-950/80 backdrop-blur-md"
    >
      <div
        className={`w-full max-w-lg bg-white dark:bg-zinc-900 border-2 border-rose-500/50 rounded-3xl p-6 sm:p-8 shadow-2xl relative text-zinc-900 dark:text-zinc-100 flex flex-col gap-6 animate-in fade-in-0 zoom-in-95 duration-200 ${className}`}
      >
        {/* Header with warning icon */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-rose-600 text-white flex items-center justify-center shrink-0 shadow-lg shadow-rose-600/30">
              <ShieldAlert className="w-6 h-6 stroke-[2.2]" />
            </div>
            <div>
              <h2
                id="restricted-jurisdiction-title"
                className="text-lg sm:text-xl font-black tracking-tight text-rose-950 dark:text-rose-100"
              >
                Access Restricted: Sanctioned Jurisdiction
              </h2>
              <div className="flex items-center gap-2 mt-0.5 text-xs text-rose-700 dark:text-rose-300 font-semibold">
                <Globe className="w-3.5 h-3.5" />
                <span>
                  Detected Location: {countryName} ({countryCode.toUpperCase()})
                </span>
              </div>
            </div>
          </div>

          {onClose && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Close modal"
              className="p-1.5 rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Blocking notice */}
        <div className="p-4 rounded-2xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900 text-rose-900 dark:text-rose-200 flex items-start gap-3 text-xs leading-relaxed">
          <Lock className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
          <p>
            <strong>Wallet Connection Blocked:</strong> Direct blockchain transactions, escrow creation,
            and payout withdrawals are disabled from your IP geographic region to comply with
            regulatory obligations.
          </p>
        </div>

        {/* Clear Regulatory Disclosure Text */}
        <div className="space-y-2">
          <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
            Regulatory Compliance Notice & Disclosure
          </h3>
          <p
            data-testid="regulatory-disclosure-text"
            className="text-xs text-zinc-600 dark:text-zinc-300 leading-relaxed bg-zinc-50 dark:bg-zinc-950/60 p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 font-normal"
          >
            {REGULATORY_DISCLOSURE_TEXT}
          </p>
        </div>

        {/* Action Buttons: Read-Only Audit Mode vs Blocked */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-2 border-t border-zinc-100 dark:border-zinc-800">
          <button
            type="button"
            data-testid="btn-read-only-audit-mode"
            onClick={handleEnterReadOnly}
            className="flex-1 inline-flex items-center justify-center gap-2 px-5 py-3 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white font-extrabold text-xs shadow-md shadow-indigo-600/25 transition-all focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <Eye className="w-4 h-4" />
            <span>Continue in Read-Only Audit Mode</span>
          </button>

          {onClose && (
            <button
              type="button"
              data-testid="btn-dismiss-jurisdiction-modal"
              onClick={onClose}
              className="px-4 py-3 rounded-2xl bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 font-bold text-xs transition-colors"
            >
              Close
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
