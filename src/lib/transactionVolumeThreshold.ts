/**
 * Anomalous Transaction Volume Threshold Warning Engine (#480)
 *
 * Enforces explicit confirmation gates when transactions exceed:
 * 1. Absolute threshold: > 50,000 XLM
 * 2. Relative threshold: > 10x normal/baseline historical transaction volume
 */

export const ABSOLUTE_VOLUME_THRESHOLD_XLM = 50_000;
export const RELATIVE_VOLUME_MULTIPLIER_THRESHOLD = 10;

export interface VolumeAnomalyCheckResult {
  isAnomalous: boolean;
  reason?: "ABSOLUTE_THRESHOLD_EXCEEDED" | "RELATIVE_THRESHOLD_EXCEEDED" | "BOTH";
  amount: number;
  baselineVolume?: number;
  multiplier?: number;
  thresholdXlm: number;
  warningMessage?: string;
}

/**
 * Evaluates whether a transaction amount exceeds anomalous volume thresholds.
 */
export function evaluateTransactionVolume(
  amount: number,
  baselineVolume?: number
): VolumeAnomalyCheckResult {
  const isAbsolute = amount > ABSOLUTE_VOLUME_THRESHOLD_XLM;
  const hasBaseline = typeof baselineVolume === "number" && baselineVolume > 0;
  const isRelative = hasBaseline && amount > baselineVolume * RELATIVE_VOLUME_MULTIPLIER_THRESHOLD;

  let reason: "ABSOLUTE_THRESHOLD_EXCEEDED" | "RELATIVE_THRESHOLD_EXCEEDED" | "BOTH" | undefined;
  if (isAbsolute && isRelative) {
    reason = "BOTH";
  } else if (isAbsolute) {
    reason = "ABSOLUTE_THRESHOLD_EXCEEDED";
  } else if (isRelative) {
    reason = "RELATIVE_THRESHOLD_EXCEEDED";
  }

  const isAnomalous = isAbsolute || isRelative;
  const multiplier = hasBaseline ? Number((amount / baselineVolume).toFixed(2)) : undefined;

  let warningMessage: string | undefined;
  if (isAnomalous) {
    if (reason === "BOTH") {
      warningMessage = `Transaction of ${amount.toLocaleString()} XLM exceeds both the 50,000 XLM safety threshold and 10x your average volume (${multiplier}x).`;
    } else if (reason === "ABSOLUTE_THRESHOLD_EXCEEDED") {
      warningMessage = `Transaction of ${amount.toLocaleString()} XLM exceeds the high-value safety threshold of 50,000 XLM.`;
    } else {
      warningMessage = `Transaction of ${amount.toLocaleString()} XLM is ${multiplier}x higher than your normal transaction volume (${baselineVolume?.toLocaleString()} XLM).`;
    }
  }

  return {
    isAnomalous,
    reason,
    amount,
    baselineVolume,
    multiplier,
    thresholdXlm: ABSOLUTE_VOLUME_THRESHOLD_XLM,
    warningMessage,
  };
}

export type TransactionGuardStatus = "idle" | "evaluating" | "warning_required" | "confirmed" | "cancelled";

export class TransactionVolumeGuard {
  private status: TransactionGuardStatus = "idle";
  private pendingAmount: number = 0;
  private pendingBaseline?: number;
  private isCheckboxConfirmed: boolean = false;

  public initiate(amount: number, baselineVolume?: number): { requiresWarning: boolean; evaluation: VolumeAnomalyCheckResult } {
    this.pendingAmount = amount;
    this.pendingBaseline = baselineVolume;
    this.isCheckboxConfirmed = false;

    const evaluation = evaluateTransactionVolume(amount, baselineVolume);
    if (evaluation.isAnomalous) {
      this.status = "warning_required";
      return { requiresWarning: true, evaluation };
    }

    this.status = "confirmed";
    return { requiresWarning: false, evaluation };
  }

  public setCheckboxConfirmed(confirmed: boolean): void {
    this.isCheckboxConfirmed = confirmed;
  }

  public confirm(): boolean {
    if (this.status === "warning_required" && !this.isCheckboxConfirmed) {
      return false;
    }
    this.status = "confirmed";
    return true;
  }

  public cancel(): void {
    this.reset();
    this.status = "cancelled";
  }

  public reset(): void {
    this.status = "idle";
    this.pendingAmount = 0;
    this.pendingBaseline = undefined;
    this.isCheckboxConfirmed = false;
  }

  public getStatus(): TransactionGuardStatus {
    return this.status;
  }

  public getPendingAmount(): number {
    return this.pendingAmount;
  }

  public getPendingBaseline(): number | undefined {
    return this.pendingBaseline;
  }

  public isConfirmed(): boolean {
    return this.isCheckboxConfirmed;
  }
}
