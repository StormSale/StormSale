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

const records = new Map<string, unknown>();
const sets = new Map<string, Set<string>>();
const counters = new Map<string, number>();
const redis = {
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
  expire: async () => 1,
};

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
  const signature = Buffer.from(signer.sign(Buffer.from(sep53Digest(message)))).toString("base64");
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
    _setRedisClientForTesting({
      ...redis,
      incr: async () => {
        throw new Error("storage unavailable");
      },
    } as never);
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
});
