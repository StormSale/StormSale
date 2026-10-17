import { useEffect } from "react";
import { useNotification } from "../context/NotificationContext";

export const PwaRegistrationFeedback: React.FC = () => {
  const { showNotification } = useNotification();

  useEffect(() => {
    const handleOfflineReady = () => {
      showNotification({
        type: "success",
        title: "StormSale is ready offline",
        message: "The app shell has been cached for offline use.",
      });
    };

    const handleRegisterError = (event: Event) => {
      const error = (event as CustomEvent<unknown>).detail;
      showNotification({
        type: "error",
        title: "Offline support could not be enabled",
        message: error instanceof Error ? error.message : String(error),
      });
    };

    window.addEventListener("pwa:offline-ready", handleOfflineReady);
    window.addEventListener("pwa:register-error", handleRegisterError);
    return () => {
      window.removeEventListener("pwa:offline-ready", handleOfflineReady);
      window.removeEventListener("pwa:register-error", handleRegisterError);
    };
  }, [showNotification]);

  return null;
};
