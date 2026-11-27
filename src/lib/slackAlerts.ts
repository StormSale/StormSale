/**
 * Slack Incoming Webhook alerts (issue #204).
 *
 * Shared, framework-free logic used by the advertiser settings UI and the
 * `/api/slack/notify` serverless proxy. The webhook URL stays in browser
 * storage and is forwarded only to the allow-listed Slack host by the proxy,
 * so a compromised client cannot turn the endpoint into an SSRF vector.
 */

export const SLACK_WEBHOOK_HOST = "hooks.slack.com";
export const SLACK_NOTIFY_ENDPOINT = "/api/slack/notify";
export const LOW_ESCROW_THRESHOLD_PERCENT = 20;
export const DEFAULT_HIGH_VALUE_THRESHOLD_XLM = 1000;
export const SLACK_SETTINGS_STORAGE_KEY = "stormsale.slack.settings";
export const SLACK_LOGS_STORAGE_KEY = "stormsale.slack.logs";
export const SLACK_LOG_LIMIT = 50;
export const SLACK_ALERT_COOLDOWN_MS = 5 * 60 * 1000;
export const SLACK_MAX_ALERTS_PER_MINUTE = 6;
export const SLACK_MINUTE_WINDOW_MS = 60 * 1000;
export const SLACK_REQUEST_TIMEOUT_MS = 8_000;

export type SlackAlertKind = "low-escrow" | "high-value-conversion" | "test";

export interface SlackAlert {
  kind: SlackAlertKind;
  campaignId: string;
  campaignName?: string;
  currentBalanceXlm?: number;
  initialBudgetXlm?: number;
  remainingPercent?: number;
  thresholdPercent?: number;
  saleAmountXlm?: number;
  affiliateAddress?: string;
  txHash?: string;
  appUrl?: string;
}

export interface SlackSettings {
  webhookUrl: string;
  enabled: boolean;
  highValueThresholdXlm: number;
  lowEscrowThresholdPercent: number;
}

export const DEFAULT_SLACK_SETTINGS: SlackSettings = {
  webhookUrl: "",
  enabled: true,
  highValueThresholdXlm: DEFAULT_HIGH_VALUE_THRESHOLD_XLM,
  lowEscrowThresholdPercent: LOW_ESCROW_THRESHOLD_PERCENT,
};

export type SlackNotificationStatus = "sent" | "failed" | "rate_limited" | "skipped";

export interface SlackNotificationLog {
  id: string;
  kind: SlackAlertKind;
  campaignId: string;
  campaignName?: string;
  status: SlackNotificationStatus;
  message: string;
  createdAt: string;
  httpStatus?: number;
}

export interface SlackTextObject {
  type: "plain_text" | "mrkdwn";
  text: string;
  emoji?: boolean;
}

export interface SlackBlock {
  type: string;
  [key: string]: unknown;
}

export interface SlackMessage {
  text: string;
  blocks: SlackBlock[];
}

export interface SlackMessageLabels {
  viewCampaign: string;
  topUpEscrow: string;
  lowEscrowHeader: string;
  highValueHeader: string;
  testHeader: string;
}

const DEFAULT_LABELS: SlackMessageLabels = {
  viewCampaign: "View Campaign",
  topUpEscrow: "Top Up Escrow",
  lowEscrowHeader: "Low campaign escrow",
  highValueHeader: "High-value conversion",
  testHeader: "StormSale Slack integration test",
};

const STATUS_LABELS: Record<SlackNotificationStatus, string> = {
  sent: "Sent",
  failed: "Failed",
  rate_limited: "Rate limited",
  skipped: "Skipped",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function safeString(value: unknown, maxLength = 200): string | undefined {
  const text =
    typeof value === "number" && Number.isFinite(value)
      ? String(value)
      : typeof value === "string"
        ? value
        : undefined;
  if (text === undefined) return undefined;
  const trimmed = text.trim();
  return trimmed ? trimmed.slice(0, maxLength) : undefined;
}

function safeNumber(value: unknown): number | undefined {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : undefined;
}

export function isValidSlackWebhookUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "https:") return false;
    if (url.hostname !== SLACK_WEBHOOK_HOST) return false;
    if (url.username || url.password) return false;
    const segments = url.pathname.split("/").filter(Boolean);
    return segments.length >= 4 && segments[0] === "services";
  } catch {
    return false;
  }
}

