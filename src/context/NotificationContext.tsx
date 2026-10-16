import React, { createContext, useContext, useState, useRef, useCallback } from "react";
import type { ReactNode } from "react";
import { CheckCircle2, XCircle, AlertCircle, X, RefreshCw } from "lucide-react";

type NotificationType = "success" | "error" | "warning" | "info";

interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  message?: string;
  duration?: number;
  action?: {
    label: string;
    onClick: () => void;
  };
}

interface NotificationContextType {
  notifications: Notification[];
  showNotification: (notification: Omit<Notification, "id">) => string;
  dismissNotification: (id: string) => void;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export const NotificationProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const dismissNotification = useCallback((id: string) => {
    const timer = timers.current[id];
    if (timer) {
      clearTimeout(timer);
      delete timers.current[id];
    }
    setNotifications((prev) => prev.filter((notification) => notification.id !== id));
  }, []);

  const showNotification = useCallback((notification: Omit<Notification, "id">) => {
    const id = Math.random().toString(36).substr(2, 9);
    const newNotification = { ...notification, id };

    setNotifications((prev) => [...prev, newNotification]);

    // Auto dismiss after duration (duration === 0 disables auto-dismiss)
    if (notification.duration !== 0) {
      const timer = setTimeout(() => {
        dismissNotification(id);
      }, notification.duration || 5000);
      timers.current[id] = timer;
    }

    return id;
  }, [dismissNotification]);

  return (
    <NotificationContext.Provider value={{ notifications, showNotification, dismissNotification }}>
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
        return <XCircle2 className="w-5 h-5 text-red-500" />;
      case "warning":
        return <AlertCircle2 className="w-5 h-5 text-yellow-500" />;
      case "info":
        return <AlertCircle2 className="w-5 h-5 text-blue-500" />;
      default:
        return <AlertCircle2 className="w-5 h-5 text-gray-500" />;
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
              {notification.action && (
                <button
                  onClick={() => {
                    notification.action!.onClick();
                    dismissNotification(notification.id);
                  }}
                  className="mt-2 inline-flex items-center gap-1 rounded-md border border-current px-2 py-1 text-xs font-medium hover:bg-black/5 transition-colors"
                >
                  <RefreshCw className="w-3 h-3" />
                  {notification.action.label}
                </button>
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
