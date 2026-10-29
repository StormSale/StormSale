/**
 * Automated Escrow Top-Up Logic (#107)
 * Handles user-defined trigger thresholds, pre-authorized allowance checking,
 * and automated escrow funding dispatch.
 */

import { xdr, Address, nativeToScVal } from "@stellar/stellar-sdk";
import {
  type WalletType,
  stellarOperations,
  parseUnitsToBigInt,
} from "./stellar";
import { CONTRACT_ADDRESSES } from "../config/contracts";
import { SUPPORTED_ESCROW_ASSETS, type SupportedEscrowAssetCode } from "../config/stellar";

export type ThresholdType = "percentage" | "fixed";

export interface AutoTopUpConfig {
  campaignId: string;
  enabled: boolean;
  thresholdType: ThresholdType;
  thresholdValue: number; // e.g. 15 for 15%, or 500 for 500 XLM
  topUpAmount: number; // Amount of XLM to fund when triggered (e.g. 1000)
  maxTopUpsPerDay: number;
  topUpCountToday: number;
  lastTopUpAt?: string;
  lastTopUpTx?: string;
}

export interface AutoTopUpTriggerEvaluation {
  shouldTrigger: boolean;
  currentBalance: number;
  thresholdAmount: number;
  thresholdPercentage: number;
  requiredTopUpAmount: number;
  hasSufficientAllowance: boolean;
  currentAllowance: number;
  allowanceDeficit: number;
  reason?: string;
}

export const STORAGE_PREFIX = "stormsale_auto_topup_";

/**
 * Generates default configuration for a campaign.
 */
export function getDefaultAutoTopUpConfig(
  campaignId: string,
  escrowInitial: number = 5000,
): AutoTopUpConfig {
  // Preset default refill: 20% of initial escrow or 1,000 XLM
  const defaultRefill = Math.max(500, Math.round(escrowInitial * 0.2));

  return {
    campaignId,
    enabled: true,
    thresholdType: "percentage",
    thresholdValue: 15, // Trigger when escrow drops below 15%
    topUpAmount: defaultRefill,
    maxTopUpsPerDay: 5,
    topUpCountToday: 0,
  };
}

/**
 * Normalizes daily top-up count by checking if lastTopUpAt was on a previous calendar day (UTC).
 */
export function normalizeDailyTopUpCount(config: AutoTopUpConfig): AutoTopUpConfig {
  const lastDay = config.lastTopUpAt ? config.lastTopUpAt.slice(0, 10) : null;
  const today = new Date().toISOString().slice(0, 10);
  if (lastDay && lastDay !== today) {
    return {
      ...config,
      topUpCountToday: 0,
    };
  }
  return config;
}

/**
 * Loads persisted configuration from localStorage or falls back to defaults.
 */
export function getStoredAutoTopUpConfig(
  campaignId: string,
  escrowInitial: number = 5000,
): AutoTopUpConfig {
  const fallback = getDefaultAutoTopUpConfig(campaignId, escrowInitial);
  if (typeof window === "undefined" || !window.localStorage) {
    return fallback;
  }

  try {
    const raw = window.localStorage.getItem(`${STORAGE_PREFIX}${campaignId}`);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    const merged: AutoTopUpConfig = {
      ...fallback,
      ...parsed,
      campaignId, // guarantee ID matches
    };
    return normalizeDailyTopUpCount(merged);
  } catch {
    return fallback;
  }
}

/**
 * Persists auto top-up configuration to localStorage.
 */
export function saveAutoTopUpConfig(config: AutoTopUpConfig): void {
  if (typeof window === "undefined" || !window.localStorage) return;
  try {
    window.localStorage.setItem(
      `${STORAGE_PREFIX}${config.campaignId}`,
      JSON.stringify(config),
    );
  } catch (err) {
    console.warn("Failed to persist auto top-up config:", err);
  }
}

/**
 * Evaluates whether an automated escrow top-up should trigger, taking into account:
 * 1. Campaign status (never trigger on Completed)
 * 2. User-defined threshold (percentage or fixed XLM balance)
 * 3. Pre-authorized allowance status (sufficient vs deficit)
 * 4. Safety limits (max top-ups per day)
 */
