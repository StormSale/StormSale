import React, { useState, useEffect, useMemo, useCallback } from "react";
import { Volume2, VolumeX, X, TrendingUp, Sparkles, Layers } from "lucide-react";
import {
  EarningsToastQueue,
  EarningsSoundManager,
  EarningsStreamListener,
  type EarningsToast,
  defaultSoundManager,
} from "../../lib/b2cEarningsToasts";

export interface B2CEarningsToastsProps {
  readonly affiliateAddress?: string;
  readonly queue?: EarningsToastQueue;
  readonly soundManager?: EarningsSoundManager;
  readonly streamListener?: EarningsStreamListener;
  readonly maxVisibleToasts?: number;
  readonly autoDismissMs?: number;
  readonly showMuteToggle?: boolean;
  readonly className?: string;
}

export const B2CEarningsToasts: React.FC<B2CEarningsToastsProps> = ({
  affiliateAddress,
  queue: externalQueue,
  soundManager: externalSoundManager,
  streamListener,
  maxVisibleToasts = 5,
  autoDismissMs = 5000,
  showMuteToggle = true,
  className = "",
}) => {
  const soundMgr = useMemo(
    () => externalSoundManager ?? defaultSoundManager,
    [externalSoundManager],
  );

  const [isMuted, setIsMuted] = useState<boolean>(() => soundMgr.isMuted());

  const queue = useMemo(() => {
    if (externalQueue) return externalQueue;
    return new EarningsToastQueue({
      maxVisibleToasts,
      defaultDurationMs: autoDismissMs,
      soundManager: soundMgr,
    });
  }, [externalQueue, maxVisibleToasts, autoDismissMs, soundMgr]);

  const [toasts, setToasts] = useState<EarningsToast[]>(() => queue.getToasts());

  // Subscribe to queue updates
  useEffect(() => {
    const unsubscribe = queue.subscribe((updatedToasts) => {
      setToasts(updatedToasts);
    });
    return () => {
      unsubscribe();
    };
  }, [queue]);

  // Subscribe to sound mute preference changes
  useEffect(() => {
    const unsubscribe = soundMgr.subscribe((muted) => {
      setIsMuted(muted);
    });
    return () => {
      unsubscribe();
    };
  }, [soundMgr]);

  // Link stream listener if provided
  useEffect(() => {
    if (streamListener) {
      if (affiliateAddress) {
        streamListener.setAffiliateAddress(affiliateAddress);
      }
    }
  }, [streamListener, affiliateAddress]);

  const handleToggleMute = useCallback(() => {
    const nextState = soundMgr.toggleMute();
    setIsMuted(nextState);
  }, [soundMgr]);

  const handleDismiss = useCallback(
    (toastId: string) => {
      queue.dismiss(toastId);
    },
    [queue],
  );

  return (
    <div
      className={`fixed bottom-5 right-5 z-50 flex flex-col items-end space-y-3 pointer-events-none max-w-sm w-full sm:max-w-md ${className}`}
      data-testid="earnings-toast-container"
      aria-label="Real-time earnings notifications"
    >
      {/* Sound Mute Toggle Toolbar */}
      {showMuteToggle && (
        <div className="pointer-events-auto flex items-center shadow-lg rounded-2xl bg-white/90 dark:bg-zinc-900/90 backdrop-blur-md border border-slate-200 dark:border-zinc-800 p-1.5 px-3 gap-2">
          <button
            type="button"
            onClick={handleToggleMute}
            className={`flex items-center gap-1.5 text-xs font-bold px-2 py-1 rounded-xl transition-all ${
              isMuted
                ? "bg-rose-50 text-rose-600 dark:bg-rose-950/60 dark:text-rose-300"
                : "bg-indigo-50 text-indigo-600 dark:bg-indigo-950/60 dark:text-indigo-300"
            }`}
            data-testid="toggle-mute-sound"
            aria-pressed={isMuted}
            aria-label={isMuted ? "Unmute notification sounds" : "Mute notification sounds"}
          >
            {isMuted ? (
              <>
                <VolumeX className="w-3.5 h-3.5" />
                <span>Sounds Muted</span>
              </>
            ) : (
              <>
                <Volume2 className="w-3.5 h-3.5" />
                <span>Sounds Active</span>
              </>
            )}
          </button>
        </div>
      )}

      {/* Stacked Toasts List */}
      <div
        className="w-full flex flex-col space-y-2 pointer-events-auto"
        data-testid="earnings-toast-stack"
        role="status"
        aria-live="polite"
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            data-testid={`earnings-toast-${toast.id}`}
            data-testid-alt="earnings-toast"
            className="relative p-4 rounded-3xl border border-emerald-300 dark:border-emerald-800/80 bg-white dark:bg-zinc-900 shadow-xl overflow-hidden backdrop-blur-md transition-all animate-in fade-in slide-in-from-bottom-3"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3 min-w-0">
                <div
                  className={`w-9 h-9 rounded-2xl flex items-center justify-center shrink-0 ${
                    toast.tier === 1
                      ? "bg-emerald-100 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400"
                      : "bg-indigo-100 text-indigo-600 dark:bg-indigo-950/60 dark:text-indigo-400"
                  }`}
                >
                  {toast.tier === 1 ? (
                    <TrendingUp className="w-5 h-5" />
                  ) : (
                    <Layers className="w-5 h-5" />
                  )}
                </div>

                <div className="flex flex-col min-w-0">
                  <div className="flex items-center gap-2">
                    <span
                      className="font-extrabold text-sm text-zinc-900 dark:text-white"
                      data-testid="earnings-toast-title"
                    >
                      {toast.title}
                    </span>
                    <span
                      className={`text-[10px] font-black px-2 py-0.5 rounded-full border ${
                        toast.tier === 1
                          ? "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/80 dark:text-emerald-300 dark:border-emerald-800"
                          : "bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/80 dark:text-indigo-300 dark:border-indigo-800"
                      }`}
                      data-testid="earnings-toast-tier"
                    >
                      {toast.tier === 1 ? "Tier 1 Direct" : "Tier 2 Override"}
                    </span>
                  </div>

                  <p
                    className="text-xs text-zinc-600 dark:text-zinc-300 mt-1 leading-snug break-words"
                    data-testid="earnings-toast-message"
                  >
                    {toast.message}
                  </p>

                  <div className="flex items-center gap-3 mt-2">
                    <div
                      className="inline-flex items-center gap-1 font-mono font-extrabold text-xs text-emerald-600 dark:text-emerald-400"
                      data-testid="earnings-toast-amount"
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>+{toast.commissionAmountXlm.toFixed(2)} XLM</span>
                    </div>

                    {toast.txHash && (
                      <span className="text-[10px] font-mono text-zinc-400">
                        Tx: {toast.txHash.slice(0, 8)}...
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Dismiss Button */}
              <button
                type="button"
                onClick={() => handleDismiss(toast.id)}
                className="text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 p-1 rounded-lg transition-colors"
                aria-label="Dismiss toast"
                data-testid={`dismiss-toast-${toast.id}`}
                data-dismiss-btn="true"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* 5-second Auto-Dismiss Progress Indicator */}
            <div
              className="absolute bottom-0 left-0 right-0 h-1 bg-slate-100 dark:bg-zinc-800/80 overflow-hidden"
              data-testid="toast-progress-bar"
            >
              <div
                className="h-full bg-emerald-500 transition-all duration-100"
                style={{ width: "100%" }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
