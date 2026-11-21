// @vitest-environment jsdom
import { Buffer } from "buffer";
globalThis.Buffer = Buffer;

import { describe, it, expect } from "vitest";
import {
  evaluateCampaignEscrowLevel,
  buildLowEscrowNotification,
} from "../context/NotificationContext";

describe("Low Escrow Balance Notification System (#41)", () => {
  describe("evaluateCampaignEscrowLevel", () => {
    it("flags low escrow when balance drops below 10% of initial", () => {
      const result = evaluateCampaignEscrowLevel({
        id: "camp-1",
        name: "Test Campaign",
        escrowInitial: 1000,
        escrowBalance: 50,
      });
      expect(result.isLowEscrow).toBe(true);
      expect(result.percentageRemaining).toBe(5);
      expect(result.remainingXlm).toBe(50);
    });

    it("does not flag when balance is above 10%", () => {
      const result = evaluateCampaignEscrowLevel({
        id: "camp-2",
        name: "Healthy Campaign",
        escrowInitial: 1000,
        escrowBalance: 200,
      });
      expect(result.isLowEscrow).toBe(false);
      expect(result.percentageRemaining).toBe(20);
    });

    it("does not flag completed campaigns even with low balance", () => {
      const result = evaluateCampaignEscrowLevel({
        id: "camp-3",
        name: "Completed Campaign",
        escrowInitial: 1000,
        escrowBalance: 50,
        status: "Completed",
      });
      expect(result.isLowEscrow).toBe(false);
    });

    it("does not flag when initial escrow is 0", () => {
      const result = evaluateCampaignEscrowLevel({
        id: "camp-4",
        name: "Zero Initial",
        escrowInitial: 0,
        escrowBalance: 0,
      });
      expect(result.isLowEscrow).toBe(false);
    });

    it("does not flag when balance is fully depleted (0)", () => {
      const result = evaluateCampaignEscrowLevel({
        id: "camp-5",
        name: "Depleted",
        escrowInitial: 1000,
        escrowBalance: 0,
      });
      expect(result.isLowEscrow).toBe(false);
    });

    it("flags at exactly 9.9% (just under threshold)", () => {
      const result = evaluateCampaignEscrowLevel({
        id: "camp-6",
        name: "Borderline Low",
        escrowInitial: 1000,
        escrowBalance: 99,
      });
      expect(result.isLowEscrow).toBe(true);
      expect(result.percentageRemaining).toBe(9.9);
    });

    it("does not flag at exactly 10%", () => {
      const result = evaluateCampaignEscrowLevel({
        id: "camp-7",
        name: "At Threshold",
        escrowInitial: 1000,
        escrowBalance: 100,
      });
      expect(result.isLowEscrow).toBe(false);
      expect(result.percentageRemaining).toBe(10);
    });
  });

  describe("buildLowEscrowNotification", () => {
    it("creates a persistent warning notification with Top Up action", () => {
      const notification = buildLowEscrowNotification({
        campaignName: "Test Campaign",
        remainingXlm: 50,
        percentageRemaining: 5,
        campaignId: "camp-1",
      });

      expect(notification.type).toBe("warning");
      expect(notification.persistent).toBe(true);
      expect(notification.duration).toBe(0);
      expect(notification.actionLabel).toBe("Top Up Escrow");
      expect(notification.campaignId).toBe("camp-1");
    });

    it("includes campaign name in the alert title", () => {
      const notification = buildLowEscrowNotification({
        campaignName: "Summer Sale 2026",
        remainingXlm: 30,
        percentageRemaining: 3,
      });

      expect(notification.title).toContain("Summer Sale 2026");
      expect(notification.title).toContain("Low Escrow Alert");
    });

    it("includes remaining XLM and percentage in the message", () => {
      const notification = buildLowEscrowNotification({
        campaignName: "Test",
        remainingXlm: 75,
        percentageRemaining: 7.5,
      });

      expect(notification.message).toContain("75");
      expect(notification.message).toContain("7.5%");
    });

    it("generates top-up URL with campaign ID", () => {
      const notification = buildLowEscrowNotification({
        campaignName: "Test",
        remainingXlm: 50,
        percentageRemaining: 5,
        campaignId: "camp-42",
      });

      expect(notification.actionUrl).toContain("campaignId=camp-42");
      expect(notification.actionUrl).toContain("topup");
    });

    it("uses default top-up URL when no campaign ID provided", () => {
      const notification = buildLowEscrowNotification({
        campaignName: "No ID",
        remainingXlm: 10,
        percentageRemaining: 1,
      });

      expect(notification.actionUrl).toContain("topup");
    });

    it("respects custom top-up URL when provided", () => {
      const notification = buildLowEscrowNotification({
        campaignName: "Custom",
        remainingXlm: 10,
        percentageRemaining: 1,
        campaignId: "camp-99",
        topUpUrl: "/custom-topup-flow",
      });

      expect(notification.actionUrl).toBe("/custom-topup-flow");
    });

    it("passes onTopUp callback through to notification", () => {
      const onTopUp = () => {};
      const notification = buildLowEscrowNotification({
        campaignName: "Callback Test",
        remainingXlm: 50,
        percentageRemaining: 5,
        onTopUp,
      });

      expect(notification.onAction).toBe(onTopUp);
    });
  });
});
