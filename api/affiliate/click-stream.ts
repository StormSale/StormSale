/**
 * GET /api/affiliate/click-stream?wallet=:affiliateWallet[&from=&to=&campaignLinkId=]
 *
 * Returns the country-level click stream for every custom short link owned by
 * an affiliate wallet, for the click stream heatmap (issue #162). Events carry
 * only a country ISO code, an event type, a timestamp and the link slug; no IP
 * address or other visitor data is stored or returned.
 *
 * Query params:
 *   wallet         (string, required) — Stellar affiliate wallet public key G...
 *   from           (string, optional) — inclusive start: ISO 8601 date/datetime or epoch ms
 *   to             (string, optional) — exclusive end: ISO 8601 datetime or epoch ms.
 *                                       A date-only value (YYYY-MM-DD) includes that whole UTC day.
 *   campaignLinkId (string, optional) — slug of one of the wallet's custom short links
 *
 * Responses:
 *   200 OK — { events: { countryIso, type, timestamp, campaignLinkId }[], truncated: boolean }
 *            newest first, at most MAX_EVENTS_RESPONSE events
 *   400    — { error: string } (missing/invalid wallet or date range)
 *   404    — { error: string } (campaignLinkId is not one of the wallet's links)
 *   405    — Method Not Allowed
 *   500    — { error: "Failed to load click stream." }
 */
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getRedisClient, affiliateKey } from "../_lib/redis";
import {
  CLICK_STREAM_MAX_EVENTS_PER_LINK,
  CLICK_STREAM_RETENTION_MS,
  readClickStreamEvents,
  type StoredClickStreamEvent,
} from "../_lib/clickStream";

/** Upper bound on events returned in one response. */
export const MAX_EVENTS_RESPONSE = 10000;

const STELLAR_PUBLIC_KEY = /^G[A-Z2-7]{55}$/;
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 24 * 60 * 60 * 1000;

function queryString(value: string | string[] | undefined): string {
  const raw = Array.isArray(value) ? value[0] : value;
  return typeof raw === "string" ? raw.trim() : "";
}

/** Parse a date bound; `null` means invalid, `undefined` means not supplied. */
function parseBound(raw: string, isEnd: boolean): number | null | undefined {
  if (!raw) return undefined;
  if (/^\d+$/.test(raw)) return Number(raw);
  const ms = Date.parse(raw);
  if (Number.isNaN(ms)) return null;
  return isEnd && DATE_ONLY.test(raw) ? ms + DAY_MS : ms;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  // Per-wallet analytics: never let a shared cache serve one wallet's data to another.
  res.setHeader("Cache-Control", "private, no-store");

  const wallet = queryString(req.query.wallet);
  if (!wallet) {
    return res.status(400).json({ error: "Missing required query parameter: wallet." });
  }
  if (!STELLAR_PUBLIC_KEY.test(wallet)) {
    return res.status(400).json({ error: "Invalid wallet: expected a Stellar public key (G...)." });
  }

  const now = Date.now();
  const from = parseBound(queryString(req.query.from), false);
  const to = parseBound(queryString(req.query.to), true);
  if (from === null) {
    return res.status(400).json({ error: "Invalid 'from' date." });
  }
  if (to === null) {
    return res.status(400).json({ error: "Invalid 'to' date." });
  }
  // Nothing older than the retention window is kept, so clamp the start to it.
  const startMs = Math.max(from ?? 0, now - CLICK_STREAM_RETENTION_MS);
  const endMs = to ?? now + 1;
  if (from !== undefined && to !== undefined && from >= to) {
    return res.status(400).json({ error: "'from' must be earlier than 'to'." });
  }

  const campaignLinkId = queryString(req.query.campaignLinkId).toLowerCase();

  try {
    const redis = getRedisClient();
    const owned = await redis.smembers(affiliateKey(wallet));
    const ownedSlugs = owned.map((slug) => String(slug).toLowerCase());

    let slugs = ownedSlugs;
    if (campaignLinkId) {
      if (!ownedSlugs.includes(campaignLinkId)) {
        return res
          .status(404)
          .json({ error: `Campaign link '${campaignLinkId}' not found for this wallet.` });
      }
      slugs = [campaignLinkId];
    }

    if (!slugs.length || startMs >= endMs) {
      return res.status(200).json({ events: [], truncated: false });
    }

    const perLinkLimit = Math.min(MAX_EVENTS_RESPONSE + 1, CLICK_STREAM_MAX_EVENTS_PER_LINK);
    const perLink = await Promise.all(
      slugs.map((slug) => readClickStreamEvents(redis, slug, startMs, endMs, perLinkLimit)),
    );

    const events: StoredClickStreamEvent[] = perLink
      .flat()
      .sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp));

    return res.status(200).json({
      events: events.slice(0, MAX_EVENTS_RESPONSE),
      truncated: events.length > MAX_EVENTS_RESPONSE,
    });
  } catch {
    return res.status(500).json({ error: "Failed to load click stream." });
  }
}
