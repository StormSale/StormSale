import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Redis } from "@upstash/redis";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import clickStreamHandler, { MAX_EVENTS_RESPONSE } from "../../api/affiliate/click-stream";
import resolveHandler from "../../api/custom-links/resolve";
import deleteHandler from "../../api/custom-links/delete";
import {
  CLICK_STREAM_MAX_EVENTS_PER_LINK,
  CLICK_STREAM_RETENTION_MS,
  GEO_COUNTRY_HEADER,
  countryFromHeaders,
  decodeClickStreamMember,
  encodeClickStreamMember,
  recordClickStreamEvent,
} from "../../api/_lib/clickStream";
import {
  _resetRedisClient,
  _setRedisClientForTesting,
  affiliateKey,
  clickEventsKey,
  slugKey,
} from "../../api/_lib/redis";
import type { CustomShortLink } from "../types/affiliateLink";

const WALLET = "GBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFSHONUCEOASW7QC7OX2H";
const OTHER_WALLET = "GDQNY3PBOJOKYZSRMK2S7LHHGWZIUISD4QORETLMXEWXBI7KFZZMKTL3";
const NOW = Date.UTC(2026, 9, 20, 12, 0, 0);
const DAY = 86_400_000;

// ---------------------------------------------------------------------------
// In-memory Redis covering the commands the click stream functions use.
// ---------------------------------------------------------------------------
type Bound = number | string;

function scoreBound(bound: Bound): { value: number; exclusive: boolean } {
  if (typeof bound === "number") return { value: bound, exclusive: false };
  if (bound === "+inf") return { value: Infinity, exclusive: false };
  if (bound === "-inf") return { value: -Infinity, exclusive: false };
  const exclusive = bound.startsWith("(");
  return { value: Number(exclusive ? bound.slice(1) : bound), exclusive };
}

class FakeRedis {
  kv = new Map<string, unknown>();
  sets = new Map<string, Set<string>>();
  zsets = new Map<string, Map<string, number>>();
  ttl = new Map<string, number>();
  failZrange = false;
  failMulti = false;

  private sorted(key: string): Array<[string, number]> {
    return [...(this.zsets.get(key) ?? new Map()).entries()].sort((a, b) => a[1] - b[1]);
  }

  async get<T>(key: string): Promise<T | null> {
    return (this.kv.get(key) as T) ?? null;
  }
  async set(key: string, value: unknown) {
    this.kv.set(key, value);
    return "OK";
  }
  async incr(key: string) {
    const next = Number(this.kv.get(key) ?? 0) + 1;
    this.kv.set(key, next);
    return next;
  }
  async del(key: string) {
    const existed = this.kv.delete(key) || this.zsets.delete(key) || this.sets.delete(key);
    return existed ? 1 : 0;
  }
  async smembers(key: string) {
    return [...(this.sets.get(key) ?? [])];
  }
  async srem(key: string, member: string) {
    return this.sets.get(key)?.delete(member) ? 1 : 0;
  }
  sadd(key: string, member: string) {
    if (!this.sets.has(key)) this.sets.set(key, new Set());
    this.sets.get(key)!.add(member);
  }
  zaddSync(key: string, score: number, member: string) {
    if (!this.zsets.has(key)) this.zsets.set(key, new Map());
    this.zsets.get(key)!.set(member, score);
  }
  async zrange(
    key: string,
    start: Bound,
    stop: Bound,
    opts: { byScore?: boolean; rev?: boolean; offset?: number; count?: number },
  ) {
    if (this.failZrange) throw new Error("upstash unavailable");
    expect(opts.byScore).toBe(true);
    const max = scoreBound(opts.rev ? start : stop);
    const min = scoreBound(opts.rev ? stop : start);
    let rows = this.sorted(key).filter(
      ([, s]) =>
        (min.exclusive ? s > min.value : s >= min.value) &&
        (max.exclusive ? s < max.value : s <= max.value),
    );
    if (opts.rev) rows = rows.reverse();
    const offset = opts.offset ?? 0;
    rows = rows.slice(offset, opts.count === undefined ? undefined : offset + opts.count);
    return rows.map(([m]) => m);
  }
  multi() {
    const ops: Array<() => void> = [];
    const chain = {
      zadd: (key: string, sm: { score: number; member: string }) => {
        ops.push(() => this.zaddSync(key, sm.score, sm.member));
        return chain;
      },
      zremrangebyscore: (key: string, min: number, max: number) => {
        ops.push(() => {
          for (const [m, s] of this.sorted(key))
            if (s >= min && s <= max) this.zsets.get(key)!.delete(m);
        });
        return chain;
      },
      zremrangebyrank: (key: string, start: number, stop: number) => {
        ops.push(() => {
          const rows = this.sorted(key);
          const n = rows.length;
          const from = start < 0 ? n + start : start;
          const to = stop < 0 ? n + stop : stop;
          rows.slice(Math.max(from, 0), to + 1).forEach(([m]) => this.zsets.get(key)!.delete(m));
        });
        return chain;
      },
      expire: (key: string, seconds: number) => {
        ops.push(() => this.ttl.set(key, seconds));
        return chain;
      },
      exec: async () => {
        if (this.failMulti) throw new Error("upstash unavailable");
        ops.forEach((op) => op());
        return [];
      },
    };
    return chain;
  }
}

