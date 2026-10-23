/**
 * GET /api/custom-links/list?wallet=:affiliateWallet
 *
 * Returns all custom short-links registered by a given affiliate wallet
 * from the shared Upstash Redis store.
 *
 * Query params:
 *   wallet (string) — Stellar affiliate wallet public key
 *
 * Responses:
 *   200 OK  — CustomShortLink[]
 *   400     — { error: "Missing wallet" }
 */
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getRedisClient, affiliateKey, slugKey } from "../_lib/redis";
import type { CustomShortLink } from "../../src/types/affiliateLink";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  const wallet = typeof req.query.wallet === "string" ? req.query.wallet.trim() : "";

  if (!wallet) {
    return res.status(400).json({ error: "Missing required query parameter: wallet." });
  }

  const redis = getRedisClient();

  // Retrieve all slugs owned by this affiliate wallet
  const slugs: string[] = await redis.smembers(affiliateKey(wallet));

  if (!slugs.length) {
    return res.status(200).json([]);
  }

  // Fetch all link records in parallel
  const records = await Promise.all(slugs.map((slug) => redis.get<CustomShortLink>(slugKey(slug))));

  const links = records
    .filter((r): r is CustomShortLink => r !== null)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return res.status(200).json(links);
}
