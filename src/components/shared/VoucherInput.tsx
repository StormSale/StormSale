import React, { useState, useEffect } from "react";
import { Tag, AlertCircle, Clock, CheckCircle } from "lucide-react";
import {
  getVoucherLockoutState,
  validateVoucherCode,
  type VoucherLockoutState,
  DEFAULT_VOUCHER_STORAGE_KEY,
} from "../../lib/voucherLockout";

export interface VoucherInputProps {
  onApplyVoucher?: (code: string) => boolean | Promise<boolean>;
  validCodes?: string[];
  storageKey?: string;
}

export const VoucherInput: React.FC<VoucherInputProps> = ({
  onApplyVoucher,
  validCodes,
  storageKey = DEFAULT_VOUCHER_STORAGE_KEY,
}) => {
  const [code, setCode] = useState("");
  const [lockoutState, setLockoutState] = useState<VoucherLockoutState>(() =>
    getVoucherLockoutState(storageKey)
  );
  const [feedback, setFeedback] = useState<{ message: string; type: "success" | "error" } | null>(
    null
  );

  // Sync state and handle countdown timer when locked
  useEffect(() => {
    if (!lockoutState.isLocked) return;

    const interval = setInterval(() => {
      const state = getVoucherLockoutState(storageKey);
      setLockoutState(state);
      if (!state.isLocked) {
        clearInterval(interval);
        setFeedback(null);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [lockoutState.isLocked, storageKey]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim() || lockoutState.isLocked) return;

    const result = validateVoucherCode(code, validCodes, storageKey);
    setLockoutState(result.lockoutState);

    if (result.valid) {
      setFeedback({ message: "Voucher applied successfully!", type: "success" });
      setCode("");
      if (onApplyVoucher) {
        onApplyVoucher(code);
      }
    } else {
      setFeedback({ message: result.error || "Invalid voucher code.", type: "error" });
    }
  };

  return (
    <div className="w-full max-w-md p-4 rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 space-y-3">
      <div className="flex items-center space-x-2 text-zinc-900 dark:text-zinc-100 font-medium text-sm">
        <Tag className="w-4 h-4 text-blue-500" />
        <span>Referral / Promo Voucher</span>
      </div>

      <form onSubmit={handleSubmit} className="flex space-x-2">
        <input
          type="text"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          disabled={lockoutState.isLocked}
          placeholder={
            lockoutState.isLocked
              ? `Locked (${lockoutState.remainingCooldownSeconds}s remaining)`
              : "Enter voucher code"
          }
          className="flex-1 px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
          aria-label="Voucher Code Input"
        />
        <button
          type="submit"
          disabled={lockoutState.isLocked || !code.trim()}
          className="px-4 py-2 text-sm font-medium rounded-lg text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
        >
          Apply
        </button>
      </form>

      {lockoutState.isLocked && (
        <div
          role="alert"
          className="flex items-center space-x-2 text-xs text-rose-600 dark:text-rose-400 bg-rose-500/10 p-2.5 rounded-lg border border-rose-500/20"
        >
          <Clock className="w-4 h-4 shrink-0" />
          <span>
            Brute-force protection: Input locked after 5 failed attempts. Please wait{" "}
            <strong>{lockoutState.remainingCooldownSeconds}s</strong> before trying again.
          </span>
        </div>
      )}

      {!lockoutState.isLocked && feedback && (
        <div
          role="alert"
          className={`flex items-center space-x-2 text-xs p-2.5 rounded-lg border ${
            feedback.type === "success"
              ? "text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border-emerald-500/20"
              : "text-rose-600 dark:text-rose-400 bg-rose-500/10 border-rose-500/20"
          }`}
        >
          {feedback.type === "success" ? (
            <CheckCircle className="w-4 h-4 shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 shrink-0" />
          )}
          <span>{feedback.message}</span>
        </div>
      )}
    </div>
  );
};
