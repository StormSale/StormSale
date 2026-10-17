import { API_URL } from "../utils/api";

export const TELEGRAM_BOT_USERNAME = "StormSaleBot";
export const TELEGRAM_BOT_BASE_URL = `https://t.me/${TELEGRAM_BOT_USERNAME}`;

export interface TelegramLinkPayload {
  token: string;
  walletAddress?: string;
}

export interface TelegramConnectionState {
  connected: boolean;
  muted?: boolean;
  telegramUsername?: string;
  linkedAt?: string;
}

export interface ConversionAlertPayload {
  campaignName: string;
  saleValue: number | string;
  commissionEarned: number | string;
  currency?: string;
  customer?: string;
}

const TELEGRAM_STORAGE_KEY = "stormsale.telegram.connection";

const getStorage = (): Storage | null => {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
};

export const generateTelegramDeepLink = (token: string): string => {
  const safeToken = (token || "").trim();
  if (!safeToken) {
    throw new Error("Telegram deep link requires a valid connection token");
  }
  return `${TELEGRAM_BOT_BASE_URL}?start=${encodeURIComponent(safeToken)}`;
};

export const formatConversionAlert = (payload: ConversionAlertPayload): string => {
  const currency = payload.currency || "XLM";
  const saleValue = Number(payload.saleValue);
  const commission = Number(payload.commissionEarned);
  const formattedSale = Number.isFinite(saleValue) ? saleValue.toFixed(2) : "0.00";
  const formattedCommission = Number.isFinite(commission) ? commission.toFixed(2) : "0.00";

  const lines = [
    "🎉 Great news! You just earned a commission!",
    "",
    `📈 Campaign: ${payload.campaignName}`,
    `💰 Sale value: ${formattedSale} ${currency}`,
    `💰 Commission earned: ${formattedCommission} ${currency}`,
  ];

  if (payload.customer) {
    lines.push(`👤 Customer: ${payload.customer}`);
  }

  lines.push("", "🚠 Keep sharing your link to earn more!");

  return lines.join("\n");
};

const safeParse = (raw: string | null): TelegramConnectionState | null => {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    return {
      connected: Boolean(parsed.connected),
      muted: Boolean(parsed.muted),
      telegramUsername:
        typeof parsed.telegramUsername === "string" ? parsed.telegramUsername : undefined,
      linkedAt: typeof parsed.linkedAt === "string" ? parsed.linkedAt : undefined,
    };
  } catch {
    return null;
  }
};

export const loadTelegramConnection = (): TelegramConnectionState => {
  const storage = getStorage();
  if (!storage) return { connected: false, muted: false };
  const parsed = safeParse(storage.getItem(TELEGRAM_STORAGE_KEY));
  return parsed || { connected: false, muted: false };
};

export const saveTelegramConnection = (state: TelegramConnectionState): boolean => {
  const storage = getStorage();
  if (!storage) return false;
  try {
    storage.setItem(TELEGRAM_STORAGE_KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
};

export const disconnectTelegram = (): void => {
  const storage = getStorage();
  if (!storage) return;
  try {
    storage.removeItem(TELEGRAM_STORAGE_KEY);
  } catch {
    // ignore storage failures
  }
};

export const setTelegramMuted = (muted: boolean): TelegramConnectionState => {
  const current = loadTelegramConnection();
  const next: TelegramConnectionState = { ...current, muted };
  saveTelegramConnection(next);
  return next;
};

export const requestTelegramLinkToken = async (
  walletAddress: string): Promise<string> => {
  const response = await fetch(`${API_URL}/telegram/link-token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ walletAddress }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || "Failed to generate Telegram link token");
  }

  const data = await response.json();
  const token = data.token || data.deepLinkToken;
  if (!token) {
    throw new Error("Telegram link token missing from response");
  }
  return String(token);
};

export const connectTelegramAlerts = async (walletAddress: string): Promise<{
  deepLink: string;
  token: string;
}> => {
  const token = await requestTelegramLinkToken(walletAddress);
  const deepLink = generateTelegramDeepLink(token);
  saveTelegramConnection({
    connected: true,
    muted: false,
    linkedAt: new Date().toISOString(),
  });
  return { deepLink, token };
};

export const dispatchConversionAlert = async (
  walletAddress: string,
  payload: ConversionAlertPayload
): Promise<{ delivered: boolean; message: string }> => {
  const connection = loadTelegramConnection();
  const message = formatConversionAlert(payload);

  if (!connection.connected || connection.muted) {
    return { delivered: false, message };
  }

  const response = await fetch(`${API_URL}/telegram/notify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      walletAddress,
      message,
      payload,
    }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || "Failed to dispatch Telegram conversion alert");
  }

  return { delivered: true, message };
};
