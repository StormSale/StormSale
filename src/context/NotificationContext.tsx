import React, { createContext, useContext, useState } from "react";
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
  optimistic?: boolean;
  txHash?: string;
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
  showOptimisticNotification: (notification: Omit<Notification, "id">) => string;
  resolveOptimisticNotification: (id: string, success: boolean, errorMessage?: string) => void;
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

const OPTIMISTIC_TIMEOUT_MS = 30000;

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export const NotificationProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const optimisticTimersRef = React.useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const optimisticSnapshotsRef = React.useRef<Record<string, Notification>>({});

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

  // Instantly surfaces an optimistic notification (<50ms) that can be reverted on txn failure.
  const showOptimisticNotification = (notification: Omit<Notification, "id">): string => {
    const id = Math.random().toString(36).substring(2, 11);
    const optimisticNotification: Notification = {
      ...notification,
      id,
      type: notification.type || "info",
      title: notification.title,
      persistent: false,
      duration: 0,
      optimistic: true,
    };

    optimisticSnapshotsRef.current[id] = optimisticNotification;
    setNotifications((prev) => [...prev, optimisticNotification]);

    // Safety net: auto-revert if the txn never resolves (e.g. dropped/replaced).
    optimisticTimersRef.current[id] = setTimeout(() => {
      resolveOptimisticNotification(id, false, "Transaction timed out");
    }, OPTIMISTIC_TIMEOUT_MS);

    return id;
  };

  // Confirms or reverts an optimistic notification based on txn outcome.
  const resolveOptimisticNotification = (id: string, success: boolean, errorMessage?: string) => {
    const timer = optimisticTimersRef.current[id];
    if (timer) {
      clearTimeout(timer);
      delete optimisticTimersRef.current[id];
    }

    const snapshot = optimisticSnapshotsRef.current[id];
    delete optimisticSnapshotsRef.current[id];

    setNotifications((prev) => {
      const existing = prev.find((n) => n.id === id);
      if (!existing) return prev;

      if (success) {
        return prev.map((n) =>
          n.id === id
            ? {
                ...n,
                optimistic: false,
                type: "success",
                title: snapshot?.title ? `${snapshot.title} confirmed` : "Transaction confirmed",
                duration: 5000,
                persistent: false,
              }
            : n,
        );
      }

      // Revert: replace optimistic entry with an error notification.
      return prev.map((n) =>
        n.id === id
          ? {
              ...n,
              optimistic: false,
              type: "error",
              title: snapshot?.title ? `${snapshot.title} failed` : "Transaction failed",
              message: errorMessage || "The transaction was rejected or failed. State has been reverted.",
              duration: 7000,
              persistent: false,
            }
          : n,
      );
    });
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
        resolveOptimisticNotification,
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
            style={
              notification.optimistic
                ? { opacity: 0.85, transition: "opacity 120ms ease-out" }
                : undefined
            }
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
                  {notification.optimistic && (
                    <span className="text-[10px] font-extrabold uppercase px-1.5 py-0.5 rounded bg-indigo-100 dark:bg-indigo-950/80 text-indigo-700 dark:text-indigo-300 border border-indigo-300 dark:border-indigo-800 shrink-0">
                      Pending
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
