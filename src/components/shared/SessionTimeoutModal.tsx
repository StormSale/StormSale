import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ShieldAlert, Clock, LogOut, RefreshCw } from "lucide-react";

export interface SessionTimeoutModalProps {
  isOpen: boolean;
  remainingSeconds: number;
  totalWarningSeconds?: number;
  onExtend: () => void;
  onDisconnect: () => void;
}

export const SessionTimeoutModal: React.FC<SessionTimeoutModalProps> = ({
  isOpen,
  remainingSeconds,
  totalWarningSeconds = 120,
  onExtend,
  onDisconnect,
}) => {
  if (!isOpen) return null;

  const minutes = Math.floor(remainingSeconds / 60);
  const seconds = remainingSeconds % 60;
  const formattedTime = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;

  // Calculate percentage of remaining warning time
  const progressPercent = Math.min(
    100,
    Math.max(0, (remainingSeconds / totalWarningSeconds) * 100),
  );

  return (
    <AnimatePresence>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
        role="dialog"
        aria-modal="true"
        aria-labelledby="session-timeout-title"
        aria-describedby="session-timeout-desc"
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          transition={{ duration: 0.2 }}
          className="w-full max-w-md bg-card text-card-foreground border border-amber-500/30 rounded-2xl p-6 shadow-2xl relative overflow-hidden"
        >
          {/* Ambient Warning Glow */}
          <div className="absolute -top-24 -right-24 w-48 h-48 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute -bottom-24 -left-24 w-48 h-48 bg-primary/10 rounded-full blur-3xl pointer-events-none" />

          {/* Header Icon */}
          <div className="flex flex-col items-center text-center">
            <div className="relative mb-4">
              <div className="w-16 h-16 rounded-full bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-500 shadow-inner">
                <ShieldAlert className="w-8 h-8 animate-pulse text-amber-500" />
              </div>
              <div className="absolute -bottom-1 -right-1 bg-amber-500 text-black p-1 rounded-full ring-2 ring-card">
                <Clock className="w-3.5 h-3.5" />
              </div>
            </div>

            <h3 id="session-timeout-title" className="text-xl font-bold tracking-tight mb-2">
              Session Inactivity Warning
            </h3>

            <p id="session-timeout-desc" className="text-sm text-muted-foreground mb-6">
              You have been inactive for close to 30 minutes. To protect your wallet and funds, your
              active session will automatically disconnect soon.
            </p>

            {/* Countdown Display Card */}
            <div className="w-full bg-muted/50 border border-border rounded-xl p-4 mb-6">
              <div className="flex items-center justify-between text-xs text-muted-foreground uppercase font-semibold tracking-wider mb-2">
                <span>Time Remaining</span>
                <span className="text-amber-500 font-bold">Auto-Disconnect</span>
              </div>

              <div className="text-4xl font-mono font-extrabold text-foreground tracking-wider py-1">
                {formattedTime}
              </div>

              {/* Progress Countdown Bar */}
              <div className="w-full bg-background rounded-full h-2 mt-3 overflow-hidden border border-border">
                <motion.div
                  className="bg-gradient-to-r from-amber-500 to-red-500 h-full rounded-full"
                  initial={false}
                  animate={{ width: `${progressPercent}%` }}
                  transition={{ duration: 0.5, ease: "linear" }}
                />
              </div>
            </div>

            {/* Action Buttons */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full">
              <button
                type="button"
                onClick={onExtend}
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl font-semibold text-sm bg-primary text-primary-foreground hover:bg-primary/90 transition-colors shadow-sm focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
                autoFocus
              >
                <RefreshCw className="w-4 h-4" />
                Stay Connected
              </button>

              <button
                type="button"
                onClick={onDisconnect}
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl font-medium text-sm bg-destructive/10 text-destructive hover:bg-destructive/20 border border-destructive/20 transition-colors focus:outline-none focus:ring-2 focus:ring-destructive focus:ring-offset-2"
              >
                <LogOut className="w-4 h-4" />
                Disconnect Now
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
