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
import {
  disconnect,
  getStatus,
  isValidWallet,
  setMuted,
  verifyOwnership,
  type OwnershipAction,
  type OwnershipProof,
} from "../../src/lib/telegramAlerts";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const store = getRedisClient();
  // Only allow GET/POST on this endpoint; reject anything else before doing work.
  if (req.method !== "GET" && req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "Method Not Allowed" });
  }
  if (req.method === "GET") {
    const wallet = req.query.wallet;
    if (!isValidWallet(wallet)) {
      return res.status(400).json({ error: "A valid Stellar wallet address is required." });
    }
    return res.status(200).json(await getStatus(store, wallet.trim()));
  }
  if (req.method === "POST") {
    const body = (req.body ?? {}) as Partial<OwnershipProof>;
    const action = body.action;
    if (action !== "mute" && action !== "unmute" && action !== "disconnect") {
      return res.status(400).json({ error: "action must be mute, unmute or disconnect." });
    }
    if (!verifyOwnership(body, action as OwnershipAction)) {
      return res.status(401).json({ error: "A fresh wallet signature is required." });
    }
    const wallet = (body as { wallet: string }).wallet;
    return res
      .status(200)
      .json(
        action === "disconnect"
          ? await disconnect(store, wallet)
          : await setMuted(store, wallet, action === "mute"),
      );
  }
  res.setHeader("Allow", "GET, POST");
  return res.status(405).json({ error: "Method Not Allowed" });
}
