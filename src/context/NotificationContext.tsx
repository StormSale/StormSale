import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from "react";
import type { ReactNode } from "react";
import {
  CheckCircle2,
  XCircle,
  AlertCircle,
  AlertTriangle,
  Loader2,
  X,
  Receipt,
  Sparkles,
  ExternalLink,
  Copy,
  Check,
  ArrowRight,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Confetti } from "../components/shared/Confetti";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "../components/ui/dialog";
import { Button } from "../components/ui/button";
import { getStellarExplorerLink } from "../utils/network";

export type NotificationType = "success" | "error" | "warning" | "info" | "pending";

export interface NotificationReceipt {
  txHash?: string;
  amount?: string;
  saleId?: number | string;
  campaign?: string;
  date?: string;
  recipient?: string;
  explorerUrl?: string;
  confirmed?: boolean;
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
  confetti?: boolean;
  receiptUrl?: string;
  receipt?: NotificationReceipt;
  onViewReceipt?: () => void;
  persistent?: boolean;
  action?: NotificationAction;
  actionLabel?: string;
  actionUrl?: string;
  onAction?: () => void;
  campaignId?: string;
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

export interface NotificationContextType {
  notifications: Notification[];
  showNotification: (notification: Omit<Notification, "id">) => string;
  dismissNotification: (id: string) => void;
  triggerConfetti: () => void;
  openReceiptModal: (receipt: NotificationReceipt) => void;
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
}

export const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export const isRewardTitle = (title: string): boolean => {
  const lower = title.toLowerCase();
  return (
    lower.includes("claim") ||
    lower.includes("commission") ||
    lower.includes("payout") ||
    lower.includes("reward")
  );
};

export const NotificationProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [confettiActive, setConfettiActive] = useState(false);
  const [activeReceipt, setActiveReceipt] = useState<NotificationReceipt | null>(null);
  const [isReceiptOpen, setIsReceiptOpen] = useState(false);
  const confettiTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const triggerConfetti = useCallback(() => {
    if (confettiTimerRef.current) {
      clearTimeout(confettiTimerRef.current);
    }
    setConfettiActive(false);
    confettiTimerRef.current = setTimeout(() => {
      setConfettiActive(true);
    }, 10);
  }, []);

  useEffect(() => {
    return () => {
      if (confettiTimerRef.current) {
        clearTimeout(confettiTimerRef.current);
      }
    };
  }, []);

  const handleConfettiComplete = useCallback(() => {
    setConfettiActive(false);
  }, []);

  const openReceiptModal = useCallback((receipt: NotificationReceipt) => {
    setActiveReceipt(receipt);
    setIsReceiptOpen(true);
  }, []);

  const dismissNotification = useCallback((id: string) => {
    setNotifications((prev) => prev.filter((notification) => notification.id !== id));
  }, []);

  const clearAllNotifications = useCallback(() => {
    setNotifications([]);
  }, []);

  const showNotification = useCallback((notification: Omit<Notification, "id">): string => {
    const id = Math.random().toString(36).substring(2, 11);
    const isPersistent = notification.persistent === true || notification.duration === 0;

      const newNotification: Notification = {
        ...notification,
        id,
        persistent: isPersistent,
        duration: isPersistent ? 0 : (notification.duration ?? 5000),
      };

      setNotifications((prev) => [...prev, newNotification]);

      // Trigger celebratory confetti animation on success if requested or if it's a claim/reward
      const isClaimSuccess =
        newNotification.confetti ||
        (newNotification.type === "success" && isRewardTitle(newNotification.title));

      if (isClaimSuccess) {
        triggerConfetti();
      }

      return id;
    },
    [triggerConfetti],
  );

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

  return (
    <NotificationContext.Provider
      value={{
        notifications,
        showNotification,
        dismissNotification,
        triggerConfetti,
        openReceiptModal,
        notifyLowEscrowBalance,
        checkEscrowBalances,
        clearAllNotifications,
      }}
    >
      {children}
      <Confetti active={confettiActive} onComplete={handleConfettiComplete} />
      <NotificationContainer />
      <ReceiptModal
        receipt={activeReceipt}
        isOpen={isReceiptOpen}
        onClose={() => setIsReceiptOpen(false)}
      />
    </NotificationContext.Provider>
  );
};

export interface ToastItemProps {
  notification: Notification;
  onDismiss: (id: string) => void;
  onReceiptClick?: (notification: Notification) => void;
}

