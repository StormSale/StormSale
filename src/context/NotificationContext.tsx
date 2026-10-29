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
  retryable?: boolean;
  onRetry?: () => void;
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
  notifyTransactionTimeout: (params: TransactionTimeoutParams) => string;
  pollTransaction: (params: PollTransactionParams) => string;
}

export interface EscrowMonitoredCampaign {
  id: string;
  name: string;
  escrowInitial: number;
  escrowBalance: number;
  status?: string;
}

export interface TransactionTimeoutParams {
  txHash?: string;
  message?: string;
  onRetry?: () => void;
  explorerUrl?: string;
}

export interface PollTransactionParams {
  txHash?: string;
  checkStatus: () => Promise<"pending" | "success" | "failed">;
  onSuccess?: () => void;
  onFailure?: () => void;
  onRetry?: () => void;
  explorerUrl?: string;
}

export const POLLING_BASE_DELAY_MS = 1000;
export const POLLING_MAX_DELAY_MS = 30000;
export const POLLING_MAX_ATTEMPTS = 8;

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
 * Computes the exponential backoff delay for a given polling attempt.
 * attempt 0 -> base, attempt 1 -> 2*base, attempt 2 -> 4*base, capped at max.
 */
export function computePollingDelay(
  attempt: number,
  baseDelay: number = POLLING_BASE_DELAY_MS,
  maxDelay: number = POLLING_MAX_DELAY_MS,
): number {
  const safeAttempt = Math.max(0, Math.floor(attempt));
  const delay = baseDelay * Math.pow(2, safeAttempt);
  return Math.min(delay, maxDelay);
}

/**
 * Determines whether polling should stop because the max attempt budget is exhausted.
 */
export function hasPollingTimedOut(
  attempt: number,
  maxAttempts: number = POLLING_MAX_ATTEMPTS,
): boolean {
  return attempt >= maxAttempts;
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
 * Builds a persistent timeout notification with a retry prompt action.
 */
export function buildTransactionTimeoutNotification(
  params: TransactionTimeoutParams,
): Omit<Notification, "id"> {
  return {
    type: "error",
    title: "Transaction Confirmation Timed Out",
    message:
      params.message ||
      "We could not confirm your transaction in time. It may still be processing on-chain.",
    persistent: true,
    duration: 0,
    retryable: true,
    onRetry: params.onRetry,
    actionLabel: "Retry Polling",
    actionUrl: params.explorerUrl,
  };
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export const NotificationProvider: React.FC<{ readonly children: ReactNode }> = ({ children }) => {
  const [notifications, setNotifications] = useState<Notification[]>([]);

  const dismissNotification = useCallback((id: string) => {
    setNotifications((prev) => prev.filter((notification) => notification.id !== id));
  }, []);

  const clearAllNotifications = useCallback(() => {
    setNotifications([]);
  }, []);

  const pollingTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  useEffect(() => {
    const timers = pollingTimers.current;
    return () => {
      timers.forEach((timer) => clearTimeout(timer));
      timers.clear();
    };
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

  // Triggers a persistent timeout notification with retry prompt
  const notifyTransactionTimeout = useCallback(
    (params: TransactionTimeoutParams): string => {
      return showNotification(buildTransactionTimeoutNotification(params));
    },
    [showNotification],
  );

  // Adaptive transaction polling with exponential backoff
  const pollTransaction = useCallback(
    (params: PollTransactionParams): string => {
      const notificationId = showNotification({
        type: "pending",
        title: "Confirming Transaction",
        message: params.txHash
          ? `Waiting for confirmation of ${params.txHash.slice(0, 10)}...`
          : "Waiting for transaction confirmation...",
        persistent: true,
        duration: 0,
      });

      let attempt = 0;

      const clearTimer = () => {
        const timer = pollingTimers.current.get(notificationId);
        if (timer) {
          clearTimeout(timer);
          pollingTimers.current.delete(notificationId);
        }
      };

      const scheduleNext = () => {
        if (hasPollingTimedOut(attempt, POLLING_MAX_ATTEMPTS)) {
          clearTimer();
          dismissNotification(notificationId);
          notifyTransactionTimeout({
            txHash: params.txHash,
            onRetry: params.onRetry,
            explorerUrl: params.explorerUrl,
          });
          return;
        }

        const delay = computePollingDelay(attempt);
        const timer = setTimeout(async () => {
          attempt += 1;
          try {
            const status = await params.checkStatus();
            if (status === "success") {
              clearTimer();
              dismissNotification(notificationId);
              if (params.onSuccess) params.onSuccess();
              return;
            }
            if (status === "failed") {
              clearTimer();
              dismissNotification(notificationId);
              if (params.onFailure) params.onFailure();
              return;
            }
          } catch {
            // treat errors as pending and continue polling
          }
          scheduleNext();
        }, delay);

        pollingTimers.current.set(notificationId, timer);
      };

      scheduleNext();
      return notificationId;
    },
    [showNotification, dismissNotification, notifyTransactionTimeout],
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
      notifyTransactionTimeout,
      pollTransaction,
    }),
    [
      notifications,
      showNotification,
      dismissNotification,
      notifyLowEscrowBalance,
      checkEscrowBalances,
      clearAllNotifications,
      notifyTransactionTimeout,
      pollTransaction,
    ],
  );

  return (
    <NotificationContext.Provider value={contextValue}>
      {children}
      <NotificationContainer />
    </NotificationContext.Provider>
  );
};
