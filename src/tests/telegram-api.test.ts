import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Keypair } from "@stellar/stellar-sdk";
import { _resetRedisClient, _setRedisClientForTesting } from "../../api/_lib/redis";
import connect from "../../api/telegram/connect";
import notify from "../../api/telegram/notify";
import settings from "../../api/telegram/settings";
import webhook from "../../api/telegram/webhook";
import { buildOwnershipMessage, linkKey, sep53Digest } from "../lib/telegramAlerts";

const data = new Map<string, unknown>();
const redis = {
  get: async (k: string) => (data.has(k) ? data.get(k) : null),
  set: async (k: string, v: unknown, o?: { nx?: boolean }) => {
    if (o?.nx && data.has(k)) return null;
    data.set(k, v);
    return "OK";
  },
  del: async (k: string) => data.delete(k),
};

function call(handler: (req: never, res: never) => unknown, req: Record<string, unknown>) {
  const out: { status?: number; body?: unknown } = {};
  const res = {
    setHeader: vi.fn(),
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
const proof = (action: "connect" | "mute") => {
  const timestamp = Date.now();
  const sig = kp.sign(Buffer.from(sep53Digest(buildOwnershipMessage(action, W, timestamp))));
  return { wallet: W, action, timestamp, signature: Buffer.from(sig).toString("base64") };
};

beforeEach(() => {
  data.clear();
  _setRedisClientForTesting(redis as never);
  process.env.TELEGRAM_BOT_TOKEN = "123:secret";
  process.env.TELEGRAM_WEBHOOK_SECRET = "hook-secret";
});
afterEach(() => {
  _resetRedisClient();
  vi.unstubAllGlobals();
});

describe("api/telegram", () => {
  it("connect requires a valid wallet signature", async () => {
    expect((await call(connect, { method: "GET" })).status).toBe(405);
    expect((await call(connect, { method: "POST", body: { wallet: W } })).status).toBe(401);
    const ok = await call(connect, { method: "POST", body: proof("connect") });
    expect(ok.status).toBe(200);
    expect((ok.body as { deepLink: string }).deepLink).toMatch(
      /^https:\/\/t\.me\/StormSaleBot\?start=/,
    );
  });

  it("settings reads status and only changes it with a signature", async () => {
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
    const muted = await call(settings, { method: "POST", body: proof("mute") });
    expect(muted.body).toMatchObject({ connected: true, muted: true });
    expect((await call(settings, { method: "DELETE" })).status).toBe(405);
  });

  it("webhook rejects requests without Telegram's secret header", async () => {
    expect((await call(webhook, { method: "POST", body: {} })).status).toBe(401);
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);
    const res = await call(webhook, {
      method: "POST",
      headers: { "x-telegram-bot-api-secret-token": "hook-secret" },
      body: { message: { chat: { id: 5, type: "private" }, text: "/start" } },
    });
    expect(res.status).toBe(200);
    expect(fetchMock.mock.calls[0][0]).toBe("https://api.telegram.org/bot123:secret/sendMessage");
    const group = await call(webhook, {
      method: "POST",
      headers: { "x-telegram-bot-api-secret-token": "hook-secret" },
      body: { message: { chat: { id: 6, type: "group" }, text: "/start" } },
    });
    expect(group.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("notify only alerts for successful transactions, once per hash", async () => {
    const hash = "a".repeat(64);
    data.set(linkKey(W), { chatId: "1", muted: false, connectedAt: "t" });
    const fetchMock = vi.fn(async (url: string) =>
      url.includes("horizon")
        ? { ok: true, json: async () => ({ successful: url.endsWith(hash) }) }
        : { ok: true },
    );
    vi.stubGlobal("fetch", fetchMock);
    const body = { affiliateWallet: W, txHash: hash, campaignName: "Spring", saleAmount: "10" };
    expect(
      (await call(notify, { method: "POST", body: { ...body, saleAmount: "ten" } })).status,
    ).toBe(400);
    expect(
      (await call(notify, { method: "POST", body: { ...body, txHash: "b".repeat(64) } })).status,
    ).toBe(422);
    expect(
      (await call(notify, { method: "POST", body: { ...body, txHash: "nothex" } })).status,
    ).toBe(422);
    expect((await call(notify, { method: "POST", body })).body).toEqual({ outcome: "sent" });
    expect((await call(notify, { method: "POST", body })).body).toEqual({ outcome: "duplicate" });
  });
});