export function normalizeSlackSettings(value: unknown): SlackSettings {
  const source = isRecord(value) ? value : {};
  const highValueThreshold = safeNumber(source.highValueThresholdXlm);
  const lowEscrowThreshold = safeNumber(source.lowEscrowThresholdPercent);
  return {
    webhookUrl: typeof source.webhookUrl === "string" ? source.webhookUrl.trim() : "",
    enabled: source.enabled !== false,
    highValueThresholdXlm:
      highValueThreshold !== undefined && highValueThreshold >= 0
        ? highValueThreshold
        : DEFAULT_HIGH_VALUE_THRESHOLD_XLM,
    lowEscrowThresholdPercent:
      lowEscrowThreshold !== undefined && lowEscrowThreshold > 0
        ? Math.min(lowEscrowThreshold, LOW_ESCROW_THRESHOLD_PERCENT)
        : LOW_ESCROW_THRESHOLD_PERCENT,
  };
}

export function loadSlackSettings(): SlackSettings {
  try {
    if (typeof localStorage === "undefined") return { ...DEFAULT_SLACK_SETTINGS };
    const raw = localStorage.getItem(SLACK_SETTINGS_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_SLACK_SETTINGS };
    return normalizeSlackSettings(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_SLACK_SETTINGS };
  }
}

export function saveSlackSettings(settings: SlackSettings): SlackSettings {
  const normalized = normalizeSlackSettings(settings);
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(SLACK_SETTINGS_STORAGE_KEY, JSON.stringify(normalized));
    }
  } catch {
    // Storage blocked — the caller still gets the normalized object.
  }
  return normalized;
}

export function validateSlackWebhook(webhookUrl: string): string | null {
  if (!webhookUrl.trim()) return "A Slack incoming webhook URL is required.";
  if (!isValidSlackWebhookUrl(webhookUrl)) {
    return "Enter a valid https://hooks.slack.com/services/... webhook URL.";
  }
  return null;
}

