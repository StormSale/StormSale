import React, { createContext, useContext, useState, useRef, useCallback } from "react";
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

export interface TransactionPollingOptions {
  txHash: string;
  checkStatus: () => Promise<"pending" | "success" | "failed">;
  initialDelayMs?: number;
  maxDelayMs?: number;
  backoffFactor?: number;
  maxAttempts?: number;
  onSuccess?: (txHash: string) => void;
  onFailure?: (txHash: string, reason?: string) => void;
  onTimeout?: (txHash: string, retry: () => void) => void;
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
  checkEscrowBalances: (campaigns: EscrowMonitoredCampaign[]) => void;
  clearAllNotifications: () => void;
  pollTransaction: (options: TransactionPollingOptions) => () => void;
  cancelTransactionPolling: (txHash: string) => void;
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
  const pollingTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const pollingCancelledRef = useRef<Set<string>>(new Set());

  const DEFAULT_INITIAL_DELAY_MS = 2000;
  const DEFAULT_MAX_DELAY_MS = 30000;
  const DEFAULT_BACKOFF_FACTOR = 1.8;
  const DEFAULT_MAX_ATTEMPTS = 12;

  const dismissNotification = (id: string) => {
    setNotifications((prev) => prev.filter((notification) => notification.id !== id));
  };

  const clearAllNotifications = () => {
    setNotifications([]);
  };

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

  const cancelTransactionPolling = useCallback((txHash: string) => {
    pollingCancelledRef.current.add(txHash);
    const timer = pollingTimersRef.current.get(txHash);
    if (timer) {
      clearTimeout(timer);
      pollingTimersRef.current.delete(txHash);
    }
  }, []);

