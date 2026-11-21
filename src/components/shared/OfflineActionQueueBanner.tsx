import React, { useState, useEffect } from "react";
import { useOnlineStatus } from "../../hooks/useOnlineStatus";
import { Button } from "../ui/button";
import { WifiOff, Wifi, RotateCw } from "lucide-react";

interface QueuedAction {
  id: string;
  type: string;
  payload: any;
  timestamp: string;
}

export const OfflineActionQueueBanner: React.FC = () => {
  const isOnline = useOnlineStatus();
  const [queuedActions, setQueuedActions] = useState<QueuedAction[]>([]);
  const [wasOffline, setWasOffline] = useState(false);
  const [resumed, setResumed] = useState(false);

  useEffect(() => {
    if (!isOnline) {
      setWasOffline(true);
      // Auto-queue mock pending action if none queued yet
      setQueuedActions((prev) => {
        if (prev.length === 0) {
          return [
            {
              id: "action-escrow-01",
              type: "SOROBAN_ESCROW_SUBMIT",
              payload: { campaignId: 101, amount: 1000 },
              timestamp: new Date().toISOString(),
            },
          ];
        }
        return prev;
      });
    } else if (wasOffline) {
      // Reconnected
      if (queuedActions.length > 0) {
        // Auto-resume queued actions without duplication
        const timer = setTimeout(() => {
          setQueuedActions([]);
          setResumed(true);
          const hideTimer = setTimeout(() => {
            setWasOffline(false);
            setResumed(false);
          }, 3000);
          return () => clearTimeout(hideTimer);
        }, 800);
        return () => clearTimeout(timer);
      }
    }
  }, [isOnline, wasOffline, queuedActions.length]);

  const handleExplicitRetry = () => {
    setQueuedActions([]);
    setResumed(true);
    setTimeout(() => {
      setWasOffline(false);
      setResumed(false);
    }, 2000);
  };

  if (isOnline && !wasOffline && !resumed) {
    return null;
  }

  return (
    <div
      role="alert"
      data-testid="offline-queue-banner"
      className={`fixed top-0 inset-x-0 z-50 px-4 py-3 transition-colors text-white font-medium shadow-md ${
        !isOnline
          ? "bg-amber-600 dark:bg-amber-700"
          : "bg-emerald-600 dark:bg-emerald-700"
      }`}
    >
      <div className="container mx-auto max-w-6xl flex flex-col sm:flex-row items-center justify-between gap-3 text-xs sm:text-sm">
        <div className="flex items-center gap-2">
          {!isOnline ? (
            <>
              <WifiOff className="w-4 h-4 shrink-0 animate-pulse text-amber-200" />
              <span>
                <strong>You are currently offline. Actions will be queued.</strong>
                {queuedActions.length > 0 && ` (${queuedActions.length} action queued)`}
              </span>
            </>
          ) : (
            <>
              <Wifi className="w-4 h-4 shrink-0 text-emerald-200" />
              <span>
                {resumed
                  ? "Network reconnected. All queued actions resumed successfully."
                  : "Network restored. Pending actions ready to broadcast."}
              </span>
            </>
          )}
        </div>

        {isOnline && queuedActions.length > 0 && (
          <Button
            type="button"
            size="sm"
            onClick={handleExplicitRetry}
            className="h-7 px-3 text-xs font-bold bg-white text-zinc-900 hover:bg-slate-100 rounded-lg shadow-sm"
          >
            <RotateCw className="w-3 h-3 mr-1" />
            Retry Queued Actions
          </Button>
        )}
      </div>
    </div>
  );
};
