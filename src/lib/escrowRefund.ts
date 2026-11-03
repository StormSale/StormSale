export interface EscrowRefundValidationResult {
  canRefund: boolean;
  isClearingExpired: boolean;
  hasClearedAllClaims: boolean;
  pendingClaimsCount: number;
  outstandingLiabilities: number;
  refundableAmount: number;
  remainingClearingSeconds: number;
  reason?: string;
}

export interface EscrowRefundCampaign {
  id: string;
  name: string;
  status: string;
  escrowBalance: number;
  escrowInitial: number;
  pendingClaims?: number;
  outstandingLiabilities?: number;
  clearingExpiresAt?: number | string | Date; // timestamp ms or ISO string
  clearingPeriodSecs?: number;
  isRefunded?: boolean;
}

/**
 * Checks if the clearing period for a campaign has concluded.
 */
export function isClearingPeriodExpired(
  clearingExpiresAt?: number | string | Date,
  currentTimeMs: number = Date.now(),
): boolean {
  if (!clearingExpiresAt) return true;
  const expiryTime =
    typeof clearingExpiresAt === "number"
      ? clearingExpiresAt
      : new Date(clearingExpiresAt).getTime();
  return currentTimeMs >= expiryTime;
}

/**
 * Checks if all affiliate claims have cleared with zero outstanding liabilities.
 */
export function hasClearedAllClaims(
  pendingClaims: number = 0,
  outstandingLiabilities: number = 0,
): boolean {
  return pendingClaims === 0 && outstandingLiabilities <= 0;
}

/**
 * Returns breakdown of refundable amount and liability clearance.
 */
export function getRefundBreakdown(campaign: EscrowRefundCampaign): {
  refundableAmount: number;
  pendingClaims: number;
  outstandingLiabilities: number;
} {
  const refundable = Math.max(0, campaign.escrowBalance || 0);
  const pending = campaign.pendingClaims || 0;
  const liabilities = Math.max(0, campaign.outstandingLiabilities || 0);
  return {
    refundableAmount: refundable,
    pendingClaims: pending,
    outstandingLiabilities: liabilities,
  };
}

/**
 * Validates whether the campaign can be concluded and its escrow refunded.
 * Acceptance criteria:
 * 1. Clearing period has expired.
 * 2. All pending affiliate claims have cleared (pendingClaims == 0 and outstandingLiabilities == 0).
 * 3. Campaign has refundable balance > 0 and is not already refunded.
 */
export function canConcludeAndRefundEscrow(
  campaign: EscrowRefundCampaign,
  currentTimeMs: number = Date.now(),
): EscrowRefundValidationResult {
  const expiryTime = campaign.clearingExpiresAt
    ? typeof campaign.clearingExpiresAt === "number"
      ? campaign.clearingExpiresAt
      : new Date(campaign.clearingExpiresAt).getTime()
    : 0;

  const remainingClearingSeconds = expiryTime > currentTimeMs
    ? Math.ceil((expiryTime - currentTimeMs) / 1000)
    : 0;

  const isClearingExpired = remainingClearingSeconds === 0;
  const pendingClaimsCount = campaign.pendingClaims ?? 0;
  const outstandingLiabilities = campaign.outstandingLiabilities ?? 0;
  const claimsCleared = hasClearedAllClaims(pendingClaimsCount, outstandingLiabilities);
  const refundableAmount = Math.max(0, campaign.escrowBalance ?? 0);

  if (campaign.isRefunded || campaign.status === "CONCLUDED") {
    return {
      canRefund: false,
      isClearingExpired,
      hasClearedAllClaims: claimsCleared,
      pendingClaimsCount,
      outstandingLiabilities,
      refundableAmount: 0,
      remainingClearingSeconds,
      reason: "Campaign escrow has already been concluded and refunded.",
    };
  }

  if (refundableAmount <= 0) {
    return {
      canRefund: false,
      isClearingExpired,
      hasClearedAllClaims: claimsCleared,
      pendingClaimsCount,
      outstandingLiabilities,
      refundableAmount: 0,
      remainingClearingSeconds,
      reason: "No remaining escrow balance to refund.",
    };
  }

  if (!isClearingExpired) {
    return {
      canRefund: false,
      isClearingExpired: false,
      hasClearedAllClaims: claimsCleared,
      pendingClaimsCount,
      outstandingLiabilities,
      refundableAmount,
      remainingClearingSeconds,
      reason: `Clearing period is still active (${remainingClearingSeconds}s remaining).`,
    };
  }

  if (!claimsCleared) {
    return {
      canRefund: false,
      isClearingExpired: true,
      hasClearedAllClaims: false,
      pendingClaimsCount,
      outstandingLiabilities,
      refundableAmount,
      remainingClearingSeconds: 0,
      reason: `Cannot refund escrow: ${pendingClaimsCount} affiliate claims are still pending with ${outstandingLiabilities} XLM liabilities.`,
    };
  }

  return {
    canRefund: true,
    isClearingExpired: true,
    hasClearedAllClaims: true,
    pendingClaimsCount: 0,
    outstandingLiabilities: 0,
    refundableAmount,
    remainingClearingSeconds: 0,
  };
}

/**
 * Updates campaign to CONCLUDED status and balance to 0.00
 */
export function applyRefundConcludedState<T extends EscrowRefundCampaign>(campaign: T): T {
  return {
    ...campaign,
    status: "CONCLUDED",
    escrowBalance: 0,
    isRefunded: true,
  };
}
