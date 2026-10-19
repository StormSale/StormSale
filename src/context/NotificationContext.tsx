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

export type TxQueueStatus = "idle" | "queued" | "submitting" | "resyncing" | "retrying" | "failed";

export interface TxQueueState {
  status: TxQueueStatus;
  pendingCount: number;
  activeSequence?: string;
  lastError?: string;
  lastUpdated: number;
}

export interface TxQueueStatusNotificationParams {
  status: TxQueueStatus;
  pendingCount: number;
  activeSequence?: string;
  lastError?: string;
}

export interface SequenceResyncParams {
  previousSequence?: string;
  newSequence?: string;
  reason?: string;
}

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
  notifyTxQueueStatus: (params: TxQueueStatusNotificationParams) => string;
  notifySequenceResync: (params: SequenceResyncParams) => string;
  notifySequenceRetry: (attempt: number, maxAttempts: number) => string;
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

/**
 * Builds a structured notification payload describing the current in-flight
 * transaction queue status so merchants can see pending submissions at a glance.
 */
export function buildTxQueueStatusNotification(
  params: TxQueueStatusNotificationParams,
): Omit<Notification, "id"> {
  const { status, pendingCount, activeSequence, lastError } = params;
  const sequenceSuffix = activeSequence ? ` (seq ${activeSequence})` : "";

  switch (status) {
    case "queued":
      return {
        type: "info",
        title: "Transaction Queued",
        message: `${pendingCount} transaction${pendingCount === 1 ? "" : "s"} waiting in the in-flight queue${sequenceSuffix}.`,
        duration: 3000,
      };
    case "submitting":
      return {
        type: "info",
        title: "Submitting Transaction",
        message: `Broadcasting transaction${sequenceSuffix}. ${pendingCount} remaining in queue.`,
        duration: 2500,
      };
    case "resyncing":
      return {
        type: "warning",
        title: "Resyncing Sequence",
        message: `Sequence mismatch detected${lastError ? `: ${lastError}` : ""}. Fetching latest sequence from Horizon.`,
        duration: 4000,
      };
    case "retrying":
      return {
        type: "warning",
        title: "Retrying Transaction",
        message: `Retrying with updated sequence${sequenceSuffix}. ${pendingCount} remaining in queue.`,
        duration: 3500,
      };
    case "failed":
      return {
        type: "error",
        title: "Transaction Failed",
        message: lastError
          ? `Transaction failed after retry: ${lastError}`
          : "Transaction failed after retry with resynced sequence.",
        persistent: true,
        duration: 0,
      };
    case "idle":
    default:
      return {
        type: "success",
        title: "Queue Cleared",
        message: "All in-flight transactions have been processed.",
        duration: 3000,
      };
  }
}

/**
 * Builds a notification payload for a sequence resync event triggered by a
 * `txBAD_SEQb error returned from Horizon.
 */
export function buildSequenceResyncNotification(
  params: SequenceResyncParams,
): Omit<Notification, "id"> {
  const { previousSequence, newSequence, reason } = params;
  const detail =
    previousSequence && newSequence
      ? `Local sequence ${previousSequence} was stale; resynced to ${newSequence}.`
      : "Local sequence was stale; resynced from Horizon.";

  return {
    type: "warning",
    title: "Sequence Resynchronized",
    message: reason ? `${detail} Reason: ${reason}` : detail,
    duration: 4000,
  };
}

/**
 * Builds a notification payload for a single automatic retry of a failed
 * sequence transaction.
 */
export function buildSequenceRetryNotification(
  attempt: number,
  maxAttempts: number,
): Omit<Notification, "id"> {
  return {
    type: "info",
    title: "Retrying Transaction",
    message: `Automatic retry ${attempt} of ${maxAttempts} with updated sequence number.`,
    duration: 3000,
  };
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export const NotificationProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const notificationsRef = useRef<Notification[]>([]);

  const dismissNotification = (id: string) => {
    setNotifications((prev) => prev.filter((notification) => notification.id !== id));
  };

  const clearAllNotifications = () => {
    setNotifications([]);
    notificationsRef.current = [];
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
    notificationsRef.current = [...notificationsRef.current, newNotification];

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

  // Dedicated helper to surface in-flight transaction queue status to the user
  const notifyTxQueueStatus = useCallback(
    (params: TxQueueStatusNotificationParams): string => {
      return showNotification(buildTxQueueStatusNotification(params));
    },
    [showNotification],
  );

  // Dedicated helper to surface a sequence resync event (triggered by txBAD_SEQ)
  const notifySequenceResync = useCallback((params: SequenceResyncParams): string => {
    return showNotification(buildSequenceResyncNotification(params));
  }, [showNotification]);

  // Dedicated helper to surface an automatic retry of a sequence transaction
  const notifySequenceRetry = useCallback((attempt: number, maxAttempts: number): string => {
    return showNotification(buildSequenceRetryNotification(attempt, maxAttempts));
  }, [showNotification]);

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
        notifyTxQueueStatus,
        notifySequenceResync,
        notifySequenceRetry,
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
    <div
      className="fixed top-4 right-4 z-50 flex w-full max-w-sm flex-col gap-3 pointer-events-none"
      aria-live="polite"
      role="status"
    >
      {notifications.map((notification) => (
        <div
          key={notification.id}
          className={`relative pointer-events-auto rounded-lg border p-4 shadow-lg transition-all ${getBackgroundColor(notification.type)}`}
        >
          <div className="flex items-start gap-3">
            {getIcon(notification.type)}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-slate-900 dark:text-zinc-100">
                {notification.title}
              </p>
              {notification.message && (
                <p className="mt-1 text-sm text-slate-600 dark:text-zinc-400">
                  {notification.message}
                </p>
              )}
              {(notification.actionLabel || notification.action) && (
                <button
                  type="button"
                  onClick={() => {
                    notification.onAction?.();
                    notification.action?.onClick?.();
                    const url = notification.actionUrl || notification.action?.url;
                    if (url) {
                      window.location.href = url;
                    }
                  }}
                  className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-700 dark:text-indigo-400"
                >
                  {notification.actionLabel || notification.action?.label}
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            <button
              type="button"
              onClick={() => dismissNotification(notification.id)}
              className="shrink-0 rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-zinc-800"
              aria-label="Dismiss notification"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
};

export const useNotification = (): NotificationContextType => {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error("useNotification must be used within a NotificationProvider");
  }
  return context;
};
