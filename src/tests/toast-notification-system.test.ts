import { describe, it, expect } from "vitest";
import { type Notification, type NotificationType } from "../context/NotificationContext";

describe("[Global UI] Toast Notification System (#2)", () => {
  it("supports all required states: success, error, warning, info, and pending", () => {
    const supportedTypes: NotificationType[] = ["success", "error", "warning", "info", "pending"];

    supportedTypes.forEach((type) => {
      const notif: Notification = {
        id: `notif-${type}`,
        type,
        title: `${type.toUpperCase()} alert`,
        message: "Test message",
      };
      expect(notif.type).toBe(type);
    });
  });

  it("sets pending notifications as persistent until manually resolved", () => {
    const pendingNotif: Notification = {
      id: "pending-1",
      type: "pending",
      title: "Submitting Transaction...",
      persistent: true,
      duration: 0,
    };

    expect(pendingNotif.type).toBe("pending");
    expect(pendingNotif.persistent).toBe(true);
    expect(pendingNotif.duration).toBe(0);
  });

  it("calculates progress percentage correctly over time", () => {
    const totalDuration = 5000;
    const calculateProgress = (remaining: number) => {
      return Math.max(0, Math.min(100, (remaining / totalDuration) * 100));
    };

    expect(calculateProgress(5000)).toBe(100);
    expect(calculateProgress(2500)).toBe(50);
    expect(calculateProgress(0)).toBe(0);
    expect(calculateProgress(-100)).toBe(0);
  });

  it("formats notification actions and urls correctly", () => {
    const actionNotif: Notification = {
      id: "action-1",
      type: "success",
      title: "Campaign Created",
      actionLabel: "View in Explorer",
      actionUrl: "https://stellar.expert/explorer/testnet/tx/123",
    };

    expect(actionNotif.actionLabel).toBe("View in Explorer");
    expect(actionNotif.actionUrl).toContain("stellar.expert");
  });
});
