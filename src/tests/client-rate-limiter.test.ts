import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";
import {
  TokenBucket,
  RateLimiterRegistry,
  RateLimiterInterceptor,
  type RateLimitNotification,
} from "../lib/rateLimiter";
import { RateLimitCountdownModal } from "../components/shared/RateLimitCountdownModal";

describe("Client Rate Limiter & Burst Request Backoff Interceptor Suite (#472)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  // =========================================================================
  // Criterion 1: Token-bucket algorithm limiting requests to max 10 calls/s
  // =========================================================================
  describe("1. Token-Bucket Algorithm (Max 10 calls/sec per endpoint)", () => {
    it("initializes with default capacity of 10 tokens", () => {
      const bucket = new TokenBucket();
      expect(bucket.capacity).toBe(10);
      expect(bucket.refillRate).toBe(10);
      expect(bucket.getAvailableTokens()).toBe(10);
    });

    it("allows a burst of up to 10 consecutive calls immediately", () => {
      const bucket = new TokenBucket();

      for (let i = 0; i < 10; i++) {
        const allowed = bucket.tryConsume(1);
        expect(allowed).toBe(true);
      }

      expect(bucket.getAvailableTokens()).toBe(0);
    });

    it("throttles and refuses the 11th call when burst capacity is exhausted", () => {
      const bucket = new TokenBucket();

      // Consume 10 allowed tokens
      for (let i = 0; i < 10; i++) {
        expect(bucket.tryConsume(1)).toBe(true);
      }

      // 11th call within the same second must be rejected
      const eleventhAllowed = bucket.tryConsume(1);
      expect(eleventhAllowed).toBe(false);
      expect(bucket.getAvailableTokens()).toBe(0);
    });

    it("continuously refills tokens over time at 10 tokens per second", () => {
      let currentTime = 1_000_000;
      const bucket = new TokenBucket({
        capacity: 10,
        refillRate: 10,
        now: () => currentTime,
      });

      // Drain all 10 tokens
      for (let i = 0; i < 10; i++) {
        bucket.tryConsume(1);
      }
      expect(bucket.getAvailableTokens()).toBe(0);

      // Advance by 500ms -> should refill 5 tokens
      currentTime += 500;
      expect(bucket.getAvailableTokens()).toBe(5);

      // Advance another 500ms -> should refill remaining 5 tokens up to capacity (10)
      currentTime += 500;
      expect(bucket.getAvailableTokens()).toBe(10);

      // Advancing further does not exceed capacity
      currentTime += 2000;
      expect(bucket.getAvailableTokens()).toBe(10);
    });

    it("correctly calculates wait time in milliseconds for needed tokens", () => {
      let currentTime = 1000;
      const bucket = new TokenBucket({
        capacity: 10,
        refillRate: 10,
        now: () => currentTime,
      });

      // Drain completely
      for (let i = 0; i < 10; i++) {
        bucket.tryConsume(1);
      }

      // Waiting for 1 token at 10 tokens/sec takes 100ms
      expect(bucket.getWaitTimeMs(1)).toBe(100);
      // Waiting for 5 tokens takes 500ms
      expect(bucket.getWaitTimeMs(5)).toBe(500);
    });

    it("isolates rate limiting counters across separate endpoints", () => {
      const registry = new RateLimiterRegistry({ capacity: 10, refillRate: 10 });
      const endpointClick = "/api/custom-links/click";
      const endpointConversion = "/api/conversions";

      // Exhaust tokens on click endpoint
      for (let i = 0; i < 10; i++) {
        expect(registry.tryConsume(endpointClick, 1)).toBe(true);
      }
      expect(registry.tryConsume(endpointClick, 1)).toBe(false);

      // Conversion endpoint remains completely unaffected and allows full burst
      for (let i = 0; i < 10; i++) {
        expect(registry.tryConsume(endpointConversion, 1)).toBe(true);
      }
      expect(registry.tryConsume(endpointConversion, 1)).toBe(false);
    });
  });

  // =========================================================================
  // Criterion 2: HTTP 429 response triggers user countdown modal ("Please wait 4s")
  // =========================================================================
  describe("2. HTTP 429 Too Many Requests & User Countdown Modal Trigger", () => {
    it("intercepts HTTP 429 response and extracts Retry-After header", async () => {
      let notifiedEvent: RateLimitNotification | null = null;
      const mockFetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: "Too many requests" }), {
          status: 429,
          headers: { "Retry-After": "4" },
        }),
      );

      const interceptor = new RateLimiterInterceptor({
        fetchFn: mockFetch,
        autoQueue: false,
        onRateLimit: (event) => {
          notifiedEvent = event;
        },
      });

      const res = await interceptor.fetch("/api/custom-links/click");
      expect(res.status).toBe(429);
      expect(notifiedEvent).not.toBeNull();
      const event = notifiedEvent as unknown as RateLimitNotification;
      expect(event.endpoint).toBe("/api/custom-links/click");
      expect(event.retryAfterSeconds).toBe(4);
      expect(event.message).toBe("Please wait 4s");
    });

    it("falls back to default 4s countdown when Retry-After header is missing or non-numeric", async () => {
      let notifiedEvent: RateLimitNotification | null = null;
      const mockFetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: "Rate limit exceeded" }), {
          status: 429,
        }),
      );

      const interceptor = new RateLimiterInterceptor({
        fetchFn: mockFetch,
        defaultBackoffSeconds: 4,
        autoQueue: false,
        onRateLimit: (event) => {
          notifiedEvent = event;
        },
      });

      await interceptor.fetch("/api/payouts/claim");
      expect(notifiedEvent).not.toBeNull();
      const event = notifiedEvent as unknown as RateLimitNotification;
      expect(event.retryAfterSeconds).toBe(4);
      expect(event.message).toBe("Please wait 4s");
    });

    it("triggers countdown notification when client-side burst limit is breached", async () => {
      const notifications: RateLimitNotification[] = [];
      const mockFetch = vi.fn().mockResolvedValue(new Response("ok", { status: 200 }));

      const interceptor = new RateLimiterInterceptor({
        fetchFn: mockFetch,
        capacity: 10,
        refillRate: 10,
        autoQueue: false,
        onRateLimit: (ev) => notifications.push(ev),
      });

      // 10 successful requests
      for (let i = 0; i < 10; i++) {
        await interceptor.fetch("/api/referral/click");
      }
      expect(notifications.length).toBe(0);

      // 11th request triggers rate limit notification
      const res = await interceptor.fetch("/api/referral/click");
      expect(res.status).toBe(429);
      expect(notifications.length).toBe(1);
      expect(notifications[0].source).toBe("client_burst");
      expect(notifications[0].message).toMatch(/Please wait \d+s/);
    });

    it("renders RateLimitCountdownModal with 'Please wait 4s' message and countdown testid", () => {
      const html = renderToString(
        React.createElement(RateLimitCountdownModal, {
          isOpen: true,
          retryAfterSeconds: 4,
          endpoint: "/api/custom-links/click",
          message: "Please wait 4s",
        }),
      );

      expect(html).toContain("Rate Limit Exceeded");
      expect(html).toContain("Please wait 4s");
      expect(html).toContain("data-testid=\"rate-limit-modal\"");
      expect(html).toContain("data-testid=\"rate-limit-countdown\"");
    });
  });

  // =========================================================================
  // Criterion 3: Automatic queueing and re-dispatch of throttled requests
  // =========================================================================
  describe("3. Automatic Queueing and Re-Dispatch After Backoff Elapses", () => {
    it("automatically queues throttled request on HTTP 429 and re-dispatches after backoff timer", async () => {
      let callCount = 0;
      let rateLimitResolved = false;

      const mockFetch = vi.fn().mockImplementation(async () => {
        callCount++;
        if (callCount === 1) {
          // First call: returns 429 with 4s backoff
          return new Response(JSON.stringify({ error: "Throttled" }), {
            status: 429,
            headers: { "Retry-After": "4" },
          });
        }
        // Second call (after re-dispatch): succeeds with 200 OK
        return new Response(JSON.stringify({ success: true, call: callCount }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      });

      const interceptor = new RateLimiterInterceptor({
        fetchFn: mockFetch,
        autoQueue: true,
        onRateLimitResolved: () => {
          rateLimitResolved = true;
        },
      });

      // Dispatch request
      const requestPromise = interceptor.fetch("/api/custom-links/click");

      // Initially only 1 call made, and request is queued
      await vi.advanceTimersByTimeAsync(10);
      expect(callCount).toBe(1);
      expect(rateLimitResolved).toBe(false);

      // Fast-forward backoff timer by 4,000 ms (4 seconds)
      await vi.advanceTimersByTimeAsync(4000);

      const response = await requestPromise;
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.call).toBe(2);
      expect(callCount).toBe(2);
      expect(rateLimitResolved).toBe(true);
    });

    it("queues rapid-fire client requests exceeding 10 calls/s and drains them cleanly", async () => {
      let successfulCalls = 0;
      const mockFetch = vi.fn().mockImplementation(async () => {
        successfulCalls++;
        return new Response(JSON.stringify({ ok: true, id: successfulCalls }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      });

      const interceptor = new RateLimiterInterceptor({
        fetchFn: mockFetch,
        capacity: 10,
        refillRate: 10,
        autoQueue: true,
      });

      const promises: Promise<Response>[] = [];

      // Fire 15 requests simultaneously
      for (let i = 0; i < 15; i++) {
        promises.push(interceptor.fetch("/api/burst-target"));
      }

      // First 10 calls succeed immediately
      await vi.advanceTimersByTimeAsync(10);
      expect(successfulCalls).toBe(10);

      // 5 requests are queued waiting for tokens
      // Advance by 1 second so bucket refills 10 tokens and drains queue
      await vi.advanceTimersByTimeAsync(1000);

      const results = await Promise.all(promises);
      expect(results.length).toBe(15);
      expect(successfulCalls).toBe(15);
      results.forEach((res) => {
        expect(res.status).toBe(200);
      });
    });

    it("respects maxQueueSize and rejects requests when queue is flooded", async () => {
      const mockFetch = vi.fn().mockResolvedValue(
        new Response("429", { status: 429, headers: { "Retry-After": "10" } }),
      );

      const interceptor = new RateLimiterInterceptor({
        fetchFn: mockFetch,
        autoQueue: true,
        maxQueueSize: 2,
      });

      // First call triggers 10s backoff
      const p1 = interceptor.fetch("/api/limited");
      await vi.advanceTimersByTimeAsync(10);

      // Add 2 queued requests (filling queue)
      const p2 = interceptor.fetch("/api/limited");
      const p3 = interceptor.fetch("/api/limited");

      // 3rd queued request exceeds maxQueueSize=2
      await expect(interceptor.fetch("/api/limited")).rejects.toThrow(
        /Rate limit queue capacity reached/,
      );

      // Clean up queued promises
      interceptor.clear();
      await Promise.allSettled([p1, p2, p3]);
    });
  });
});
