import { describe, expect, it, vi } from "vitest";
import source from "../../public/stormsale.js?raw";

// A genuinely valid Ed25519 Stellar public key (StrKey, G...) used for referral attribution.
const validReferral = "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5";

type StoredCookie = { value: string; domain: string; hostOnly: boolean };
type Conversion = { orderId: string; amount: number };
type SdkApi = { trackConversion: (conversion: Conversion) => Promise<unknown> };
type FetchInit = { method?: string; keepalive?: boolean; signal?: AbortSignal };
type FetchResponse = { ok: boolean };

// Evaluate the tag exactly as a browser <script> would: an IIFE receiving its globals.
const runSdk = new Function("window", "document", "URLSearchParams", source);

async function gzipSize(value: string) {
  const stream = new Blob([value]).stream().pipeThrough(new CompressionStream("gzip"));
  return (await new Response(stream).arrayBuffer()).byteLength;
}

function loadSdk(search = "", endpoint = "https://merchant.example/conversions") {
  const cookies = new Map<string, StoredCookie>();
  const writes: string[] = [];
  const events: { type: string; detail: unknown }[] = [];
  const fetchMock = vi.fn<(url: string, init: FetchInit) => Promise<FetchResponse>>(async () => ({
    ok: true,
  }));
  let hostname = "shop.example.com";

  // Model the browser: a cookie is readable only from a host allowed by its domain scope.
  function visibleTo(host: string, cookie: StoredCookie) {
    if (cookie.hostOnly) return host === cookie.domain;
    return host === cookie.domain || host.endsWith(`.${cookie.domain}`);
  }

  const document = {
    currentScript: { getAttribute: (name: string) => (name === "data-endpoint" ? endpoint : null) },
    dispatchEvent: (event: { type: string; detail: unknown }) => events.push(event),
    get cookie() {
      return Array.from(cookies)
        .filter(([, cookie]) => visibleTo(hostname, cookie))
        .map(([name, cookie]) => `${name}=${cookie.value}`)
        .join("; ");
    },
    set cookie(value: string) {
      writes.push(value);
      const [pair, ...attributes] = value.split(";");
      const separator = pair.indexOf("=");
      const name = pair.slice(0, separator);
      const cookieValue = pair.slice(separator + 1);
      const attribute = (key: string) =>
        attributes
          .map((part) => part.trim())
          .find((part) => part.toLowerCase().startsWith(`${key.toLowerCase()}=`))
          ?.slice(key.length + 1);

      const domainAttribute = attribute("Domain");
      const domain = (domainAttribute ?? hostname).replace(/^\./, "").toLowerCase();
      // Browsers refuse a Domain that is a bare public suffix (e.g. "com").
      if (domainAttribute && !domain.includes(".")) return;
      if (attribute("Max-Age") === "0") {
        cookies.delete(name);
        return;
      }
      cookies.set(name, { value: cookieValue, domain, hostOnly: !domainAttribute });
    },
  };

  class MockCustomEvent {
    type: string;
    detail: unknown;

    constructor(type: string, init: { detail: unknown }) {
      this.type = type;
      this.detail = init.detail;
    }
  }

  const window: {
    location: { hostname: string; protocol: string; search: string };
    CustomEvent: typeof MockCustomEvent;
    fetch: typeof fetchMock;
    AbortController: typeof AbortController;
    setTimeout: (handler: () => void, timeout?: number) => unknown;
    clearTimeout: (handle: unknown) => void;
    stormsale?: SdkApi;
  } = {
    location: { hostname, protocol: "https:", search },
    CustomEvent: MockCustomEvent,
    fetch: fetchMock,
    AbortController,
    setTimeout: (handler, timeout) => setTimeout(handler, timeout),
    clearTimeout: (handle) => clearTimeout(handle as Parameters<typeof clearTimeout>[0]),
  };

  function loadPage(host: string, pageSearch: string) {
    hostname = host;
    window.location.hostname = host;
    window.location.search = pageSearch;
    runSdk(window, document, URLSearchParams);
    return window.stormsale!;
  }

  loadPage(window.location.hostname, search);
  return { window, document, cookies, writes, events, fetch: fetchMock, loadPage };
}

