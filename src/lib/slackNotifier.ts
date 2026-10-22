import type {
  SlackEscrowAlertData,
  SlackHighValueAlertData,
  SlackIntegrationConfig,
  SlackNotificationKind,
  SlackNotificationLog,
  SlackSendOutcome,
  SlackWebhookPayload,
} from "../types/slack";
import {
  buildHighValueConversionPayload,
  buildLowEscrowAlertPayload,
  buildTestAlertPayload,
} from "./slackBlockKit";

export const SLACK_SETTINGS_STORAGE_KEY = "stormsale_slack_integration_v1";
export const SLACK_LOGS_STORAGE_KEY = "stormsale_slack_notification_logs_v1";

/** Slack only accepts HTTPS hooks on its own services host. */
export const SLACK_WEBHOOK_URL_PATTERN =
  /^https:\/\/hooks\.slack\.com\/services\/[A-Za-z0-9_-]{1,64}\/[A-Za-z0-9_-]{1,64}\/[A-Za-z0-9_-]{1,192}$/;

export const SLACK_FLOOD_WINDOW_MS = 60_000;
const MAX_STORED_LOGS = 100;
const REQUEST_TIMEOUT_MS = 8_000;

export const DEFAULT_SLACK_CONFIG: SlackIntegrationConfig = {
  isEnabled: false,
  webhookUrl: "",
  channelName: "#merchant-alerts",
  lowEscrowThresholdPercent: 20,
  highValueConversionXlm: 1000,
  cooldownSeconds: 300,
  maxNotificationsPerMinute: 10,
  appBaseUrl: "https://stormsale.app",
};

let memoryConfig: SlackIntegrationConfig | null = null;
let memoryLogs: SlackNotificationLog[] = [];

// Tracks the last send per event key plus a rolling window of send times, so a
// repeat alert for one campaign and general channel flooding are both suppressed.
const rateLimitCooldowns = new Map<string, number>();
const rateLimitSends: number[] = [];

function generateId(prefix: string): string {
  const random = Math.random().toString(16).slice(2, 10);
  return `${prefix}_${Date.now().toString(36)}${random}`;
}

function hasStorage(): boolean {
  return typeof localStorage !== "undefined";
}

export function validateSlackWebhookUrl(url: string): { isValid: boolean; reason?: string } {
  const trimmed = url.trim();
  if (!trimmed) return { isValid: false, reason: "Webhook URL is required" };
  if (!trimmed.startsWith("https://")) {
    return { isValid: false, reason: "Slack webhooks must use HTTPS" };
  }
  if (!SLACK_WEBHOOK_URL_PATTERN.test(trimmed)) {
    return {
      isValid: false,
      reason: "URL must be a Slack Incoming Webhook on https://hooks.slack.com/services/...",
    };
  }
  return { isValid: true };
}

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  const parsed = typeof value === "string" ? Number(value) : value;
  if (typeof parsed !== "number" || !Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(parsed, min), max);
}

export function normalizeSlackConfig(
  partial?: Partial<SlackIntegrationConfig> | null,
): SlackIntegrationConfig {
  const merged = { ...DEFAULT_SLACK_CONFIG, ...(partial || {}) };
  return {
    ...merged,
    isEnabled: merged.isEnabled === true,
    webhookUrl: (merged.webhookUrl || "").trim(),
    channelName: (merged.channelName || DEFAULT_SLACK_CONFIG.channelName).trim(),
    lowEscrowThresholdPercent: clampNumber(merged.lowEscrowThresholdPercent, 1, 99, 20),
    highValueConversionXlm: clampNumber(merged.highValueConversionXlm, 1, 1_000_000, 1000),
    cooldownSeconds: clampNumber(merged.cooldownSeconds, 30, 86_400, 300),
    maxNotificationsPerMinute: clampNumber(merged.maxNotificationsPerMinute, 1, 60, 10),
    appBaseUrl: (merged.appBaseUrl || DEFAULT_SLACK_CONFIG.appBaseUrl).trim(),
  };
}

export function loadSlackConfig(): SlackIntegrationConfig {
  if (!hasStorage()) return DEFAULT_SLACK_CONFIG;
  try {
    const raw = localStorage.getItem(SLACK_SETTINGS_STORAGE_KEY);
    if (!raw) return DEFAULT_SLACK_CONFIG;
    return normalizeSlackConfig(JSON.parse(raw));
  } catch {
    return DEFAULT_SLACK_CONFIG;
  }
}

