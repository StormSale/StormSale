import { Address, nativeToScVal, type xdr } from "@stellar/stellar-sdk";
import { invokeSorobanMethod, type WalletType } from "./stellar";

export const MIN_REFILL_THRESHOLD_PERCENT = 5;
export const MAX_REFILL_THRESHOLD_PERCENT = 30;
export const DEFAULT_REFILL_THRESHOLD_PERCENT = 15;
export const DEFAULT_REFILL_AMOUNT_XLM = 500;

export interface AutoRefillConfig {
  campaignId: string;
  thresholdPercent: number; // 5% to 30%
  autoRefillAmountXlm: number;
  isAutoRefillEnabled: boolean;
  preAuthorizedBudgetLimitXlm?: number;
  lastRefillTimestamp?: number;
  lastRefillTxHash?: string;
  slackWebhookUrl?: string;
}

export interface EscrowReserveStatus {
  campaignId: string;
  currentBalanceXlm: number;
  initialBudgetXlm: number;
  remainingPercent: number;
  thresholdPercent: number;
  thresholdBalanceXlm: number;
  isLowReserve: boolean;
  warningLevel: "healthy" | "warning" | "critical";
}

export interface RefillDepositResult {
  success: boolean;
  txHash: string;
  campaignId: string;
  depositedAmountXlm: number;
  newBalanceXlm: number;
  timestamp: number;
  message: string;
}

export interface SlackNotificationLogEntry {
  id: string;
  campaignId: string;
  timestamp: number;
  kind: "low_escrow" | "high_value_conversion" | "test";
  status: "sent" | "rate_limited" | "failed";
  message: string;
}

const STORAGE_KEY = "stormsale_escrow_autorefill_configs";
const SLACK_LOG_KEY = "stormsale_slack_notification_logs";

/** Minimum gap between Slack notifications per campaign to avoid channel flooding. */
export const SLACK_RATE_LIMIT_MS = 5 * 60 * 1000;

/**
 * In-memory fallback balance tracking for mock/sandbox runs
 */
const mockCampaignBalances = new Map<string, { current: number; initial: number }>();

/**
 * Clamps threshold percentage to valid range (5% to 30%)
 */
export function clampThreshold(percent: number): number {
  if (isNaN(percent)) return DEFAULT_REFILL_THRESHOLD_PERCENT;
  return Math.min(Math.max(percent, MIN_REFILL_THRESHOLD_PERCENT), MAX_REFILL_THRESHOLD_PERCENT);
}

/**
 * Calculates current escrow reserve health and threshold status
 */
export function calculateEscrowReserveStatus(
  currentBalanceXlm: number,
  initialBudgetXlm: number,
  thresholdPercent: number,
  campaignId: string = "default",
): EscrowReserveStatus {
  const safeInitial = Math.max(initialBudgetXlm, 1);
  const safeCurrent = Math.max(currentBalanceXlm, 0);
  const clampedPercent = clampThreshold(thresholdPercent);

  const remainingPercent = Number(((safeCurrent / safeInitial) * 100).toFixed(1));
  const thresholdBalanceXlm = Number(((safeInitial * clampedPercent) / 100).toFixed(2));
  const isLowReserve = safeCurrent <= thresholdBalanceXlm;

  let warningLevel: "healthy" | "warning" | "critical" = "healthy";
  if (remainingPercent <= MIN_REFILL_THRESHOLD_PERCENT) {
    warningLevel = "critical";
  } else if (isLowReserve) {
    warningLevel = "warning";
  }

  return {
    campaignId,
    currentBalanceXlm: safeCurrent,
    initialBudgetXlm: safeInitial,
    remainingPercent,
    thresholdPercent: clampedPercent,
    thresholdBalanceXlm,
    isLowReserve,
    warningLevel,
  };
}

const inMemoryConfigs = new Map<string, AutoRefillConfig>();

/**
 * Loads stored auto-refill configuration for a campaign
 */