function mockRes() {
  const res = {
    statusCode: 200,
    body: undefined as unknown,
    headers: {} as Record<string, string>,
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    json(body: unknown) {
      res.body = body;
      return res;
    },
    setHeader(name: string, value: string) {
      res.headers[name.toLowerCase()] = value;
      return res;
    },
  };
  return res;
}

type MockRes = ReturnType<typeof mockRes>;

async function call(
  handler: (req: VercelRequest, res: VercelResponse) => unknown,
  req: { method?: string; query?: Record<string, string>; headers?: Record<string, string> },
): Promise<MockRes> {
  const res = mockRes();
  await handler(
    { method: "GET", query: {}, headers: {}, ...req } as unknown as VercelRequest,
    res as unknown as VercelResponse,
  );
  return res;
}

function link(slug: string, wallet = WALLET): CustomShortLink {
  return {
    id: `csl_${slug}`,
    slug,
    affiliateWallet: wallet,
    walletFingerprint: "wf_test",
    campaignId: "42",
    campaignName: "Campaign #42",
    destinationUrl: "https://shop.example.com/",
    trackingParams: { ref: wallet },
    createdAt: new Date(NOW - 30 * DAY).toISOString(),
    updatedAt: new Date(NOW - 30 * DAY).toISOString(),
    clickCount: 0,
  };
}

let redis: FakeRedis;

function addLink(slug: string, wallet = WALLET) {
  redis.kv.set(slugKey(slug), link(slug, wallet));
  redis.sadd(affiliateKey(wallet), slug);
}

function addEvent(
  slug: string,
  country: string,
  ageMs: number,
  type: "click" | "conversion" = "click",
) {
  const ts = NOW - ageMs;
  redis.zaddSync(clickEventsKey(slug), ts, encodeClickStreamMember(type, country, ts));
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  redis = new FakeRedis();
  _setRedisClientForTesting(redis as unknown as Redis);
});

afterEach(() => {
  vi.useRealTimers();
  _resetRedisClient();
});

// ---------------------------------------------------------------------------
describe("click stream storage helpers", () => {
  it("reads the country from the Vercel edge geo header only", () => {
    expect(countryFromHeaders({ [GEO_COUNTRY_HEADER]: "ng" })).toBe("NG");
    expect(countryFromHeaders({ [GEO_COUNTRY_HEADER]: [" de "] })).toBe("DE");
    // Client-controllable headers from other providers are not trusted on Vercel.
    expect(countryFromHeaders({ "cf-ipcountry": "US" })).toBeNull();
    expect(countryFromHeaders({})).toBeNull();
  });

  it("rejects values that are not real country codes", () => {
    for (const value of ["XX", "T1", "USA", "1A", ""]) {
      expect(countryFromHeaders({ [GEO_COUNTRY_HEADER]: value })).toBeNull();
    }
  });

  it("round-trips an event and rejects malformed members", () => {
    const member = encodeClickStreamMember("conversion", "KE", NOW);
    expect(decodeClickStreamMember(member, "promo")).toEqual({
      countryIso: "KE",
      type: "conversion",
      timestamp: new Date(NOW).toISOString(),
      campaignLinkId: "promo",
    });
    expect(decodeClickStreamMember("abc|click|NG|x", "promo")).toBeNull();
    expect(decodeClickStreamMember(`${NOW}|view|NG|x`, "promo")).toBeNull();
    expect(decodeClickStreamMember(`${NOW}|click|Nigeria|x`, "promo")).toBeNull();
    expect(decodeClickStreamMember(42, "promo")).toBeNull();
  });

  it("trims events past the retention window and caps each link", async () => {
    const key = clickEventsKey("promo");
    redis.zaddSync(key, NOW - CLICK_STREAM_RETENTION_MS - 1, "old|click|US|a");
    for (let i = 0; i < CLICK_STREAM_MAX_EVENTS_PER_LINK; i++) {
      redis.zaddSync(key, NOW - DAY + i, `${NOW - DAY + i}|click|US|${i}`);
    }
    await recordClickStreamEvent(redis as unknown as Redis, "promo", "click", "NG", NOW);

    const remaining = redis.zsets.get(key)!;
    expect(remaining.size).toBe(CLICK_STREAM_MAX_EVENTS_PER_LINK);
    expect(remaining.has("old|click|US|a")).toBe(false);
    expect([...remaining.keys()].some((m) => m.startsWith(`${NOW}|click|NG|`))).toBe(true);
    expect(redis.ttl.get(key)).toBe(CLICK_STREAM_RETENTION_MS / 1000);
  });
});

