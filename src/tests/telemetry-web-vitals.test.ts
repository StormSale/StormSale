import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { VercelRequest, VercelResponse } from "@vercel/node";

const mocks = vi.hoisted(() => ({
  getRedisClient: vi.fn(),
  pipeline: {
    hincrby: vi.fn(),
    hincrbyfloat: vi.fn(),
    expire: vi.fn(),
    exec: vi.fn(),
  },
  redis: {
    pipeline: vi.fn(),
    hgetall: vi.fn(),
  },
}));

vi.mock("../../api/_lib/redis", () => ({ getRedisClient: mocks.getRedisClient }));

import handler from "../../api/telemetry/web-vitals";

interface ResponseState {
  status: number;
  body: unknown;
  headers: Record<string, string>;
}

function createResponse(): { res: VercelResponse; state: ResponseState } {
  const state: ResponseState = { status: 0, body: undefined, headers: {} };
  const res = {
    setHeader: vi.fn((name: string, value: string) => {
      state.headers[name] = value;
      return res;
    }),
    status: vi.fn((status: number) => {
      state.status = status;
      return res;
    }),
    json: vi.fn((body: unknown) => {
      state.body = body;
      return res;
    }),
    end: vi.fn(() => res),
  };
  return { res: res as unknown as VercelResponse, state };
}

function createRequest(
  method: string,
  options: {
    body?: unknown;
    headers?: Record<string, string | string[] | undefined>;
    query?: Record<string, string | string[]>;
  } = {},
): VercelRequest {
  return {
    method,
    body: options.body,
    headers: options.headers ?? {},
    query: options.query ?? {},
  } as unknown as VercelRequest;
}

const validPayload = {
  name: "LCP",
  value: 2500,
  rating: "good",
  deviceType: "desktop",
  viewportCategory: "wide",
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-24T12:15:00.000Z"));
  vi.clearAllMocks();
  mocks.redis.pipeline.mockReturnValue(mocks.pipeline);
  mocks.pipeline.hincrby.mockReturnValue(mocks.pipeline);
  mocks.pipeline.hincrbyfloat.mockReturnValue(mocks.pipeline);
  mocks.pipeline.expire.mockReturnValue(mocks.pipeline);
  mocks.pipeline.exec.mockResolvedValue([]);
  mocks.redis.hgetall.mockResolvedValue({});
  mocks.getRedisClient.mockReturnValue(mocks.redis);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("Web Vitals aggregate API", () => {
  it("stores anonymous count and sum fields in an expiring hourly bucket", async () => {
    const { res, state } = createResponse();
    await handler(
      createRequest("POST", {
        body: JSON.stringify(validPayload),
        headers: { "content-type": "application/json; charset=utf-8" },
      }),
      res,
    );

    const key = "rum:web-vitals:2026-11-24T12";
    expect(state.status).toBe(204);
    expect(mocks.pipeline.hincrby).toHaveBeenCalledWith(key, "LCP|desktop|wide|good|count", 1);
    expect(mocks.pipeline.hincrbyfloat).toHaveBeenCalledWith(
      key,
      "LCP|desktop|wide|good|sum",
      2500,
    );
    expect(mocks.pipeline.expire).toHaveBeenCalledWith(key, 8 * 24 * 60 * 60);
    expect(state.headers["Cache-Control"]).toBe("no-store");
    expect(state.headers.Vary).toBe("DNT, Sec-GPC");
  });

  it.each([{ dnt: "1" }, { "sec-gpc": "1" }, { dnt: ["0", "1"] }])(
    "does not touch Redis when privacy headers are present: %j",
    async (headers) => {
      const { res, state } = createResponse();
      await handler(createRequest("POST", { body: validPayload, headers }), res);
      expect(state.status).toBe(204);
      expect(mocks.getRedisClient).not.toHaveBeenCalled();
    },
  );

  it("rejects wallet addresses and any unexpected payload fields", async () => {
    const { res, state } = createResponse();
    await handler(
      createRequest("POST", {
        body: { ...validPayload, walletAddress: "GABC123456789" },
        headers: { "content-type": "application/json" },
      }),
      res,
    );
    expect(state.status).toBe(400);
    expect(mocks.getRedisClient).not.toHaveBeenCalled();
  });

  it.each([
    ["text/plain", validPayload],
    ["application/json", "{not-json"],
    ["application/json", "x".repeat(2049)],
    ["application/json", { ...validPayload, value: -1 }],
    ["application/json", { ...validPayload, name: "FCP" }],
  ])("rejects invalid content type or body", async (contentType, body) => {
    const { res, state } = createResponse();
    await handler(createRequest("POST", { body, headers: { "content-type": contentType } }), res);
    expect([400, 415]).toContain(state.status);
    expect(mocks.getRedisClient).not.toHaveBeenCalled();
  });

  it("returns grouped averages and rating percentages across hourly buckets", async () => {
    mocks.redis.hgetall.mockImplementation(async (key: string) =>
      key.endsWith("T12")
        ? {
            "CLS|mobile|compact|good|count": "1",
            "CLS|mobile|compact|good|sum": "0.1",
            "CLS|mobile|compact|poor|count": "3",
            "CLS|mobile|compact|poor|sum": "0.6",
            malformed: "10",
          }
        : {},
    );
    const { res, state } = createResponse();
    await handler(createRequest("GET", { query: { hours: "2" } }), res);

    expect(state.status).toBe(200);
    expect(state.body).toMatchObject({
      from: "2026-11-24T11:00:00.000Z",
      to: "2026-11-24T13:00:00.000Z",
      metrics: [
        {
          name: "CLS",
          deviceType: "mobile",
          viewportCategory: "compact",
          rating: "good",
          count: 1,
          averageValue: 0.1,
          contextCount: 4,
          ratingPercentage: 25,
        },
        {
          rating: "poor",
          count: 3,
          averageValue: 0.2,
          contextCount: 4,
          ratingPercentage: 75,
        },
      ],
    });
  });

  it.each(["0", "169", "1.5", "abc", ["1", "2"]])(
    "rejects invalid aggregate windows: %j",
    async (hours) => {
      const { res, state } = createResponse();
      await handler(createRequest("GET", { query: { hours } }), res);
      expect(state.status).toBe(400);
      expect(mocks.getRedisClient).not.toHaveBeenCalled();
    },
  );

  it("rejects unsupported methods and advertises allowed methods", async () => {
    const { res, state } = createResponse();
    await handler(createRequest("PUT"), res);
    expect(state.status).toBe(405);
    expect(state.headers.Allow).toBe("GET, POST");
  });

  it("returns a controlled error when aggregate storage fails", async () => {
    mocks.pipeline.exec.mockRejectedValue(new Error("Redis unavailable"));
    const { res, state } = createResponse();
    await handler(
      createRequest("POST", {
        body: validPayload,
        headers: { "content-type": "application/json" },
      }),
      res,
    );
    expect(state.status).toBe(500);
    expect(state.body).toEqual({ error: "Unable to record Web Vitals." });
  });
});