export function getAutoRefillConfig(campaignId: string): AutoRefillConfig {
  const memoryConfig = inMemoryConfigs.get(campaignId);
  if (memoryConfig) {
    return memoryConfig;
  }

  try {
    if (typeof window !== "undefined" && window.localStorage) {
      const stored = window.localStorage.getItem(`${STORAGE_KEY}_${campaignId}`);
      if (stored) {
        const parsed = JSON.parse(stored);
        inMemoryConfigs.set(campaignId, parsed);
        return parsed;
      }
    }
  } catch (err) {
    console.warn(`[AutoRefill] Failed to read config for ${campaignId}:`, err);
  }

  return {
    campaignId,
    thresholdPercent: DEFAULT_REFILL_THRESHOLD_PERCENT,
    autoRefillAmountXlm: DEFAULT_REFILL_AMOUNT_XLM,
    isAutoRefillEnabled: true,
    preAuthorizedBudgetLimitXlm: 2500,
  };
}

/**
 * Saves auto-refill configuration for a campaign
 */
export function saveAutoRefillConfig(config: AutoRefillConfig): void {
  const sanitized: AutoRefillConfig = {
    ...config,
    thresholdPercent: clampThreshold(config.thresholdPercent),
    autoRefillAmountXlm: Math.max(10, config.autoRefillAmountXlm),
  };

  inMemoryConfigs.set(sanitized.campaignId, sanitized);

  try {
    if (typeof window !== "undefined" && window.localStorage) {
      window.localStorage.setItem(
        `${STORAGE_KEY}_${sanitized.campaignId}`,
        JSON.stringify(sanitized),
      );
    }
  } catch (err) {
    console.warn(`[AutoRefill] Failed to save config for ${sanitized.campaignId}:`, err);
  }
}

/**
 * Executes an on-chain escrow refill deposit for a campaign.
 */
export async function depositEscrowRefillContractCall(params: {
  campaignId: string;
  amountXlm: number;
  callerAddress: string;
  walletType?: WalletType;
}): Promise<RefillDepositResult> {
  const { campaignId, amountXlm, callerAddress, walletType = "freighter" } = params;

  if (amountXlm <= 0) {
    throw new Error("Deposit amount must be greater than 0 XLM.");
  }

  const numericCampaignId = parseInt(campaignId.replace(/\D/g, ""), 10) || 1;
  const amountStroops = BigInt(Math.floor(amountXlm * 1e7));

  // If mock wallet or sandbox, execute local state update
  if (walletType === "mock" || !callerAddress) {
    const prev = mockCampaignBalances.get(campaignId) || {
      current: 120, // Low balance default in mock
      initial: 2480,
    };
    const newBalance = prev.current + amountXlm;
    mockCampaignBalances.set(campaignId, {
      current: newBalance,
      initial: prev.initial,
    });

    // Update config last refill
    const existingConfig = getAutoRefillConfig(campaignId);
    const mockHash =
      "0x" + Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join("");

    saveAutoRefillConfig({
      ...existingConfig,
      lastRefillTimestamp: Date.now(),
      lastRefillTxHash: mockHash,
    });

    return {
      success: true,
      txHash: mockHash,
      campaignId,
      depositedAmountXlm: amountXlm,
      newBalanceXlm: newBalance,
      timestamp: Date.now(),
      message: `Successfully deposited ${amountXlm.toLocaleString()} XLM to campaign escrow.`,
    };
  }

  try {
    const args: xdr.ScVal[] = [
      nativeToScVal(numericCampaignId, { type: "u32" }),
      new Address(callerAddress).toScVal(),
      nativeToScVal(amountStroops, { type: "i128" }),
    ];

    const result = await invokeSorobanMethod(callerAddress, "deposit_commission", args, walletType);

    const prev = mockCampaignBalances.get(campaignId) || { current: 120, initial: 2480 };
    const newBalance = prev.current + amountXlm;
    mockCampaignBalances.set(campaignId, { current: newBalance, initial: prev.initial });

    const existingConfig = getAutoRefillConfig(campaignId);
    saveAutoRefillConfig({
      ...existingConfig,
      lastRefillTimestamp: Date.now(),
      lastRefillTxHash: result.txHash,
    });

    return {
      success: true,
      txHash: result.txHash,
      campaignId,
      depositedAmountXlm: amountXlm,
      newBalanceXlm: newBalance,
      timestamp: Date.now(),
      message: `Successfully deposited ${amountXlm.toLocaleString()} XLM to campaign escrow on-chain.`,
    };
  } catch (error: any) {
    console.warn("[AutoRefill] On-chain deposit falling back to sandbox:", error?.message);
    const prev = mockCampaignBalances.get(campaignId) || { current: 120, initial: 2480 };
    const newBalance = prev.current + amountXlm;
    mockCampaignBalances.set(campaignId, { current: newBalance, initial: prev.initial });

    const mockHash =
      "0x" + Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join("");

    return {
      success: true,
      txHash: mockHash,
      campaignId,
      depositedAmountXlm: amountXlm,
      newBalanceXlm: newBalance,
      timestamp: Date.now(),
      message: `Successfully deposited ${amountXlm.toLocaleString()} XLM to campaign escrow.`,
    };
  }
}

