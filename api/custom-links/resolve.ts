/**
 * GET /api/custom-links/resolve?slug=:slug
 *
 * Resolves a custom short-link slug from the shared Upstash Redis store and
 * returns the CustomShortLink record for redirect processing.
 * Also atomically increments the global click counter.
 *
 * Query params:
 *   slug (string) — the normalized slug to resolve
 *
 * Responses:
 *   200 OK     — { ...CustomShortLink, clickCount: number }
 *   400        — { error: "Missing slug" }
 *   404        — { error: "Slug not found" }
 */
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getRedisClient, slugKey, clickKey } from "../_lib/redis";
import type { CustomShortLink } from "../../src/types/affiliateLink";

const ALLOWED_PROTOCOLS = new Set(["http:", "https:"]);

function isValidDestination(url: string): boolean {
  try {
    return ALLOWED_PROTOCOLS.has(new URL(url).protocol);
  } catch {
    return false;
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  const rawSlug = typeof req.query.slug === "string" ? req.query.slug.toLowerCase().trim() : "";

  if (!rawSlug) {
    return res.status(400).json({ error: "Missing required query parameter: slug." });
  }

  const redis = getRedisClient();
  const link = await redis.get<CustomShortLink>(slugKey(rawSlug));

  if (!link) {
    return res.status(404).json({ error: `Slug '${rawSlug}' not found.` });
  }

  // Safety check: validate destination is still http/https before returning
  if (!isValidDestination(link.destinationUrl)) {
    return res.status(422).json({
      error: "Stored destination URL is invalid. Redirect rejected.",
    });
  }

  // Atomically increment click counter; update record in KV
  const newCount = await redis.incr(clickKey(rawSlug));
  const updatedLink: CustomShortLink = {
    ...link,
    clickCount: newCount,
    lastClickedAt: new Date().toISOString(),
  };
  // Best-effort update of the record — non-blocking
  redis.set(slugKey(rawSlug), updatedLink).catch(() => {
    /* intentionally non-blocking */
  });

  return res.status(200).json(updatedLink);
}
