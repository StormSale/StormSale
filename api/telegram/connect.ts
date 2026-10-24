/**
 * POST /api/telegram/connect
 *
 * Body: { wallet, timestamp, signature } — a SEP-53 signature of
 *   buildOwnershipMessage("connect", wallet, timestamp), proving wallet ownership.
 * 200:  { token, deepLink, expiresIn } — deepLink is t.me/StormSaleBot?start={token}
 *
 * The token is single use and expires after 15 minutes. The bot binds the
 * Telegram chat to the wallet when the affiliate presses Start.
 */
import { randomBytes } from "node:crypto";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getRedisClient } from "../_lib/redis";
import { createConnectToken, verifyOwnership } from "../../src/lib/telegramAlerts";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method Not Allowed" });
  }
  const body = req.body ?? {};
  if (typeof body !== "object" || Array.isArray(body)) {
    return res.status(400).json({ error: "Invalid request body." });
  }
  const proof = {
    wallet: body.wallet,
    timestamp: body.timestamp,
    signature: body.signature,
    action: "connect" as const,
  };
  if (!verifyOwnership(proof, "connect")) {
    return res.status(401).json({ error: "A fresh wallet signature is required." });
  }
  const result = await createConnectToken(getRedisClient(), proof.wallet, (n) => randomBytes(n));
  return res.status(200).json(result);
}
