import React, { createContext, useContext, useState, useRef, useCallback, useEffect } from "react";
import type { ReactNode } from "react";
import {
  CheckCircle2,
  XCircle,
  AlertCircle,
  AlertTriangle,
  X,
  ExternalLink,
  ArrowRight,
} from "lucide-react";

export type NotificationType = "success" | "error" | "warning" | "info";

export interface NotificationAction {
  label: string;
  url?: string;
  onClick?: () => void;
}

export interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  message?: string;
  duration?: number;
  persistent?: boolean;
  action?: NotificationAction;
  actionLabel?: string;
  actionUrl?: string;
  onAction?: () => void;
  campaignId?: string;
}

export interface TransactionPollingState {
  isPolling: boolean;
  attempt: number;
  elapsedMs: number;
  timedOut: boolean;
  txHash?: string;
}

export interface TransactionPollingOptions {
  txHash: string;
  checkStatus: () => Promise<"pending" | "success" | "failed">;
  initialDelayMs?: number;
  maxDelayMs?: number;
  backoffFactor?: number;
  timeoutMs?: number;
  onSuccess?: (txHash: string) => void;
  onFailure?: (txHash: string) => void;
  onTimeout?: (txHash: string, state: TransactionPollingState) => void;
}

export interface NotificationContextType {
  notifications: Notification[];
  showNotification: (notification: Omit<Notification, "id">) => string;
  dismissNotification: (id: string) => void;
  notifyLowEscrowBalance: (params: {
    campaignName: string;
    remainingXlm: number;
    percentageRemaining: number;
    campaignId?: string;
    topUpUrl?: string;
    onTopUp?: () => void;
  }) => string;
  checkEscrowBalances: (campaigms: EscrowMonitoredCampaign[]) => void;
  clearAllNotifications: () => void;
  startTransactionPolling: (options: TransactionPollingOptions) => void;
  stopTransactionPolling: (txHash: string) => void;
  getPollingState: (txHash: string) => TransactionPollingState | undefined;
}

export interface EscrowMonitoredCampaign {
  id: string;
  name: string;
  escrowInitial: number;
  escrowBalance: number;
  status?: string;
}

/**
 * Evaluates campaign escrow funds and determines whether a critical low-balance condition exists (< 10%).
 */
export function evaluateCampaignEscrowLevel(campaign: EscrowMonitoredCampaign): {
  isLowEscrow: boolean;
  remainingXlm: number;
  percentageRemaining: number;
} {
  if (campaign.status === "Completed" || campaign.escrowInitial <= 0) {
    return { isLowEscrow: false, remainingXlm: campaign.escrowBalance, percentageRemaining: 0 };
  }
  const percentage = (campaign.escrowBalance / campaign.escrowInitial) * 100;
  return {
    isLowEscrow: percentage < 10 && campaign.escrowBalance > 0,
    remainingXlm: campaign.escrowBalance,
    percentageRemaining: percentage,
  };
}

/**
 * Computes the next polling delay using exponential backoff with a cap.
 */
export function computeBackoffDelay(
  attempt: number,
  initialDelayMs = 1000,
  backoffFactor = 2,
  maxDelayMs = 30000,
): number {
  const delay = initialDelayMs * Math.pow(backoffFactor, Math.max(0, attempt));
  return Math.min(delay, maxDelayMs);
}

/**
 * Builds a persistent timeout notification with a retry prompt action.
 */
export function buildTransactionTimeoutNotification(txHash: string): Omit<Notification, "id"> {
  return {
    type: "warning",
    title: "Transaction Confirmation Timed Out",
    message: `We could not confirm transaction ${txHash.slice(0, 10)}... within the expected time. It may still be pending on-chain.`,
    persistent: true,
    duration: 0,
    actionLabel: "Retry Confirmation",
  };
}

/**
 * Builds a structured persistent notification payload with Top Up flow action details.
 */
