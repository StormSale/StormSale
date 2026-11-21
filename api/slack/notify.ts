/**
 * POST /api/slack/notify — deliver a StormSale alert to a Slack Incoming Webhook.
 *
 * Body: { webhookUrl: "https://hooks.slack.com/services/...", alert: SlackAlert }
 *
 * The endpoint only forwards to the allow-listed Slack host, so it cannot be
 * abused as an open proxy / SSRF primitive. Callers are rate limited per IP,
 * and non-test alerts are throttled per campaign (or transaction) to keep a
 * noisy monitor from spamming a shared channel.
 */
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getRedisClient } from "../_lib/redis";
import { clientIp } from "../_lib/telegram";
import {
  SLACK_ALERT_COOLDOWN_MS,
  SLACK_REQUEST_TIMEOUT_MS,
  buildSlackAlertMessage,
  isValidSlackWebhookUrl,
  normalizeSlackAlert,
  type SlackAlert,
} from "../../src/lib/slackAlerts";

const SLACK_RATE_LIMIT_PER_MINUTE = 30;
const CAMPAIGN_COOLDOWN_SECONDS = Math.ceil(SLACK_ALERT_COOLDOWN_MS / 1000);

interface Bucket {
  count: number;
  resetAt: number;
}

const memoryBuckets = new Map<string, Bucket>();

function memoryRateLimit(bucket: string, limit: number, windowSeconds: number): boolean {
  const now = Date.now();
  const existing = memoryBuckets.get(bucket);
  if (!existing || existing.resetAt <= now) {
    memoryBuckets.set(bucket, { count: 1, resetAt: now + windowSeconds * 1000 });
    return true;
  }
  existing.count += 1;
  return existing.count <= limit;
}

async function rateLimit(bucket: string, limit: number, windowSeconds: number): Promise<boolean> {
  try {
    const store = getRedisClient();
    const key = `sl:rl:${bucket}`;
    const count = await store.incr(key);
    if (count === 1) await store.expire(key, windowSeconds);
    return count <= limit;
  } catch {
    // Redis is optional in local/dev; the per-instance bucket still throttles.
    return memoryRateLimit(bucket, limit, windowSeconds);
  }
}

function cooldownBucket(alert: SlackAlert): string | null {
  if (alert.kind === "test") return null;
  if (alert.kind === "low-escrow") return `campaign:low:${alert.campaignId}`;
  return `conversion:${alert.campaignId}:${alert.txHash || "latest"}`;
}

function parseBody(body: unknown): { webhookUrl?: unknown; alert?: unknown } {
  if (typeof body === "string") {
    try {
      return JSON.parse(body) as { webhookUrl?: unknown; alert?: unknown };
    } catch {
      return {};
    }
  }
  return (body ?? {}) as { webhookUrl?: unknown; alert?: unknown };
}

async function postToSlack(webhookUrl: string, alert: SlackAlert): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SLACK_REQUEST_TIMEOUT_MS);
  try {
    const message = buildSlackAlertMessage(alert);
    return await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(message),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  const { webhookUrl, alert: rawAlert } = parseBody(req.body);
  if (!isValidSlackWebhookUrl(webhookUrl)) {
    return res
      .status(400)
      .json({ error: "webhookUrl must be an https://hooks.slack.com/services/... URL." });
  }
  const alert = normalizeSlackAlert(rawAlert);
  if (!alert) {
    return res.status(400).json({ error: "A valid alert payload is required." });
  }

  if (!(await rateLimit(`ip:${clientIp(req)}`, SLACK_RATE_LIMIT_PER_MINUTE, 60))) {
    res.setHeader("Retry-After", "60");
    return res.status(429).json({ error: "Too many Slack notifications. Try again shortly." });
  }

  const campaignBucket = cooldownBucket(alert);
  if (campaignBucket && !(await rateLimit(campaignBucket, 1, CAMPAIGN_COOLDOWN_SECONDS))) {
    res.setHeader("Retry-After", String(CAMPAIGN_COOLDOWN_SECONDS));
    return res
      .status(429)
      .json({ error: "This campaign already notified Slack in the last 5 minutes." });
  }

  try {
    const response = await postToSlack(webhookUrl.trim(), alert);
    if (!response.ok) {
      console.error("[slack/notify] Slack rejected the message", response.status);
      return res
        .status(502)
        .json({ error: `Slack rejected the notification (HTTP ${response.status}).` });
    }
    return res.status(200).json({ ok: true, delivered: true });
  } catch (err) {
    console.error("[slack/notify]", err instanceof Error ? err.message : err);
    return res.status(502).json({ error: "Could not deliver the Slack notification." });
  }
}

/** Exposed for unit tests that exercise throttling without a Redis instance. */
export function _resetSlackMemoryBuckets(): void {
  memoryBuckets.clear();
}
