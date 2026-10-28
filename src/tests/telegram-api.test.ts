import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  Account,
  Address,
  Contract,
  Keypair,
  Networks,
  StrKey,
  TransactionBuilder,
  nativeToScVal,
} from "@stellar/stellar-sdk";
import { _resetRedisClient, _setRedisClientForTesting } from "../../api/_lib/redis";
import {
  clientIp,
  fetchCommissionRateBps,
  fetchConfirmedTransaction,
  getContractId,
  getTelegramSender,
  secretsMatch,
} from "../../api/_lib/telegram";
import connect from "../../api/telegram/connect";
import notify from "../../api/telegram/notify";
import settings from "../../api/telegram/settings";
import webhook from "../../api/telegram/webhook";
import { buildOwnershipMessage, linkKey, sep53Digest } from "../lib/telegramAlerts";

const data = new Map<string, unknown>();
const redis = {
  get: async (k: string) => (data.has(k) ? data.get(k) : null),
  getdel: async (k: string) => {
    const v = data.has(k) ? data.get(k) : null;
    data.delete(k);
    return v;
  },
  set: async (k: string, v: unknown, o?: { nx?: boolean }) => {
    if (o?.nx && data.has(k)) return null;
    data.set(k, v);
    return "OK";
  },
  del: async (k: string) => data.delete(k),
  incr: async (k: string) => {
    const next = Number(data.get(k) ?? 0) + 1;
    data.set(k, next);
    return next;
  },
  expire: async () => 1,
};

function call(handler: (req: never, res: never) => unknown, req: Record<string, unknown>) {
  const out: { status?: number; body?: unknown; headers: Record<string, string> } = {
    headers: {},
  };
  const res = {
    setHeader: (k: string, v: string) => {
      out.headers[k] = v;
    },
    status(code: number) {
      out.status = code;
      return res;
    },
    json(body: unknown) {
      out.body = body;
      return res;
    },
  };
  return Promise.resolve(handler({ headers: {}, query: {}, ...req } as never, res as never)).then(
    () => out,
  );
}

const kp = Keypair.random();
const W = kp.publicKey();
let tick = 0;
const proof = (action: "connect" | "mute" | "disconnect") => {
  // Distinct timestamps give distinct signatures, since each one is single use.
  const timestamp = Date.now() - tick++;
  const sig = kp.sign(Buffer.from(sep53Digest(buildOwnershipMessage(action, W, timestamp))));
  return { wallet: W, action, timestamp, signature: Buffer.from(sig).toString("base64") };
};

const CONTRACT = StrKey.encodeContract(Buffer.alloc(32, 3));
const ADVERTISER = Keypair.random().publicKey();
const HASH = "a".repeat(64);

function logSaleEnvelope(contractId = CONTRACT, amount = 1_205_000_000n): string {
  return new TransactionBuilder(new Account(ADVERTISER, "1"), {
    fee: "100",
    networkPassphrase: Networks.TESTNET,
  })
    .addOperation(
      new Contract(contractId).call(
        "log_sale",
        new Address(ADVERTISER).toScVal(),
        nativeToScVal(7, { type: "u32" }),
        new Address(W).toScVal(),
        nativeToScVal(amount, { type: "i128" }),
      ),
    )
    .setTimeout(30)
    .build()
    .toEnvelope()
    .toXDR("base64");
}

const campaignXdr = (rate: unknown) =>
  nativeToScVal(
    { commission_rate: rate, id: 7 },
    { type: { commission_rate: ["symbol", "u32"], id: ["symbol", "u32"] } },
  ).toXDR("base64");

const rpcResponse = (result: unknown, ok = true) => ({ ok, json: async () => ({ result }) });