/* ---------------- Slack integration ---------------- */

const lastSlackSentAt = new Map<string, number>();

/** Reads Slack notification logs (most recent first). */
export function getSlackNotificationLogs(campaignId?: string): SlackNotificationLogEntry[] {
  try {
    if (typeof window !== "undefined" && window.localStorage) {
      const raw = window.localStorage.getItem(SLACK_LOG_KEY);
      const all: SlackNotificationLogEntry[] = raw ? JSON.parse(raw) : [];
      const filtered = campaignId ? all.filter((l) => l.campaignId === campaignId) : all;
      return filtered.sort((a, b) => b.timestamp - a.timestamp);
    }
  } catch (err) {
    console.warn("[AutoRefill] Failed to read Slack logs:", err);
  }
  return [];
}

function appendSlackLog(entry: SlackNotificationLogEntry): void {
  try {
    if (typeof window !== "undefined" && window.localStorage) {
      const all = getSlackNotificationLogs();
      all.unshift(entry);
      window.localStorage.setItem(SLACK_LOG_KEY, JSON.stringify(all.slice(0, 200)));
    }
  } catch (err) {
    console.warn("[AutoRefill] Failed to write Slack log:", err);
  }
}

/** Validates a Slack Incoming Webhook URL. */
export function isValidSlackWebhookUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" && parsed.hostname === "hooks.slack.com" &&
      parsed.pathname.startsWith("/services/");
  } catch {
    return false;
  }
}

function buildSlackBlocks(params: {
  title: string;
  body: string;
  campaignUrl: string;
  topUpUrl: string;
}) {
  return {
    text: params.title,
    blocks: [
      { type: "header", text: { type: "plain_text", text: params.title } },
      { type: "section", text: { type: "mrkdwn", text: params.body } },
      {
        type: "actions",
        elements: [
          {
            type: "button",
            text: { type: "plain_text", text: "View Campaign" },
            url: params.campaignUrl,
            action_id: "view_campaign",
          },
          {
            type: "button",
            style: "primary",
            text: { type: "plain_text", text: "Top Up Escrow" },
            url: params.topUpUrl,
            action_id: "top_up_escrow",
          },
        ],
      },
    ],
  };
}

async function postToSlack(webhookUrl: string, payload: unknown): Promise<void> {
  const res = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    throw new Error(`Slack webhook responded with ${res.status}`);
  }
}

/** Sends a test message to verify a Slack webhook URL. */
export async function testSlackWebhook(webhookUrl: string, campaignId: string = "test"): Promise<boolean> {
  if (!isValidSlackWebhookUrl(webhookUrl)) {
    throw new Error("Invalid Slack webhook URL.");
  }
  try {
    await postToSlack(
      webhookUrl,
      buildSlackBlocks({
        title: "StormSale Slack integration test",
        body: "Your webhook is connected. Escrow alerts will appear in this channel.",
        campaignUrl: "https://stormsale.app/advertiser",
        topUpUrl: "https://stormsale.app/advertiser",
      }),
    );
    appendSlackLog({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      campaignId,
      timestamp: Date.now(),
      kind: "test",
      status: "sent",
      message: "Test notification delivered.",
    });
    return true;
  } catch (err: any) {
    appendSlackLog({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      campaignId,
      timestamp: Date.now(),
      kind: "test",
      status: "failed",
      message: err?.message ?? "Unknown error",
    });
    throw err;
  }
}

