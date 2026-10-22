import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  createNotificationId,
  evaluateCampaignEscrowLevel,
  buildLowEscrowNotification,
} from "../context/NotificationContext";

describe("NotificationContext & ID Generator (#151)", () => {
  const originalCrypto = globalThis.crypto;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    Object.defineProperty(globalThis, "crypto", {
      value: originalCrypto,
      writable: true,
      configurable: true,
    });
  });

  describe("createNotificationId", () => {
    it("should use crypto.randomUUID() when available", () => {
      const mockUuid = "12345678-1234-4234-8234-123456789abc";
      const randomUuidSpy = vi.fn().mockReturnValue(mockUuid);

      Object.defineProperty(globalThis, "crypto", {
        value: {
          ...originalCrypto,
          randomUUID: randomUuidSpy,
        },
        writable: true,
        configurable: true,
      });

      const id = createNotificationId();
      expect(id).toBe(mockUuid);
      expect(randomUuidSpy).toHaveBeenCalled();
    });

    it("should fall back to Math.random base-36 string when crypto.randomUUID is unavailable", () => {
      Object.defineProperty(globalThis, "crypto", {
        value: undefined,
        writable: true,
        configurable: true,
      });

      const id = createNotificationId();
      expect(typeof id).toBe("string");
      expect(id.length).toBeGreaterThan(0);
    });

    it("should fall back to Math.random if crypto.randomUUID throws", () => {
      Object.defineProperty(globalThis, "crypto", {
        value: {
          randomUUID: () => {
            throw new Error("randomUUID unsupported");
          },
        },
        writable: true,
        configurable: true,
      });

      const id = createNotificationId();
      expect(typeof id).toBe("string");
      expect(id.length).toBeGreaterThan(0);
    });
  });

  describe("Escrow Level Evaluation", () => {
    it("should trigger low escrow alert when remaining is under 10%", () => {
      const campaign = {
        id: "camp-1",
        name: "Test Campaign",
        escrowInitial: 1000,
        escrowBalance: 90,
      };

      const result = evaluateCampaignEscrowLevel(campaign);
      expect(result.isLowEscrow).toBe(true);
      expect(result.percentageRemaining).toBe(9);
    });

    it("should not trigger low escrow alert when balance is above 10%", () => {
      const campaign = {
        id: "camp-2",
        name: "Healthy Campaign",
        escrowInitial: 1000,
        escrowBalance: 250,
      };

      const result = evaluateCampaignEscrowLevel(campaign);
      expect(result.isLowEscrow).toBe(false);
      expect(result.percentageRemaining).toBe(25);
    });

    it("should create structured notification payload for low escrow", () => {
      const notification = buildLowEscrowNotification({
        campaignName: "Test Campaign",
        remainingXlm: 50,
        percentageRemaining: 5,
        campaignId: "camp-1",
      });

      expect(notification.type).toBe("warning");
      expect(notification.persistent).toBe(true);
      expect(notification.title).toContain("Low Escrow Alert: Test Campaign");
      expect(notification.actionLabel).toBe("Top Up Escrow");
    });
  });
});
