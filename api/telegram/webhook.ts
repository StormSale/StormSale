/**
 * POST /api/telegram/webhook — Telegram Bot API update receiver.
 *
 * Register with:
 *   setWebhook(url=https://<host>/api/telegram/webhook, secret_token=$TELEGRAM_WEBHOOK_SECRET)
 * Telegram then sends the secret in X-Telegram-Bot-Api-Secret-Token; requests
 * without it are rejected. Once authenticated, the update is always
 * acknowledged with 200 so Telegram does not redeliver it in a loop; failures
 * are logged instead.
 */
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getRedisClient } from "../_lib/redis";
import { getTelegramSender, secretsMatch } from "../_lib/telegram";
import { handleBotCommand } from "../../src/lib/telegramAlerts";

interface TelegramUpdate {
  message?: { chat?: { id?: number | string; type?: string }; text?: string };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method Not Allowed" });
  }
  if (
    !secretsMatch(
      req.headers["x-telegram-bot-api-secret-token"],
      process.env.TELEGRAM_WEBHOOK_SECRET,
    )
  ) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  const message = (req.body as TelegramUpdate | undefined)?.message;
  const chatId = message?.chat?.id;
  // Only private chats can be linked, so alerts never land in a group.
  if (
    chatId === undefined ||
    message?.chat?.type !== "private" ||
    typeof message.text !== "string"
  ) {
    return res.status(200).json({ ok: true });
  }
  try {
    const reply = await handleBotCommand(getRedisClient(), String(chatId), message.text);
    const delivered = await getTelegramSender()(String(chatId), reply);
    if (!delivered) console.warn("[telegram/webhook] reply was not delivered");
  } catch (err) {
    console.error("[telegram/webhook]", err instanceof Error ? err.message : err);
  }
  return res.status(200).json({ ok: true });
}