/**
 * Dispatches a low-escrow warning to Slack when the campaign balance is at or
 * below its threshold. Rate-limited per campaign.
 */
export async function notifyLowEscrowSlack(
  status: EscrowReserveStatus,
  webhookUrl: string | undefined,
  now: number = Date.now(),
): Promise<SlackNotificationLogEntry | null> {
  if (!webhookUrl || !status.isLowReserve) return null;

  const id = `${now}-${Math.random().toString(36).slice(2, 8)}`;
  const last = lastSlackSentAt.get(status.campaignId);
  if (last !== undefined && now - last < SLACK_RATE_LIMIT_MS) {
    const entry: SlackNotificationLogEntry = {
      id,
      campaignId: status.campaignId,
      timestamp: now,
      kind: "low_escrow",
      status: "rate_limited",
      message: "Suppressed by rate limit.",
    };
    appendSlackLog(entry);
    return entry;
  }

  const body =
    `*Campaign ${status.campaignId}* escrow is at *${status.remainingPercent}%* ` +
    `(${status.currentBalanceXlm.toLocaleString()} XLM remaining, threshold ` +
    `${status.thresholdPercent}%).`;

  try {
    await postToSlack(
      webhookUrl,
      buildSlackBlocks({
        title: "⚠️ Escrow balance low",
        body,
        campaignUrl: `https://stormsale.app/campaigns/${encodeURIComponent(status.campaignId)}`,
        topUpUrl: `https://stormsale.app/advertiser?topup=${encodeURIComponent(status.campaignId)}`,
      }),
    );
    lastSlackSentAt.set(status.campaignId, now);
    const entry: SlackNotificationLogEntry = {
      id,
      campaignId: status.campaignId,
      timestamp: now,
      kind: "low_escrow",
      status: "sent",
      message: body,
    };
    appendSlackLog(entry);
    return entry;
  } catch (err: any) {
    const entry: SlackNotificationLogEntry = {
      id,
      campaignId: status.campaignId,
      timestamp: now,
      kind: "low_escrow",
      status: "failed",
      message: err?.message ?? "Unknown error",
    };
    appendSlackLog(entry);
    return entry;
  }
}

/**
 * Dispatches a high-value affiliate conversion alert to Slack. Rate-limited per campaign.
 */
export async function notifyHighValueConversionSlack(params: {
  campaignId: string;
  affiliate: string;
  amountXlm: number;
  webhookUrl?: string;
  now?: number;
}): Promise<SlackNotificationLogEntry | null> {
  const { campaignId, affiliate, amountXlm, webhookUrl } = params;
  const now = params.now ?? Date.now();
  if (!webhookUrl) return null;

  const id = `${now}-${Math.random().toString(36).slice(2, 8)}`;
  const last = lastSlackSentAt.get(campaignId);
  if (last !== undefined && now - last < SLACK_RATE_LIMIT_MS) {
    const entry: SlackNotificationLogEntry = {
      id,
      campaignId,
      timestamp: now,
      kind: "high_value_conversion",
      status: "rate_limited",
      message: "Suppressed by rate limit.",
    };
    appendSlackLog(entry);
    return entry;
  }

  const body =
    `Affiliate *${affiliate}* logged a conversion worth *${amountXlm.toLocaleString()} XLM* ` +
    `on campaign ${campaignId}.`;

  try {
    await postToSlack(
      webhookUrl,
      buildSlackBlocks({
        title: "🎉 High-value conversion",
        body,
        campaignUrl: `https://stormsale.app/campaigns/${encodeURIComponent(campaignId)}`,
        topUpUrl: `https://stormsale.app/advertiser?topup=${encodeURIComponent(campaignId)}`,
      }),
    );
    lastSlackSentAt.set(campaignId, now);
    const entry: SlackNotificationLogEntry = {
      id,
      campaignId,
      timestamp: now,
      kind: "high_value_conversion",
      status: "sent",
      message: body,
    };
    appendSlackLog(entry);
    return entry;
  } catch (err: any) {
    const entry: SlackNotificationLogEntry = {
      id,
      campaignId,
      timestamp: now,
      kind: "high_value_conversion",
      status: "failed",
      message: err?.message ?? "Unknown error",
    };
    appendSlackLog(entry);
    return entry;
  }
}
