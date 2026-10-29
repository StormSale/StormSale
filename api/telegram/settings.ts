/**
 * GET  /api/telegram/settings?wallet=G…           → { connected, muted, connectedAt }
 * POST /api/telegram/settings { wallet, action, timestamp, signature }
 *   action: "mute" | "unmute" | "disconnect", signed as buildOwnershipMessage(action, wallet, timestamp)
 *
 * Affiliates can also mute, unmute or disconnect from Telegram itself with
 * /mute, /unmute and /stop.
 */
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getRedisClient } from "../_lib/redis";
import { clientIp } from "../_lib/telegram";
import {
  claimOwnershipProof,
  consumeRateLimit,
  disconnect,
  getStatus,
  isValidWallet,
  setMuted,
  verifyOwnership,
  type OwnershipProof,
} from "../../src/lib/telegramAlerts";

const STATUS_LIMIT_PER_MINUTE = 60;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET" && req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "Method Not Allowed" });
  }
  try {
    const store = getRedisClient();
    if (req.method === "GET") {
      const wallet = req.query.wallet;
      if (!isValidWallet(wallet)) {
        return res.status(400).json({ error: "A valid Stellar wallet address is required." });
      }
      if (
        !(await consumeRateLimit(store, `status:${clientIp(req)}`, STATUS_LIMIT_PER_MINUTE, 60))
      ) {
        res.setHeader("Retry-After", "60");
        return res.status(429).json({ error: "Too many requests." });
      }
      return res.status(200).json(await getStatus(store, wallet.trim()));
    }

    const body = (req.body ?? {}) as Partial<OwnershipProof>;
    const action = body.action;
    if (action !== "mute" && action !== "unmute" && action !== "disconnect") {
      return res.status(400).json({ error: "action must be mute, unmute or disconnect." });
    }
    if (!verifyOwnership(body, action)) {
      return res.status(401).json({ error: "A fresh wallet signature is required." });
    }
    if (!(await claimOwnershipProof(store, body))) {
      return res.status(401).json({ error: "This signature was already used." });
    }
    return res
      .status(200)
      .json(
        action === "disconnect"
          ? await disconnect(store, body.wallet)
          : await setMuted(store, body.wallet, action === "mute"),
      );
  } catch (err) {
    console.error("[telegram/settings]", err instanceof Error ? err.message : err);
    return res.status(503).json({ error: "Telegram alerts are temporarily unavailable." });
  }
}
