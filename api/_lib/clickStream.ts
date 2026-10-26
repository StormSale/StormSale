/**
 * Country-level click stream storage for the affiliate heatmap (issue #162).
 *
 * Each custom short link owns one Redis sorted set (`clickEventsKey(slug)`)
 * scored by the event timestamp in milliseconds. A member encodes only:
 *
 *   `${timestampMs}|${type}|${countryIso}|${nonce}`
 *
 * The nonce exists solely so two events in the same millisecond from the same
 * country stay distinct members. No IP address, user agent, referrer, wallet
 * or any other visitor identifier is ever written.
 *
 * Bounding:
 *  - events older than CLICK_STREAM_RETENTION_DAYS are trimmed on every write,
 *  - each link keeps at most CLICK_STREAM_MAX_EVENTS_PER_LINK newest events,
 *  - the key expires CLICK_STREAM_RETENTION_DAYS after its last write.
 */
import type { Redis } from "@upstash/redis";
import { clickEventsKey } from "./redis";

export type ClickStreamEventType = "click" | "conversion";

export interface StoredClickStreamEvent {
  countryIso: string;
  type: ClickStreamEventType;
  /** ISO 8601 timestamp. */
  timestamp: string;
  /** Slug of the custom short link the event belongs to. */
  campaignLinkId: string;
}

export const CLICK_STREAM_RETENTION_DAYS = 365;
export const CLICK_STREAM_RETENTION_MS = CLICK_STREAM_RETENTION_DAYS * 24 * 60 * 60 * 1000;
export const CLICK_STREAM_MAX_EVENTS_PER_LINK = 5000;

/**
 * Edge-set geo header on Vercel, where these functions deploy (see
 * vercel.json). It is written by Vercel's edge network, so a client cannot
 * spoof it. Other providers' headers (e.g. `cf-ipcountry`) are deliberately
 * NOT trusted: on Vercel they would be plain client-controlled input.
 */
export const GEO_COUNTRY_HEADER = "x-vercel-ip-country";

const ISO_ALPHA2 = /^[A-Z]{2}$/;
/** User-assigned / unknown codes some edges emit instead of a country. */
const NON_COUNTRY_CODES = new Set(["XX", "ZZ", "T1", "A1", "A2", "O1", "EU", "AP"]);

type HeaderValue = string | string[] | undefined;

/**
 * Read the visitor's ISO 3166-1 alpha-2 country from the platform geo header.
 * Returns null when the header is missing or is not a real country code, in
 * which case the click is still counted on the link but not placed on the map.
 */
export function countryFromHeaders(headers: Record<string, HeaderValue>): string | null {
  const raw = headers[GEO_COUNTRY_HEADER];
  const value = (Array.isArray(raw) ? raw[0] : raw)?.trim().toUpperCase();
  if (!value || !ISO_ALPHA2.test(value) || NON_COUNTRY_CODES.has(value)) return null;
  return value;
}

function nonce(): string {
  return Math.random().toString(36).slice(2, 10);
}

export function encodeClickStreamMember(
  type: ClickStreamEventType,
  countryIso: string,
  timestampMs: number,
): string {
  return `${timestampMs}|${type}|${countryIso}|${nonce()}`;
}

/** Parse a stored member back into an event, or null when it is malformed. */
export function decodeClickStreamMember(
  member: unknown,
  campaignLinkId: string,
): StoredClickStreamEvent | null {
  if (typeof member !== "string") return null;
  const [ts, type, countryIso] = member.split("|");
  const timestampMs = Number(ts);
  if (!Number.isFinite(timestampMs)) return null;
  if (type !== "click" && type !== "conversion") return null;
  if (!countryIso || !ISO_ALPHA2.test(countryIso)) return null;
  return {
    countryIso,
    type,
    timestamp: new Date(timestampMs).toISOString(),
    campaignLinkId,
  };
}

/**
 * Append one country-level event to a link's click stream and enforce the
 * retention window and per-link cap in the same round trip.
 */
export async function recordClickStreamEvent(
  redis: Redis,
  slug: string,
  type: ClickStreamEventType,
  countryIso: string,
  now: number = Date.now(),
): Promise<void> {
  const key = clickEventsKey(slug);
  await redis
    .multi()
    .zadd(key, { score: now, member: encodeClickStreamMember(type, countryIso, now) })
    .zremrangebyscore(key, 0, now - CLICK_STREAM_RETENTION_MS)
    .zremrangebyrank(key, 0, -(CLICK_STREAM_MAX_EVENTS_PER_LINK + 1))
    .expire(key, CLICK_STREAM_RETENTION_DAYS * 24 * 60 * 60)
    .exec();
}

/**
 * Read a link's events with `startMs <= timestamp < endMs`, newest first,
 * capped at `limit`.
 */
export async function readClickStreamEvents(
  redis: Redis,
  slug: string,
  startMs: number,
  endMs: number,
  limit: number,
): Promise<StoredClickStreamEvent[]> {
  const members = await redis.zrange<unknown[]>(
    clickEventsKey(slug),
    `(${endMs}` as `(${number}`,
    startMs,
    {
      byScore: true,
      rev: true,
      offset: 0,
      count: limit,
    },
  );
  return members
    .map((member) => decodeClickStreamMember(member, slug))
    .filter((event): event is StoredClickStreamEvent => event !== null);
}