/** fetch stub: Soroban RPC by method, everything else is the Telegram API. */
function stubNetwork({
  tx = { status: "SUCCESS", envelopeXdr: logSaleEnvelope() } as unknown,
  campaign = { results: [{ xdr: campaignXdr(500) }] } as unknown,
  telegramOk = true,
} = {}) {
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (url.includes("soroban")) {
      const { method } = JSON.parse(String(init?.body));
      return rpcResponse(method === "getTransaction" ? tx : campaign);
    }
    return { ok: telegramOk, json: async () => ({}) };
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

beforeEach(() => {
  data.clear();
  _setRedisClientForTesting(redis as never);
  process.env.TELEGRAM_BOT_TOKEN = "123:secret";
  process.env.TELEGRAM_WEBHOOK_SECRET = "hook-secret";
  process.env.STORMSALE_CONTRACT_ID = CONTRACT;
  process.env.STELLAR_RPC_URL = "https://soroban.test";
});
afterEach(() => {
  _resetRedisClient();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  delete process.env.STORMSALE_CONTRACT_ID;
  delete process.env.STELLAR_RPC_URL;
});

describe("api/telegram/connect", () => {
  it("requires a valid, unused wallet signature", async () => {
    expect((await call(connect, { method: "GET" })).status).toBe(405);
    expect((await call(connect, { method: "POST", body: [] })).status).toBe(400);
    expect((await call(connect, { method: "POST", body: { wallet: W } })).status).toBe(401);
    const signed = proof("connect");
    const ok = await call(connect, { method: "POST", body: signed });
    expect(ok.status).toBe(200);
    expect((ok.body as { deepLink: string }).deepLink).toMatch(
      /^https:\/\/t\.me\/StormSaleBot\?start=/,
    );
    const replay = await call(connect, { method: "POST", body: signed });
    expect(replay.status).toBe(401);
    expect(replay.body).toEqual({ error: "This signature was already used." });
  });

  it("rate limits connect links per wallet", async () => {
    for (let i = 0; i < 5; i++) {
      expect((await call(connect, { method: "POST", body: proof("connect") })).status).toBe(200);
    }
    const limited = await call(connect, { method: "POST", body: proof("connect") });
    expect(limited.status).toBe(429);
    expect(limited.headers["Retry-After"]).toBe("900");
  });

  it("returns 503 when storage is unavailable", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    _resetRedisClient();
    const url = process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_URL;
    expect((await call(connect, { method: "POST", body: proof("connect") })).status).toBe(503);
    if (url) process.env.UPSTASH_REDIS_REST_URL = url;
  });
});

describe("api/telegram/settings", () => {
  it("reads status and only changes it with a fresh signature", async () => {
    expect((await call(settings, { method: "GET", query: { wallet: "bad" } })).status).toBe(400);
    expect((await call(settings, { method: "GET", query: { wallet: W } })).body).toMatchObject({
      connected: false,
    });
    expect(
      (await call(settings, { method: "POST", body: { wallet: W, action: "x" } })).status,
    ).toBe(400);
    expect(
      (await call(settings, { method: "POST", body: { wallet: W, action: "mute" } })).status,
    ).toBe(401);
    data.set(linkKey(W), { chatId: "1", muted: false, connectedAt: "t" });
    const signed = proof("mute");
    const muted = await call(settings, { method: "POST", body: signed });
    expect(muted.body).toMatchObject({ connected: true, muted: true });
    expect((await call(settings, { method: "POST", body: signed })).status).toBe(401);
    const gone = await call(settings, { method: "POST", body: proof("disconnect") });
    expect(gone.body).toMatchObject({ connected: false });
    expect((await call(settings, { method: "DELETE" })).status).toBe(405);
  });

  it("rate limits status reads per caller", async () => {
    const req = { method: "GET", query: { wallet: W }, headers: { "x-forwarded-for": "9.9.9.9" } };
    for (let i = 0; i < 60; i++) await call(settings, req);
    expect((await call(settings, req)).status).toBe(429);
    expect(
      (await call(settings, { ...req, headers: { "x-forwarded-for": "8.8.8.8" } })).status,
    ).toBe(200);
  });

  it("returns 503 when storage throws", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    _setRedisClientForTesting({
      ...redis,
      incr: async () => Promise.reject(new Error("down")),
    } as never);
    expect((await call(settings, { method: "GET", query: { wallet: W } })).status).toBe(503);
  });
});

