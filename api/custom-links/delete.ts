/**
 * DELETE /api/custom-links/delete?slug=:slug&wallet=:affiliateWallet
 *
 * Deletes a custom short-link from the shared Upstash Redis store.
 * Only the owning affiliate wallet can delete its own slugs.
 *
 * Query params:
 *   slug   (string) — the slug to delete
 *   wallet (string) — the affiliate wallet that owns the slug
 *
 * Responses:
 *   200 OK   — { deleted: true }
 *   400      — { error: string }
 *   403      — { error: "Unauthorized" }
 *   404      — { error: "Slug not found" }
 */
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getRedisClient, slugKey, affiliateKey, clickEventsKey } from "../_lib/redis";
import type { CustomShortLink } from "../../src/types/affiliateLink";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "DELETE") {
    res.setHeader("Allow", "DELETE");
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  const rawSlug = typeof req.query.slug === "string" ? req.query.slug.toLowerCase().trim() : "";
  const wallet = typeof req.query.wallet === "string" ? req.query.wallet.trim() : "";

  if (!rawSlug) {
    return res.status(400).json({ error: "Missing required query parameter: slug." });
  }
  if (!wallet) {
    return res.status(400).json({ error: "Missing required query parameter: wallet." });
  }

  const redis = getRedisClient();
  const link = await redis.get<CustomShortLink>(slugKey(rawSlug));

  if (!link) {
    return res.status(404).json({ error: `Slug '${rawSlug}' not found.` });
  }

  // Ownership check — only the affiliate that created the slug can delete it
  if (link.affiliateWallet !== wallet) {
    return res.status(403).json({ error: "Unauthorized: you do not own this slug." });
  }

  await redis.del(slugKey(rawSlug));
  // Drop the link's click stream with it so no orphaned analytics remain.
  await redis.del(clickEventsKey(rawSlug));
  await redis.srem(affiliateKey(wallet), rawSlug);

  return res.status(200).json({ deleted: true, slug: rawSlug });
}
