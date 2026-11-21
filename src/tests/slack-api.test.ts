// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../api/_lib/redis", () => ({
  getRedisClient: () => {
    throw new Error("Redis not configured in tests");
  },
}));

import handler, { _resetSlackMemoryBuckets } from "../../api/slack/notify";

const WEBHOOK = "https://hooks.slack.com/services/T000/B000/abc123";

function createRes() {
  const res: Record<string, unknown> = { headers: {} };
  res.setHeader = (key: string, value: string) => {
    (res.headers as Record<string, string>)[key] = value;
  };
  res.status = (code: number) => {
    res.statusCode = code;
    return res;
  };
  res.json = (body: unknown) => {
    res.body = body;
    return res;
  };
  return res as {
    headers: Record<string, string>;
    statusCode?: number;
    body?: unknown;
    setHeader: (key: string, value: string) => void;
    status: (code: number) => typeof res;
    json: (body: unknown) => typeof res;
  };
}

function createReq(body: unknown, method = "POST") {
  return {
    method,
    body,
    headers: { "x-forwarded-for": "203.0.113.9" },
    socket: { remoteAddress: "203.0.113.9" },
  };
}

const validAlert = {
  kind: "low-escrow",
  campaignId: "42",
  campaignName: "Tech Gadgets",
  currentBalanceXlm: 75,
  initialBudgetXlm: 1000,
  remainingPercent: 7.5,
  thresholdPercent: 20,
};

beforeEach(() => {
  _resetSlackMemoryBuckets();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("POST /api/slack/notify", () => {
  it("rejects non-POST requests", async () => {
    const res = createRes();
    await handler(createReq({}, "GET") as never, res as never);
    expect(res.statusCode).toBe(405);
    expect(res.headers.Allow).toBe("POST");
  });

  it("validates the webhook host and alert payload", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const badUrl = createRes();
    await handler(
      createReq({ webhookUrl: "https://evil.example/services/T/B/C", alert: validAlert }) as never,
      badUrl as never,
    );
    expect(badUrl.statusCode).toBe(400);

    const badAlert = createRes();
    await handler(
      createReq({ webhookUrl: WEBHOOK, alert: { kind: "low-escrow" } }) as never,
      badAlert as never,
    );
    expect(badAlert.statusCode).toBe(400);

    const missing = createRes();
    await handler(createReq(undefined) as never, missing as never);
    expect(missing.statusCode).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("forwards a Block Kit message to Slack", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });
    vi.stubGlobal("fetch", fetchMock);

    const res = createRes();
    await handler(createReq({ webhookUrl: WEBHOOK, alert: validAlert }) as never, res as never);

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ ok: true, delivered: true });
    expect(fetchMock).toHaveBeenCalledWith(WEBHOOK, expect.objectContaining({ method: "POST" }));
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.text).toContain("Tech Gadgets");
    expect(body.blocks.some((block: { type: string }) => block.type === "actions")).toBe(true);
  });

  it("accepts a JSON string body", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });
    vi.stubGlobal("fetch", fetchMock);

    const res = createRes();
    await handler(
      createReq(JSON.stringify({ webhookUrl: WEBHOOK, alert: validAlert })) as never,
      res as never,
    );
    expect(res.statusCode).toBe(200);
  });

  it("returns 502 when Slack rejects the message or the network fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 403, json: async () => ({}) }),
    );
    const rejected = createRes();
    await handler(
      createReq({ webhookUrl: WEBHOOK, alert: validAlert }) as never,
      rejected as never,
    );
    expect(rejected.statusCode).toBe(502);

    _resetSlackMemoryBuckets();
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("socket hang up")));
    const failed = createRes();
    await handler(
      createReq({
        webhookUrl: WEBHOOK,
        alert: { ...validAlert, campaignId: "43" },
      }) as never,
      failed as never,
    );
    expect(failed.statusCode).toBe(502);
  });

  it("throttles repeated alerts for the same campaign", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });
    vi.stubGlobal("fetch", fetchMock);

    const first = createRes();
    await handler(createReq({ webhookUrl: WEBHOOK, alert: validAlert }) as never, first as never);
    expect(first.statusCode).toBe(200);

    const second = createRes();
    await handler(createReq({ webhookUrl: WEBHOOK, alert: validAlert }) as never, second as never);
    expect(second.statusCode).toBe(429);
    expect(second.headers["Retry-After"]).toBe("300");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not cooldown test notifications", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });
    vi.stubGlobal("fetch", fetchMock);
    const testAlert = { kind: "test", campaignId: "test" };

    for (let i = 0; i < 2; i++) {
      const res = createRes();
      await handler(createReq({ webhookUrl: WEBHOOK, alert: testAlert }) as never, res as never);
      expect(res.statusCode).toBe(200);
    }
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