describe("api/telegram/webhook", () => {
  const auth = { "x-telegram-bot-api-secret-token": "hook-secret" };

  it("rejects requests without Telegram's secret header", async () => {
    expect((await call(webhook, { method: "GET" })).status).toBe(405);
    expect((await call(webhook, { method: "POST", body: {} })).status).toBe(401);
    expect(
      (
        await call(webhook, {
          method: "POST",
          headers: { "x-telegram-bot-api-secret-token": "wrong-secret" },
          body: {},
        })
      ).status,
    ).toBe(401);
  });

  it("replies to private chats only", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);
    const res = await call(webhook, {
      method: "POST",
      headers: auth,
      body: { message: { chat: { id: 5, type: "private" }, text: "/start" } },
    });
    expect(res.status).toBe(200);
    expect(fetchMock.mock.calls[0][0]).toBe("https://api.telegram.org/bot123:secret/sendMessage");
    const group = await call(webhook, {
      method: "POST",
      headers: auth,
      body: { message: { chat: { id: 6, type: "group" }, text: "/start" } },
    });
    expect(group.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("acknowledges the update even when the reply or storage fails", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
    const body = { message: { chat: { id: 5, type: "private" }, text: "/mute" } };
    expect((await call(webhook, { method: "POST", headers: auth, body })).status).toBe(200);
    expect(warn).toHaveBeenCalled();
    _setRedisClientForTesting({
      ...redis,
      get: async () => Promise.reject(new Error("x")),
    } as never);
    expect((await call(webhook, { method: "POST", headers: auth, body })).status).toBe(200);
    expect(error).toHaveBeenCalled();
  });
});

describe("api/telegram/notify", () => {
  beforeEach(() => {
    data.set(linkKey(W), { chatId: "1", muted: false, connectedAt: "t" });
  });

  it("builds the alert from the ledger, once per hash", async () => {
    const fetchMock = stubNetwork();
    // Caller-supplied fields are ignored; only the hash matters.
    const body = { txHash: HASH, saleAmount: "999999", affiliateWallet: "GFAKE" };
    expect((await call(notify, { method: "POST", body })).body).toEqual({ outcome: "sent" });
    const telegram = fetchMock.mock.calls.find(([url]) => url.includes("api.telegram.org"));
    const text = JSON.parse(String(telegram?.[1]?.body)).text as string;
    expect(text).toContain("Campaign #7");
    expect(text).toContain("120.5 XLM");
    expect(text).toContain("Commission earned: <b>6.025 XLM</b>");
    expect(text).not.toContain("999999");
    expect((await call(notify, { method: "POST", body })).body).toEqual({ outcome: "duplicate" });
  });

  it("validates input and configuration", async () => {
    stubNetwork();
    expect((await call(notify, { method: "GET" })).status).toBe(405);
    expect((await call(notify, { method: "POST", body: { txHash: "nothex" } })).status).toBe(400);
    delete process.env.STORMSALE_CONTRACT_ID;
    expect((await call(notify, { method: "POST", body: { txHash: HASH } })).status).toBe(503);
  });

  it("rejects failed, unknown or non-StormSale transactions", async () => {
    stubNetwork({ tx: { status: "FAILED" } });
    expect((await call(notify, { method: "POST", body: { txHash: HASH } })).status).toBe(422);
    stubNetwork({
      tx: {
        status: "SUCCESS",
        envelopeXdr: logSaleEnvelope(StrKey.encodeContract(Buffer.alloc(32, 4))),
      },
    });
    expect((await call(notify, { method: "POST", body: { txHash: HASH } })).status).toBe(422);
  });

  it("omits the commission line when the campaign can't be read", async () => {
    const fetchMock = stubNetwork({ campaign: { error: "not found" } });
    expect((await call(notify, { method: "POST", body: { txHash: HASH } })).body).toEqual({
      outcome: "sent",
    });
    const telegram = fetchMock.mock.calls.find(([url]) => url.includes("api.telegram.org"));
    expect(JSON.parse(String(telegram?.[1]?.body)).text).not.toContain("Commission");
  });

  it("reports Telegram delivery failures with 502", async () => {
    stubNetwork({ telegramOk: false });
    const res = await call(notify, { method: "POST", body: { txHash: HASH } });
    expect(res.status).toBe(502);
    expect(res.body).toEqual({ outcome: "send_failed" });
  });

  it("rate limits callers and survives storage errors", async () => {
    stubNetwork();
    const req = {
      method: "POST",
      body: { txHash: HASH },
      headers: { "x-forwarded-for": "1.1.1.1" },
    };
    for (let i = 0; i < 30; i++) await call(notify, req);
    expect((await call(notify, req)).status).toBe(429);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    _setRedisClientForTesting({
      ...redis,
      incr: async () => Promise.reject(new Error("x")),
    } as never);
    expect((await call(notify, { method: "POST", body: { txHash: HASH } })).status).toBe(503);
  });
});

