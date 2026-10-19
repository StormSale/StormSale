import React, { createContext, useContext, useState, useCallback, useRef } from "react";
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

export interface OptimisticNotificationOptions {
  /** Called immediately (synchronously) so callers can apply optimistic state within <50ms. */
  onOptimistic?: () => void;
  /** Called if the underlying transaction fails; must restore the pre-optimistic state. */
  onRevert?: () => void;
  /** Called when the transaction is confirmed on-chain. */
  onConfirm?: () => void;
  /** Optional promise representing the on-chain transaction. */
  transaction?: Promise<unknown>;
  /** Message shown while the transaction is pending. Defaults to "Transaction pending...". */
  pendingMessage?: string;
  /** Message shown on success. Defaults to the original notification message. */
  successMessage?: string;
  /** Message shown on failure. Defaults to the original notification message. */
  failureMessage?: string;
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
  showOptimisticNotification: (
    notification: Omit<Notification, "id">,
    options?: OptimisticNotificationOptions,
  ) => string;
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
  const notificationsRef = useRef<Notification[]>([]);
  notificationsRef.current = notifications;

  const dismissNotification = (id: string) => {
    setNotifications((prev) => prev.filter((notification) => notification.id !== id));
  };

  const clearAllNotifications = () => {
    setNotifications([]);
  };

  const showNotification = useCallback((notification: Omit<Notification, "id">): string => {
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

  /**
   * Optimistic UI helper: applies the caller's optimistic state synchronously
   * (well under 50ms), shows a pending notification, then either confirms or
   * reverts based on the transaction outcome.
   */
  const showOptimisticNotification = useCallback(
    (
      notification: Omit<Notification, "id">,
      options: OptimisticNotificationOptions = {},
    ): string => {
      const {
        onOptimistic,
        onRevert,
        onConfirm,
        transaction,
        pendingMessage = "Transaction pending...",
        successMessage,
        failureMessage,
      } = options;

      // 1. Apply optimistic state immediately (synchronous, <50ms).
      if (onOptimistic) {
        try {
          onOptimistic();
        } catch (err) {
          // If optimistic application itself throws, do not proceed.
          // eslint-disable-next-line no-console
          console.error("[optimistic] onOptimistic threw:", err);
          throw err;
        }
      }

      // 2. Show a pending notification right away.
      const pendingId = showNotification({
        ...notification,
        type: "info",
        message: pendingMessage,
        persistent: true,
        duration: 0,
      });

      // 3. If a transaction promise was provided, wire up confirm/revert.
      if (transaction) {
        transaction
          .then(() => {
            if (onConfirm) onConfirm();
            dismissNotification(pendingId);
            showNotification({
              ...notification,
              type: "success",
              message: successMessage ?? notification.message,
              persistent: false,
              duration: notification.duration ?? 5000,
            });
          })
          .catch((err: unknown) => {
            // Reliable revert on failure.
            if (onRevert) {
              try {
                onRevert();
              } catch (revertErr) {
                // eslint-disable-next-line no-console
                console.error("[optimistic] onRevert threw:", revertErr);
              }
            }
            dismissNotification(pendingId);
            showNotification({
              ...notification,
              type: "error",
              message: failureMessage ?? notification.message,
              persistent: false,
              duration: notification.duration ?? 7000,
            });
            // eslint-disable-next-line no-console
            console.error("[optimistic] transaction failed:", err);
          });
      }

      return pendingId;
    },
    [showNotification],
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
        showOptimisticNotification,
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
                    <span className="text-[10px] font-extrabold uppercase tracking-wide text-amber-600 dark:text-amber-400">
                      Persistent
                    </span>
                  )}
                </div>
                {notification.message && (
                  <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-300 leading-relaxed">
                    {notification.message}
                  </p>
                )}
                {actionLabel && (
                  <button
                    type="button"
                    onClick={() => {
                      if (notification.onAction) {
                        notification.onAction();
                      } else if (actionUrl) {
                        window.location.href = actionUrl;
                      }
                    }}
                    className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline"
                  >
                    {actionLabel}
                    {actionUrl ? <ExternalLink className="w-3.5 h-3.5" /> : <ArrowRight className="w-3.5 h-3.5" />}
                  </button>
                )}
              </div>
              <button
                type="button"
                onClick={() => dismissNotification(notification.id)}
                aria-label="Dismiss notification"
                className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 shrink-0"
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

export const useNotification = (): NotificationContextType => {
  const ctx = useContext(NotificationContext);
  if (!ctx) {
    throw new Error("useNotification must be used within a NotificationProvider");
  }
  return ctx;
};
