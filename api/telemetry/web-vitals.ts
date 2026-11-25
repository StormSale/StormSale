import { z } from "zod";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getRedisClient } from "../_lib/redis";

const payloadSchema = z
  .object({
    name: z.enum(["LCP", "CLS", "INP"]),
    value: z.number().finite().nonnegative().max(3_600_000),
    rating: z.enum(["good", "needs-improvement", "poor"]),
    deviceType: z.enum(["mobile", "tablet", "desktop"]),
    viewportCategory: z.enum(["compact", "medium", "wide"]),
  })
  .strict();

const RETENTION_SECONDS = 8 * 24 * 60 * 60;
const HOUR_MS = 60 * 60 * 1000;

function hasDoNotTrack(req: VercelRequest): boolean {
  const headers = req.headers as Record<string, string | string[] | undefined>;
  return (
    headers["dnt"] === "1" ||
    headers["sec-gpc"] === "1" ||
    (Array.isArray(headers["dnt"]) && headers["dnt"].includes("1")) ||
    (Array.isArray(headers["sec-gpc"]) && headers["sec-gpc"].includes("1"))
  );
}

function bucketKey(date: Date): string {
  return `rum:web-vitals:${date.toISOString().slice(0, 13)}`;
}

function fieldKey(payload: z.infer<typeof payloadSchema>, suffix: "count" | "sum"): string {
  return `${payload.name}|${payload.deviceType}|${payload.viewportCategory}|${payload.rating}|${suffix}`;
}

function parsePayload(body: unknown): z.infer<typeof payloadSchema> | null {
  let value = body;
  if (typeof value === "string") {
    if (value.length > 2048) return null;
    try {
      value = JSON.parse(value);
    } catch {
      return null;
    }
  }
  const parsed = payloadSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Vary", "DNT, Sec-GPC");

  if (hasDoNotTrack(req)) {
    return res.status(204).end();
  }

  if (req.method === "POST") {
    const contentType = String(req.headers["content-type"] || "")
      .split(";")[0]
      .trim();
    if (contentType !== "application/json") {
      return res.status(415).json({ error: "Content-Type must be application/json." });
    }

    const payload = parsePayload(req.body);
    if (!payload) {
      return res.status(400).json({ error: "Invalid Web Vitals payload." });
    }

    try {
      const redis = getRedisClient();
      const key = bucketKey(new Date());
      const pipeline = redis
        .pipeline()
        .hincrby(key, fieldKey(payload, "count"), 1)
        .hincrbyfloat(key, fieldKey(payload, "sum"), payload.value)
        .expire(key, RETENTION_SECONDS);
      await pipeline.exec();
      return res.status(204).end();
    } catch {
      return res.status(500).json({ error: "Unable to record Web Vitals." });
    }
  }

  if (req.method === "GET") {
    const rawHours = req.query.hours;
    const hours =
      rawHours === undefined ? 24 : Array.isArray(rawHours) ? Number.NaN : Number(rawHours);
    if (!Number.isInteger(hours) || hours < 1 || hours > 168) {
      return res.status(400).json({ error: "'hours' must be an integer between 1 and 168." });
    }

    try {
      const redis = getRedisClient();
      const currentHour = Date.now();
      const end = Math.floor(currentHour / HOUR_MS) * HOUR_MS;
      const start = end - (hours - 1) * HOUR_MS;
      const keys = Array.from({ length: hours }, (_, index) =>
        bucketKey(new Date(start + index * HOUR_MS)),
      );
      const buckets = await Promise.all(
        keys.map((key) => redis.hgetall<Record<string, string>>(key)),
      );
      const aggregates = new Map<
        string,
        {
          name: string;
          deviceType: string;
          viewportCategory: string;
          rating: string;
          count: number;
          sum: number;
        }
      >();
      const contextCounts = new Map<string, number>();

      for (const bucket of buckets) {
        for (const [field, rawValue] of Object.entries(bucket || {})) {
          const parts = field.split("|");
          if (parts.length !== 5) continue;
          const [name, deviceType, viewportCategory, rating, suffix] = parts;
          const value = Number(rawValue);
          if (!Number.isFinite(value) || value < 0) continue;
          const groupKey = `${name}|${deviceType}|${viewportCategory}|${rating}`;
          const contextKey = `${name}|${deviceType}|${viewportCategory}`;
          const current = aggregates.get(groupKey) || {
            name,
            deviceType,
            viewportCategory,
            rating,
            count: 0,
            sum: 0,
          };
          if (suffix === "count") {
            current.count += value;
            contextCounts.set(contextKey, (contextCounts.get(contextKey) || 0) + value);
          } else if (suffix === "sum") {
            current.sum += value;
          }
          aggregates.set(groupKey, current);
        }
      }

      const metrics = [...aggregates.values()]
        .filter((entry) => entry.count > 0)
        .map((entry) => {
          const contextKey = `${entry.name}|${entry.deviceType}|${entry.viewportCategory}`;
          const contextCount = contextCounts.get(contextKey) || 0;
          return {
            name: entry.name,
            deviceType: entry.deviceType,
            viewportCategory: entry.viewportCategory,
            rating: entry.rating,
            count: entry.count,
            averageValue: Number((entry.sum / entry.count).toFixed(4)),
            contextCount,
            ratingPercentage: contextCount
              ? Number(((entry.count / contextCount) * 100).toFixed(2))
              : 0,
          };
        })
        .sort(
          (a, b) =>
            a.name.localeCompare(b.name) ||
            a.deviceType.localeCompare(b.deviceType) ||
            a.viewportCategory.localeCompare(b.viewportCategory) ||
            a.rating.localeCompare(b.rating),
        );

      return res.status(200).json({
        from: new Date(start).toISOString(),
        to: new Date(end + HOUR_MS).toISOString(),
        metrics,
      });
    } catch {
      return res.status(500).json({ error: "Unable to load Web Vitals aggregates." });
    }
  }

  res.setHeader("Allow", "GET, POST");
  return res.status(405).json({ error: "Method Not Allowed" });
}
