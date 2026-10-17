import React, { createContext, useContext, useState, useRef, useEffect, useCallback } from "react";
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
  /** Maximum number of polling attempts before timing out. Default: 10 */
  maxAttempts?: number;
  /** Initial delay in ms before the first retry. Default: 1000 */
  initialDelayMs?: number;
  /** Multiplier applied to the delay after each failed attempt. Default: 2 */
  backoffFactor?: number;
  /** Upper bound for the delay between attempts in ms. Default: 30000 */
  maxDelayMs?: number;
  /** Optional callback invoked when polling times out. */
  onTimeout?: (info: { attempts: number; lastError?: unknown }) => void;
  /** Optional callback invoked on each failed attempt. */
  onRetry?: (info: { attempt: number; delayMs: number; error?: unknown }) => void;
}

export interface TransactionPollingResult {
  confirmed: boolean;
  attempts: number;
  timedOut: boolean;
  lastError?: unknown;
}

export interface TransactionPollingHandle {
  cancel: () => void;
  promise: Promise<TransactionPollingResult>;
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
  pollTransaction: (
    checkFn: () => Promise<boolean>,
    options?: TransactionPollingOptions,
  ) => TransactionPollingHandle;
  notifyTransactionTimeout: (params: {
    txHash?: string;
    onRetry: () => void;
    attempts?: number;
  }) => string;
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
 * Computes the delay for a given polling attempt using exponential backoff.
 * Attempt 0 returns initialDelayMs; each subsequent attempt multiplies by backoffFactor,
 * clamped to maxDelayMs.
 */
export function computeBackoffDelay(
  attempt: number,
  options: Pick<TransactionPollingOptions, "initialDelayMs" | "backoffFactor" | "maxDelayMs"> = {},
): number {
  const initialDelayMs = options.initialDelayMs ?? 1000;
  const backoffFactor = options.backoffFactor ?? 2;
  const maxDelayMs = options.maxDelayMs ?? 30000;
  const safeAttempt = Math.max(0, attempt);
  const raw = initialDelayMs * Math.pow(backoffFactor, safeAttempt);
  return Math.min(raw, maxDelayMs);
}

/**
 * Builds a persistent notification prompting the user to retry a timed-out transaction.
 */
export function buildTransactionTimeoutNotification(params: {
  txHash?: string;
  onRetry: () => void;
  attempts?: number;
}): Omit<Notification, "id"> {
  const attemptsText = params.attempts ? ` after ${params.attempts} attempts` : "";
  return {
    type: "error",
    title: "Transaction Confirmation Timed Out",
    message: `We could not confirm your transaction${attemptsText}.${
      params.txHash ? ` Hash: ${params.txHash.slice(0, 10)}…` : ""
    } You can retry polling or check the explorer.`,
    persistent: true,
    duration: 0,
    actionLabel: "Retry",
    onAction: params.onRetry,
  };
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export const NotificationProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [notifications, setNotifications] = useState<Notification[]>([]);

  // Track active polling handles so they can be cancelled on unmount.
  const activePollsRef = useRef<Set<() => void>>(new Set());

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

  // Exponential-backoff polling for blockchain transaction confirmation.
  const pollTransaction = useCallback(
    (
      checkFn: () => Promise<boolean>,
      options: TransactionPollingOptions = {},
    ): TransactionPollingHandle => {
      const maxAttempts = options.maxAttempts ?? 10;
      let cancelled = false;
      let timer: ReturnType<typeof setTimeout> | null = null;
      const cancelRef: { current: () => void } = { current: () => {} };

      const promise = new Promise<TransactionPollingResult>((resolve) => {
        const finish = (result: TransactionPollingResult) => {
          if (timer) {
            clearTimeout(timer);
            timer = null;
          }
          activePollsRef.current.delete(cancelRef.current);
          resolve(result);
        };

        cancelRef.current = () => {
          cancelled = true;
          finish({ confirmed: false, attempts: 0, timedOut: false });
        };
        activePollsRef.current.add(cancelRef.current);

        const attempt = async (attemptIndex: number, lastError?: unknown) => {
          if (cancelled) return;

          if (attemptIndex >= maxAttempts) {
            const result: TransactionPollingResult = {
              confirmed: false,
              attempts: attemptIndex,
              timedOut: true,
              lastError,
            };
            if (options.onTimeout) {
              try {
                options.onTimeout({ attempts: attemptIndex, lastError });
              } catch {
                // swallow callback errors
              }
            }
            finish(result);
            return;
          }

          let confirmed = false;
          let error: unknown = lastError;
          try {
            confirmed = await checkFn();
          } catch (err) {
            error = err;
          }

          if (cancelled) return;

          if (confirmed) {
            finish({
              confirmed: true,
              attempts: attemptIndex + 1,
              timedOut: false,
              lastError: error,
            });
            return;
          }

          const delayMs = computeBackoffDelay(attemptIndex, options);
          if (options.onRetry) {
            try {
              options.onRetry({ attempt: attemptIndex + 1, delayMs, error });
            } catch {
              // swallow callback errors
            }
          }

          timer = setTimeout(() => {
            void attempt(attemptIndex + 1, error);
          }, delayMs);
        };

        void attempt(0);
      });

      return { cancel: () => cancelRef.current(), promise };
    },
    [],
  );

  const notifyTransactionTimeout = (params: {
    txHash?: string;
    onRetry: () => void;
    attempts?: number;
  }): string => {
    return showNotification(buildTransactionTimeoutNotification(params));
  };

  // Cancel any in-flight polls when the provider unmounts.
  useEffect(() => {
    const polls = activePollsRef.current;
    return () => {
      polls.forEach((cancel) => cancel());
      polls.clear();
    };
  }, []);

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
        notifyTransactionTimeout,
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
