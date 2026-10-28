import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { Keypair } from "@stellar/stellar-sdk";
import {
  createCustomShortLink,
  getCustomLinkBySlug,
  resetCustomLinksStore,
  saveCustomLinks,
} from "../lib/customLinks";
import { ShortLinkRedirect } from "../components/affiliate/ShortLinkRedirect";

const dispatchTrackingBeaconMock = vi.hoisted(() => vi.fn());

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    useEffect: (effect: () => void | (() => void)) => {
      const cleanup = effect();
      if (cleanup) cleanup();
      effect();
    },
    useMemo: (factory: () => unknown) => factory(),
    useRef: (current: unknown) => ({ current }),
    useState: (initial: unknown) => [initial, vi.fn()],
  };
});

vi.mock("../lib/customLinks", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/customLinks")>()),
  dispatchTrackingBeacon: dispatchTrackingBeaconMock,
}));

function getTextContent(node: unknown): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(getTextContent).join("");
  if (node && typeof node === "object" && "props" in node) {
    return getTextContent((node as { props: { children?: unknown } }).props.children);
  }
  return "";
}

describe("ShortLinkRedirect", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    resetCustomLinksStore();
    dispatchTrackingBeaconMock.mockClear();
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/api/custom-links/register") && init?.method === "POST") {
        const body = JSON.parse((init?.body as string) ?? "{}");
        const link = {
          id: `csl_${Date.now()}_test`,
          slug: body.slug,
          affiliateWallet: body.affiliateWallet ?? "",
          walletFingerprint: body.walletFingerprint ?? "",
          campaignId: body.campaignId ?? "1",
          campaignName: body.campaignName ?? `Campaign #${body.campaignId}`,
          destinationUrl: body.destinationUrl ?? "",
          trackingParams: body.trackingParams ?? {},
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          clickCount: 0,
        };
        return new Response(JSON.stringify(link), { status: 201 });
      }
      return new Response(JSON.stringify({ error: "Not Found" }), { status: 404 });
    }) as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.useRealTimers();
    vi.unstubAllGlobals();
    resetCustomLinksStore();
  });

  it("renders a not-found view for an unknown slug", () => {
    const view = ShortLinkRedirect({ customSlug: "unknown-slug" });

    expect(getTextContent(view)).toContain("Short Link Not Found");
  });

  it("does not expose an unsafe stored destination as a redirect link", async () => {
    const link = await createCustomShortLink({
      slug: "unsafe-destination",
      affiliateWallet: Keypair.random().publicKey(),
      campaignId: "16",
      destinationUrl: "https://merchant.example.com/product",
    });
    saveCustomLinks([{ ...link, destinationUrl: "javascript:alert(1)" }]);

    const view = ShortLinkRedirect({ customSlug: link.slug });

    expect(getTextContent(view)).toContain("Short Link Not Found");
    expect(getTextContent(view)).not.toContain("javascript:");
  });

  it("redirects to the resolved destination and dispatches one tracking beacon", async () => {
    const link = await createCustomShortLink({
      slug: "redirect-test",
      affiliateWallet: Keypair.random().publicKey(),
      campaignId: "15",
      destinationUrl: "https://merchant.example.com/product",
    });
    const replace = vi.fn();
    vi.stubGlobal("window", {
      location: {
        pathname: "/c/redirect-test",
        search: "?subid=visitor-123",
        replace,
      },
    });
    vi.useFakeTimers();

    ShortLinkRedirect({ customSlug: link.slug });
    await vi.advanceTimersByTimeAsync(1200);

    expect(dispatchTrackingBeaconMock).toHaveBeenCalledTimes(1);
    expect(getCustomLinkBySlug(link.slug)?.clickCount).toBe(1);
    expect(replace).toHaveBeenCalledWith(
      expect.stringContaining("https://merchant.example.com/product?"),
    );
    expect(replace.mock.calls[0][0]).toContain("subid=visitor-123");
  });

  it("renders not-found for a path with malformed percent-encoding", () => {
    vi.stubGlobal("window", {
      location: {
        pathname: "/c/%E0%A4%A",
        search: "",
        replace: vi.fn(),
      },
    });

    expect(() => ShortLinkRedirect({})).not.toThrow();
    expect(getTextContent(ShortLinkRedirect({}))).toContain("Short Link Not Found");
  });
});
