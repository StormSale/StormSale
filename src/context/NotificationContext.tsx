import React, { createContext, useContext, useState, useEffect } from "react";
import type { ReactNode } from "react";
import { CheckCircle2, XCircle, AlertCircle, X, Telegram } from "lucide-react";

type NotificationType = "success" | "error" | "warning" | "info";

interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  message?: string;
  duration?: number;
}

export interface TelegramPreferences {
  connected: boolean;
  muted: boolean;
  token: string | null;
  username: string | null;
}

export interface ConversionAlert {
  campaignName: string;
  saleValue: number;
  commissionEarned: number;
  currency?: string;
  customerName?: string;
}

interface NotificationContextType {
  notifications: Notification[];
  showNotification: (notification: Omit<Notification, "id">) => void;
  dismissNotification: (id: string) => void;
  telegram: TelegramPreferences;
  connectTelegram: () => void;
  disconnectTelegram: () => void;
  toggleTelegramMute: () => void;
  dispatchConversionAlert: (alert: ConversionAlert) => void;
}

const TELEGRAM_STORAGE_KEY = "stormsale_telegram_prefs";
const TELEGRAM_BOT_USERNAME = "StormSaleBot";

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

function generateTelegramToken(): string {
  const bytes = new Uint8Array(16);
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  return Array.from(bytes)
    .map((b) => b.toString(16).pad-start(2, "0"))
    .join("");
}

function buildTelegramDeepLink(token: string): string {
  return `https://t.me/${TELEGRAM_BOT_USERNAME}?start=${encodeURIComponent(token)}`;
}

