/**
 * POST /api/custom-links/register
 *
 * Registers a new custom short-link slug in the shared Upstash Redis store.
 * Uses Redis SET NX (set-if-not-exists) for atomic, globally unique slug
 * enforcement — concurrent registrations of the same slug are safely rejected.
 *
 * Request body (JSON):
 *   {
 *     slug: string,              // e.g. "tech-deals"
 *     affiliateWallet: string,   // Stellar public key G...
 *     walletFingerprint: string, // SHA-256 wf_ prefix hex
 *     campaignId: string,
 *     campaignName?: string,
 *     destinationUrl: string,    // https:// or http:// only
 *     trackingParams?: Record<string, string>
 *   }
 *
 * Responses:
 *   201 Created   — { ...CustomShortLink }
 *   400 Bad Request — { error: string }
 *   409 Conflict  — { error: string, slug: string }
 *   405 Method Not Allowed
 */
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getRedisClient, slugKey, affiliateKey } from "../_lib/redis";
import type { CustomShortLink } from "../../src/types/affiliateLink";

const SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const RESERVED_SLUGS = new Set([
  "c",
  "api",
  "dashboard",
  "affiliate",
  "advertiser",
  "auditor",
  "auth",
  "login",
  "register",
  "admin",
  "settings",
  "terms",
  "privacy",
  "help",
  "support",
  "explore",
  "webhook",
  "contracts",
]);
const ALLOWED_PROTOCOLS = new Set(["http:", "https:"]);

function validateSlug(slug: string): string | null {
  if (!slug || slug.length < 3 || slug.length > 50) {
    return "Slug must be between 3 and 50 characters.";
  }
  if (!SLUG_REGEX.test(slug)) {
    return "Slug must contain only lowercase alphanumeric characters and single hyphens.";
  }
  if (RESERVED_SLUGS.has(slug)) {
    return `'${slug}' is a reserved route and cannot be used as a custom slug.`;
  }
  return null;
}

function isValidDestination(url: string): boolean {
  try {
    const parsed = new URL(url);
    return ALLOWED_PROTOCOLS.has(parsed.protocol);
  } catch {
    return false;
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  const body = req.body as Partial<CustomShortLink>;
  const {
    affiliateWallet,
    walletFingerprint,
    campaignId,
    campaignName,
    destinationUrl,
    trackingParams,
  } = body;

  const rawSlug = typeof body.slug === "string" ? body.slug.toLowerCase().trim() : "";

  // ── Validation ────────────────────────────────────────────────────────────
  const slugError = validateSlug(rawSlug);
  if (slugError) return res.status(400).json({ error: slugError });

  if (!affiliateWallet || typeof affiliateWallet !== "string") {
    return res.status(400).json({ error: "Missing required field: affiliateWallet." });
  }
  if (!destinationUrl || !isValidDestination(destinationUrl)) {
    return res.status(400).json({
      error: "Invalid destinationUrl. Only http: and https: protocols are allowed.",
    });
  }
  if (!campaignId || typeof campaignId !== "string") {
    return res.status(400).json({ error: "Missing required field: campaignId." });
  }

  // ── Build record ──────────────────────────────────────────────────────────
  const now = new Date().toISOString();
  const link: CustomShortLink = {
    id: `csl_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    slug: rawSlug,
    affiliateWallet,
    walletFingerprint: walletFingerprint ?? "",
    campaignId,
    campaignName: campaignName ?? `Campaign #${campaignId}`,
    destinationUrl,
    trackingParams: trackingParams ?? {
      ref: affiliateWallet,
      campaign: campaignId,
      utm_source: "stormsale",
      utm_medium: "affiliate",
      utm_campaign: rawSlug,
    },
    createdAt: now,
    updatedAt: now,
    clickCount: 0,
  };

  // ── Atomic uniqueness: SET NX ─────────────────────────────────────────────
  // SET NX (set-if-not-exists) is an atomic Redis operation.
  // Returns "OK" on success, null if the slug is already taken.
  // This prevents race conditions between concurrent registrations.
  const redis = getRedisClient();
  const created = await redis.set(slugKey(rawSlug), link, { nx: true });

  if (created === null) {
    return res.status(409).json({
      error: `Slug '${rawSlug}' is already registered by another affiliate.`,
      slug: rawSlug,
    });
  }

  // Maintain per-affiliate slug index for /api/custom-links/list
  await redis.sadd(affiliateKey(affiliateWallet), rawSlug);

  return res.status(201).json(link);
}
