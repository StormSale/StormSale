/* eslint-disable react-refresh/only-export-components */
import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
} from "react";
import type { ReactNode } from "react";
import {
  CheckCircle2,
  XCircle,
  AlertCircle,
  AlertTriangle,
  Loader2,
  X,
  ExternalLink,
  ArrowRight,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { SorobanEventStream, type SorobanStreamStatus } from "../services/sorobanEventStream";

export type NotificationType = "success" | "error" | "warning" | "info" | "pending";

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

export const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export const NotificationProvider: React.FC<{ readonly children: ReactNode }> = ({ children }) => {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [streamStatus, setStreamStatus] = useState<SorobanStreamStatus>("polling");
  const [lastEventAt, setLastEventAt] = useState<number | null>(null);
  const streamRef = useRef<SorobanEventStream | null>(null);

  const dismissNotification = useCallback((id: string) => {
    setNotifications((prev) => prev.filter((notification) => notification.id !== id));
  }, []);

  const clearAllNotifications = useCallback(() => {
    setNotifications([]);
  }, []);

  const showNotification = useCallback((notification: Omit<Notification, "id">): string => {
    let randomSuffix: string;
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      randomSuffix = crypto.randomUUID();
    } else if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
      const buffer = new Uint32Array(2);
      crypto.getRandomValues(buffer);
      randomSuffix = `${buffer[0].toString(36)}-${buffer[1].toString(36)}`;
    } else {
      randomSuffix = `${Date.now().toString(36)}-${(performance.now() * 1000).toString(36)}`;
    }

    const id = `toast-${Date.now()}-${randomSuffix}`;
    const isPersistent = notification.persistent === true || notification.duration === 0;

    const newNotification: Notification = {
      ...notification,
      id,
      persistent: isPersistent,
      duration: isPersistent ? 0 : (notification.duration ?? 5000),
    };
    setNotifications((prev) => [...prev, newNotification]);
    return id;
  }, []);

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
  const notifyLowEscrowBalance = useCallback(
    (params: {
      campaignName: string;
      remainingXlm: number;
      percentageRemaining: number;
      campaignId?: string;
      topUpUrl?: string;
      onTopUp?: () => void;
    }): string => {
      return showNotification(buildLowEscrowNotification(params));
    },
    [showNotification],
  );

  // Automated background evaluation for low escrow balances
  const checkEscrowBalances = useCallback(
    (campaigns: EscrowMonitoredCampaign[]) => {
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
    },
    [notifications, notifyLowEscrowBalance],
  );

  const contextValue = useMemo(
    () => ({
      notifications,
      showNotification,
      dismissNotification,
      notifyLowEscrowBalance,
      checkEscrowBalances,
      clearAllNotifications,
      streamStatus,
      lastEventAt,
    }),
    [
      notifications,
      showNotification,
      dismissNotification,
      notifyLowEscrowBalance,
      checkEscrowBalances,
      clearAllNotifications,
      streamStatus,
      lastEventAt,
    ],
  );

  return (
    <NotificationContext.Provider value={contextValue}>
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

interface ToastItemProps {
  readonly notification: Notification;
  readonly onDismiss: (id: string) => void;
}

const ToastItem: React.FC<ToastItemProps> = ({ notification, onDismiss }) => {
  const isAutoDismiss = !notification.persistent && (notification.duration ?? 0) > 0;
  const duration = notification.duration ?? 5000;

  const [remainingTime, setRemainingTime] = useState<number>(duration);
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const startTimeRef = useRef<number>(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Auto-dismiss countdown with hover-to-pause
  useEffect(() => {
    if (!isAutoDismiss) return;

    if (isPaused) {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      return;
    }

    startTimeRef.current = Date.now();
    timerRef.current = setTimeout(() => {
      onDismiss(notification.id);
    }, remainingTime);

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [isAutoDismiss, isPaused, remainingTime, notification.id, onDismiss]);

  const handleMouseEnter = () => {
    if (!isAutoDismiss) return;
    const elapsed = Date.now() - startTimeRef.current;
    setRemainingTime((prev) => Math.max(0, prev - elapsed));
    setIsPaused(true);
  };

  const handleMouseLeave = () => {
    if (!isAutoDismiss) return;
    setIsPaused(false);
  };

  const getIcon = (type: NotificationType) => {
    switch (type) {
      case "success":
        return <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />;
      case "error":
        return <XCircle className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />;
      case "warning":
        return <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />;
      case "pending":
        return <Loader2 className="w-5 h-5 text-indigo-500 animate-spin shrink-0 mt-0.5" />;
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
      case "pending":
        return "bg-white dark:bg-zinc-900 border-indigo-300 dark:border-indigo-800/80 shadow-indigo-500/10";
      case "info":
        return "bg-white dark:bg-zinc-900 border-indigo-300 dark:border-indigo-800/80 shadow-indigo-500/10";
      default:
        return "bg-white dark:bg-zinc-900 border-slate-200 dark:border-zinc-800 shadow-zinc-500/10";
    }
  };

  const getProgressBarColor = (type: NotificationType) => {
    switch (type) {
      case "success":
        return "bg-emerald-500";
      case "error":
        return "bg-rose-500";
      case "warning":
        return "bg-amber-500";
      case "pending":
        return "bg-indigo-500";
      case "info":
        return "bg-indigo-500";
      default:
        return "bg-zinc-500";
    }
  };

  const actionLabel = notification.actionLabel || notification.action?.label;
  const actionUrl = notification.actionUrl || notification.action?.url;

  const renderBadge = () => {
    if (notification.persistent) {
      return (
        <span className="text-[10px] font-extrabold uppercase px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-950/80 text-amber-700 dark:text-amber-300 border border-amber-300 dark:border-amber-800 shrink-0">
          Persistent Alert
        </span>
      );
    }
    if (notification.type === "pending") {
      return (
        <span className="text-[10px] font-extrabold uppercase px-1.5 py-0.5 rounded bg-indigo-100 dark:bg-indigo-950/80 text-indigo-700 dark:text-indigo-300 border border-indigo-300 dark:border-indigo-800 shrink-0">
          In Progress
        </span>
      );
    }
    return null;
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: -16, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.15 } }}
      transition={{ type: "spring", stiffness: 350, damping: 25 }}
      role="alert"
      aria-live="polite"
      data-testid="notification-toast"
      data-type={notification.type}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      className={`relative p-4 rounded-2xl border shadow-xl backdrop-blur-md overflow-hidden pointer-events-auto ${getBackgroundColor(
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
            {renderBadge()}
          </div>

          {notification.message && (
            <p className="text-xs text-zinc-600 dark:text-zinc-300 mt-1.5 leading-relaxed">
              {notification.message}
            </p>
          )}

          {/* Interactive Action: Link or Button to flow */}
          {actionLabel && (
            <div className="mt-3 flex items-center gap-2 pt-1">
              {actionUrl ? (
                <a
                  href={actionUrl}
                  onClick={() => {
                    if (notification.onAction) notification.onAction();
                    if (notification.action?.onClick) notification.action.onClick();
                    onDismiss(notification.id);
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
                    onDismiss(notification.id);
                  }}
                  className="inline-flex items-center text-xs font-bold px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white shadow-sm transition-all"
                >
                  <span>{actionLabel}</span>
                  <ArrowRight className="w-3.5 h-3.5 ml-1.5 opacity-90" />
                </button>
              )}

              <button
                type="button"
                onClick={() => onDismiss(notification.id)}
                className="text-xs text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 font-semibold px-2 py-1 transition-colors"
              >
                Dismiss
              </button>
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={() => onDismiss(notification.id)}
          className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 transition-colors p-1 -mr-1 -mt-1 rounded-lg"
          aria-label="Close notification"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Visual Progress Indicator for Dismissal Time */}
      {isAutoDismiss && (
        <div
          data-testid="toast-progress-bar"
          className="absolute bottom-0 left-0 right-0 h-1 bg-slate-100 dark:bg-zinc-800/80 overflow-hidden"
        >
          <motion.div
            initial={{ width: "100%" }}
            animate={{ width: isPaused ? undefined : "0%" }}
            transition={{
              duration: remainingTime / 1000,
              ease: "linear",
            }}
            role="progressbar"
            aria-label="Dismissal progress"
            className={`h-full ${getProgressBarColor(notification.type)}`}
          />
        </div>
      )}
    </motion.div>
  );
};

const NotificationContainer: React.FC = () => {
  const { notifications, dismissNotification } = useNotification();

  if (notifications.length === 0) return null;

  return (
    <div
      aria-label="Notifications"
      className="fixed top-4 right-4 z-50 space-y-3 max-w-md w-full px-4 sm:px-0 pointer-events-none"
    >
      <AnimatePresence mode="popLayout">
        {notifications.map((notification) => (
          <ToastItem
            key={notification.id}
            notification={notification}
            onDismiss={dismissNotification}
          />
        ))}
      </AnimatePresence>
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

export function NotificationWrapper({ children }: { readonly children: React.ReactNode }) {
  return <NotificationProvider>{children}</NotificationProvider>;
}

export function withNotification<P extends object>(Component: React.ComponentType<P>) {
  return function WrappedWithNotification(props: Readonly<P>) {
    return (
      <NotificationProvider>
        <Component {...props} />
      </NotificationProvider>
    );
  };
}