export function saveSlackConfig(config: Partial<SlackIntegrationConfig>): SlackIntegrationConfig {
  const next = normalizeSlackConfig(config);
  if (hasStorage()) {
    localStorage.setItem(SLACK_SETTINGS_STORAGE_KEY, JSON.stringify(next));
  }
  memoryConfig = next;
  return next;
}

/** Config source used by dispatchers: module cache first, then browser storage. */
export function getActiveSlackConfig(): SlackIntegrationConfig {
  return memoryConfig ?? loadSlackConfig();
}

export function resetSlackNotifierStore(): void {
  memoryConfig = null;
  memoryLogs = [];
  rateLimitCooldowns.clear();
  rateLimitSends.length = 0;
}

// ---------------------------------------------------------------------------
// Notification logs (rendered inside advertiser settings)
// ---------------------------------------------------------------------------

export function getSlackNotificationLogs(): SlackNotificationLog[] {
  if (hasStorage()) {
    const raw = localStorage.getItem(SLACK_LOGS_STORAGE_KEY);
    if (raw) {
      try {
        memoryLogs = JSON.parse(raw);
      } catch {
        // Keep the in-memory copy when storage holds a corrupt payload
      }
    }
  }
  return memoryLogs;
}

function persistLogs(logs: SlackNotificationLog[]): void {
  if (hasStorage()) {
    localStorage.setItem(SLACK_LOGS_STORAGE_KEY, JSON.stringify(logs));
  }
}

export function recordSlackNotificationLog(
  entry: Omit<SlackNotificationLog, "id" | "createdAt">,
): SlackNotificationLog {
  const log: SlackNotificationLog = {
    ...entry,
    id: generateId("slack"),
    createdAt: new Date().toISOString(),
  };
  getSlackNotificationLogs();
  memoryLogs = [log, ...memoryLogs].slice(0, MAX_STORED_LOGS);
  persistLogs(memoryLogs);
  return log;
}

export function clearSlackNotificationLogs(): void {
  memoryLogs = [];
  if (hasStorage()) {
    localStorage.removeItem(SLACK_LOGS_STORAGE_KEY);
  }
}

// ---------------------------------------------------------------------------
// Rate limiting: per-event cooldown plus a rolling flood-guard window
// ---------------------------------------------------------------------------

export function resetSlackRateLimiter(): void {
  rateLimitCooldowns.clear();
  rateLimitSends.length = 0;
}

export function buildSlackRateLimitKey(kind: SlackNotificationKind, campaignId?: string): string {
  return campaignId ? `${kind}:${campaignId}` : kind;
}

function pruneSends(nowMs: number): void {
  while (rateLimitSends.length > 0 && nowMs - rateLimitSends[0] >= SLACK_FLOOD_WINDOW_MS) {
    rateLimitSends.shift();
  }
}

/** Sliding-window check; records nothing. Callers record with registerSlackSend. */
export function checkSlackRateLimit(
  key: string,
  config: SlackIntegrationConfig = getActiveSlackConfig(),
  nowMs: number = Date.now(),
): { allowed: boolean; reason?: string } {
  const lastSentAt = rateLimitCooldowns.get(key);
  if (lastSentAt !== undefined && nowMs - lastSentAt < config.cooldownSeconds * 1000) {
    const waitSeconds = Math.ceil((config.cooldownSeconds * 1000 - (nowMs - lastSentAt)) / 1000);
    return {
      allowed: false,
      reason: `Cooldown active for ${key}, retry in ${waitSeconds}s`,
    };
  }

  pruneSends(nowMs);
  if (rateLimitSends.length >= config.maxNotificationsPerMinute) {
    return {
      allowed: false,
      reason: `Flood guard: ${config.maxNotificationsPerMinute} notifications/minute limit reached`,
    };
  }

  return { allowed: true };
}

function registerSlackSend(key: string, nowMs: number): void {
  rateLimitCooldowns.set(key, nowMs);
  rateLimitSends.push(nowMs);
}

/** Clears the cooldown so a campaign that dips again can alert immediately. */
export function clearSlackRateLimitCooldown(key: string): void {
  rateLimitCooldowns.delete(key);
}

// ---------------------------------------------------------------------------
// Slack Incoming Webhook transport
// ---------------------------------------------------------------------------

