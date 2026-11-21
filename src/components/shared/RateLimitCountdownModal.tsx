import React, { useState, useEffect } from "react";
import { Dialog } from "../ui/dialog";
import { Clock, ShieldAlert } from "lucide-react";

export interface RateLimitCountdownModalProps {
  isOpen: boolean;
  retryAfterSeconds: number;
  endpoint?: string;
  message?: string;
  onComplete?: () => void;
  onClose?: () => void;
}

export const RateLimitCountdownModal: React.FC<RateLimitCountdownModalProps> = ({
  isOpen,
  retryAfterSeconds,
  endpoint,
  message,
  onComplete,
  onClose,
}) => {
  const [secondsRemaining, setSecondsRemaining] = useState(retryAfterSeconds);

  useEffect(() => {
    setSecondsRemaining(retryAfterSeconds);
  }, [retryAfterSeconds, isOpen]);

  useEffect(() => {
    if (!isOpen || secondsRemaining <= 0) {
      if (isOpen && secondsRemaining <= 0) {
        onComplete?.();
      }
      return;
    }

    const timer = setInterval(() => {
      setSecondsRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          onComplete?.();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [isOpen, secondsRemaining, onComplete]);

  if (!isOpen) return null;

  const displayMessage =
    message || (secondsRemaining > 0 ? `Please wait ${secondsRemaining}s` : "Requests ready to resume");

  const progressPercent = Math.max(
    0,
    Math.min(100, retryAfterSeconds > 0 ? ((retryAfterSeconds - secondsRemaining) / retryAfterSeconds) * 100 : 100),
  );

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose?.()}>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md"
        data-testid="rate-limit-modal"
      >
        <div
          className="border border-amber-500/30 bg-zinc-950 text-white shadow-2xl rounded-3xl p-6 max-w-sm w-full relative"
          role="dialog"
          aria-modal="true"
        >
          <div className="items-center text-center pt-2">
            <div className="w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 mb-3 mx-auto animate-pulse">
              <ShieldAlert className="w-7 h-7" />
            </div>
            <h2 className="text-xl font-bold tracking-tight text-white flex items-center justify-center gap-2">
              Rate Limit Exceeded
            </h2>
            <p className="text-zinc-400 text-xs mt-1">
              Too many rapid requests were detected. To prevent spam and replay exploits, a temporary backoff is in effect.
            </p>
          </div>

          <div className="py-4 space-y-4">
            <div className="p-4 rounded-2xl bg-amber-950/20 border border-amber-500/20 text-center space-y-2">
              <div className="flex items-center justify-center space-x-2 text-amber-300 font-mono text-lg font-bold">
                <Clock className="w-5 h-5 animate-spin text-amber-400" />
                <span data-testid="rate-limit-countdown">{displayMessage}</span>
              </div>
              {endpoint && (
                <p className="text-[11px] font-mono text-zinc-400 truncate max-w-[280px] mx-auto">
                  Endpoint: {endpoint}
                </p>
              )}
            </div>

            {/* Progress bar */}
            <div className="w-full bg-zinc-800 rounded-full h-1.5 overflow-hidden">
              <div
                className="bg-amber-400 h-full transition-all duration-1000 ease-linear rounded-full"
                style={{ width: `${progressPercent}%` }}
                role="progressbar"
                aria-valuenow={progressPercent}
                aria-valuemin={0}
                aria-valuemax={100}
              />
            </div>
          </div>
        </div>
      </div>
    </Dialog>
  );
};