function createLog(
  alert: SlackAlert,
  status: SlackNotificationStatus,
  message: string,
  httpStatus?: number,
): SlackNotificationLog {
  const id = `slack_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  return {
    id,
    kind: alert.kind,
    campaignId: alert.campaignId,
    campaignName: alert.campaignName,
    status,
    message,
    createdAt: new Date().toISOString(),
    httpStatus,
  };
}

function normalizeLogs(value: unknown): SlackNotificationLog[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((entry): entry is Record<string, unknown> => isRecord(entry))
    .map((entry): SlackNotificationLog => ({
      id: safeString(entry.id, 80) || `slack_${Math.random().toString(36).slice(2, 10)}`,
      kind:
        entry.kind === "low-escrow" ||
        entry.kind === "high-value-conversion" ||
        entry.kind === "test"
          ? entry.kind
          : "test",
      campaignId: safeString(entry.campaignId, 128) || "unknown",
      campaignName: safeString(entry.campaignName, 128),
      status:
        entry.status === "sent" ||
        entry.status === "failed" ||
        entry.status === "rate_limited" ||
        entry.status === "skipped"
          ? entry.status
          : "failed",
      message: safeString(entry.message, 500) || STATUS_LABELS.failed,
      createdAt: typeof entry.createdAt === "string" ? entry.createdAt : new Date().toISOString(),
      httpStatus: safeNumber(entry.httpStatus),
    }))
    .slice(0, SLACK_LOG_LIMIT);
}

export function getSlackNotificationLogs(): SlackNotificationLog[] {
  try {
    if (typeof localStorage === "undefined") return [];
    const raw = localStorage.getItem(SLACK_LOGS_STORAGE_KEY);
    if (!raw) return [];
    return normalizeLogs(JSON.parse(raw));
  } catch {
    return [];
  }
}

export function appendSlackNotificationLog(log: SlackNotificationLog): SlackNotificationLog[] {
  const logs = [log, ...getSlackNotificationLogs()].slice(0, SLACK_LOG_LIMIT);
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(SLACK_LOGS_STORAGE_KEY, JSON.stringify(logs));
    }
  } catch {
    // Ignore storage failures; the in-memory caller still receives the entry.
  }
  return logs;
}

export function clearSlackNotificationLogs(): void {
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.removeItem(SLACK_LOGS_STORAGE_KEY);
    }
  } catch {
    // Ignore storage failures.
  }
}

const lastAlertAt = new Map<string, number>();
let rateWindowStart = 0;
let rateWindowCount = 0;

export function slackAlertThrottleKey(alert: SlackAlert): string {
  if (alert.kind === "low-escrow") return `low:${alert.campaignId}`;
  if (alert.kind === "high-value-conversion") {
    return `conversion:${alert.txHash || alert.campaignId}`;
  }
  return `test:${alert.campaignId}`;
}

export function isSlackAlertThrottled(key: string, now: number = Date.now()): boolean {
  const last = lastAlertAt.get(key);
  if (last !== undefined && now - last < SLACK_ALERT_COOLDOWN_MS) return true;

  if (now - rateWindowStart >= SLACK_MINUTE_WINDOW_MS) {
    rateWindowStart = now;
    rateWindowCount = 0;
  }
  return rateWindowCount >= SLACK_MAX_ALERTS_PER_MINUTE;
}

export function recordSlackAlert(key: string, now: number = Date.now()): void {
  lastAlertAt.set(key, now);
  rateWindowCount += 1;
}

/** Test-only hook so unit tests do not share rate-limit state. */
export function resetSlackRateLimit(): void {
  lastAlertAt.clear();
  rateWindowStart = 0;
  rateWindowCount = 0;
}

export function resolveAppBaseUrl(appUrl?: string): string {
  const candidate =
    appUrl?.trim() ||
    (typeof window !== "undefined" && window.location ? window.location.origin : "");
  try {
    return new URL(candidate).origin;
  } catch {
    return "https://stormsale.app";
  }
}

export function buildCampaignUrl(
  campaignId: string,
  action: "view" | "top-up" = "view",
  appUrl?: string,
): string {
  const url = new URL(resolveAppBaseUrl(appUrl));
  url.searchParams.set("page", "advertiser");
  url.searchParams.set("tab", "my-campaigns");
  if (campaignId) url.searchParams.set("campaign", campaignId);
  if (action === "top-up") url.searchParams.set("action", "top-up");
  return url.toString();
}

function formatAmount(value: number | undefined): string {
  if (value === undefined) return "—";
  return `${value.toLocaleString("en-US", { maximumFractionDigits: 4 })} XLM`;
}

function formatPercent(value: number | undefined): string {
  if (value === undefined) return "—";
  return `${value.toLocaleString("en-US", { maximumFractionDigits: 1 })}%`;
}

function actionBlocks(alert: SlackAlert, labels: SlackMessageLabels): SlackBlock {
  return {
    type: "actions",
    elements: [
      {
        type: "button",
        text: { type: "plain_text", text: labels.viewCampaign, emoji: true },
        url: buildCampaignUrl(alert.campaignId, "view", alert.appUrl),
        action_id: "stormsale_view_campaign",
      },
      {
        type: "button",
        text: { type: "plain_text", text: labels.topUpEscrow, emoji: true },
        url: buildCampaignUrl(alert.campaignId, "top-up", alert.appUrl),
        action_id: "stormsale_top_up_escrow",
        style: "primary",
      },
    ],
  };
}

function campaignName(alert: SlackAlert): string {
  return alert.campaignName?.trim() || `Campaign ${alert.campaignId}`;
}

export function buildLowEscrowBlocks(
  alert: SlackAlert,
  labels: SlackMessageLabels = DEFAULT_LABELS,
): SlackBlock[] {
  return [
    {
      type: "header",
      text: {
        type: "plain_text",
        text: `⚠️ ${labels.lowEscrowHeader}`,
        emoji: true,
      },
    },
    {
      type: "section",
      fields: [
        { type: "mrkdwn", text: `*Campaign*\n${campaignName(alert)}` },
        { type: "mrkdwn", text: `*Remaining*\n${formatPercent(alert.remainingPercent)}` },
        { type: "mrkdwn", text: `*Balance*\n${formatAmount(alert.currentBalanceXlm)}` },
        {
          type: "mrkdwn",
          text: `*Alert threshold*\n${formatPercent(alert.thresholdPercent ?? LOW_ESCROW_THRESHOLD_PERCENT)}`,
        },
      ],
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: "Campaign budget is below 20% of its escrow. Top up to keep affiliates converting.",
      },
    },
    actionBlocks(alert, labels),
    {
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: "StormSale escrow monitor · automated low-balance alert",
        },
      ],
    },
  ];
}

export function buildHighValueConversionBlocks(
  alert: SlackAlert,
  labels: SlackMessageLabels = DEFAULT_LABELS,
): SlackBlock[] {
  return [
    {
      type: "header",
      text: {
        type: "plain_text",
        text: `💰 ${labels.highValueHeader}`,
        emoji: true,
      },
    },
    {
      type: "section",
      fields: [
        { type: "mrkdwn", text: `*Campaign*\n${campaignName(alert)}` },
        { type: "mrkdwn", text: `*Sale amount*\n${formatAmount(alert.saleAmountXlm)}` },
        {
          type: "mrkdwn",
          text: `*Affiliate*\n${alert.affiliateAddress || "—"}`,
        },
        { type: "mrkdwn", text: `*Transaction*\n${alert.txHash || "—"}` },
      ],
    },
    actionBlocks(alert, labels),
    {
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: "StormSale conversion monitor · high-value sale recorded",
        },
      ],
    },
  ];
}

export function buildTestBlocks(labels: SlackMessageLabels = DEFAULT_LABELS): SlackBlock[] {
  return [
    {
      type: "header",
      text: { type: "plain_text", text: `✅ ${labels.testHeader}`, emoji: true },
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: "This channel is connected to StormSale. Low escrow and high-value conversion alerts will appear here.",
      },
    },
  ];
}

export function buildSlackAlertMessage(
  alert: SlackAlert,
  labels: SlackMessageLabels = DEFAULT_LABELS,
): SlackMessage {
  if (alert.kind === "low-escrow") {
    return {
      text: `StormSale low escrow: ${campaignName(alert)} at ${formatPercent(alert.remainingPercent)}.`,
      blocks: buildLowEscrowBlocks(alert, labels),
    };
  }
  if (alert.kind === "high-value-conversion") {
    return {
      text: `StormSale high-value conversion: ${formatAmount(alert.saleAmountXlm)} for ${campaignName(alert)}.`,
      blocks: buildHighValueConversionBlocks(alert, labels),
    };
  }
  return {
    text: "StormSale Slack integration test — your channel is connected.",
    blocks: buildTestBlocks(labels),
  };
}

export function normalizeSlackAlert(value: unknown): SlackAlert | null {
  if (!isRecord(value)) return null;
  const kind =
    value.kind === "low-escrow" || value.kind === "high-value-conversion" || value.kind === "test"
      ? value.kind
      : null;
  if (!kind) return null;

  const campaignId = safeString(value.campaignId, 128) || (kind === "test" ? "test" : "");
  if (!campaignId) return null;

  const alert: SlackAlert = {
    kind,
    campaignId,
    campaignName: safeString(value.campaignName, 128),
    currentBalanceXlm: safeNumber(value.currentBalanceXlm),
    initialBudgetXlm: safeNumber(value.initialBudgetXlm),
    remainingPercent: safeNumber(value.remainingPercent),
    thresholdPercent: safeNumber(value.thresholdPercent),
    saleAmountXlm: safeNumber(value.saleAmountXlm),
    affiliateAddress: safeString(value.affiliateAddress, 128),
    txHash: safeString(value.txHash, 128),
    appUrl: safeString(value.appUrl, 500),
  };
  return alert;
}

export interface SendSlackAlertOptions {
  endpoint?: string;
  fetchImpl?: typeof fetch;
  force?: boolean;
  now?: number;
}

async function postSlackAlert(
  webhookUrl: string,
  alert: SlackAlert,
  options: SendSlackAlertOptions,
): Promise<{ ok: boolean; status?: number; error?: string }> {
  const fetchImpl = options.fetchImpl ?? (typeof fetch !== "undefined" ? fetch : undefined);
  if (!fetchImpl) return { ok: false, error: "Fetch is unavailable in this environment." };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SLACK_REQUEST_TIMEOUT_MS);
  try {
    const response = await fetchImpl(options.endpoint ?? SLACK_NOTIFY_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ webhookUrl, alert }),
      signal: controller.signal,
    });
    const body = (await response.json().catch(() => ({}))) as { error?: string };
    return { ok: response.ok, status: response.status, error: body.error };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Slack notification request failed.",
    };
  } finally {
    clearTimeout(timer);
  }
}

/** Send one alert through the server proxy, apply client throttling, and log the outcome. */
export async function sendSlackAlert(
  webhookUrl: string,
  alertInput: SlackAlert,
  options: SendSlackAlertOptions = {},
): Promise<SlackNotificationLog> {
  const alert = normalizeSlackAlert(alertInput) ?? alertInput;
  const validationError = validateSlackWebhook(webhookUrl);
  if (validationError) {
    const log = createLog(alert, "failed", validationError);
    appendSlackNotificationLog(log);
    return log;
  }

  const now = options.now ?? Date.now();
  const key = slackAlertThrottleKey(alert);
  if (!options.force && isSlackAlertThrottled(key, now)) {
    const log = createLog(
      alert,
      "rate_limited",
      "Notification skipped to avoid flooding the Slack channel.",
    );
    appendSlackNotificationLog(log);
    return log;
  }

  recordSlackAlert(key, now);
  const result = await postSlackAlert(webhookUrl.trim(), alert, options);
  const label = alert.campaignName || `campaign ${alert.campaignId}`;
  const message =
    alert.kind === "low-escrow"
      ? `Low escrow alert ${result.ok ? "sent" : "failed"} for ${label}.`
      : alert.kind === "high-value-conversion"
        ? `High-value conversion alert ${result.ok ? "sent" : "failed"} for ${label}.`
        : `Slack test notification ${result.ok ? "sent" : "failed"}.`;

  const log = createLog(
    alert,
    result.ok ? "sent" : "failed",
    result.ok ? message : result.error || message,
    result.status,
  );
  appendSlackNotificationLog(log);
  return log;
}

export interface LowEscrowAlertInput {
  campaignId: string;
  campaignName?: string;
  currentBalanceXlm: number;
  initialBudgetXlm: number;
  remainingPercent?: number;
  thresholdPercent?: number;
  appUrl?: string;
}

export function remainingEscrowPercent(
  currentBalanceXlm: number,
  initialBudgetXlm: number,
): number {
  if (!Number.isFinite(currentBalanceXlm) || !Number.isFinite(initialBudgetXlm)) return 0;
  if (initialBudgetXlm <= 0) return 0;
  return Number(((Math.max(currentBalanceXlm, 0) / initialBudgetXlm) * 100).toFixed(1));
}

export async function dispatchLowEscrowAlert(
  input: LowEscrowAlertInput,
  options: SendSlackAlertOptions = {},
): Promise<SlackNotificationLog | null> {
  const settings = loadSlackSettings();
  if (!settings.enabled || !settings.webhookUrl) return null;

  const percent =
    input.remainingPercent ??
    remainingEscrowPercent(input.currentBalanceXlm, input.initialBudgetXlm);
  const triggerPercent = Math.min(settings.lowEscrowThresholdPercent, LOW_ESCROW_THRESHOLD_PERCENT);
  if (percent >= triggerPercent) return null;

  return sendSlackAlert(
    settings.webhookUrl,
    {
      kind: "low-escrow",
      campaignId: input.campaignId,
      campaignName: input.campaignName,
      currentBalanceXlm: input.currentBalanceXlm,
      initialBudgetXlm: input.initialBudgetXlm,
      remainingPercent: percent,
      thresholdPercent: triggerPercent,
      appUrl: input.appUrl,
    },
    options,
  );
}

export interface HighValueConversionAlertInput {
  campaignId: string;
  campaignName?: string;
  saleAmountXlm: number;
  affiliateAddress?: string;
  txHash?: string;
  appUrl?: string;
}

export async function dispatchHighValueConversionAlert(
  input: HighValueConversionAlertInput,
  options: SendSlackAlertOptions = {},
): Promise<SlackNotificationLog | null> {
  const settings = loadSlackSettings();
  if (!settings.enabled || !settings.webhookUrl) return null;
  if (!Number.isFinite(input.saleAmountXlm)) return null;
  if (input.saleAmountXlm < settings.highValueThresholdXlm) return null;

  return sendSlackAlert(
    settings.webhookUrl,
    {
      kind: "high-value-conversion",
      campaignId: input.campaignId,
      campaignName: input.campaignName,
      saleAmountXlm: input.saleAmountXlm,
      affiliateAddress: input.affiliateAddress,
      txHash: input.txHash,
      appUrl: input.appUrl,
    },
    options,
  );
}

export async function sendSlackTestNotification(
  webhookUrl?: string,
  options: SendSlackAlertOptions = {},
): Promise<SlackNotificationLog> {
  const settings = loadSlackSettings();
  const target = (webhookUrl?.trim() || settings.webhookUrl).trim();
  return sendSlackAlert(
    target,
    { kind: "test", campaignId: "test", campaignName: "Slack integration test" },
    { ...options, force: true },
  );
}
