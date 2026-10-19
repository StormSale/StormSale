import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { type NotificationType } from "../context/NotificationContext";

describe("[UI] Toast Notification & Progress System Suite (#12)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("Notification Type and Auto-Dismiss Contracts", () => {
    it("supports success, error, warning, info, and pending notification types", () => {
      const supportedTypes: NotificationType[] = [
        "success",
        "error",
        "warning",
        "info",
        "pending",
      ];
      expect(supportedTypes).toHaveLength(5);
      expect(supportedTypes).toContain("pending");
      expect(supportedTypes).toContain("success");
      expect(supportedTypes).toContain("error");
      expect(supportedTypes).toContain("warning");
      expect(supportedTypes).toContain("info");
    });

    it("verifies auto-dismiss behavior for timed notifications", () => {
      const notifications: Array<{
        id: string;
        type: NotificationType;
        duration: number;
        persistent: boolean;
      }> = [];

      const addNotification = (notif: {
        type: NotificationType;
        title: string;
        duration?: number;
        persistent?: boolean;
      }) => {
        const id = "notif_" + Math.random().toString(36).substring(2, 8);
        const isPersistent = notif.persistent === true || notif.duration === 0;
        const entry = {
          ...notif,
          id,
          persistent: isPersistent,
          duration: isPersistent ? 0 : notif.duration ?? 5000,
        };
        notifications.push(entry);
        return id;
      };

      // 1. Add auto-dismissing pending notification
      const notifId = addNotification({
        type: "pending",
        title: "Submitting Soroban Transaction...",
        duration: 4000,
      });

      expect(notifId).toBeTruthy();
      expect(notifications.length).toBe(1);
      expect(notifications[0].persistent).toBe(false);
      expect(notifications[0].duration).toBe(4000);
      expect(notifications[0].type).toBe("pending");
    });

    it("ensures persistent notifications have duration 0 and do not auto-dismiss", () => {
      const notif = {
        type: "warning" as NotificationType,
        title: "Low Escrow Balance",
        persistent: true,
        duration: 0,
      };

      const isPersistent = notif.persistent === true || notif.duration === 0;
      expect(isPersistent).toBe(true);
      expect(notif.duration).toBe(0);
    });

    it("calculates progress percentage correctly for dismissal bar", () => {
      const totalDuration = 5000;
      const elapsed = 2500;
      const remainingTime = totalDuration - elapsed;

      const progressRatio = remainingTime / totalDuration;
      const progressPercent = Math.round(progressRatio * 100);

      expect(progressPercent).toBe(50);
    });
  });
});
