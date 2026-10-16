import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from "react";
import type { ReactNode } from "react";
import { CheckCircle2, XCircle, AlertCircle, X, Wifi, WifiOff, Loader2 } from "lucide-react";

type NotificationType = "success" | "error" | "warning" | "info";

interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  message?: string;
  duration?: number;
}

type ConnectionStatus = "connected" | "polling" | "reconnecting";

interface NotificationContextType {
  notifications: Notification[];
  showNotification: (notification: Omit<Notification, "id">) => void;
  dismissNotification: (id: string) => void;
  connectionStatus: ConnectionStatus;
  setConnectionStatus: (status: ConnectionStatus) => void;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export const NotificationProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("polling");

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

  const dismissNotification = (id: string) => {
    setNotifications((prev) => prev.filter((notification) => notification.id !== id));
  };

  return (
    <NotificationContext.Provider
      value={{ notifications, showNotification, dismissNotification, connectionStatus, setConnectionStatus }}
    >
      {children}
      <ConnectionStatusPill status={connectionStatus} />
      <NotificationContainer />
    </NotificationContext.Provider>
  );
};

const ConnectionStatusPill: React.FC<{ status: ConnectionStatus }> = ({ status }) => {
  const config: Record<ConnectionStatus, { label: string; className: string; icon: ReactNode }> = {
    connected: {
      label: "Connected",
      className: "bg-green-100 text-green-800 border-green-300 dark:bg-green-900 dark:text-green-200 dark:border-green-700",
      icon: <Wifi className="w-3.5 h-3.5" />,
    },
    polling: {
      label: "Polling",
      className: "bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-900 dark:text-blue-200 dark:border-blue-700",
      icon: <Loader2 className="w-3.5 h-3.5 animate-spin" />,
    },
    reconnecting: {
      label: "Reconnecting",
      className: "bg-yellow-100 text-yellow-800 border-yellow-300 dark:bg-yellow-900 dark:text-yellow-200 dark:border-yellow-700",
      icon: <WifiOff className="w-3.5 h-3.5" />,
    },
  };

  const { label, className, icon } = config[status];

  return (
    <div
      role="status"
      aria-live="polite"
      className={`fixed bottom-4 right-4 z-50 inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium shadow-sm ${className}`}
    >
      {icon}
      <span>{label}</span>
    </div>
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
                <p className="text-sm text-muted-foreground mt-1">{notification.message}</p>
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

/**
 * Exponential backoff event polling worker for Soroban RPC events.
 *
 * Polls `server.getEvents()` for the topic filters `create_campaign`,
 * `log_sale`, and `claim_payout`. Backoff grows exponentially up to 30S
 * when the tab is blurred (to save CPU and RPC quota) and resets on focus.
 * Incoming events are dispatched as global context notifications so that
 * consumers can trigger lightweight query re-validation.
 */
export const SOROBAN_EVENT_TOPICS = ["create_campaign", "log_sale", "claim_payout"] as const;

export interface SorobanEventStreamOptions {
  /** A Soroban RPC server instance exposing `getEvents()`. */
  server: { getEvents: (request: any) => Promise<any> };
  /** Optional starting ledger cursor. */
  startLedger?: number;
  /** Base polling interval in ms (default 2000). */
  baseIntervalMs?: number;
  /** Maximum backoff interval in ms (default 30000). */
  maxIntervalMs?: number;
  /** Called for each newly observed event. */
  onEvent?: (event: any) => void;
  /** Called whenever the connection status changes. */
  onStatusChange?: (status: ConnectionStatus) => void;
}

/**
 * React hook that runs the Soroban event polling worker and wires it into
 * the notification context (status pill + toast notifications).
 */
export function useSorobanEventStream(options: SorobanEventStreamOptions) {
  const { showNotification, setConnectionStatus, connectionStatus } = useNotification();
  const {
    server,
    startLedger,
    baseIntervalMs = 2000,
    maxIntervalMs = 30000,
    onEvent,
    onStatusChange,
  } = options;

  const cursorRef = useRef<number | undefined>(startLedger);
  const backoffRef = useRef<number>(baseIntervalMs);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelledRef = useRef<boolean>(false);

  const emitStatus = useCallback(
    (status: ConnectionStatus) => {
      setConnectionStatus(status);
      onStatusChange?.(status);
    },
    [setConnectionStatus, onStatusChange],
  );

  const scheduleNext = useCallback(
    (delay: number) => {
      if (cancelledRef.current) return;
      timerRef.current = setTimeout(() => {
        void poll();
      }, delay);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const poll = useCallback(async () => {
    if (cancelledRef.current) return;

    const blurred = typeof document !== "undefined" && document.visibilityState === "hidden";

    try {
      emitStatus(blurred ? "polling" : "connected");

      const response = await server.getEvents({
        startLedger: cursorRef.current,
        filters: [{ type: "contract", topics: [[...SOROBAN_EVENT_TOPICS]] }],
      });

      const events: any[] = response?.events ?? [];

      for (const event of events) {
        onEvent?.(event);
        showNotification({
          type: "info",
          title: "On-chain event",
          message: `Received ${event?.topic?.[0] ?? "contract"} event`,
          duration: 4000,
        });
      }

      if (response?.latestLedger) {
        cursorRef.current = response.latestLedger;
      }

      // Successful poll resets backoff.
      backoffRef.current = baseIntervalMs;
      emitStatus(blurred ? "polling" : "connected");
      scheduleNext(blurred ? Math.min(maxIntervalMs, baseIntervalMs * 2) : baseIntervalMs);
    } catch (error) {
      emitStatus("reconnecting");

      const nextBackoff = Math.min(maxIntervalMs, backoffRef.current * 2);
      backoffRef.current = nextBackoff;

      showNotification({
        type: "warning",
        title: "Event stream reconnecting",
        message: `Retrying in ${Math.round(nextBackoff / 1000)}s`,
        duration: 3000,
      });

      scheduleNext(nextBackoff);
    }
  }, [server, baseIntervalMs, maxIntervalMs, emitStatus, onEvent, showNotification, scheduleNext]);

  useEffect(() => {
    cancelledRef.current = false;
    void poll();

    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        // Reset backoff and poll immediately when the tab regains focus.
        backoffRef.current = baseIntervalMs;
        if (timerRef.current) clearTimeout(timerRef.current);
        void poll();
      } else {
        // Blurred: allow backoff to grow up to maxIntervalMs.
        backoffRef.current = Math.min(maxIntervalMs, Math.max(backoffRef.current, baseIntervalMs * 2));
      }
    };

    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      cancelledRef.current = true;
      if (timerRef.current) clearTimeout(timerRef.current);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [poll, baseIntervalMs, maxIntervalMs]);

  return { connectionStatus };
}

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
