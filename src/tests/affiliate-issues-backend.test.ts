import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Keypair } from "@stellar/stellar-sdk";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import handler from "../../api/affiliate/issues";
import { _resetRedisClient, _setRedisClientForTesting } from "../../api/_lib/redis";
import {
  buildAffiliateIssueAuthMessage,
  type AffiliateIssueAction,
  type AffiliateIssueSubmission,
} from "../lib/affiliateIssueAuth";
import { affiliateIssueDraftSchema } from "../lib/validation";
import { sep53Digest } from "../lib/telegramAlerts";

interface MockPipeline {
  incr: (key: string) => MockPipeline;
  expire: (key: string, seconds: number, option?: string) => MockPipeline;
  set: (key: string, value: unknown, options?: { nx?: boolean }) => MockPipeline;
  sadd: (key: string, ...members: string[]) => MockPipeline;
  exec: () => Promise<unknown[]>;
}

interface MockRedis {
  get: <T>(key: string) => Promise<T | null>;
  set: (key: string, value: unknown, options?: { nx?: boolean }) => Promise<string | null>;
  sadd: (key: string, ...members: string[]) => Promise<number>;
  smembers: (key: string) => Promise<string[]>;
  incr: (key: string) => Promise<number>;
  expire: (key: string, seconds: number, option?: string) => Promise<number>;
  multi: () => MockPipeline;
}

const records = new Map<string, unknown>();
const sets = new Map<string, Set<string>>();
const counters = new Map<string, number>();
const ttls = new Map<string, number>();

let activeRedisMock: MockRedis;

const redis: MockRedis = {
  get: async <T>(key: string) => (records.has(key) ? (records.get(key) as T) : null),
  set: async (key: string, value: unknown, options?: { nx?: boolean }) => {
    if (options?.nx && records.has(key)) return null;
    records.set(key, value);
    return "OK";
  },
  sadd: async (key: string, ...members: string[]) => {
    const values = sets.get(key) ?? new Set<string>();
    const before = values.size;
    members.forEach((member) => values.add(member));
    sets.set(key, values);
    return values.size - before;
  },
  smembers: async (key: string) => [...(sets.get(key) ?? [])],
  incr: async (key: string) => {
    const count = (counters.get(key) ?? 0) + 1;
    counters.set(key, count);
    return count;
  },
  expire: async (key: string, seconds: number, option?: string) => {
    if (option === "NX" && ttls.has(key)) {
      return 0;
    }
    ttls.set(key, seconds);
    return 1;
  },
  multi: () => {
    const queued: Array<() => Promise<unknown>> = [];
    const chain: MockPipeline = {
      incr: (key: string) => {
        queued.push(async () => activeRedisMock.incr(key));
        return chain;
      },
      expire: (key: string, seconds: number, option?: string) => {
        queued.push(async () => activeRedisMock.expire(key, seconds, option));
        return chain;
      },
      set: (key: string, value: unknown, options?: { nx?: boolean }) => {
        queued.push(async () => activeRedisMock.set(key, value, options));
        return chain;
      },
      sadd: (key: string, ...members: string[]) => {
        queued.push(async () => activeRedisMock.sadd(key, ...members));
        return chain;
      },
      exec: async () => {
        const results = [];
        for (const op of queued) {
          results.push(await op());
        }
        return results;
      },
    };
    return chain;
  },
};
activeRedisMock = redis;

const affiliate = Keypair.random();
const otherWallet = Keypair.random();
const reportDraft: AffiliateIssueSubmission = {
  campaignId: "spring-campaign",
  saleDate: "2026-10-10",
  details: "My attributed sale is missing from this campaign.",
};

function signedHeaders(
  action: AffiliateIssueAction,
  payload?: AffiliateIssueSubmission,
  signer: Keypair = affiliate,
  timestamp = Date.now(),
) {
  const message = buildAffiliateIssueAuthMessage(action, signer.publicKey(), timestamp, payload);
  const signature = Buffer.from(signer.sign(new Uint8Array(sep53Digest(message)))).toString(
    "base64",
  );
  return {
    "x-stormsale-wallet": signer.publicKey(),
    "x-stormsale-timestamp": String(timestamp),
    "x-stormsale-signature": signature,
  };
}

function call(req: Partial<VercelRequest> & { method?: string; headers?: Record<string, string> }) {
  const result: { status?: number; body?: unknown; headers: Record<string, string> } = {
    headers: {},
  };
  const res = {
    setHeader: (name: string, value: string) => {
      result.headers[name] = value;
    },
    status(code: number) {
      result.status = code;
      return res;
    },
    json(body: unknown) {
      result.body = body;
      return res;
    },
  };
  return Promise.resolve(
    handler({ headers: {}, query: {}, ...req } as VercelRequest, res as unknown as VercelResponse),
  ).then(() => result);
}

beforeEach(() => {
  records.clear();
  sets.clear();
  counters.clear();
  ttls.clear();
  activeRedisMock = redis;
  _setRedisClientForTesting(redis as never);
});

afterEach(() => {
  _resetRedisClient();
  vi.restoreAllMocks();
});

