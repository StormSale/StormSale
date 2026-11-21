/**
 * Batch Cancellation and Escrow Refund Rollback Engine (Issue #468)
 *
 * Implements:
 * 1. Safe batch sale cancellation requiring typed campaign name confirmation.
 * 2. Soroban contract call for `cancel_batch_sale`.
 * 3. Immediate escrow refund calculation and advertiser balance rollback.
 */

import { Address, nativeToScVal, type xdr } from "@stellar/stellar-sdk";
import { invokeSorobanMethod, type WalletType } from "./stellar";

export interface BatchSaleState {
  batchId: string;
  campaignId: number;
  campaignName: string;
  advertiserAddress: string;
  totalTokens: number;
  soldTokens: number;
  escrowDepositXlm: number;
  spentEscrowXlm: number;
  status: "active" | "cancelled" | "completed";
}

export interface BatchCancelResult {
  success: boolean;
  batchId: string;
  campaignId: number;
  txHash: string;
  refundedEscrowXlm: number;
  unsoldTokens: number;
  updatedAdvertiserBalanceXlm: number;
}

/**
 * Calculates remaining unspent escrow and unsold tokens eligible for refund.
 */
export function calculateBatchRefund(batch: BatchSaleState): {
  refundedEscrowXlm: number;
  unsoldTokens: number;
} {
  const unsoldTokens = Math.max(0, batch.totalTokens - batch.soldTokens);
  const refundedEscrowXlm = Math.max(0, batch.escrowDepositXlm - batch.spentEscrowXlm);
  return {
    refundedEscrowXlm: Math.round(refundedEscrowXlm * 10_000_000) / 10_000_000,
    unsoldTokens,
  };
}

/**
 * Validates that user confirmation input matches the exact campaign name.
 */
export function validateCancellationConfirmation(
  inputName: string,
  expectedName: string,
): { isConfirmed: boolean; error?: string } {
  const trimmedInput = (inputName || "").trim();
  const trimmedExpected = (expectedName || "").trim();

  if (!trimmedInput) {
    return {
      isConfirmed: false,
      error: "Please type the campaign name to confirm cancellation.",
    };
  }

  if (trimmedInput !== trimmedExpected) {
    return {
      isConfirmed: false,
      error: `Input "${trimmedInput}" does not match campaign name "${trimmedExpected}".`,
    };
  }

  return { isConfirmed: true };
}

/**
 * Invokes the Soroban smart contract method `cancel_batch_sale`.
 * Releases unspent escrow and unsold inventory back to the advertiser.
 */
export async function cancelBatchSaleContractCall(
  advertiserAddress: string,
  batchId: string,
  campaignId: number,
  walletType: WalletType = "freighter",
): Promise<{ success: boolean; txHash: string }> {
  const trimmed = advertiserAddress.trim();
  if (!trimmed) {
    throw new Error("Advertiser address is required to cancel batch sale.");
  }
  if (!batchId || !batchId.trim()) {
    throw new Error("Batch ID is required for cancellation.");
  }
  if (!Number.isInteger(campaignId) || campaignId <= 0) {
    throw new Error("A valid campaignId is required for batch cancellation.");
  }

  // Handle mock/testing mode
  if (
    walletType === "mock" ||
    (typeof window !== "undefined" &&
      (window as unknown as { __MOCK_CANCEL__?: boolean }).__MOCK_CANCEL__)
  ) {
    const mockHash =
      "0x" + Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join("");
    return {
      success: true,
      txHash: mockHash,
    };
  }

  const args: xdr.ScVal[] = [
    new Address(trimmed).toScVal(),
    nativeToScVal(batchId, { type: "string" }),
    nativeToScVal(campaignId, { type: "u32" }),
  ];

  const result = await invokeSorobanMethod(trimmed, "cancel_batch_sale", args, walletType);

  return {
    success: true,
    txHash: result.txHash,
  };
}

/**
 * Executes full batch cancellation flow:
 * 1. Confirms typed campaign name
 * 2. Invokes Soroban `cancel_batch_sale` contract method
 * 3. Immediately calculates refunded escrow and returns updated advertiser balance
 */
export async function executeBatchCancellationAndRefund(params: {
  batch: BatchSaleState;
  confirmationNameInput: string;
  currentAdvertiserBalanceXlm: number;
  walletType?: WalletType;
  onBalanceUpdate?: (newBalance: number) => void;
}): Promise<BatchCancelResult> {
  const {
    batch,
    confirmationNameInput,
    currentAdvertiserBalanceXlm,
    walletType = "mock",
    onBalanceUpdate,
  } = params;

  if (batch.status !== "active") {
    throw new Error(
      `Cannot cancel batch in status "${batch.status}". Only active batches can be cancelled.`,
    );
  }

  // 1. Confirmation check
  const confirmation = validateCancellationConfirmation(confirmationNameInput, batch.campaignName);
  if (!confirmation.isConfirmed) {
    throw new Error(confirmation.error);
  }

  // 2. Contract call
  const contractRes = await cancelBatchSaleContractCall(
    batch.advertiserAddress,
    batch.batchId,
    batch.campaignId,
    walletType,
  );

  // 3. Balance rollback
  const { refundedEscrowXlm, unsoldTokens } = calculateBatchRefund(batch);
  const updatedAdvertiserBalanceXlm =
    Math.round((currentAdvertiserBalanceXlm + refundedEscrowXlm) * 10_000_000) / 10_000_000;

  batch.status = "cancelled";
  onBalanceUpdate?.(updatedAdvertiserBalanceXlm);

  return {
    success: true,
    batchId: batch.batchId,
    campaignId: batch.campaignId,
    txHash: contractRes.txHash,
    refundedEscrowXlm,
    unsoldTokens,
    updatedAdvertiserBalanceXlm,
  };
}