export const ToastItem: React.FC<ToastItemProps> = ({ notification, onDismiss, onReceiptClick }) => {
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

  const isReward =
    notification.confetti ||
    (notification.type === "success" && isRewardTitle(notification.title));

  const hasReceipt = Boolean(
    notification.receipt || notification.receiptUrl || notification.onViewReceipt,
  );

  const actionLabel = notification.actionLabel || notification.action?.label;
  const actionUrl = notification.actionUrl || notification.action?.url;

  const getIcon = (type: NotificationType) => {
    if (isReward) {
      return (
        <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-amber-500 to-indigo-600 flex items-center justify-center shadow-md shrink-0 animate-bounce">
          <Sparkles className="w-4 h-4 text-white" />
        </div>
      );
    }
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
        return <AlertCircle className="w-5 h-5 text-slate-500 shrink-0 mt-0.5" />;
    }
  };

  const getBackgroundColor = (type: NotificationType) => {
    if (isReward) {
      return "bg-gradient-to-br from-white via-indigo-50/50 to-amber-50/40 dark:from-zinc-900 dark:via-zinc-900 dark:to-indigo-950/40 border-indigo-200 dark:border-indigo-500/40 shadow-xl shadow-indigo-500/10";
    }
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
            <div className="flex items-center gap-1 shrink-0">
              {isReward && (
                <span className="inline-flex items-center text-[10px] uppercase font-extrabold tracking-wider px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300">
                  Reward
                </span>
              )}
              {notification.persistent ? (
                <span className="text-[10px] font-extrabold uppercase px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-950/80 text-amber-700 dark:text-amber-300 border border-amber-300 dark:border-amber-800">
                  Persistent Alert
                </span>
              ) : notification.type === "pending" ? (
                <span className="text-[10px] font-extrabold uppercase px-1.5 py-0.5 rounded bg-indigo-100 dark:bg-indigo-950/80 text-indigo-700 dark:text-indigo-300 border border-indigo-300 dark:border-indigo-800">
                  In Progress
                </span>
              ) : null}
            </div>
          </div>

          {notification.message && (
            <p className="text-xs text-zinc-600 dark:text-zinc-300 mt-1.5 leading-relaxed break-words">
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

          {/* "View Receipt" Action Button */}
          {hasReceipt && (
            <div className="mt-3 pt-2 border-t border-slate-100 dark:border-zinc-800/80 flex items-center justify-between">
              <button
                type="button"
                onClick={() => onReceiptClick?.(notification)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white transition-all shadow-sm shadow-indigo-500/20"
              >
                <Receipt className="w-3.5 h-3.5" />
                <span>View Receipt</span>
                <ExternalLink className="w-3 h-3 opacity-70" />
              </button>
              {notification.receipt?.confirmed === true && (
                <span className="text-[10px] text-zinc-400 dark:text-zinc-500 font-medium">
                  On-chain Verified
                </span>
              )}
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

export const NotificationContainer: React.FC = () => {
  const { notifications, dismissNotification, openReceiptModal } = useNotification();

  if (notifications.length === 0) return null;

  const handleReceiptClick = (notification: Notification) => {
    if (notification.onViewReceipt) {
      notification.onViewReceipt();
    } else if (notification.receipt) {
      openReceiptModal(notification.receipt);
    } else if (notification.receiptUrl) {
      window.open(notification.receiptUrl, "_blank", "noopener,noreferrer");
    }
  };

  return (
    <div
      aria-label="Notifications"
      className="fixed top-4 right-4 z-50 space-y-3 max-w-sm sm:max-w-md w-full px-4 sm:px-0 pointer-events-none"
    >
      <AnimatePresence mode="popLayout">
        {notifications.map((notification) => (
          <ToastItem
            key={notification.id}
            notification={notification}
            onDismiss={dismissNotification}
            onReceiptClick={handleReceiptClick}
          />
        ))}
      </AnimatePresence>
    </div>
  );
};

export const ReceiptModal: React.FC<{
  receipt: NotificationReceipt | null;
  isOpen: boolean;
  onClose: () => void;
}> = ({ receipt, isOpen, onClose }) => {
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState<string | null>(null);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (copyTimerRef.current) {
        clearTimeout(copyTimerRef.current);
      }
    };
  }, []);

  if (!receipt) return null;

  const handleCopy = async (text: string) => {
    try {
      if (!navigator.clipboard?.writeText) {
        throw new Error("Clipboard API unavailable");
      }
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setCopyError(null);
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
      copyTimerRef.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopyError("Failed to copy");
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
      copyTimerRef.current = setTimeout(() => setCopyError(null), 3000);
    }
  };

  const explorerLink =
    receipt.explorerUrl ||
    (receipt.txHash ? getStellarExplorerLink("tx", receipt.txHash) : undefined);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-3xl p-6 shadow-2xl">
        <DialogHeader className="pb-4 border-b border-slate-100 dark:border-zinc-800/60">
          <div className="flex items-center space-x-3">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-emerald-500 to-indigo-600 flex items-center justify-center text-white shadow-md">
              <Receipt className="w-6 h-6" />
            </div>
            <div>
              <DialogTitle className="text-xl font-black text-zinc-900 dark:text-white">
                Commission Payout Receipt
              </DialogTitle>
              <DialogDescription className="text-xs text-zinc-500 dark:text-zinc-400">
                Official cryptographic settlement confirmation
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="py-4 space-y-4">
          {/* Status Badge */}
          <div
            className={`flex items-center justify-between p-3.5 rounded-xl border ${
              receipt.confirmed === true
                ? "bg-emerald-50 dark:bg-emerald-500/10 border-emerald-100 dark:border-emerald-500/20"
                : "bg-amber-50 dark:bg-amber-500/10 border-amber-100 dark:border-amber-500/20"
            }`}
          >
            <div className="flex items-center space-x-2">
              {receipt.confirmed === true ? (
                <>
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                  <span className="text-xs font-bold text-emerald-800 dark:text-emerald-300">
                    Settled on Soroban Smart Contract
                  </span>
                </>
              ) : (
                <>
                  <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                  <span className="text-xs font-bold text-amber-800 dark:text-amber-300">
                    Simulated / Unconfirmed
                  </span>
                </>
              )}
            </div>
            <span
              className={`text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-md ${
                receipt.confirmed === true
                  ? "bg-emerald-200/60 dark:bg-emerald-500/30 text-emerald-900 dark:text-emerald-200"
                  : "bg-amber-200/60 dark:bg-amber-500/30 text-amber-900 dark:text-amber-200"
              }`}
            >
              {receipt.confirmed === true ? "Confirmed" : "Simulated"}
            </span>
          </div>

          {/* Key Payout Details */}
          <div className="space-y-2.5 text-xs">
            {receipt.amount && (
              <div className="flex justify-between items-center p-3 rounded-xl bg-slate-50 dark:bg-zinc-950/60 border border-slate-100 dark:border-zinc-800/60">
                <span className="font-medium text-zinc-500 dark:text-zinc-400">Claimed Amount</span>
                <span className="font-extrabold text-sm text-indigo-600 dark:text-indigo-400">
                  {receipt.amount}
                </span>
              </div>
            )}

            {receipt.saleId !== undefined && (
              <div className="flex justify-between items-center p-3 rounded-xl bg-slate-50 dark:bg-zinc-950/60 border border-slate-100 dark:border-zinc-800/60">
                <span className="font-medium text-zinc-500 dark:text-zinc-400">Sale ID</span>
                <span className="font-mono font-bold text-zinc-800 dark:text-zinc-200">
                  #{receipt.saleId}
                </span>
              </div>
            )}

            {receipt.campaign && (
              <div className="flex justify-between items-center p-3 rounded-xl bg-slate-50 dark:bg-zinc-950/60 border border-slate-100 dark:border-zinc-800/60">
                <span className="font-medium text-zinc-500 dark:text-zinc-400">Campaign</span>
                <span className="font-mono text-zinc-700 dark:text-zinc-300 truncate max-w-[200px]">
                  {receipt.campaign}
                </span>
              </div>
            )}

            {receipt.date && (
              <div className="flex justify-between items-center p-3 rounded-xl bg-slate-50 dark:bg-zinc-950/60 border border-slate-100 dark:border-zinc-800/60">
                <span className="font-medium text-zinc-500 dark:text-zinc-400">Timestamp</span>
                <span className="text-zinc-700 dark:text-zinc-300 font-medium">{receipt.date}</span>
              </div>
            )}

            {receipt.txHash && (
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-zinc-950/60 border border-slate-100 dark:border-zinc-800/60 space-y-1.5">
                <div className="flex justify-between items-center">
                  <span className="font-medium text-zinc-500 dark:text-zinc-400">
                    Transaction Hash
                  </span>
                  <button
                    onClick={() => handleCopy(receipt.txHash || "")}
                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 hover:underline"
                    aria-label="Copy transaction hash"
                  >
                    {copied ? (
                      <>
                        <Check className="w-3 h-3 text-emerald-500" />
                        <span className="text-emerald-500">Copied</span>
                      </>
                    ) : copyError ? (
                      <>
                        <AlertTriangle className="w-3 h-3 text-rose-500" />
                        <span className="text-rose-500">{copyError}</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3 h-3" />
                        <span>Copy</span>
                      </>
                    )}
                  </button>
                </div>
                <p className="font-mono text-[11px] text-zinc-700 dark:text-zinc-300 break-all select-all">
                  {receipt.txHash}
                </p>
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 pt-2">
          {explorerLink ? (
            <a
              href={explorerLink}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-bold bg-zinc-900 hover:bg-zinc-800 dark:bg-indigo-600 dark:hover:bg-indigo-500 text-white transition-all shadow-sm"
            >
              <span>View in Stellar Expert</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          ) : (
            <div />
          )}

          <Button
            variant="outline"
            onClick={onClose}
            className="rounded-xl px-5 text-xs font-semibold"
          >
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
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
