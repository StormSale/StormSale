/**
 * GET /api/custom-links/availability?slug=:slug
 *
 * Checks whether a custom short-link slug is available in Redis WITHOUT recording click activity.
 * Runs redis.exists(slugKey(slug)).
 *
 * Query params:
 *   slug (string) — the normalized slug to check
 *
 * Responses:
 *   200 OK — { available: boolean, slug: string }
 *   400 — { error: "Missing required query parameter: slug." }
 */
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getRedisClient, slugKey } from "../_lib/redis";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  const rawSlug = typeof req.query.slug === "string" ? req.query.slug.toLowerCase().trim() : "";
  if (!rawSlug) {
    return res.status(400).json({ error: "Missing required query parameter: slug." });
  }

  try {
    const redis = getRedisClient();
    const exists = await redis.exists(slugKey(rawSlug));
    return res.status(200).json({
      slug: rawSlug,
      available: exists === 0,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return res.status(500).json({ error: message });
  }
}
