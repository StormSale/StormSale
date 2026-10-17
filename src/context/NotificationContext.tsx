import React, { createContext, useContext, useEffect, useRef, useState } from "react";
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
import { SorobanEventStream, type SorobanConnectionStatus } from "../lib/sorobanEventStream";
import type { SorobanEvent } from "../lib/sorobanEventStream";

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
  connectionStatus: SorobanConnectionStatus;
  lastEventAt: number | null;
  subscribeToEvent: (listener: (event: SorobanEvent) => void) => () => void;
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

const TOPIC_LABELS: Record<string, string> = {
  create_campaign: "Campaign Created",
  log_sale: "Sale Logged",
  claim_payout: "Payout Claimed",
};

/**
 * Builds a subtle toast notification payload for an incoming Soroban contract event.
 */
export function buildSorobanEventNotification(event: SorobanEvent): Omit<Notification, "id"> {
  const label = TOPIC_LABELS[event.topic] ?? event.topic;
  const shortTx = event.txHash ? `${event.txHash.slice(0, 6)}…${event.txHash.slice(-4)}` : undefined;
  return {
    type: "info",
    title: `On-chain: ${label}`,
    message: shortTx ? `Ledger ${event.ledger} · tx ${shortTx}` : `Ledger ${event.ledger}`,
    duration: 4000,
    campaignId: event.campaignId,
  };
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export const NotificationProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [connectionStatus, setConnectionStatus] = useState<SorobanConnectionStatus>("polling");
  const [lastEventAt, setLastEventAt] = useState<number | null>(null);
  const streamRef = useRef<SorobanEventStream | null>(null);
  const listenersRef = useRef<Set<(event: SorobanEvent) => void>>(new Set());

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

  const subscribeToEvent = (listener: (event: SorobanEvent) => void) => {
    listenersRef.current.add(listener);
    return () => {
      listenersRef.current.delete(listener);
    };
  };

  // Lifecycle: start the Soroban RPC event streaming worker once per provider mount.
  useEffect(() => {
    const stream = new SorobanEventStream({
      topics: ["create_campaign", "log_sale", "claim_payout"],
      onStatusChange: (status) => setConnectionStatus(status),
      onEvent: (event) => {
        setLastEventAt(Date.now());
        listenersRef.current.forEach((listener) => {
          try {
            listener(event);
          } catch {
            // Listener errors must not break the stream loop.
          }
        });
        showNotification(buildSorobanEventNotification(event));
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
        connectionStatus,
        lastEventAt,
        subscribeToEvent,
      }}
    >
      {children}
      <NotificationContainer />
    </NotificationContext.Provider>
  );
};

const NotificationContainer: React.FC = () => {
  const { notifications, dismissNotification, connectionStatus } = useNotification();

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
      <ConnectionStatusPill status={connectionStatus} />
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

const ConnectionStatusPill: React.FC<{ status: SorobanConnectionStatus }> = ({ status }) => {
  const config: Record<SorobanConnectionStatus, { label: string; dot: string; bg: string }> = {
    connected: {
      label: "Connected",
      dot: "bg-emerald-500",
      bg: "bg-emerald-50 dark:bg-emerald-950/60 border-emerald-300 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300",
    },
    polling: {
      label: "Polling",
      dot: "bg-amber-500",
      bg: "bg-amber-50 dark:bg-amber-950/60 border-amber-300 dark:border-amber-800 text-amber-700 dark:text-amber-300",
    },
    reconnecting: {
      label: "Reconnecting",
      dot: "bg-rose-500 animate-pulse",
      bg: "bg-rose-50 dark:bg-rose-950/60 border-rose-300 dark:border-rose-800 text-rose-700 dark:text-rose-300",
    },
  };
  const { label, dot, bg } = config[status];
  return (
    <div
      role="status"
      aria-live="polite"
      className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-bold shadow-sm backdrop-blur-md ${bg}`}
    >
      <span className={`w-2 h-2 rounded-full ${dot}`} />
      <span>{label}</span>
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