export function buildLowEscrowNotification(params: {
  campaignName: string;
  remainingXlm: number;
  percentageRemaining: number;
  campaignId?: string;
  topUpUrl?: string;
  onTopUp?: () => void;
}): Omit<Notification, "id"> {
  const defaultTopUpUrl = params.campaignId
    ? `/advertiser?action=topup&campaignId=${encodeURIComponent(params.campaignId)}`
    : `/advertiser?action=topup`;

  return {
    type: "warning",
    title: `Low Escrow Alert: ${params.campaignName}`,
    message: `Remaining balance is critically low at ${params.remainingXlm.toLocaleString()} XLM (${params.percentageRemaining.toFixed(
       1,
     )}%). Payouts will stall if escrow is exhausted.`,
    persistent: true,
    duration: 0,
    campaignId: params.campaignId,
    actionLabel: "Top Up Escrow",
    actionUrl: params.topUpUrl || defaultTopUpUrl,
    onAction: params.onTopUp,
  };
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export const NotificationProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const pollingStatesRef = useRef<Map<string, TransactionPollingState>>(new Map());
  const pollingTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const dismissNotification = (id: string) => {
    setNotifications((prev) => prev.filter((notification) => notification.id !== id));
  };

  const clearAllNotifications = () => {
    setNotifications([]);
  };

  const stopTransactionPolling = useCallback((txHash: string) => {
    const timer = pollingTimersRef.current.get(txHash);
    if (timer) {
      clearTimeout(timer);
      pollingTimersRef.current.delete(txHash);
    }
    pollingStatesRef.current.delete(txHash);
  }, []);

  const showNotification = (notification: Omit<Notification, "id">): string => {
    const id = Math.random().toString(36).substring(2, 11);
    const isPersistent = notification.persistent === true || notification.duration === 0;

    const newNotification: Notification = {
      ...notification,
      id,
      persistent: isPersistent,
      duration: isPersistent ? 0 : notification.duration ?? 5000,
    };

    setNotifications((prev) => [...prev, newNotification]);

    // Only set auto-dismiss timeout if notification is NOT persistent
    if (!isPersistent && newNotification.duration && newNotification.duration > 0) {
      setTimeout(() => {
        dismissNotification(id);
      }, newNotification.duration);
    }

    return id;
  };

  const startTransactionPolling = useCallback(
    (options: TransactionPollingOptions) => {
      const {
        txHash,
        checkStatus,
        initialDelayMs = 1000,
        maxDelayMs = 30000,
        backoffFactor = 2,
        timeoutMs = 120000,
        onSuccess,
        onFailure,
        onTimeout,
      } = options;

      // Reset any existing polling for this tx
      const existingTimer = pollingTimersRef.current.get(txHash);
      if (existingTimer) {
        clearTimeout(existingTimer);
        pollingTimersRef.current.delete(txHash);
      }

      const startedAt = Date.now();
      const initialState: TransactionPollingState = {
        isPolling: true,
        attempt: 0,
        elapsedMs: 0,
        timedOut: false,
        txHash,
      };
      pollingStatesRef.current.set(txHash, initialState);

      const runAttempt = async (attempt: number) => {
        const elapsed = Date.now() - startedAt;

        if (elapsed >= timeoutMs) {
          pollingStatesRef.current.set(txHash, {
            isPolling: false,
            attempt,
            elapsedMs: elapsed,
            timedOut: true,
            txHash,
          });
          pollingTimersRef.current.delete(txHash);

          const timeoutNotification = buildTransactionTimeoutNotification(txHash);
          showNotification({
            ...timeoutNotification,
            onAction: () => {
              startTransactionPolling(options);
            },
          });

          if (onTimeout) onTimeout(txHash, pollingStatesRef.current.get(txHash)!);
          return;
        }

        try {
          const status = await checkStatus();
          if (status === "success") {
            pollingStatesRef.current.set(txHash, {
              isPolling: false,
              attempt,
              elapsedMs: Date.now() - startedAt,
              timedOut: false,
              txHash,
            });
            pollingTimersRef.current.delete(txHash);
            if (onSuccess) onSuccess(txHash);
            return;
          }
          if (status === "failed") {
            pollingStatesRef.current.set(txHash, {
              isPolling: false,
              attempt,
              elapsedMs: Date.now() - startedAt,
              timedOut: false,
              txHash,
            });
            pollingTimersRef.current.delete(txHash);
            if (onFailure) onFailure(txHash);
            return;
          }
        } catch {
          // Treat transient errors as pending and continue polling
        }

        const nextAttempt = attempt + 1;
        const delay = computeBackoffDelay(nextAttempt, initialDelayMs, backoffFactor, maxDelayMs);
        pollingStatesRef.current.set(txHash, {
          isPolling: true,
          attempt: nextAttempt,
          elapsedMs: Date.now() - startedAt,
          timedOut: false,
          txHash,
        });

        const timer = setTimeout(() => {
          runAttempt(nextAttempt);
        }, delay);
        pollingTimersRef.current.set(txHash, timer);
      };

      runAttempt(0);
    },
    [showNotification],
  );

  const getPollingState = useCallback((txHash: string) => {
    return pollingStatesRef.current.get(txHash);
  }, []);

  useEffect(() => {
    return () => {
      pollingTimersRef.current.forEach((timer) => clearTimeout(timer));
      pollingTimersRef.current.clear();
      pollingStatesRef.current.clear();
    };
  }, []);

  // Dedicated helper to trigger persistent low-escrow toast alerts with top-up action
  const notifyLowEscrowBalance = (params: {
    campaignName: string;
    remainingXlm: number;
    percentageRemaining: number;
    campaignId?: string;
    topUpUrl?: string;
    onTopUp?: () => void;
  }): string => {
    return showNotification(buildLowEscrowNotification(params));
  };

  // Automated background evaluation for low escrow balances
  const checkEscrowBalances = (campaigns: EscrowMonitoredCampaign[]) => {
    campaigns.forEach((campaign) => {
      const evalResult = evaluateCampaignEscrowLevel(campaign);
      if (evalResult.isLowEscrow) {
        const alreadyNotified = notifications.some(
          (n) => n.campaignId === campaign.id && n.persistent,
        );
        if (!alreadyNotified) {
          notifyLowEscrowBalance({
            campaignName: campaign.name,
            remainingXlm: evalResult.remainingXlm,
            percentageRemaining: evalResult.percentageRemaining,
            campaignId: campaign.id,
          });
        }
      }
    });
  };

  return (
    <NotificationContext.Provider
      value={{
        notifications,
        showNotification,
        dismissNotification,
        notifyLowEscrowBalance,
        checkEscrowBalances,
        clearAllNotifications,
        startTransactionPolling,
        stopTransactionPolling,
        getPollingState,
      }}
    >
      {children}
      <NotificationContainer />
    </NotificationContext.Provider>
  );
};

