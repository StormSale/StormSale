import { describe, expect, it } from "vitest";
import {
  readStormSaleReferralCookie,
  stormsaleMiddleware,
  withStormSaleReferral,
} from "./index.js";

/**
 * Helper to construct a Request object with an optional Cookie header for testing.
 *
 * @param url - Request URL string.
 * @param cookie - Optional Cookie header value.
 * @returns Initialized Request object.
 */
function createRequest(url: string, cookie?: string): Request {
  return new Request(url, {
    headers: cookie ? { cookie } : undefined,
  });
}

describe("@stormsale/next-middleware", () => {
  it("extracts the existing `ref` query parameter and sets the attribution cookie", () => {
    const response = new Response(null);

    stormsaleMiddleware(
      createRequest("https://stormsale.xyz/c/campaign-123?ref=GABC123_xyz"),
      response,
    );

    expect(response.headers.get("set-cookie")).toContain("__stormsale_ref=GABC123_xyz");
  });

  it.each(["", "contains space", "x".repeat(65), "ref;bad=value"])(
    "ignores invalid referral tokens: %s",
    (referral) => {
      const response = new Response(null);
      const request = createRequest(
        `https://stormsale.xyz/c/campaign-123?ref=${encodeURIComponent(referral)}`,
      );

      expect(stormsaleMiddleware(request, response)).toBe(response);
      expect(response.headers.has("set-cookie")).toBe(false);
    },
  );

  it("sets HttpOnly, Secure, SameSite=Lax, Path, and Max-Age cookie attributes", () => {
    const response = new Response(null);

    stormsaleMiddleware(
      createRequest("https://stormsale.xyz/c/campaign-123?ref=affiliate_123"),
      response,
      { maxAge: 3600, domain: ".stormsale.xyz" },
    );

    const cookie = response.headers.get("set-cookie");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("Secure");
    expect(cookie).toContain("SameSite=Lax");
    expect(cookie).toContain("Path=/");
    expect(cookie).toContain("Max-Age=3600");
    expect(cookie).toContain("Domain=.stormsale.xyz");
  });

  it("preserves an existing valid attribution cookie by default", () => {
    const response = new Response(null);

    stormsaleMiddleware(
      createRequest(
        "https://stormsale.xyz/c/campaign-123?ref=new-affiliate",
        "__stormsale_ref=existing-affiliate",
      ),
      response,
    );

    expect(response.headers.has("set-cookie")).toBe(false);
  });

  it("replaces an existing cookie when configured to overwrite", () => {
    const response = new Response(null);

    stormsaleMiddleware(
      createRequest(
        "https://stormsale.xyz/c/campaign-123?ref=new-affiliate",
        "__stormsale_ref=existing-affiliate",
      ),
      response,
      { overwriteExisting: true },
    );

    expect(response.headers.get("set-cookie")).toContain("__stormsale_ref=new-affiliate");
  });

  it("passes non-referral requests through without changing their response", () => {
    const response = new Response("unchanged", { status: 202 });

    expect(
      stormsaleMiddleware(createRequest("https://stormsale.xyz/c/campaign-123"), response),
    ).toBe(response);
    expect(response.status).toBe(202);
    expect(response.headers.has("set-cookie")).toBe(false);
  });

  it("composes with an existing middleware handler and preserves its response", async () => {
    const originalResponse = new Response("middleware response", { status: 201 });
    const middleware = withStormSaleReferral(() => originalResponse);

    const response = await middleware(
      createRequest("https://stormsale.xyz/c/campaign-123?ref=affiliate-123"),
    );

    expect(response).toBe(originalResponse);
    expect(response.status).toBe(201);
    expect(await response.text()).toBe("middleware response");
    expect(response.headers.get("set-cookie")).toContain("__stormsale_ref=affiliate-123");
  });

  it("handles void or undefined returning handlers by creating a continue response", async () => {
    let handlerCalled = false;
    const middleware = withStormSaleReferral(() => {
      handlerCalled = true;
    });

    const response = await middleware(
      createRequest("https://stormsale.xyz/c/campaign-123?ref=affiliate-123"),
    );

    expect(handlerCalled).toBe(true);
    expect(response.headers.get("x-middleware-next")).toBe("1");
    expect(response.headers.get("set-cookie")).toContain("__stormsale_ref=affiliate-123");
  });

  it("forwards extra arguments such as event to the wrapped handler", async () => {
    let capturedEvent: unknown;
    const mockEvent = { waitUntil: () => {} };
    const middleware = withStormSaleReferral((_req: Request, event: typeof mockEvent) => {
      capturedEvent = event;
      return new Response("ok");
    });

    const request = createRequest("https://stormsale.xyz/c/campaign-123?ref=affiliate-123");
    await middleware(request, mockEvent);

    expect(capturedEvent).toBe(mockEvent);
  });

  it("returns the validated referral from headers and a Next.js cookie store", () => {
    expect(readStormSaleReferralCookie("__stormsale_ref=affiliate-123; theme=dark")).toBe(
      "affiliate-123",
    );
    expect(
      readStormSaleReferralCookie({
        get: (name) => (name === "__stormsale_ref" ? { value: "affiliate-123" } : undefined),
      }),
    ).toBe("affiliate-123");
    expect(readStormSaleReferralCookie("__stormsale_ref=invalid%20value")).toBeNull();
  });

  it("passes through unchanged if option processing fails", () => {
    const response = new Response(null);
    const matcher = () => {
      throw new Error("matcher failed");
    };

    expect(
      stormsaleMiddleware(
        createRequest("https://stormsale.xyz/c/campaign-123?ref=affiliate-123"),
        response,
        { matcher },
      ),
    ).toBe(response);
    expect(response.headers.has("set-cookie")).toBe(false);
  });

  it("handles 1,000 referral requests in under 5ms per request", () => {
    const request = createRequest("https://stormsale.xyz/c/campaign-123?ref=affiliate-123");
    const iterations = 1_000;
    const startedAt = performance.now();

    for (let index = 0; index < iterations; index += 1) {
      stormsaleMiddleware(request, new Response(null));
    }

    const millisecondsPerRequest = (performance.now() - startedAt) / iterations;
    expect(millisecondsPerRequest).toBeLessThan(5);
  });
});