export function evaluateAutoTopUpTrigger(
  campaign: {
    id?: string;
    status: string;
    escrowInitial: number;
    escrowBalance: number;
  },
  config: AutoTopUpConfig,
  currentAllowance: number,
): AutoTopUpTriggerEvaluation {
  const normalizedConfig = normalizeDailyTopUpCount(config);
  const currentBalance = Math.max(0, campaign.escrowBalance);
  const escrowInitial = Math.max(0, campaign.escrowInitial);
  let thresholdAmount: number;
  let thresholdPercentage: number;

  if (normalizedConfig.thresholdType === "percentage") {
    thresholdPercentage = normalizedConfig.thresholdValue;
    thresholdAmount = (normalizedConfig.thresholdValue / 100) * escrowInitial;
  } else {
    thresholdAmount = normalizedConfig.thresholdValue;
    thresholdPercentage = escrowInitial > 0 ? (normalizedConfig.thresholdValue / escrowInitial) * 100 : 0;
  }

  const hasSufficientAllowance = currentAllowance >= normalizedConfig.topUpAmount;
  const allowanceDeficit = Math.max(0, normalizedConfig.topUpAmount - currentAllowance);

  // Condition 1: Completed or Ended campaigns must never auto top-up
  if (campaign.status === "Completed") {
    return {
      shouldTrigger: false,
      currentBalance,
      thresholdAmount,
      thresholdPercentage,
      requiredTopUpAmount: normalizedConfig.topUpAmount,
      hasSufficientAllowance,
      currentAllowance,
      allowanceDeficit,
      reason: "Campaign is completed or ended.",
    };
  }

  // Condition 2: Auto top-up disabled
  if (!normalizedConfig.enabled) {
    return {
      shouldTrigger: false,
      currentBalance,
      thresholdAmount,
      thresholdPercentage,
      requiredTopUpAmount: normalizedConfig.topUpAmount,
      hasSufficientAllowance,
      currentAllowance,
      allowanceDeficit,
      reason: "Automated top-up is disabled for this campaign.",
    };
  }

  // Condition 3: Safety cap check
  if (normalizedConfig.topUpCountToday >= normalizedConfig.maxTopUpsPerDay) {
    return {
      shouldTrigger: false,
      currentBalance,
      thresholdAmount,
      thresholdPercentage,
      requiredTopUpAmount: normalizedConfig.topUpAmount,
      hasSufficientAllowance,
      currentAllowance,
      allowanceDeficit,
      reason: `Daily top-up limit reached (${normalizedConfig.topUpCountToday}/${normalizedConfig.maxTopUpsPerDay}).`,
    };
  }

  // Condition 4: Has balance dropped at or below trigger threshold?
  const isBelowThreshold = currentBalance <= thresholdAmount;

  if (!isBelowThreshold) {
    return {
      shouldTrigger: false,
      currentBalance,
      thresholdAmount,
      thresholdPercentage,
      requiredTopUpAmount: normalizedConfig.topUpAmount,
      hasSufficientAllowance,
      currentAllowance,
      allowanceDeficit,
      reason: `Balance (${currentBalance} XLM) is healthy and above trigger threshold (${thresholdAmount.toFixed(0)} XLM).`,
    };
  }

  // If below threshold and allowance is insufficient
  if (!hasSufficientAllowance) {
    return {
      shouldTrigger: false,
      currentBalance,
      thresholdAmount,
      thresholdPercentage,
      requiredTopUpAmount: normalizedConfig.topUpAmount,
      hasSufficientAllowance: false,
      currentAllowance,
      allowanceDeficit,
      reason: `Threshold breached, but pre-authorized allowance is insufficient. Requires ${allowanceDeficit.toLocaleString()} XLM more allowance approval.`,
    };
  }

  // All conditions passed: trigger automated top-up!
  return {
    shouldTrigger: true,
    currentBalance,
    thresholdAmount,
    thresholdPercentage,
    requiredTopUpAmount: normalizedConfig.topUpAmount,
    hasSufficientAllowance: true,
    currentAllowance,
    allowanceDeficit: 0,
    reason: `Threshold breached: Escrow balance (${currentBalance} XLM) is below ${thresholdAmount.toFixed(0)} XLM. Pre-authorized allowance is sufficient.`,
  };
}

/**
 * Tops up / funds escrow balance for an active campaign on-chain.
 */
export async function topUpCampaignEscrowContractCall(
  advertiserAddress: string,
  campaignId: number,
  amount: number,
  walletType: WalletType = "freighter",
  assetCode: SupportedEscrowAssetCode = "XLM",
): Promise<{ success: boolean; txHash: string; toppedUpAmount: number }> {
  if (!advertiserAddress) throw new Error("Wallet not connected");
  if (amount <= 0) throw new Error("Top-up amount must be greater than zero");

  if (
    walletType === "mock" ||
    advertiserAddress.startsWith("GASTORMSALE7") ||
    (typeof (globalThis as any).process !== "undefined" && (globalThis as any).process?.env?.NODE_ENV === "test")
  ) {
    const mockHash =
      "0x" + Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join("");
    // Deduct mock allowance if stored in localStorage
    if (typeof window !== "undefined" && window.localStorage) {
      const key = `mock_allowance_${advertiserAddress}_${CONTRACT_ADDRESSES.CAMPAIGN_ESCROW}`;
      const stored = window.localStorage.getItem(key);
      if (stored) {
        const remaining = Math.max(0, parseFloat(stored) - amount);
        window.localStorage.setItem(key, remaining.toString());
      }
    }
    return {
      success: true,
      txHash: mockHash,
      toppedUpAmount: amount,
    };
  }

  const assetConfig = SUPPORTED_ESCROW_ASSETS[assetCode] || SUPPORTED_ESCROW_ASSETS.XLM;
  const amountStroops = parseUnitsToBigInt(amount, assetConfig.decimals);

  const args: xdr.ScVal[] = [
    new Address(advertiserAddress).toScVal(),
    nativeToScVal(campaignId, { type: "u32" }),
    nativeToScVal(amountStroops, { type: "i128" }),
  ];

  const result = await stellarOperations.invokeSorobanMethod(
    advertiserAddress,
    "top_up_escrow",
    args,
    walletType,
  );

  return {
    success: true,
    txHash: result.txHash,
    toppedUpAmount: amount,
  };
}