function formatCurrency(value: number, currency: string): string {
  try {
    return new Intl.NumberFormat("undefined" === typeof navigator ? "en-US" : navigator.language || "en-US", {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return `${currency} ${value.toFixed(2)}`;
  }
}

function buildConversionMessage(alert: ConversionAlert): string {
  const currency = alert.currency || "USD";
  const sale = formatCurrency(alert.saleValue, currency);
  const commission = formatCurrency(alert.commissionEarned, currency);
  const lines = [
    "🎉 New Sale! 🎉",
    `"🔄 Campaign: ${alert.campaignName}"`,
    `💰 Sale Value: ${sale}`,
    `💰 Commission Earned: ${commission}`,
  ];
  if (alert.customerName) {
    lines.push(`👄 Customer: ${alert.customerName}`);
  }
  lines.push("🎈 Congratulations, keep up the great work!");
  return lines.join("\n");
}

export const NotificationProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [telegram, setTelegram] = useState<TelegramPreferences>(() => {
    const defaultPrefs: TelegramPreferences = {
      connected: false,
      muted: false,
      token: null,
      username: null,
    };
    if (typeof window === "undefined") return defaultPrefs;
    try {
      const stored = window.localStorage.getItem(TELEGRAM_STORAGE_KEY);
      if (!stored) return defaultPrefs;
      const parsed = JSON.parse(stored) as Partial<TelegramPreferences>;
      return { ...defaultPrefs, ...parsed };
    } catch {
      return defaultPrefs;
    }
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(TELEGRAM_STORAGE_KEY, JSON.stringify(telegram));
    } catch {
      /* ignore persistence errors */
    }
  }, [telegram]);

  const dismissNotification = (id: string) => {
    setNotifications((prev) => prev.filter((notification) => notification.id !== id));
  };

  const showNotification = (notification: Omit<Notification, "id">) => {
    const id = Math.random().toString(36).substr(2, 9);
    const newNotification = { ...notification, id };

    setNotifications((prev) => [...prev, newNotification]);

    // Auto dismiss after duration
    if (notification.duration !== 0) {
      setTimeout(() => {
        dismissNotification(id);
      }, notification.duration || 5000);
    }
  };

  const connectTelegram = () => {
    const token = generateTelegramToken();
    const deepLink = buildTelegramDeepLink(token);
    setTelegram(() => ({
      connected: true,
      muted: false,
      token,
      username: null,
    }));
    if (typeof window !== "undefined") {
      window.open(deepLink, "_blank", "noopener,noreferrer");
    }
    showNotification({
      type: "success",
      title: "Telegram Alerts Connected",
      message: "You'll now receive instant sale notifications via StormSaleBot.",
    });
  };

  const disconnectTelegram = () => {
    setTelegram({
      connected: false,
      muted: false,
      token: null,
      username: null,
    });
    showNotification( {
      type: "info",
      title: "Telegram Alerts Disconnected",
      message: "You will no longer receive sale notifications.",
    });
  };

  const toggleTelegramMute = () => {
    setTelegram((prev) => {
      const nextMuted = !prev.muted;
      showNotification({
        type: "info",
        title: nextMuted ? "Telegram Alerts Muted" : "Telegram Alerts Unmuted",
        message: nextMuted
          ? "Sale alerts are paused. You can unmute anytime."
          : "Sale alerts are now active again.",
      });
      return { ...prev, muted: nextMuted };
    });
  };

  const dispatchConversionAlert = (alert: ConversionAlert) => {
    const message = buildConversionMessage(alert);
    if (!telegram.connected || telegram.muted) {
      return;
    }
    showNotification({
      type: "success",
      title: "New Affiliate Sale!",
      message,
      duration: 8000,
    });
  };

  return (
    <NotificationContext.Provider
      value={{
        notifications,
        showNotification,
        dismissNotification,
        telegram,
        connectTelegram,
        disconnectTelegram,
        toggleTelegramMute,
        dispatchConversionAlert,
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
        return <CheckCircle2 className="w-5 h-5 text-green-500" />;
      case "error":
        return <XCircle className="w-5 h-5 text-red-500" />;
      case "warning":
        return <AlertCircle className="w-5 h-5 text-yellow-500" />;
      case "info":
        return <AlertCircle className="w-5 h-5 text-blue-500" />;
      default:
        return <AlertCircle className="w-5 h-5 text-gray-500" />;
    }
  };

  const getBackgroundColor = (type: NotificationType) => {
    switch (type) {
      case "success":
        return "bg-green-50 border-green-200 dark:bg-green-900 dark:border-green-800";
      case "error":
        return "bg-red-50 border-red-200 dark:bg-red-900 dark:border-red-800";
      case "warning":
        return "bg-yellow-50 border-yellow-200 dark:bg-yellow-900 dark:border-yellow-800";
      case "info":
        return "bg-blue-50 border-blue-200 dark:bg-blue-900 dark:border-blue-800";
      default:
        return "bg-gray-50 border-gray-200 dark:bg-gray-900 dark:border-gray-800";
    }
  };

  if (notifications.length === 0) return null;

  return (
    <div className="fixed top-4 right-4 z-50 space-y-2 max-w-sm">
      {notifications.map((notification) => (
        <div
          key={notification.id}
          className={`p-4 rounded-lg border shadow-lg transform transition-all duration-300 ${getBackgroundColor(notification.type)}`}
        >
          <div className="flex items-start space-x-3">
            {getIcon(notification.type)}
            <div className="flex-1">
              <h4 className="font-semibold text-sm">{notification.title}</h4>
              {notification.message && (
                <p className="text-sm text-muted-foreground mt-1 whitespace-pre-line">{notification.message}</p>
              )}
            </div>
            <button
              onClick={() => dismissNotification(notification.id)}
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      ))}
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

// Add small wrapper component to wrap any tree with the NotificationProvider.
// Use this to wrap Web3Provider and its children in your app entry (e.g. App.tsx).
export function NotificationWrapper({ children }: { children: React.ReactNode }) {
  return (
    // Reuse the existing NotificationProvider exported in this file
    // If your NotificationProvider is named differently, update accordingly.
    <NotificationProvider>{children}</NotificationProvider>
  );
}

// Higher-order component to wrap a component with NotificationProvider.
// Example usage: export default withNotification(Web3Provider) or in App: {withNotification(Web3Provider)()}
export function withNotification<P extends object>(Component: React.ComponentType<P>) {
  return function WrappedWithNotification(props: P) {
    return (
      <NotificationProvider>
        <Component {...props} />
      </NotificationProvider>
    );
  };
}
