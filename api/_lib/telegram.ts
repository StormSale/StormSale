/**
 * Server-only Telegram helpers for the /api/telegram/* functions.
 *
 * Environment:
 *   TELEGRAM_BOT_TOKEN       — token from @BotFather (never exposed to the client)
 *   TELEGRAM_WEBHOOK_SECRET  — secret_token passed to setWebhook; checked on every update
 *   STELLAR_HORIZON_URL      — Horizon used to confirm sale transactions
 *                              (defaults to https://horizon-testnet.stellar.org)
 */
import type { TelegramSender } from "../../src/lib/telegramAlerts";

export function getTelegramSender(): TelegramSender {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN is not configured");
  return async (chatId, html) => {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: html,
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }),
    });
    return res.ok;
  };
}

/** True when Horizon reports `txHash` as a successful transaction. */
export async function isSuccessfulTransaction(txHash: string): Promise<boolean> {
  if (!/^[0-9a-f]{64}$/i.test(txHash)) return false;
  const horizon = process.env.STELLAR_HORIZON_URL || "https://horizon-testnet.stellar.org";
  const res = await fetch(`${horizon.replace(/\/$/, "")}/transactions/${txHash}`);
  if (!res.ok) return false;
  const data = (await res.json()) as { successful?: boolean };
  return data.successful === true;
}