describe("StormSale tracking tag", () => {
  it("stays under 5KB gzipped", async () => {
    expect(await gzipSize(source)).toBeLessThan(5 * 1024);
  });

  it("stores referral attribution in a 30-day cookie shared by subdomains", () => {
    const { cookies, writes } = loadSdk(`?ref=${validReferral}`);
    const stored = cookies.get("_stormsale_ref");

    expect(stored?.value).toBe(encodeURIComponent(validReferral));
    expect(stored?.domain).toBe("example.com");
    expect(stored?.hostOnly).toBe(false);
    expect(writes.some((write) => write.includes("Domain=example.com"))).toBe(true);
    expect(writes.some((write) => write.includes("Max-Age=2592000"))).toBe(true);
  });

  it("rejects malformed referrals instead of storing them", () => {
    const malformed = [
      "GABC123",
      `G${"A".repeat(55)}`,
      "SBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
    ];
    for (const referral of malformed) {
      const { cookies } = loadSdk(`?ref=${referral}`);
      expect(cookies.has("_stormsale_ref")).toBe(false);
    }
  });

  it("keeps referral attribution available on a sibling subdomain", async () => {
    const { loadPage, events, fetch } = loadSdk(`?ref=${validReferral}`, "");
    const checkoutSdk = loadPage("checkout.example.com", "");
    const result = await checkoutSdk.trackConversion({ orderId: "order-8", amount: 12 });

    expect(result).toEqual({ orderId: "order-8", amount: 12, referral: validReferral });
    expect(fetch).not.toHaveBeenCalled();
    expect(events[0]).toMatchObject({ type: "stormsale:conversion", detail: result });
  });

  it("does not leak a shared referral cookie to an unrelated domain suffix", async () => {
    const { loadPage } = loadSdk(`?ref=${validReferral}`, "");
    const outsiderSdk = loadPage("notexample.com", "");
    const result = await outsiderSdk.trackConversion({ orderId: "order-9", amount: 5 });

    expect(result).toEqual({ orderId: "order-9", amount: 5, referral: null });
  });

  it("ignores malformed referral cookies and still tracks the conversion", async () => {
    const { cookies, window } = loadSdk("", "");
    cookies.set("_stormsale_ref", {
      value: "%E0%A4%A",
      domain: "shop.example.com",
      hostOnly: true,
    });

    const result = await window.stormsale!.trackConversion({ orderId: "order-3", amount: 9 });

    expect(result).toEqual({ orderId: "order-3", amount: 9, referral: null });
  });

  it("preserves the stored referral and sends conversion details to the configured endpoint", async () => {
    const { window, events, fetch } = loadSdk(`?ref=${validReferral}`);
    const result = await window.stormsale!.trackConversion({ orderId: "order-7", amount: 42.5 });

    expect(result).toEqual({ orderId: "order-7", amount: 42.5, referral: validReferral });
    expect(fetch).toHaveBeenCalledWith(
      "https://merchant.example/conversions",
      expect.objectContaining({ method: "POST", keepalive: true }),
    );
    expect(events[0]).toMatchObject({ type: "stormsale:conversion", detail: result });
  });

  it("surfaces HTTP errors from the configured endpoint", async () => {
    const { window, fetch } = loadSdk(`?ref=${validReferral}`);
    fetch.mockResolvedValueOnce({ ok: false });

    await expect(
      window.stormsale!.trackConversion({ orderId: "order-1", amount: 1 }),
    ).rejects.toThrow("conversion request failed");
  });

  it("aborts and fails when the configured endpoint hangs", async () => {
    vi.useFakeTimers();
    try {
      const { window, fetch } = loadSdk(`?ref=${validReferral}`);
      const captured: { signal?: AbortSignal } = {};
      fetch.mockImplementation((_url, init) => {
        captured.signal = init.signal;
        return new Promise((_resolve, reject) => {
          init.signal?.addEventListener("abort", () => reject(new Error("aborted")));
        });
      });

      const pending = expect(
        window.stormsale!.trackConversion({ orderId: "order-2", amount: 3 }),
      ).rejects.toThrow("timed out");

      await vi.advanceTimersByTimeAsync(10000);
      await pending;

      expect(captured.signal?.aborted).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("rejects invalid conversion inputs", async () => {
    const { window } = loadSdk();

    await expect(window.stormsale!.trackConversion({ orderId: "", amount: 1 })).rejects.toThrow(
      "non-empty orderId",
    );
    await expect(
      window.stormsale!.trackConversion({ orderId: "order-7", amount: 0 }),
    ).rejects.toThrow("amount greater than zero");
  });
});
