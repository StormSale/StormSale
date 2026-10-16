import { readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";

const source = readFileSync(new URL("../public/stormsale.js", import.meta.url), "utf8");

function loadSdk(search = "", endpoint = "https://merchant.example/conversions") {
  const cookies = new Map<string, string>();
  const writes: string[] = [];
  const events: { type: string; detail: unknown }[] = [];
  const fetch = vi.fn().mockResolvedValue({ ok: true });
  const document = {
    currentScript: { getAttribute: (name: string) => (name === "data-endpoint" ? endpoint : null) },
    dispatchEvent: (event: { type: string; detail: unknown }) => events.push(event),
    get cookie() {
      return Array.from(cookies, ([name, value]) => `${name}=${value}`).join("; ");
    },
    set cookie(value: string) {
      writes.push(value);
      const [pair, ...attributes] = value.split(";");
      const [name, cookieValue] = pair.split("=", 2);
      const domain = attributes.find((attribute) => attribute.trim().startsWith("Domain="));
      if (domain?.trim() === "Domain=com") return;
      if (attributes.some((attribute) => attribute.trim() === "Max-Age=0")) {
        cookies.delete(name);
      } else {
        cookies.set(name, cookieValue);
      }
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
    fetch: typeof fetch;
    stormsale?: {
      trackConversion: (conversion: { orderId: string; amount: number }) => Promise<unknown>;
    };
  } = {
    location: { hostname: "shop.example.com", protocol: "https:", search },
    CustomEvent: MockCustomEvent,
    fetch,
  };

  function loadPage(hostname: string, pageSearch: string) {
    window.location.hostname = hostname;
    window.location.search = pageSearch;
    runInNewContext(source, {
      window,
      document,
      URLSearchParams,
      encodeURIComponent,
      decodeURIComponent,
    });
    return window.stormsale!;
  }

  loadPage(window.location.hostname, search);
  return { window, document, cookies, writes, events, fetch, loadPage };
}

describe("StormSale tracking tag", () => {
  it("stays under 5KB gzipped", () => {
    expect(gzipSync(source).byteLength).toBeLessThan(5 * 1024);
  });

  it("stores referral attribution in a 30-day cookie shared by subdomains", () => {
    const { cookies, writes } = loadSdk("?ref=GABC123");
    expect(decodeURIComponent(cookies.get("_stormsale_ref") ?? "")).toBe("GABC123");
    expect(writes.some((write) => write.includes("Domain=example.com"))).toBe(true);
    expect(writes.some((write) => write.includes("Max-Age=2592000"))).toBe(true);
  });

  it("keeps referral attribution available on a sibling subdomain", async () => {
    const { loadPage, events, fetch } = loadSdk("?ref=GABC123", "");
    const checkoutSdk = loadPage("checkout.example.com", "");
    const result = await checkoutSdk.trackConversion({ orderId: "order-8", amount: 12 });

    expect(result).toEqual({ orderId: "order-8", amount: 12, referral: "GABC123" });
    expect(fetch).not.toHaveBeenCalled();
    expect(events[0]).toMatchObject({ type: "stormsale:conversion", detail: result });
  });

  it("preserves the stored referral and sends conversion details to the configured endpoint", async () => {
    const { window, events, fetch } = loadSdk("?ref=GABC123");
    const result = await window.stormsale!.trackConversion({ orderId: "order-7", amount: 42.5 });

    expect(result).toEqual({ orderId: "order-7", amount: 42.5, referral: "GABC123" });
    expect(fetch).toHaveBeenCalledWith(
      "https://merchant.example/conversions",
      expect.objectContaining({ method: "POST", keepalive: true }),
    );
    expect(events[0]).toMatchObject({ type: "stormsale:conversion", detail: result });
  });

  it("rejects invalid conversion amounts", async () => {
    const { window } = loadSdk();
    await expect(
      window.stormsale!.trackConversion({ orderId: "order-7", amount: 0 }),
    ).rejects.toThrow("amount greater than zero");
  });
});