const NotificationContainer: React.FC = () => {
  const { notifications, dismissNotification } = useNotification();

  const getIcon = (type: NotificationType) => {
    switch (type) {
      case "success":
        return <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />;
      case "error":
        return <XCircle2 className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />;
      case "warning":
        return <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />;
      case "info":
        return <AlertCircle className="w-5 h-5 text-indigo-500 shrink-0 mt-0.5" />;
      default:
        return <AlertCircle className="w-5 h-5 text-zinc-500 shrink-0 mt-0.5" />;
    }
  };

  const getBackgroundColor = (type: NotificationType) => {
    switch (type) {
      case "success":
        return "bg-emerald-50/95 border-emerald-200";
      case "error":
        return "bg-rose-50/95 border-rose-200";
      case "warning":
        return "bg-amber-50/95 border-amber-200";
      case "info":
        return "bg-indigo-50/95 border-indigo-200";
      default:
        return "bg-zinc-50/95 border-zinc-200";
    }
  };

  if (notifications.length === 0) return null;

  return (
    <div className="fixed top-4 right-4 z-50 flex w-full max-w-sm flex-col gap-2 p-4">
      {notifications.map((n) => (
        <div
          key={N.id}
          className={`pointer-events-auto flex items-start gap-3 rounded-lg border p-4 shadow-lg ${getBackgroundColor(n.type)}`}
        >
          {getIcon(n.type)}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-zinc-900">{n.title}</p>
            {n.message && (
              <p className="mt-1 text-sm text-zinc-600">{n.message}</p>
            )}
            {(n.actionLabel || n.action) && (
              <div className="mt-2 flex items-center gap-2">
                {n.actionUrl ? (
                  <a
                    href={n.actionUrl}
                    onClick={() => {
                      n.onAction && n.onAction();
                      dismissNotification(n.id);
                    }}
                    className="inline-flex items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-700"
                  >
                    {n.actionLabel || n.action?.label}
                    <ExternalLink className="w-3 h-3" />
                  </a>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      n.onAction && n.onAction();
                      dismissNotification(n.id);
                    }}
                    className="inline-flex items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-700"
                  >
                    {n.actionLabel || n.action?.label}
                    <ArrowRight className="w-3 h-3" />
                  </button>
                )}
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={() => dismissNotification(n.id)}
            className="shrink-0 rounded p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600"
            aria-label="Dismiss notification"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      ))}
    </div>
  );
};

export const useNotification = (): NotificationContextType => {
  const ctx = useContext(NotificationContext);
  if (!ctx) {
    throw new Error("useNotification must be used within a NotificationProvider");
  }
  return ctx;
};
