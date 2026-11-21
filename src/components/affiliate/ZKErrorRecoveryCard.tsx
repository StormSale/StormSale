import React, { useState } from "react";
import { AlertTriangle, RefreshCw, KeyRound, ShieldAlert } from "lucide-react";
import {
  type ZKProofErrorCode,
  calculateCircuitRetryBackoff,
  formatZKErrorMessage,
  dispatchZKTelemetryEvent,
  validateWhitelistSecret,
} from "../../lib/zkErrorRecovery";

export interface ZKErrorRecoveryCardProps {
  errorCode?: ZKProofErrorCode | null;
  errorMessage?: string;
  attemptCount?: number;
  isRetrying?: boolean;
  onRetry?: () => void;
  onSecretSubmit?: (secret: string) => void;
}

export const ZKErrorRecoveryCard: React.FC<ZKErrorRecoveryCardProps> = ({
  errorCode,
  errorMessage,
  attemptCount = 0,
  isRetrying = false,
  onRetry,
  onSecretSubmit,
}) => {
  const [secretInput, setSecretInput] = useState("");
  const [secretError, setSecretError] = useState<string | null>(null);

  if (!errorCode && !errorMessage && !secretError) {
    return null;
  }

  const activeErrorCode = errorCode || "UNHANDLED_ERROR";
  const displayMessage = secretError || formatZKErrorMessage(activeErrorCode, errorMessage);
  const nextBackoffMs = calculateCircuitRetryBackoff(attemptCount + 1);
  const nextBackoffSec = Math.round(nextBackoffMs / 1000);

  const handleSecretValidation = (e: React.FormEvent) => {
    e.preventDefault();
    const result = validateWhitelistSecret(secretInput);
    if (!result.valid) {
      setSecretError(result.error!);
      dispatchZKTelemetryEvent({
        type: "zk_proof_error",
        errorCode: "INVALID_WHITELIST_SECRET",
        message: result.error!,
        attempt: attemptCount,
        timestamp: Date.now(),
      });
    } else {
      setSecretError(null);
      onSecretSubmit?.(secretInput);
    }
  };

  return (
    <div
      role="alert"
      className="p-5 rounded-2xl border border-red-500/30 bg-red-950/20 backdrop-blur-md text-red-200 space-y-4 shadow-xl"
    >
      <div className="flex items-start gap-3">
        {activeErrorCode === "INVALID_WHITELIST_SECRET" ? (
          <KeyRound className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
        ) : (
          <AlertTriangle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
        )}

        <div className="flex-1 space-y-1">
          <h4 className="text-sm font-bold tracking-tight text-white flex items-center gap-2">
            <span>
              {activeErrorCode === "INVALID_WHITELIST_SECRET"
                ? "Invalid Access Credentials"
                : activeErrorCode === "CIRCUIT_TIMEOUT"
                  ? "Proof Circuit Timeout"
                  : "Proof Generation Error"}
            </span>
            {attemptCount > 0 && (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-500/20 text-red-300 font-medium">
                {`Attempt ${attemptCount}`}
              </span>
            )}
          </h4>

          <p className="text-xs text-zinc-300 leading-relaxed">{displayMessage}</p>
        </div>
      </div>

      {/* Secret Entry Recovery Form */}
      {activeErrorCode === "INVALID_WHITELIST_SECRET" && (
        <form onSubmit={handleSecretValidation} className="space-y-3 pt-1">
          <div className="flex gap-2">
            <input
              type="text"
              value={secretInput}
              onChange={(e) => {
                setSecretInput(e.target.value);
                setSecretError(null);
              }}
              placeholder="Enter valid whitelist secret (e.g. zk_wh_sec_...)"
              className="flex-1 px-3 py-2 text-xs rounded-xl bg-zinc-900 border border-zinc-700 text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-amber-500/50"
            />
            <button
              type="submit"
              className="px-4 py-2 text-xs font-semibold rounded-xl bg-amber-500 hover:bg-amber-400 text-black transition-colors"
            >
              Verify Secret
            </button>
          </div>
        </form>
      )}

      {/* Circuit Timeout Exponential Backoff Retry Button */}
      {activeErrorCode === "CIRCUIT_TIMEOUT" && (
        <div className="flex items-center justify-between pt-2 border-t border-red-500/20">
          <div className="text-[11px] text-zinc-400 flex items-center gap-1.5">
            <ShieldAlert className="w-3.5 h-3.5 text-amber-400" />
            <span>{`Exponential backoff delay: ${nextBackoffSec}s (${nextBackoffMs}ms)`}</span>
          </div>

          <button
            type="button"
            onClick={onRetry}
            disabled={isRetrying}
            className="inline-flex items-center gap-2 px-3.5 py-1.5 text-xs font-semibold rounded-xl bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white transition-all shadow-md"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRetrying ? "animate-spin" : ""}`} />
            <span>{isRetrying ? "Retrying Circuit..." : `Retry in ${nextBackoffSec}s`}</span>
          </button>
        </div>
      )}
    </div>
  );
};
