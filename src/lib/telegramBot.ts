import { createHash } from "crypto";

export interface TelegramConnection {
  affiliateId: string;
  telegramUserId?: string;
  token: string;
  connectedAt?: Date;
}

export interface TelegramNotificationPreferences {
  enabled: boolean;
  muted: boolean;
  connected: boolean;
}

export interface ConversionAlertPayload {
  campaignName: string;
  saleValue: number;
  commissionEarned: number;
  currency?: string;
  customerName?: string;
  conversionId?: string;
}

export const TELEGRAM_BOT_USERNAME = "StormSaleBot";

const TOKEN_BYTES_MIN = 16;
const TOKEN_BYTES_MAX = 64;

export function generateConnectToken(affiliateId: string): string {
  if (!affiliateId || affiliateId.trim().length === 0) {
    throw new Error("affiliateId is required to generate a Telegram connect token");
  }
  const raw = `${affiliateId}:${Date.now()}:${Math.random().toString(36).slice(2)}`;
  return createHash("sha256").update(raw).digest("hex").slice(0, 32);
}

export function buildConnectDeepLink(token: string): string {
  if (!token || token.trim().length === 0) {
    throw new Error("token is required to build the Telegram deep link");
  }
  return `https://t.me/${TELEGRAM_BOT_USERNAME}?start=${encodeURIComponent(token)}`;
}

export function isValidConnectToken(token: string): boolean {
  if (typeof token !== "string") return false;
  if (token.length < TOKEN_BYTES_MIN || token.length > TOKEN_BYTES_MAX) return false;
  return /^[A-Za-z0-9_-]+$/.test(token);
}

export function createDefaultPreferences(): TelegramNotificationPreferences {
  return { enabled: true, muted: false, connected: false };
}

export function connectTelegram(
  affiliateId: string,
  telegramUserId: string,
  token: string,
): TelegramConnection {
  if (!isValidConnectToken(token)) {
    throw new Error("Invalid Telegram connect token");
  }
  if (!telegramUserId || telegramUserId.trim().length === 0) {
    throw new Error("telegramUserId is required");
  }
  return {
    affiliateId,
    telegramUserId: telegramUserId.trim(),
    token,
    connectedAt: new Date(),
  };
}

export function disconnectTelegram(
  preferences: TelegramNotificationPreferences,
): TelegramNotificationPreferences {
  return { ...preferences, connected: false, enabled: false, muted: false };
}

export function setMuted(
  preferences: TelegramNotificationPreferences,
  muted: boolean,
): TelegramNotificationPreferences {
  return { ...preferences, muted };
}

export function setEnabled(
  preferences: TelegramNotificationPreferences,
  enabled: boolean,
): TelegramNotificationPreferences {
  return { ...preferences, enabled };
}

function formatCommency(value: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return `${currency} ${value.toFixed(2)}`;
  }
}

export function formatConversionAlert(payload: ConversionAlertPayload): string {
  const currency = payload.currency || "USD";
  const lines: string[] = [
    "🎉 **New Sale!** 🎉",
    "",
    `📞 Campaign: **${escapeMarkdown(payload.campaignName)}**`,
    `💵 Sale value: **${formatCommency(payload.saleValue, currency)}**`,
    `💰 Commission earned: **${formatCommency(payload.commissionEarned, currency)}**`,
  ];
  if (payload.customerName) {
    lines.push(`👤 Customer: ${escapeMarkdown(payload.customerName)}`);
  }
  if (payload.conversionId) {
    lines.push(`🗄 ${escapeMarkdown(payload.conversionId)}`);
  }
  lines.push("", "🚀 Your commission has been credited!");
  return lines.join("\n");
}

export function escapeMarkdown(text: string): string {
  return text.replace(/([_*[\]\(\)~#`>])/g, "$1");
}

export interface TelegramSendResult {
  ok: boolean;
  description?: string;
}

export async function sendTelegramMessage(
  botToken: string,
  chatId: string,
  text: string,
): Promise<TelegramSendResult> {
  if (!botToken) throw new Error("TELEGRAM_BOT_TOKEN is not configured");
  if (!chatId) throw new Error("chatId is required");
  const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: "Markdown",
      disable_web_page_preview: true,
    }),
  });
  const data = (await response.json()) as { ok?: boolean; description?: string };
  if (!response.ok || data.ok === false) {
    return { ok: false, description: data.description || `Telegram API responded with ${response.status}` };
  }
  return { ok: true };
}

export async function dispatchConversionAlert(
  botToken: string,
  connection: TelegramConnection,
  preferences: TelegramNotificationPreferences,
  payload: ConversionAlertPayload,
): Promise<TelegramSendResult> {
  if (!preferences.connected || !preferences.enabled || preferences.muted) {
    return { ok: false, description: "Notifications are disabled or muted" };
  }
  if (!connection.telegramUserId) {
    return { ok: false, description: "Telegram account is not connected" };
  }
  const text = formatConversionAlert(payload);
  return sendTelegramMessage(botToken, connection.telegramUserId, text);
}