describe("api/_lib/telegram", () => {
  it("compares the webhook secret in constant time", () => {
    expect(secretsMatch("hook-secret", "hook-secret")).toBe(true);
    expect(secretsMatch("hook-secreT", "hook-secret")).toBe(false);
    expect(secretsMatch("short", "hook-secret")).toBe(false);
    expect(secretsMatch(undefined, "hook-secret")).toBe(false);
    expect(secretsMatch("x", undefined)).toBe(false);
  });

  it("derives the caller address for rate limiting", () => {
    expect(clientIp({ headers: { "x-forwarded-for": "1.2.3.4, 10.0.0.1" } })).toBe("1.2.3.4");
    expect(clientIp({ headers: { "x-forwarded-for": ["5.6.7.8"] } })).toBe("5.6.7.8");
    expect(clientIp({ headers: {}, socket: { remoteAddress: "9.9.9.9" } })).toBe("9.9.9.9");
    expect(clientIp({ headers: {} })).toBe("unknown");
  });

  it("accepts only a well-formed contract id", () => {
    expect(getContractId()).toBe(CONTRACT);
    process.env.STORMSALE_CONTRACT_ID = "CNOTACONTRACT";
    expect(getContractId()).toBeNull();
  });

  it("requires the bot token and treats network errors as a failed send", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("timeout")));
    expect(await getTelegramSender()("1", "hi")).toBe(false);
    delete process.env.TELEGRAM_BOT_TOKEN;
    expect(() => getTelegramSender()).toThrow("TELEGRAM_BOT_TOKEN");
  });

  it("retries a transaction that the RPC has not indexed yet", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(rpcResponse({ status: "NOT_FOUND" }))
      .mockResolvedValueOnce(rpcResponse({ status: "SUCCESS", envelopeXdr: "AAAA" }));
    vi.stubGlobal("fetch", fetchMock);
    expect(await fetchConfirmedTransaction(HASH, { delayMs: 0 })).toEqual({ envelopeXdr: "AAAA" });
    expect(fetchMock).toHaveBeenCalledTimes(2);

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(rpcResponse({ status: "NOT_FOUND" })));
    expect(await fetchConfirmedTransaction(HASH, { attempts: 2, delayMs: 0 })).toBeNull();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(rpcResponse(null, false)));
    expect(await fetchConfirmedTransaction(HASH, { delayMs: 0 })).toBeNull();
    expect(await fetchConfirmedTransaction("0x" + HASH)).toBeNull();
  });

  it("reads the campaign commission rate from a get_campaign simulation", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(rpcResponse({ results: [{ xdr: campaignXdr(750) }] })),
    );
    expect(await fetchCommissionRateBps(CONTRACT, 7)).toBe(750);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(rpcResponse({ results: [{ xdr: campaignXdr(20_000) }] })),
    );
    expect(await fetchCommissionRateBps(CONTRACT, 7)).toBeNull();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(rpcResponse({ results: [] })));
    expect(await fetchCommissionRateBps(CONTRACT, 7)).toBeNull();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(rpcResponse({ results: [{ xdr: "%%" }] })));
    expect(await fetchCommissionRateBps(CONTRACT, 7)).toBeNull();
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("down")));
    expect(await fetchCommissionRateBps(CONTRACT, 7)).toBeNull();
  });
});