// ---------------------------------------------------------------------------
describe("GET /api/custom-links/resolve click recording", () => {
  it("records a country-level click event without storing the IP", async () => {
    addLink("promo");
    const res = await call(resolveHandler, {
      query: { slug: "promo" },
      headers: {
        [GEO_COUNTRY_HEADER]: "NG",
        "x-forwarded-for": "203.0.113.7",
        "x-real-ip": "203.0.113.7",
        "user-agent": "Mozilla/5.0 (test)",
      },
    });

    expect(res.statusCode).toBe(200);
    expect((res.body as CustomShortLink).clickCount).toBe(1);
    const members = [...redis.zsets.get(clickEventsKey("promo"))!.keys()];
    expect(members).toHaveLength(1);
    expect(decodeClickStreamMember(members[0], "promo")).toMatchObject({
      countryIso: "NG",
      type: "click",
    });

    const everything = JSON.stringify({
      kv: [...redis.kv.entries()],
      zsets: [...redis.zsets.entries()].map(([k, v]) => [k, [...v.keys()]]),
    });
    expect(everything).not.toContain("203.0.113.7");
    expect(everything).not.toContain("Mozilla");
  });

  it("still counts the click but skips the map when the country is unknown", async () => {
    addLink("promo");
    const res = await call(resolveHandler, { query: { slug: "promo" } });
    expect(res.statusCode).toBe(200);
    expect((res.body as CustomShortLink).clickCount).toBe(1);
    expect(redis.zsets.has(clickEventsKey("promo"))).toBe(false);
  });

  it("never fails the redirect when the click stream write fails", async () => {
    addLink("promo");
    redis.failMulti = true;
    const res = await call(resolveHandler, {
      query: { slug: "promo" },
      headers: { [GEO_COUNTRY_HEADER]: "US" },
    });
    expect(res.statusCode).toBe(200);
    expect((res.body as CustomShortLink).destinationUrl).toBe("https://shop.example.com/");
  });

  it("deletes a link's click stream together with the link", async () => {
    addLink("promo");
    addEvent("promo", "US", DAY);
    const res = await call(deleteHandler, {
      method: "DELETE",
      query: { slug: "promo", wallet: WALLET },
    });
    expect(res.statusCode).toBe(200);
    expect(redis.zsets.has(clickEventsKey("promo"))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
describe("GET /api/affiliate/click-stream", () => {
  beforeEach(() => {
    addLink("promo");
    addLink("summer");
    addLink("theirs", OTHER_WALLET);
    addEvent("promo", "US", 1 * DAY);
    addEvent("promo", "US", 1 * DAY, "conversion");
    addEvent("promo", "NG", 3 * DAY);
    addEvent("summer", "DE", 10 * DAY);
    addEvent("summer", "GB", 60 * DAY);
    addEvent("theirs", "FR", 1 * DAY);
  });

  it("returns the wallet's events, newest first, in the heatmap contract", async () => {
    const res = await call(clickStreamHandler, { query: { wallet: WALLET } });
    expect(res.statusCode).toBe(200);
    expect(res.headers["cache-control"]).toBe("private, no-store");
    const body = res.body as { events: Array<Record<string, unknown>>; truncated: boolean };
    expect(body.truncated).toBe(false);
    expect(body.events.map((e) => e.countryIso)).toEqual(["US", "US", "NG", "DE", "GB"]);
    for (const event of body.events) {
      expect(Object.keys(event).sort()).toEqual(
        ["campaignLinkId", "countryIso", "timestamp", "type"].sort(),
      );
    }
    expect(body.events.filter((e) => e.type === "conversion")).toHaveLength(1);
    // Another affiliate's link never leaks in.
    expect(body.events.some((e) => e.campaignLinkId === "theirs")).toBe(false);
  });

  it("filters by date range with a date-only end covering the whole day", async () => {
    const day = (ms: number) => new Date(ms).toISOString().slice(0, 10);
    const res = await call(clickStreamHandler, {
      query: { wallet: WALLET, from: day(NOW - 10 * DAY), to: day(NOW - 3 * DAY) },
    });
    const body = res.body as { events: Array<{ countryIso: string }> };
    expect(body.events.map((e) => e.countryIso)).toEqual(["NG", "DE"]);
  });

  it("accepts epoch-millisecond bounds with an exclusive end", async () => {
    const res = await call(clickStreamHandler, {
      query: { wallet: WALLET, from: String(NOW - 3 * DAY), to: String(NOW - 1 * DAY) },
    });
    const body = res.body as { events: Array<{ countryIso: string }> };
    expect(body.events.map((e) => e.countryIso)).toEqual(["NG"]);
  });

  it("filters by campaign link", async () => {
    const res = await call(clickStreamHandler, {
      query: { wallet: WALLET, campaignLinkId: "SUMMER" },
    });
    const body = res.body as { events: Array<{ countryIso: string; campaignLinkId: string }> };
    expect(body.events.map((e) => e.countryIso)).toEqual(["DE", "GB"]);
    expect(new Set(body.events.map((e) => e.campaignLinkId))).toEqual(new Set(["summer"]));
  });

  it("refuses a campaign link the wallet does not own", async () => {
    const res = await call(clickStreamHandler, {
      query: { wallet: WALLET, campaignLinkId: "theirs" },
    });
    expect(res.statusCode).toBe(404);
  });

  it("returns an empty stream for a wallet without links", async () => {
    const res = await call(clickStreamHandler, {
      query: { wallet: "GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN7" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ events: [], truncated: false });
  });

  it("caps the response size and flags truncation", async () => {
    for (let l = 0; l < 3; l++) {
      const slug = `bulk-${l}`;
      addLink(slug);
      for (let i = 0; i < 4000; i++) {
        const ts = NOW - DAY + l * 4000 + i;
        redis.zaddSync(clickEventsKey(slug), ts, `${ts}|click|IN|${i}`);
      }
    }
    const res = await call(clickStreamHandler, { query: { wallet: WALLET } });
    const body = res.body as { events: unknown[]; truncated: boolean };
    expect(body.events).toHaveLength(MAX_EVENTS_RESPONSE);
    expect(body.truncated).toBe(true);
  });

  it.each([
    [{}, "Missing required query parameter: wallet."],
    [{ wallet: "not-a-wallet" }, "Invalid wallet: expected a Stellar public key (G...)."],
    [{ wallet: WALLET, from: "yesterday" }, "Invalid 'from' date."],
    [{ wallet: WALLET, to: "soon" }, "Invalid 'to' date."],
    [{ wallet: WALLET, from: "2026-10-10", to: "2026-10-01" }, "'from' must be earlier than 'to'."],
  ])("rejects bad input %j with 400", async (query, error) => {
    const res = await call(clickStreamHandler, { query: query as Record<string, string> });
    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ error });
  });

  it("rejects non-GET methods", async () => {
    const res = await call(clickStreamHandler, { method: "POST", query: { wallet: WALLET } });
    expect(res.statusCode).toBe(405);
    expect(res.headers.allow).toBe("GET");
  });

  it("returns a generic 500 when storage fails", async () => {
    redis.failZrange = true;
    const res = await call(clickStreamHandler, { query: { wallet: WALLET } });
    expect(res.statusCode).toBe(500);
    expect(res.body).toEqual({ error: "Failed to load click stream." });
  });
});
