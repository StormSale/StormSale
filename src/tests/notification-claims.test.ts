import { describe, it, expect } from "vitest";
import { getStellarExplorerLink } from "../utils/network";
import {
  isRewardTitle,
  type Notification,
  type NotificationReceipt,
} from "../context/NotificationContext";

describe("Affiliate Claim Confirmation & Reward Toasts Suite (#53)", () => {
  describe("Receipt Data Modeling & Explorer Link Integration", () => {
    it("generates correct Stellar Expert explorer URL for claim transaction receipts", () => {
      const mockTxHash = "e2d8479e0a811c759f2a969df2011b6fa2e7dcb46a9a3b6db4237f37f3a8b412";
      const receiptUrl = getStellarExplorerLink("tx", mockTxHash);

      expect(receiptUrl).toBe(`https://stellar.expert/explorer/testnet/tx/${mockTxHash}`);
    });

    it("creates complete NotificationReceipt payload for commission payout claims", () => {
      const receipt: NotificationReceipt = {
        txHash: "a1b2c3d4e5f60718293a4b5c6d7e8f90123456789abcdef0123456789abcdef0",
        amount: "25.0 XLM",
        saleId: 2,
        campaign: "CB4RN8XJLP8M1K3V6P7...",
        date: "10/15/2026, 4:30:00 PM",
        explorerUrl:
          "https://stellar.expert/explorer/testnet/tx/a1b2c3d4e5f60718293a4b5c6d7e8f90123456789abcdef0123456789abcdef0",
      };

      expect(receipt.txHash).toHaveLength(64);
      expect(receipt.amount).toContain("XLM");
      expect(receipt.saleId).toBe(2);
      expect(receipt.explorerUrl).toContain("stellar.expert");
    });
  });

  describe("Claim Confirmation Notification Structure", () => {
    it("supports confetti flag and receipt metadata in notification objects", () => {
      const notification: Notification = {
        id: "test-claim-notif",
        type: "success",
        title: "Commission Paid Out!",
        message: "Settled on Stellar ledger. Tx: e2d8479e0a...",
        confetti: true,
        receiptUrl: "https://stellar.expert/explorer/testnet/tx/e2d8479e0a...",
        receipt: {
          txHash: "e2d8479e0a811c759f2a969df2011b6fa2e7dcb46a9a3b6db4237f37f3a8b412",
          amount: "10.0 XLM",
          saleId: 1,
        },
      };

      expect(notification.confetti).toBe(true);
      expect(notification.receipt).toBeDefined();
      expect(notification.receipt?.amount).toBe("10.0 XLM");
      expect(notification.receiptUrl).toBeDefined();
    });

    it("correctly identifies reward/claim toast characteristics using exported isRewardTitle", () => {
      expect(isRewardTitle("Commission Paid Out!")).toBe(true);
      expect(isRewardTitle("commission earned")).toBe(true);
      expect(isRewardTitle("Claim Successful")).toBe(true);
      expect(isRewardTitle("CLAIM PROCESSED")).toBe(true);
      expect(isRewardTitle("Payout Settled")).toBe(true);
      expect(isRewardTitle("Reward Unlocked")).toBe(true);
      expect(isRewardTitle("Normal Information")).toBe(false);
      expect(isRewardTitle("System Error")).toBe(false);
    });
  });
});
