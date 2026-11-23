import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";
import { Keypair } from "@stellar/stellar-sdk";
import {
  type BatchSaleState,
  calculateBatchRefund,
  validateCancellationConfirmation,
  cancelBatchSaleContractCall,
  executeBatchCancellationAndRefund,
} from "../lib/batchCancelRefund";
import { BatchCancelConfirmationModal } from "../components/advertiser/BatchCancelConfirmationModal";
import * as stellarLib from "../lib/stellar";

describe("Batch Cancellation and Escrow Refund Rollback Tests (#468)", () => {
  const TEST_ADVERTISER = Keypair.random().publicKey();

  const activeBatch: BatchSaleState = {
    batchId: "batch_2026_q4_001",
    campaignId: 42,
    campaignName: "Apex Quantum Launch Batch",
    advertiserAddress: TEST_ADVERTISER,
    totalTokens: 100_000,
    soldTokens: 35_000,
    escrowDepositXlm: 2_500.0,
    spentEscrowXlm: 875.0,
    status: "active",
  };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe("1. Cancellation Confirmation Modal Requires Typing Campaign Name", () => {
    it("rejects confirmation when typed input is empty, partial, or mismatched", () => {
      const expected = "Apex Quantum Launch Batch";

      // Empty input
      const emptyCheck = validateCancellationConfirmation("", expected);
      expect(emptyCheck.isConfirmed).toBe(false);
      expect(emptyCheck.error).toContain("Please type the campaign name");

      // Partial name
      const partialCheck = validateCancellationConfirmation("Apex Quantum", expected);
      expect(partialCheck.isConfirmed).toBe(false);
      expect(partialCheck.error).toContain("does not match");

      // Typo
      const typoCheck = validateCancellationConfirmation("Apex Quantum Launch Bath", expected);
      expect(typoCheck.isConfirmed).toBe(false);
      expect(typoCheck.error).toContain("does not match");
    });

    it("accepts confirmation only when input strictly matches the campaign name", () => {
      const expected = "Apex Quantum Launch Batch";

      const validCheck = validateCancellationConfirmation("Apex Quantum Launch Batch", expected);
      expect(validCheck.isConfirmed).toBe(true);
      expect(validCheck.error).toBeUndefined();

      // Handles surrounding whitespace cleanly
      const whitespaceCheck = validateCancellationConfirmation(
        "  Apex Quantum Launch Batch  ",
        expected,
      );
      expect(whitespaceCheck.isConfirmed).toBe(true);
    });

    it("renders modal with disabled confirm button when typed name does not match", () => {
      const html = renderToString(
        React.createElement(BatchCancelConfirmationModal, {
          isOpen: true,
          batch: activeBatch,
          onClose: vi.fn(),
          onConfirmCancel: vi.fn(),
        }),
      );

      expect(html).toContain("Cancel Batch Sale &amp; Refund Escrow");
      expect(html).toContain("Apex Quantum Launch Batch");
      expect(html).toContain("Irreversible Action");
      expect(html).toContain("Confirm &amp; Refund Escrow");
      // Button must be disabled initially because input is empty
      expect(html).toContain("disabled");
    });

    it("does not render modal when isOpen is false or batch is null", () => {
      const closedHtml = renderToString(
        React.createElement(BatchCancelConfirmationModal, {
          isOpen: false,
          batch: activeBatch,
          onClose: vi.fn(),
          onConfirmCancel: vi.fn(),
        }),
      );
      expect(closedHtml).toBe("");

      const nullBatchHtml = renderToString(
        React.createElement(BatchCancelConfirmationModal, {
          isOpen: true,
          batch: null,
          onClose: vi.fn(),
          onConfirmCancel: vi.fn(),
        }),
      );
      expect(nullBatchHtml).toBe("");
    });
  });

  describe("2. Soroban Contract Call for `cancel_batch_sale`", () => {
    it("invokes Soroban contract method `cancel_batch_sale` with correct parameters", async () => {
      const invokeSpy = vi.spyOn(stellarLib, "invokeSorobanMethod").mockResolvedValue({
        success: true,
        txHash: "0x" + "a".repeat(64),
      });

      const res = await cancelBatchSaleContractCall(
        TEST_ADVERTISER,
        "batch_test_123",
        42,
        "freighter",
      );

      expect(res.success).toBe(true);
      expect(res.txHash).toBe("0x" + "a".repeat(64));

      expect(invokeSpy).toHaveBeenCalledTimes(1);
      const [calledAddress, calledMethod, calledArgs, calledWallet] = invokeSpy.mock.calls[0];
      expect(calledAddress).toBe(TEST_ADVERTISER);
      expect(calledMethod).toBe("cancel_batch_sale");
      expect(calledArgs).toHaveLength(3);
      expect(calledWallet).toBe("freighter");
    });

    it("handles simulated / mock wallet execution", async () => {
      const res = await cancelBatchSaleContractCall(TEST_ADVERTISER, "batch_mock_999", 101, "mock");

      expect(res.success).toBe(true);
      expect(res.txHash).toMatch(/^0x[0-9a-f]{64}$/);
    });

    it("validates input parameters before invoking contract", async () => {
      await expect(cancelBatchSaleContractCall("", "batch_1", 1)).rejects.toThrow(
        /Advertiser address is required/,
      );

      await expect(cancelBatchSaleContractCall(TEST_ADVERTISER, "", 1)).rejects.toThrow(
        /Batch ID is required/,
      );

      await expect(cancelBatchSaleContractCall(TEST_ADVERTISER, "batch_1", -1)).rejects.toThrow(
        /valid campaignId is required/,
      );
    });
  });

  describe("3. Returned Escrow Reflected in Advertiser Balance Immediately Upon Confirmation", () => {
    it("accurately calculates remaining unspent escrow and unsold inventory", () => {
      const { refundedEscrowXlm, unsoldTokens } = calculateBatchRefund(activeBatch);

      // totalTokens (100,000) - soldTokens (35,000) = 65,000 unsold tokens
      expect(unsoldTokens).toBe(65_000);

      // escrowDeposit (2,500.0) - spentEscrow (875.0) = 1,625.0 XLM refund
      expect(refundedEscrowXlm).toBe(1_625.0);
    });

    it("executes full cancellation flow and updates advertiser balance immediately", async () => {
      const batchCopy: BatchSaleState = { ...activeBatch };
      const startingAdvertiserBalanceXlm = 500.0;
      let recordedBalance: number | null = null;

      const result = await executeBatchCancellationAndRefund({
        batch: batchCopy,
        confirmationNameInput: "Apex Quantum Launch Batch",
        currentAdvertiserBalanceXlm: startingAdvertiserBalanceXlm,
        walletType: "mock",
        onBalanceUpdate: (newBalance) => {
          recordedBalance = newBalance;
        },
      });

      expect(result.success).toBe(true);
      expect(result.batchId).toBe(batchCopy.batchId);
      expect(result.refundedEscrowXlm).toBe(1_625.0);
      expect(result.unsoldTokens).toBe(65_000);

      // Updated balance must be immediately reflected
      // 500.0 (initial) + 1,625.0 (refund) = 2,125.0 XLM
      expect(result.updatedAdvertiserBalanceXlm).toBe(2_125.0);
      expect(recordedBalance).toBe(2_125.0);

      // Batch status transitions to cancelled
      expect(batchCopy.status).toBe("cancelled");
    });

    it("aborts execution if confirmation campaign name does not match", async () => {
      const batchCopy: BatchSaleState = { ...activeBatch };
      let balanceUpdated = false;

      await expect(
        executeBatchCancellationAndRefund({
          batch: batchCopy,
          confirmationNameInput: "Wrong Name",
          currentAdvertiserBalanceXlm: 500.0,
          walletType: "mock",
          onBalanceUpdate: () => {
            balanceUpdated = true;
          },
        }),
      ).rejects.toThrow(/does not match/);

      expect(balanceUpdated).toBe(false);
      expect(batchCopy.status).toBe("active");
    });

    it("rejects cancellation if batch is already cancelled or completed", async () => {
      const cancelledBatch: BatchSaleState = {
        ...activeBatch,
        status: "cancelled",
      };

      await expect(
        executeBatchCancellationAndRefund({
          batch: cancelledBatch,
          confirmationNameInput: cancelledBatch.campaignName,
          currentAdvertiserBalanceXlm: 500.0,
          walletType: "mock",
        }),
      ).rejects.toThrow(/Cannot cancel batch in status "cancelled"/);
    });
  });
});
