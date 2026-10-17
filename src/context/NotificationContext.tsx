import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from "react";
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
import { SorobanEventStream, type SorobanStreamStatus } from "../services/sorobanEventStream";

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
  streamStatus: SorobanStreamStatus;
  lastEventAt: number | null;
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
 * Maps a Soroban contract event topic to a user-facing toast notification.
 * Returns null when the topic is not one we surface to the user.
 */
export function buildSorobanEventNotification(
  topic: string,
  payload: Record<string, unknown>,
): Omit<Notification, "id"> | null {
  const campaignName =
    typeof payload.campaignName === "string" ? payload.campaignName : undefined;
  const campaignId =
    typeof payload.campaignId === "string" ? payload.campaignId : undefined;
  const amount = typeof payload.amount === "number" ? payload.amount : undefined;

  switch (topic) {
    case "create_campaign":
      return {
        type: "info",
        title: "New Campaign Created",
        message: campaignName
          ? `Campaign "${campaignName}" is now live on-chain.`
          : "A new campaign was created on-chain.",
        campaignId,
        duration: 6000,
      };
    case "log_sale":
      return {
        type: "success",
        title: "Sale Logged",
        message:
          amount !== undefined
            ? `A sale of ${amount.toLocaleString()} XLM was recorded on-chain.`
            : "A new sale was recorded on-chain.",
        campaignId,
        duration: 6000,
      };
    case "claim_payout":
      return {
        type: "success",
        title: "Payout Claimed",
        message:
          amount !== undefined
            ? `A payout of ${amount.toLocaleString()} XLM was claimed.`
            : "A payout was claimed on-chain.",
        campaignId,
        duration: 6000,
      };
    default:
      return null;
  }
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export const NotificationProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [streamStatus, setStreamStatus] = useState<SorobanStreamStatus>("polling");
  const [lastEventAt, setLastEventAt] = useState<number | null>(null);
  const streamRef = useRef<SorobanEventStream | null>(null);

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

  // Wire up the Soroban RPC event stream once on mount.
  useEffect(() => {
    const stream = new SorobanEventStream({
      topics: ["create_campaign", "log_sale", "claim_payout"],
      onStatusChange: (status) => setStreamStatus(status),
      onEvent: (event) => {
        setLastEventAt(Date.now());
        const payload = buildSorobanEventNotification(event.topic, event.payload);
        if (payload) {
          showNotification(payload);
        }
        // Dispatch a global event so query layers can re-validate lightweight data.
        if (typeof window !== "undefined") {
          window.dispatchEvent(
            new CustomEvent("soroban:event", {
              detail: { topic: event.topic, payload: event.payload },
            }),
          );
        }
      },
    });
    streamRef.current = stream;
    stream.start();
    return () => {
      stream.stop();
      streamRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
        streamStatus,
        lastEventAt,
      }}
    >
      {children}
      <NotificationContainer />
      <StreamStatusPill status={streamStatus} />
    </NotificationContext.Provider>
  );
};

const STREAM_STATUS_META: Record<
  SorobanStreamStatus,
  { label: string; dot: string; pill: string }
> = {
  connected: {
    label: "Connected",
    dot: "bg-emerald-500",
    pill: "bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800",
  },
  polling: {
    label: "Polling",
    dot: "bg-indigo-500",
    pill: "bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border-indigo-300 dark:border-indigo-800",
  },
  reconnecting: {
    label: "Reconnecting",
    dot: "bg-amber-500 animate-pulse",
    pill: "bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border-amber-300 dark:border-amber-800",
  },
};

const StreamStatusPill: React.FC<{ status: SorobanStreamStatus }> = ({ status }) => {
  const meta = STREAM_STATUS_META[status];
  return (
    <div className="fixed bottom-4 right-4 z-40">
      <span
        role="status"
        aria-live="polite"
        className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-bold shadow-lg backdrop-blur-md ${meta.pill}`}
      >
        <span className={`w-2 h-2 rounded-full ${meta.dot}`} />
        {meta.label}
      </span>
    </div>
  );
};

const NotificationContainer: React.FC<never> = () => {
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
            )}`}
          >
            <div className="flex items-start gap-3">
              {getIcon(notification.type)}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-zinc-900 dark:text-white">
                  {notification.title}
                </p>
                {notification.message && (
                  <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
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
                        window.location.assign(actionUrl);
                      }
                    }}
                    className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline"
                  >
                    {actionLabel}
                    {actionUrl ? (
                      <ExternalLink className="w-3 h-3" />
                    ) : (
                      <ArrowRight className="w-3 h-3" />
                    )}
                  </button>
                )}
              </div>
              <button
                type="button"
                onClick={() => dismissNotification(notification.id)}
                aria-label="Dismiss notification"
                className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 transition-colors"
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
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error("useNotification must be used within a NotificationProvider");
  }
  return context;
};
