/**
 * Shared Redis client for StormSale Vercel Serverless Functions.
 *
 * Uses Upstash Redis (the current Vercel-recommended Redis integration).
 * Configure the following environment variables in Vercel's dashboard
 * (and locally in .env.local for development):
 *
 *   UPSTASH_REDIS_REST_URL  — REST URL for your Upstash Redis database
 *   UPSTASH_REDIS_REST_TOKEN — REST token for your Upstash Redis database
 *
 * These are provided automatically if you connect an Upstash Redis database
 * from the Vercel Marketplace (Integrations → Storage → Upstash Redis).
 */
import { Redis } from "@upstash/redis";

// Lazily instantiated so the module can be imported in tests without env vars.
let _redis: Redis | null = null;

export function getRedisClient(): Redis {
  if (_redis) return _redis;

  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    throw new Error(
      "Missing required environment variables: UPSTASH_REDIS_REST_URL and " +
        "UPSTASH_REDIS_REST_TOKEN. Connect an Upstash Redis database from " +
        "the Vercel Marketplace and redeploy.",
    );
  }

  _redis = new Redis({ url, token });
  return _redis;
}

/** KV key for slug → CustomShortLink mapping */
export const slugKey = (slug: string) => `sl:slug:${slug.toLowerCase()}`;

/** KV key for affiliate wallet → Set of owned slugs */
export const affiliateKey = (wallet: string) => `sl:wallet:${wallet}`;

/** KV key for click counter (separate for atomic INCR) */
export const clickKey = (slug: string) => `sl:clicks:${slug.toLowerCase()}`;

/** Expose for testing / injection */
export function _setRedisClientForTesting(client: Redis): void {
  _redis = client;
}

export function _resetRedisClient(): void {
  _redis = null;
}
