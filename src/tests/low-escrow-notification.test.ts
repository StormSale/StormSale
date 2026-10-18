import { describe, it, expect, vi } from "vitest";
import {
  evaluateCampaignEscrowLevel,
  buildLowEscrowNotification,
  type EscrowMonitoredCampaign,
  type Notification,
} from "../context/NotificationContext";

describe("[Advertiser] Low Escrow Balance Notification System (#41)", () => {
  describe("Escrow Evaluation Engine (< 10% Threshold)", () => {
    it("flags active campaigns with balance < 10% as low escrow", () => {
      const lowCampaign: EscrowMonitoredCampaign = {
        id: "2",
        name: "Web3 Masterclass",
        escrowInitial: 10000,
        escrowBalance: 750, // 7.5%
        status: "Active",
      };

      const result = evaluateCampaignEscrowLevel(lowCampaign);
      expect(result.isLowEscrow).toBe(true);
      expect(result.percentageRemaining).toBe(7.5);
      expect(result.remainingXlm).toBe(750);
    });

    it("does not flag campaigns with >= 10% balance", () => {
      const healthyCampaign: EscrowMonitoredCampaign = {
        id: "1",
        name: "Tech Gadgets Pro",
        escrowInitial: 5000,
        escrowBalance: 3250, // 65.0%
        status: "Active",
      };

      const result = evaluateCampaignEscrowLevel(healthyCampaign);
      expect(result.isLowEscrow).toBe(false);
      expect(result.percentageRemaining).toBe(65);
    });

    it("does not flag completed/ended campaigns", () => {
      const completedCampaign: EscrowMonitoredCampaign = {
        id: "4",
        name: "DeFi Starter Pack",
        escrowInitial: 3000,
        escrowBalance: 150, // 5% but completed
        status: "Completed",
      };

      const result = evaluateCampaignEscrowLevel(completedCampaign);
      expect(result.isLowEscrow).toBe(false);
    });

    it("handles zero or exhausted balance safely", () => {
      const emptyCampaign: EscrowMonitoredCampaign = {
        id: "5",
        name: "Empty Campaign",
        escrowInitial: 5000,
        escrowBalance: 0,
        status: "Active",
      };

      const result = evaluateCampaignEscrowLevel(emptyCampaign);
      expect(result.isLowEscrow).toBe(false);
    });
  });

  describe("Persistent Toast Alerts (Till Addressed)", () => {
    it("builds persistent notification with duration: 0 and persistent: true", () => {
      const payload = buildLowEscrowNotification({
        campaignName: "Web3 Masterclass",
        remainingXlm: 750,
        percentageRemaining: 7.5,
        campaignId: "2",
      });

      expect(payload.type).toBe("warning");
      expect(payload.persistent).toBe(true);
      expect(payload.duration).toBe(0);
      expect(payload.title).toContain("Web3 Masterclass");
      expect(payload.message).toContain("750 XLM (7.5%)");
    });

    it("simulates notification lifecycle: standard auto-dismisses vs persistent persists", () => {
      const notifications: Notification[] = [];

      const addNotification = (notif: Omit<Notification, "id">) => {
        const id = "notif_" + Math.random().toString(36).substr(2, 6);
        const isPersistent = notif.persistent === true || notif.duration === 0;
        const entry: Notification = {
          ...notif,
          id,
          persistent: isPersistent,
          duration: isPersistent ? 0 : notif.duration ?? 5000,
        };
        notifications.push(entry);
        return entry;
      };

      const dismiss = (id: string) => {
        const idx = notifications.findIndex((n) => n.id === id);
        if (idx !== -1) notifications.splice(idx, 1);
      };

      // 1. Add standard notification
      const standard = addNotification({
        type: "info",
        title: "Standard Message",
        duration: 3000,
      });

      // 2. Add persistent low-escrow notification
      const lowEscrow = addNotification(
        buildLowEscrowNotification({
          campaignName: "Crypto Tools Suite",
          remainingXlm: 680,
          percentageRemaining: 8.5,
          campaignId: "3",
        }),
      );

      expect(notifications.length).toBe(2);

      // Simulate standard notification timer expiration
      if (!standard.persistent && standard.duration) {
        dismiss(standard.id);
      }

      // Persistent alert MUST remain in the active notification queue
      expect(notifications.length).toBe(1);
      expect(notifications[0].id).toBe(lowEscrow.id);
      expect(notifications[0].persistent).toBe(true);

      // Dismissed only when addressed by user
      dismiss(lowEscrow.id);
      expect(notifications.length).toBe(0);
    });
  });

  describe("Link to 'Top Up' Flow in Notifications", () => {
    it("includes default Top Up flow URL containing the campaign ID", () => {
      const payload = buildLowEscrowNotification({
        campaignName: "Web3 Masterclass",
        remainingXlm: 750,
        percentageRemaining: 7.5,
        campaignId: "camp_42",
      });

      expect(payload.actionLabel).toBe("Top Up Escrow");
      expect(payload.actionUrl).toBe("/advertiser?action=topup&campaignId=camp_42");
    });

    it("supports custom topUpUrl and onTopUp callback handler", () => {
      const mockTopUpHandler = vi.fn();
      const payload = buildLowEscrowNotification({
        campaignName: "Web3 Masterclass",
        remainingXlm: 750,
        percentageRemaining: 7.5,
        topUpUrl: "https://stormsale.io/advertiser/topup/2",
        onTopUp: mockTopUpHandler,
      });

      expect(payload.actionUrl).toBe("https://stormsale.io/advertiser/topup/2");
      expect(payload.onAction).toBeDefined();

      payload.onAction!();
      expect(mockTopUpHandler).toHaveBeenCalledTimes(1);
    });
  });
});
