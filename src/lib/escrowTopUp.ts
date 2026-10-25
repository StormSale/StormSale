/**
 * Automated Escrow Top-Up Logic (#107)
 * Handles user-defined trigger thresholds, pre-authorized allowance checking,
 * and automated escrow funding dispatch.
 *
 * Slack notification support (issue: Automated Slack App for Merchant Escrow
 * Depletion Notifications): low-balance evaluations can be dispatched to a
 * Slack Incoming Webhook with Block Kit formatting, rate-limited per campaign,
 * and recorded in a local notification log surfaced in advertiser settings.
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

/* ------------------------------------------------------------------------ */
/* Slack notification types & configuration                                  */
/* ------------------------------------------------------------------------ */

export const SLACK_STORAGE_PREFIX = "stormsale_slack_";
export const SLACK_NOTIFICATION_LOG_PREFIX = "stormsale_slack_log_";

/** Campaign budget level (fraction of initial escrow) that triggers a warning. */
export const LOW_BUDGET_RATIO = 0.2;

/** Minimum time between Slack notifications for the same campaign (ms). */
export const SLACK_RATE_LIMIT_MS = 15 * 60 * 1000;

/** Maximum number of notification log entries retained per campaign. */
export const SLACK_LOG_MAX_ENTRIES = 50;

export interface SlackConfig {
  enabled: boolean;
  webhookUrl: string;
  /** Base URL used to build "View Campaign" / "Top Up Escrow" links. */
  appBaseUrl: string;
}

export interface SlackNotificationLogEntry {
  id: string;
  campaignId: string;
  kind: "low_escrow" | "high_value_conversion" | "test";
  status: "sent" | "failed" | "rate_limited" | "skipped";
  message: string;
  createdAt: string;
  error?: string;
}

export interface SlackDispatchResult {
  sent: boolean;
  status: SlackNotificationLogEntry["status"];
  error?: string;
}

export interface SlackBlockKitMessage {
  text: string;
  blocks: Array<Record<string, unknown>>;
}

/**
 * Returns true when a URL is a plausible Slack Incoming Webhook URL.
 */
export function isValidSlackWebhookUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return (
      parsed.protocol === "https:" &&
      parsed.hostname === "hooks.slack.com" &&
      parsed.pathname.startsWith("/services/")
    );
  } catch {
    return false;
  }
}

export function getDefaultSlackConfig(): SlackConfig {
  return {
    enabled: false,
    webhookUrl: "",
    appBaseUrl: typeof window !== "undefined" && window.location ? window.location.origin : "",
  };
}

export function getStoredSlackConfig(advertiserAddress: string): SlackConfig {
  const fallback = getDefaultSlackConfig();
  if (typeof window === "undefined" || !window.localStorage) return fallback;
  try {
    const raw = window.localStorage.getItem(`${SLACK_STORAGE_PREFIX}${advertiserAddress}`);
    if (!raw) return fallback;
    return { ...fallback, ...JSON.parse(raw) };
  } catch {
    return fallback;
  }
}

export function saveSlackConfig(advertiserAddress: string, config: SlackConfig): void {
  if (typeof window === "undefined" || !window.localStorage) return;
  try {
    window.localStorage.setItem(
      `${SLACK_STORAGE_PREFIX}${advertiserAddress}`,
      JSON.stringify(config),
    );
  } catch (err) {
    console.warn("Failed to persist Slack config:", err);
  }
}

/* ------------------------------------------------------------------------ */
/* Slack notification log                                                    */
/* ------------------------------------------------------------------------ */