  const pollTransaction = useCallback(
    (options: TransactionPollingOptions): (() => void) => {
      const {
        txHash,
        checkStatus,
        initialDelayMs = DEFAULT_INITIAL_DELAY_MS,
        maxDelayMs = DEFAULT_MAX_DELAY_MS,
        backoffFactor = DEFAULT_BACKOFF_FACTOR,
        maxAttempts = DEFAULT_MAX_ATTEMPTS,
        onSuccess,
        onFailure,
        onTimeout,
      } = options;

      // Reset any prior cancellation for this txHash so retries can run.
      pollingCancelledRef.current.delete(txHash);

      let attempt = 0;
      let delay = initialDelayMs;

      const scheduleNext = () => {
        if (pollingCancelledRef.current.has(txHash)) return;
        const timer = setTimeout(runAttempt, delay);
        pollingTimersRef.current.set(txHash, timer);
        // Exponential backoff with cap.
        delay = Math.min(delay * backoffFactor, maxDelayMs);
      };

      const runAttempt = async () => {
        if (pollingCancelledRef.current.has(txHash)) return;
        attempt += 1;

        try {
          const status = await checkStatus();
          if (pollingCancelledRef.current.has(txHash)) return;

          if (status === "success") {
            pollingTimersRef.current.delete(txHash);
            if (onSuccess) onSuccess(txHash);
            return;
          }

          if (status === "failed") {
            pollingTimersRef.current.delete(txHash);
            if (onFailure) onFailure(txHash, "Transaction failed on-chain");
            return;
          }
        } catch (err) {
          // Transient errors: keep polling until attempts exhausted.
        }

        if (attempt >= maxAttempts) {
          pollingTimersRef.current.delete(txHash);
          const retry = () => {
            pollTransaction(options);
          };
          if (onTimeout) {
            onTimeout(txHash, retry);
          } else {
            showNotification({
              type: "warning",
              title: "Transaction Confirmation Timed Out",
              message: `We could not confirm transaction ${txHash.slice(0, 10)}... within the expected window.`,
              persistent: true,
              duration: 0,
              actionLabel: "Retry",
              onAction: retry,
            });
          }
          return;
        }

        scheduleNext();
      };

      // Kick off first attempt after the initial delay.
      const initialTimer = setTimeout(runAttempt, delay);
      pollingTimersRef.current.set(txHash, initialTimer);
      delay = Math.min(delay * backoffFactor, maxDelayMs);

      return () => cancelTransactionPolling(txHash);
    },
    [cancelTransactionPolling, showNotification],
  );

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
        pollTransaction,
        cancelTransactionPolling,
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
        return <XCircle className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />;
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
        return "bg-white dark:bg-zinc-900 border-emerald-300 dark:border-emerald-800/80 shadow-emerald-500/10";
      case "error":
        return "bg-white dark:bg-zinc-900 border-rose-300 dark:border-rose-800/80 shadow-rose-500/10";
      case "warning":
        return "bg-white dark:bg-zinc-900 border-amber-300 dark:border-amber-800/80 shadow-amber-500/10";
      case "info":
        return "bg-white dark:bg-zinc-900 border-indigo-300 dark:border-indigo-800/80 shadow-indigo-500/10";
      default:
        return "bg-white dark:bg-zinc-900 border-slate-200 dark:border-zinc-800 shadow-zinc-500/10";
    }
  };

  if (notifications.length === 0) return null;

  return (
    <div className="fixed top-4 right-4 z-50 space-y-3 max-w-md w-full px-4 sm:px-0">
      {notifications.map((notification) => {
        const actionLabel = notification.actionLabel || notification.action?.label;
        const actionUrl = notification.actionUrl || notification.action?.url;

        return (
          <div
            key={notification.id}
            role="alert"
            className={`p-4 rounded-2xl border shadow-xl backdrop-blur-md transform transition-all duration-300 ${getBackgroundColor(
              notification.type,
            )} ${notification.persistent ? "ring-2 ring-amber-400/20" : ""}`}
          >
            <div className="flex items-start space-x-3">
              {getIcon(notification.type)}
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <h4 className="font-bold text-sm text-zinc-900 dark:text-white leading-tight">
                    {notification.title}
                  </h4>
                  {notification.persistent && (
                    <span className="text-[10px] font-extrabold uppercase px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-950/80 text-amber-700 dark:text-amber-300 border border-amber-300 dark:border-amber-800 shrink-0">
                      Persistent Alert
                    </span>
                  )}
                </div>

                {notification.message && (
                  <p className="text-xs text-zinc-600 dark:text-zinc-300 mt-1.5 leading-relaxed">
                    {notification.message}
                  </p>
                )}

                {/* Interactive Action: Link or Button to "Top Up" flow */}
                {actionLabel && (
                  <div className="mt-3 flex items-center gap-2 pt-1">
                    {actionUrl ? (
                      <a
                        href={actionUrl}
                        onClick={() => {
                          if (notification.onAction) notification.onAction();
                          if (notification.action?.onClick) notification.action.onClick();
                          dismissNotification(notification.id);
                        }}
                        className="inline-flex items-center text-xs font-bold px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white shadow-sm transition-all"
                      >
                        <span>{actionLabel}</span>
                        <ExternalLink className="w-3.5 h-3.5 ml-1.5 opacity-90" />
                      </a>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          if (notification.onAction) notification.onAction();
                          if (notification.action?.onClick) notification.action.onClick();
                          dismissNotification(notification.id);
                        }}
                        className="inline-flex items-center text-xs font-bold px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white shadow-sm transition-all"
                      >
                        <span>{actionLabel}</span>
                        <ArrowRight className="w-3.5 h-3.5 ml-1.5 opacity-90" />
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => dismissNotification(notification.id)}
                      className="text-xs text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 font-semibold px-2 py-1 transition-colors"
                    >
                      Dismiss
                    </button>
                  </div>
                )}
              </div>

              <button
                type="button"
                onClick={() => dismissNotification(notification.id)}
                className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 transition-colors p-1 -mr-1 -mt-1"
                aria-label="Close notification"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
};

export const useNotification = () => {
  const context = useContext(NotificationContext);
  if (context === undefined) {
    throw new Error("useNotification must be used within a NotificationProvider");
  }
  return context;
};

export function NotificationWrapper({ children }: { children: React.ReactNode }) {
  return <NotificationProvider>{children}</NotificationProvider>;
}

export function withNotification<P extends object>(Component: React.ComponentType<P>) {
  return function WrappedWithNotification(props: P) {
    return (
      <NotificationProvider>
        <Component {...props} />
      </NotificationProvider>
    );
  };
}