describe("api/affiliate/issues", () => {
  it("authenticates, persists, and retrieves reports scoped to the signing affiliate", async () => {
    const submission = affiliateIssueDraftSchema.parse(reportDraft);
    const created = await call({
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...signedHeaders("submit", submission),
      },
      body: submission,
    });

    expect(created.status).toBe(201);
    expect(created.headers["Cache-Control"]).toBe("private, no-store");
    expect(created.body).toMatchObject({
      affiliateAddress: affiliate.publicKey(),
      campaignId: "spring-campaign",
      status: "submitted",
      attachmentCount: 0,
    });

    const loaded = await call({
      method: "GET",
      headers: signedHeaders("read"),
    });
    expect(loaded.status).toBe(200);
    expect(loaded.body).toEqual([created.body]);

    const otherWalletReports = await call({
      method: "GET",
      headers: signedHeaders("read", undefined, otherWallet),
    });
    expect(otherWalletReports.status).toBe(200);
    expect(otherWalletReports.body).toEqual([]);
  });

  it("rejects missing, invalid, stale, and replayed wallet proofs", async () => {
    const submission = affiliateIssueDraftSchema.parse(reportDraft);
    expect((await call({ method: "GET" })).status).toBe(401);

    expect(
      (
        await call({
          method: "GET",
          headers: signedHeaders("read", undefined, affiliate, Date.now() - 6 * 60 * 1000),
        })
      ).status,
    ).toBe(401);

    const forged = signedHeaders("submit", submission, otherWallet);
    forged["x-stormsale-wallet"] = affiliate.publicKey();
    expect(
      (
        await call({
          method: "POST",
          headers: { "content-type": "application/json", ...forged },
          body: submission,
        })
      ).status,
    ).toBe(401);

    const validHeaders = signedHeaders("submit", submission);
    const alteredBody = {
      ...submission,
      details: "This submitted description has been changed after signing.",
    };
    expect(
      (
        await call({
          method: "POST",
          headers: { "content-type": "application/json", ...validHeaders },
          body: alteredBody,
        })
      ).status,
    ).toBe(401);

    const freshHeaders = signedHeaders("submit", submission);
    const unpaddedHeaders = {
      ...freshHeaders,
      "x-stormsale-signature": freshHeaders["x-stormsale-signature"].replace(/=+$/, ""),
    };
    const first = await call({
      method: "POST",
      headers: { "content-type": "application/json", ...unpaddedHeaders },
      body: submission,
    });
    expect(first.status).toBe(201);
    const replay = await call({
      method: "POST",
      headers: { "content-type": "application/json", ...freshHeaders },
      body: submission,
    });
    expect(replay.status).toBe(401);
  });

  it("rejects invalid report fields and unsupported uploads without accepting file data", async () => {
    const invalid = { ...reportDraft, details: "too short" };
    expect(
      (
        await call({
          method: "POST",
          headers: {
            "content-type": "application/json",
            ...signedHeaders("submit"),
          },
          body: invalid,
        })
      ).status,
    ).toBe(400);

    const upload = await call({
      method: "POST",
      headers: { "content-type": "multipart/form-data; boundary=test" },
      body: {},
    });
    expect(upload.status).toBe(503);
    expect(upload.body).toEqual({
      error: "Private evidence storage is not configured. No files were accepted or stored.",
    });
    expect(records.size).toBe(0);
  });

  it("returns explicit method and storage errors", async () => {
    const unsupportedMethod = await call({ method: "PATCH" });
    expect(unsupportedMethod.status).toBe(405);
    expect(unsupportedMethod.headers.Allow).toBe("GET, POST");

    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const failingRedis: MockRedis = {
      ...redis,
      incr: async () => {
        throw new Error("storage unavailable");
      },
    };
    activeRedisMock = failingRedis;
    _setRedisClientForTesting(failingRedis as never);
    const submission = affiliateIssueDraftSchema.parse(reportDraft);
    const failed = await call({
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...signedHeaders("submit", submission),
      },
      body: submission,
    });
    expect(failed.status).toBe(503);
    expect(failed.body).toEqual({ error: "Issue reports are temporarily unavailable." });
  });

  it("atomically increments rate counter and sets its TTL on first access", async () => {
    const submission = affiliateIssueDraftSchema.parse(reportDraft);
    const response = await call({
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...signedHeaders("submit", submission),
      },
      body: submission,
    });
    expect(response.status).toBe(201);

    // Verify rate limit key has counter and TTL set
    const rateLimitKey = `affiliate-issues:rate:submit:${affiliate.publicKey()}`;
    expect(counters.get(rateLimitKey)).toBe(1);
    expect(ttls.get(rateLimitKey)).toBe(15 * 60);
  });

  it("persists report and updates wallet index atomically via multi pipeline", async () => {
    const submission = affiliateIssueDraftSchema.parse(reportDraft);
    const response = await call({
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...signedHeaders("submit", submission),
      },
      body: submission,
    });
    expect(response.status).toBe(201);
    const reportId = (response.body as { id: string }).id;

    // Verify atomic pipeline wrote both the report object and the wallet member set
    expect(records.has(`affiliate-issues:report:${reportId}`)).toBe(true);
    const memberSet = sets.get(`affiliate-issues:wallet:${affiliate.publicKey()}:reports`);
    expect(memberSet?.has(reportId)).toBe(true);
  });
});