export async function postSlackMessage(
  webhookUrl: string,
  payload: SlackWebhookPayload,
  options?: { fetchImpl?: typeof fetch; timeoutMs?: number },
): Promise<SlackSendOutcome> {
  const fetchImpl = options?.fetchImpl || fetch;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), options?.timeoutMs ?? REQUEST_TIMEOUT_MS);

  try {
    const res = await fetchImpl(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    const responseBody = (await res.text()).slice(0, 500);
    return {
      ok: res.ok,
      httpStatusCode: res.status,
      responseBody,
      error: res.ok ? undefined : `HTTP ${res.status}: ${responseBody || res.statusText}`,
    };
  } catch (err: unknown) {
    return {
      ok: false,
      httpStatusCode: 0,
      responseBody: "",
      error: err instanceof Error ? err.message : "Slack webhook request failed",
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

export interface SlackDispatchResult {
  log: SlackNotificationLog | null;
  delivered: boolean;
  suppressedReason?: string;
}

export interface SlackDispatchOptions {
  config?: SlackIntegrationConfig;
  nowMs?: number;
  fetchImpl?: typeof fetch;
  /** Test pings from the settings screen bypass the cooldown window. */
  bypassRateLimit?: boolean;
}

async function dispatchPayload(
  kind: SlackNotificationKind,
  payload: SlackWebhookPayload,
  message: string,
  identity: { campaignId?: string; campaignName?: string },
  options?: SlackDispatchOptions,
): Promise<SlackDispatchResult> {
  const config = options?.config ?? getActiveSlackConfig();
  const nowMs = options?.nowMs ?? Date.now();
  const rateLimitKey = buildSlackRateLimitKey(kind, identity.campaignId);

  // Automated alerts stay silent until the merchant enables the integration;
  // the settings screen test ping runs regardless so a URL can be verified.
  if (kind !== "ping.test" && !config.isEnabled) {
    return { log: null, delivered: false, suppressedReason: "Slack integration is disabled" };
  }

  if (!options?.bypassRateLimit) {
    const decision = checkSlackRateLimit(rateLimitKey, config, nowMs);
    if (!decision.allowed) {
      return {
        log: recordSlackNotificationLog({
          kind,
          status: "rate_limited",
          channel: config.channelName,
          message,
          httpStatusCode: null,
          campaignId: identity.campaignId,
          campaignName: identity.campaignName,
          error: decision.reason,
        }),
        delivered: false,
        suppressedReason: decision.reason,
      };
    }
  }

  const validation = validateSlackWebhookUrl(config.webhookUrl);
  if (!validation.isValid) {
    return {
      log: null,
      delivered: false,
      suppressedReason: validation.reason,
    };
  }

  registerSlackSend(rateLimitKey, nowMs);
  const outcome = await postSlackMessage(config.webhookUrl, payload, {
    fetchImpl: options?.fetchImpl,
  });

  return {
    log: recordSlackNotificationLog({
      kind,
      status: outcome.ok ? "delivered" : "failed",
      channel: payload.channel || config.channelName,
      message,
      httpStatusCode: outcome.httpStatusCode,
      campaignId: identity.campaignId,
      campaignName: identity.campaignName,
      error: outcome.error,
      payload,
    }),
    delivered: outcome.ok,
    suppressedReason: outcome.error,
  };
}

/** Sends the connectivity ping triggered from the settings screen. */
export async function testSlackWebhook(
  webhookUrl: string,
  options?: SlackDispatchOptions,
): Promise<SlackDispatchResult> {
  const base = options?.config ?? getActiveSlackConfig();
  const config = normalizeSlackConfig({ ...base, webhookUrl });
  return dispatchPayload(
    "ping.test",
    buildTestAlertPayload({ channel: config.channelName, appBaseUrl: config.appBaseUrl }),
    "Slack webhook connectivity test",
    {},
    { ...options, config, bypassRateLimit: true },
  );
}

/**
 * Posts the formatted escrow depletion warning for one campaign.
 * Returns a null log when the integration is disabled or misconfigured.
 */
export async function dispatchEscrowDepletionAlert(
  data: SlackEscrowAlertData,
  options?: SlackDispatchOptions,
): Promise<SlackDispatchResult> {
  const config = options?.config ?? getActiveSlackConfig();
  const payload = buildLowEscrowAlertPayload(data, {
    appBaseUrl: config.appBaseUrl,
    channel: config.channelName,
  });
  const message = `${data.campaignName}: escrow at ${data.percentageRemaining.toFixed(1)}% (${data.remainingXlm.toLocaleString()} XLM)`;

  return dispatchPayload(
    "escrow.depletion",
    payload,
    message,
    { campaignId: data.campaignId, campaignName: data.campaignName },
    options,
  );
}

export async function dispatchHighValueConversionAlert(
  data: SlackHighValueAlertData,
  options?: SlackDispatchOptions,
): Promise<SlackDispatchResult> {
  const config = options?.config ?? getActiveSlackConfig();
  const payload = buildHighValueConversionPayload(data, {
    appBaseUrl: config.appBaseUrl,
    channel: config.channelName,
  });
  const message = `${data.campaignName}: high-value conversion of ${data.amountXlm.toLocaleString()} XLM`;

  return dispatchPayload(
    "conversion.high_value",
    payload,
    message,
    { campaignId: data.campaignId, campaignName: data.campaignName },
    options,
  );
}

/**
 * Conversion pipeline hook: announces the sale only when it clears the merchant's
 * high-value threshold, so the channel stays quiet for routine postbacks.
 */
export async function maybeDispatchHighValueConversionAlert(
  params: {
    campaignName: string;
    campaignId?: string;
    affiliateAddress: string;
    amountXlm: number;
    stellarTxHash?: string;
  },
  options?: SlackDispatchOptions,
): Promise<SlackDispatchResult | null> {
  const config = options?.config ?? getActiveSlackConfig();
  const amountXlm = Number(params.amountXlm);
  if (!Number.isFinite(amountXlm) || amountXlm < config.highValueConversionXlm) return null;

  return dispatchHighValueConversionAlert(
    {
      campaignId: params.campaignId,
      campaignName: params.campaignName,
      affiliateAddress: params.affiliateAddress,
      amountXlm,
      stellarTxHash: params.stellarTxHash,
    },
    { ...options, config },
  );
}

export interface SlackMonitoredCampaign {
  id: string;
  name: string;
  status?: string;
  escrowInitial: number;
  escrowBalance: number;
}

export interface EscrowDepletionEvaluation {
  isDepleted: boolean;
  remainingXlm: number;
  percentageRemaining: number;
}

/** Campaigns are flagged only while live, funded, and under the alert threshold. */
export function evaluateEscrowDepletion(
  campaign: SlackMonitoredCampaign,
  thresholdPercent: number = getActiveSlackConfig().lowEscrowThresholdPercent,
): EscrowDepletionEvaluation {
  if (campaign.status === "Completed" || campaign.escrowInitial <= 0) {
    return {
      isDepleted: false,
      remainingXlm: campaign.escrowBalance,
      percentageRemaining: 0,
    };
  }

  const percentageRemaining = (campaign.escrowBalance / campaign.escrowInitial) * 100;
  return {
    isDepleted: percentageRemaining < thresholdPercent && campaign.escrowBalance > 0,
    remainingXlm: campaign.escrowBalance,
    percentageRemaining,
  };
}

/**
 * Escrow monitor sweep: alerts every depleted campaign and resets the cooldown
 * for campaigns that recovered, so a later dip alerts again.
 */
export async function watchCampaignEscrowLevels(
  campaigns: SlackMonitoredCampaign[],
  options?: SlackDispatchOptions,
): Promise<SlackDispatchResult[]> {
  const config = options?.config ?? getActiveSlackConfig();
  if (!config.isEnabled) return [];

  const results: SlackDispatchResult[] = [];

  for (const campaign of campaigns) {
    const key = buildSlackRateLimitKey("escrow.depletion", campaign.id);
    const evaluation = evaluateEscrowDepletion(campaign, config.lowEscrowThresholdPercent);

    if (!evaluation.isDepleted) {
      clearSlackRateLimitCooldown(key);
      continue;
    }

    results.push(
      await dispatchEscrowDepletionAlert(
        {
          campaignId: campaign.id,
          campaignName: campaign.name,
          remainingXlm: evaluation.remainingXlm,
          initialXlm: campaign.escrowInitial,
          percentageRemaining: evaluation.percentageRemaining,
          thresholdPercent: config.lowEscrowThresholdPercent,
        },
        { ...options, config },
      ),
    );
  }

  return results;
}
