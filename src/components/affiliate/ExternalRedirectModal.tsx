import React, { useMemo } from "react";
import { sanitizeRedirectUrl } from "../../lib/redirectSanitizer";
import { ShieldAlert, ExternalLink, ArrowRight, XCircle } from "lucide-react";

interface ExternalRedirectModalProps {
  isOpen: boolean;
  targetUrl: string;
  onConfirm: (url: string) => void;
  onCancel: () => void;
}

export const ExternalRedirectModal: React.FC<ExternalRedirectModalProps> = ({
  isOpen,
  targetUrl,
  onConfirm,
  onCancel,
}) => {
  const sanitizeResult = useMemo(() => {
    return sanitizeRedirectUrl(targetUrl);
  }, [targetUrl]);

  if (!isOpen) return null;

  const { isValid, sanitizedUrl, targetDomain, reason } = sanitizeResult;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="redirect-modal-title"
      data-testid="external-redirect-modal"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm"
    >
      <div className="w-full max-w-lg bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-3xl p-6 sm:p-8 shadow-2xl space-y-6">
        {/* Header Icon */}
        <div className="flex items-center gap-4">
          <div
            className={`w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 ${
              isValid
                ? "bg-amber-500/10 text-amber-500 border border-amber-500/20"
                : "bg-rose-500/10 text-rose-500 border border-rose-500/20"
            }`}
          >
            {isValid ? <ExternalLink className="w-7 h-7" /> : <ShieldAlert className="w-7 h-7" />}
          </div>
          <div>
            <h3
              id="redirect-modal-title"
              className="text-xl font-black text-zinc-900 dark:text-white"
            >
              {isValid ? "External Redirect Warning" : "Malicious Redirect Blocked"}
            </h3>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
              {isValid
                ? "You are navigating to an external merchant website."
                : "The destination URL violates StormSale security policies."}
            </p>
          </div>
        </div>

        {/* Destination Details */}
        <div className="bg-slate-50 dark:bg-zinc-950/60 border border-slate-200 dark:border-zinc-800/80 rounded-2xl p-4 space-y-2">
          <div className="flex items-center justify-between text-xs text-zinc-500">
            <span>Target Host</span>
            <span className="font-mono font-bold text-zinc-800 dark:text-zinc-200" data-testid="target-domain">
              {targetDomain || "Unknown"}
            </span>
          </div>
          <div className="text-xs break-all font-mono text-zinc-600 dark:text-zinc-400 bg-white dark:bg-zinc-900 p-2.5 rounded-xl border border-slate-200/60 dark:border-zinc-800" data-testid="target-url">
            {targetUrl}
          </div>
        </div>

        {/* Security Warning or Block Reason */}
        {isValid ? (
          <div className="text-xs text-zinc-600 dark:text-zinc-300 leading-relaxed bg-amber-500/5 border border-amber-500/15 rounded-xl p-3">
            <span className="font-bold text-amber-600 dark:text-amber-400">Notice: </span>
            Ensure you trust <strong className="font-mono">{targetDomain}</strong> before submitting
            transactions or connecting private wallets. StormSale smart escrow is not responsible
            for external domain content.
          </div>
        ) : (
          <div className="text-xs text-rose-600 dark:text-rose-400 leading-relaxed bg-rose-500/10 border border-rose-500/20 rounded-xl p-3 flex items-start gap-2">
            <XCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <div>
              <strong>Security Violation: </strong>
              <span>{reason || "Untrusted or invalid destination URL."}</span>
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 pt-2">
          <button
            type="button"
            data-testid="btn-cancel-redirect"
            onClick={onCancel}
            className="px-4 py-2.5 rounded-xl text-xs font-bold text-zinc-600 dark:text-zinc-400 hover:bg-slate-100 dark:hover:bg-zinc-800 transition"
          >
            Cancel & Stay
          </button>
          {isValid && (
            <button
              type="button"
              data-testid="btn-confirm-redirect"
              onClick={() => onConfirm(sanitizedUrl || targetUrl)}
              className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-md shadow-indigo-500/20 transition"
            >
              Continue to Merchant
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
