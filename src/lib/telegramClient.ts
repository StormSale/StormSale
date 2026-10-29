/**
 * Browser client for the Telegram alert functions in `api/telegram/*`.
 *
 * Holds no secrets. Changing a connection proves wallet ownership with a
 * SEP-53 signed message (Freighter `signMessage`), checked server-side.
 */
import { signMessage } from "@stellar/freighter-api";
import {
  buildOwnershipMessage,
  type AlertOutcome,
  type OwnershipAction,
  type OwnershipProof,
  type TelegramStatus,
} from "./telegramAlerts";

export const TELEGRAM_API = {
  connect: "/api/telegram/connect",
  settings: "/api/telegram/settings",
  notify: "/api/telegram/notify",
};

export type MessageSigner = (message: string, wallet: string) => Promise<string>;

/** Default signer: Freighter's SEP-53 `signMessage`. */
export const freighterSigner: MessageSigner = async (message, wallet) => {
  const result = await signMessage(message, { address: wallet });
  if (result.error || !result.signedMessage) {
    throw new Error("Wallet signature was rejected.");
  }
  const signed = result.signedMessage;
  return typeof signed === "string" ? signed : signed.toString("base64");
};

export async function signOwnership(
  action: OwnershipAction,
  wallet: string,
  signer: MessageSigner = freighterSigner,
  now: () => number = Date.now,
): Promise<OwnershipProof> {
  const timestamp = now();
  const signature = await signer(buildOwnershipMessage(action, wallet, timestamp), wallet);
  return { wallet, action, timestamp, signature };
}

async function readJson<T>(res: Response, fallback: string): Promise<T> {
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(data.error || fallback);
  return data;
}

export async function fetchTelegramStatus(wallet: string): Promise<TelegramStatus> {
  const res = await fetch(`${TELEGRAM_API.settings}?wallet=${encodeURIComponent(wallet)}`);
  return readJson<TelegramStatus>(res, "Could not load Telegram alert status.");
}

/** Returns the t.me deep link that finishes the connection in Telegram. */
export async function requestTelegramConnectLink(
  wallet: string,
  signer?: MessageSigner,
): Promise<string> {
  const proof = await signOwnership("connect", wallet, signer);
  const res = await fetch(TELEGRAM_API.connect, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(proof),
  });
  const data = await readJson<{ deepLink?: string }>(res, "Could not create a Telegram link.");
  if (!data.deepLink) throw new Error("Could not create a Telegram link.");
  return data.deepLink;
}

export async function updateTelegramAlerts(
  wallet: string,
  action: Exclude<OwnershipAction, "connect">,
  signer?: MessageSigner,
): Promise<TelegramStatus> {
  const proof = await signOwnership(action, wallet, signer);
  const res = await fetch(TELEGRAM_API.settings, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(proof),
  });
  return readJson<TelegramStatus>(res, "Could not update Telegram alerts.");
}

/** Result of asking the server to alert an affiliate, or "error" if the request failed. */
export type ConversionNoticeResult = AlertOutcome | "error";

const NOTIFY_TIMEOUT_MS = 15_000;
const OUTCOMES: readonly AlertOutcome[] = [
  "sent",
  "duplicate",
  "not_connected",
  "muted",
  "send_failed",
];

/**
 * Ask the server to alert the affiliate about a confirmed `log_sale`
 * transaction. The server reads the affiliate, campaign and amounts from the
 * ledger, so only the hash is sent. Bounded by a timeout and never throws.
 */
export async function notifyTelegramConversion(
  txHash: string,
  timeoutMs: number = NOTIFY_TIMEOUT_MS,
): Promise<ConversionNoticeResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(TELEGRAM_API.notify, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ txHash }),
      signal: controller.signal,
    });
    const data = (await res.json().catch(() => ({}))) as { outcome?: unknown };
    const outcome = OUTCOMES.find((o) => o === data.outcome);
    return outcome ?? "error";
  } catch {
    return "error";
  } finally {
    clearTimeout(timer);
  }
}