export function getSlackNotificationLog(campaignId: string): SlackNotificationLogEntry[] {
  if (typeof window === "undefined" || !window.localStorage) return [];
  try {
    const raw = window.localStorage.getItem(`${SLACK_NOTIFICATION_LOG_PREFIX}${campaignId}`);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function appendSlackNotificationLog(entry: SlackNotificationLogEntry): void {
  if (typeof window === "undefined" || !window.localStorage) return;
  try {
    const existing = getSlackNotificationLog(entry.campaignId);
    const next = [entry, ...existing].slice(0, SLACK_LOG_MAX_ENTRIES);
    window.localStorage.setItem(
      `${SLACK_NOTIFICATION_LOG_PREFIX}${entry.campaignId}`,
      JSON.stringify(next),
    );
  } catch (err) {
    console.warn("Failed to persist Slack notification log:", err);
  }
}

function makeLogEntry(
  campaignId: string,
  kind: SlackNotificationLogEntry["kind"],
  status: SlackNotificationLogEntry["status"],
  message: string,
  error?: string,
): SlackNotificationLogEntry {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    campaignId,
    kind,
    status,
    message,
    createdAt: new Date().toISOString(),
    ...(error ? { error } : {}),
  };
}

/* ------------------------------------------------------------------------ */
/* Slack rate limiting                                                       */
/* ------------------------------------------------------------------------ */

const slackLastSentAt = new Map<string, number>();

/**
 * Returns true if a notification for this campaign may be sent now.
 * Uses the last successful send timestamp recorded in memory and in the log.
 */
export function canSendSlackNotification(
  campaignId: string,
  now: number = Date.now(),
  rateLimitMs: number = SLACK_RATE_LIMIT_MS,
): boolean {
  let last = slackLastSentAt.get(campaignId);
  if (last === undefined) {
    const sentEntry = getSlackNotificationLog(campaignId).find((e) => e.status === "sent");
    if (sentEntry) {
      last = Date.parse(sentEntry.createdAt);
      if (Number.isNaN(last)) last = undefined;
    }
  }
  if (last === undefined) return true;
  return now - last >= rateLimitMs;
}

/* ------------------------------------------------------------------------ */
/* Slack Block Kit formatting                                                */
/* ------------------------------------------------------------------------ */

export interface CampaignSlackContext {
  id: string;
  name?: string;
  escrowBalance: number;
  escrowInitial: number;
}

export function buildCampaignLinks(
  appBaseUrl: string,
  campaignId: string,
): { viewCampaign: string; topUpEscrow: string } {
  const base = appBaseUrl.replace(/\/+$/, "");
  return {
    viewCampaign: `${base}/campaigns/${encodeURIComponent(campaignId)}`,
    topUpEscrow: `${base}/campaigns/${encodeURIComponent(campaignId)}?action=top-up`,
  };
}

/**
 * Builds a Slack Block Kit low-escrow warning with "View Campaign" and
 * "Top Up Escrow" action buttons.
 */
export function buildLowEscrowSlackMessage(
  campaign: CampaignSlackContext,
  appBaseUrl: string,
): SlackBlockKitMessage {
  const name = campaign.name || `Campaign ${campaign.id}`;
  const pct =
    campaign.escrowInitial > 0
      ? Math.max(0, (campaign.escrowBalance / campaign.escrowInitial) * 100)
      : 0;
  const links = buildCampaignLinks(appBaseUrl, campaign.id);
  const text = `Low escrow balance: ${name} at ${pct.toFixed(1)}% of budget`;

  return {
    text,
    blocks: [
      {
        type: "header",
        text: { type: "plain_text", text: "⚠️ Low escrow balance", emoji: true },
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text:
            `*${name}* has dropped to *${campaign.escrowBalance.toLocaleString()}* of ` +
            `*${campaign.escrowInitial.toLocaleString()}* XLM (${pct.toFixed(1)}%).`,
        },
      },
      {
        type: "actions",
        elements: [
          {
            type: "button",
            text: { type: "plain_text", text: "View Campaign", emoji: true },
            url: links.viewCampaign,
            action_id: "view_campaign",
          },
          {
            type: "button",
            style: "primary",
            text: { type: "plain_text", text: "Top Up Escrow", emoji: true },
            url: links.topUpEscrow,
            action_id: "top_up_escrow",
          },
        ],
      },
    ],
  };
}

/* ------------------------------------------------------------------------ */
/* Slack dispatch                                                            */
/* ------------------------------------------------------------------------ */

/**
 * Posts a Block Kit payload to a Slack Incoming Webhook.
 */
export async function postToSlackWebhook(
  webhookUrl: string,
  message: SlackBlockKitMessage,
): Promise<void> {
  if (!isValidSlackWebhookUrl(webhookUrl)) {
    throw new Error("Invalid Slack webhook URL");
  }
  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(message),
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Slack webhook responded ${response.status}${body ? `: ${body}` : ""}`);
  }
}

/**
 * Sends a test message to the configured webhook to verify connectivity.
 * The result is recorded in the notification log.
 */
export async function testSlackWebhook(
  campaignId: string,
  webhookUrl: string,
): Promise<SlackDispatchResult> {
  const message: SlackBlockKitMessage = {
    text: "StormSale Slack integration test",
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: "✅ *StormSale* Slack integration is connected. Escrow alerts will appear here.",
        },
      },
    ],
  };
  try {
    await postToSlackWebhook(webhookUrl, message);
    const entry = makeLogEntry(campaignId, "test", "sent", "Test notification delivered");
    appendSlackNotificationLog(entry);
    slackLastSentAt.set(campaignId, Date.parse(entry.createdAt));
    return { sent: true, status: "sent" };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    appendSlackNotificationLog(
      makeLogEntry(campaignId, "test", "failed", "Test notification failed", error),
    );
    return { sent: false, status: "failed", error };
  }
}

/**
 * Dispatches a low-escrow alert for a campaign if its balance is below
 * LOW_BUDGET_RATIO of the initial escrow, Slack is enabled, and the rate
 * limit allows it. Every attempt is recorded in the notification log.
 */
export async function notifyLowEscrowBalance(
  campaign: CampaignSlackContext,
  slackConfig: SlackConfig,
  now: number = Date.now(),
): Promise<SlackDispatchResult> {
  if (!slackConfig.enabled || !slackConfig.webhookUrl) {
    return { sent: false, status: "skipped" };
  }
  if (campaign.escrowInitial <= 0) {
    return { sent: false, status: "skipped" };
  }
  const ratio = campaign.escrowBalance / campaign.escrowInitial;
  if (ratio > LOW_BUDGET_RATIO) {
    return { sent: false, status: "skipped" };
  }
  if (!canSendSlackNotification(campaign.id, now)) {
    appendSlackNotificationLog(
      makeLogEntry(
        campaign.id,
        "low_escrow",
        "rate_limited",
        "Suppressed: rate limit window active",
      ),
    );
    return { sent: false, status: "rate_limited" };
  }

  const message = buildLowEscrowSlackMessage(campaign, slackConfig.appBaseUrl);
  try {
    await postToSlackWebhook(slackConfig.webhookUrl, message);
    const entry = makeLogEntry(campaign.id, "low_escrow", "sent", message.text);
    appendSlackNotificationLog(entry);
    slackLastSentAt.set(campaign.id, now);
    return { sent: true, status: "sent" };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    appendSlackNotificationLog(
      makeLogEntry(campaign.id, "low_escrow", "failed", message.text, error),
    );
    return { sent: false, status: "failed", error };
  }
}

/* ------------------------------------------------------------------------ */
/* Auto top-up config                                                        */
/* ------------------------------------------------------------------------ */

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
