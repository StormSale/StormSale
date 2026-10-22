/**
 * src/tests/custom-links.test.ts
 *
 * Unit tests for src/lib/customLinks.ts.
 *
 * All tests that exercise createCustomShortLink / deleteCustomShortLink /
 * fetchCustomLinkBySlug / fetchAllCustomLinks mock global fetch, because
 * those functions now call /api/custom-links/* Vercel serverless endpoints
 * backed by Upstash Redis. The mock simulates the server's atomic SET NX
 * uniqueness logic using a local Map so concurrent registration tests
 * remain meaningful.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  normalizeSlug,
  validateSlugFormat,
  computeWalletFingerprint,
  checkSlugAvailability,
  checkSlugAvailabilityRemote,
  createCustomShortLink,
  getCustomLinkBySlug,
  getAllCustomLinks,
  deleteCustomShortLink,
  buildDestinationRedirectUrl,
  buildTrackingHeaders,
  resolveShortLinkRedirect,
  resolveShortLinkRedirectAsync,
  getShortLinkUrl,
  resetCustomLinksStore,
  saveCustomLinks,
  fetchCustomLinkBySlug,
  fetchAllCustomLinks,
} from "../lib/customLinks";
import type { CustomShortLink } from "../types/affiliateLink";
import { Keypair } from "@stellar/stellar-sdk";

// ---------------------------------------------------------------------------
// Fetch mock: simulates Upstash Redis-backed serverless functions
// ---------------------------------------------------------------------------

/** In-memory slug store that mimics Redis SET NX behaviour */
const mockStore = new Map<string, CustomShortLink>();

/** Simulate a successful POST /api/custom-links/register response */
function makeRegisterHandler(store: Map<string, CustomShortLink>) {
  return async (input: Partial<CustomShortLink>): Promise<Response> => {
    const slug = (input.slug ?? "").toLowerCase().trim();
    if (!slug) {
      return new Response(JSON.stringify({ error: "Missing slug." }), { status: 400 });
    }
    if (store.has(slug)) {
      return new Response(
        JSON.stringify({
          error: `Slug '${slug}' is already registered by another affiliate.`,
          slug,
        }),
        { status: 409 },
      );
    }
    const link: CustomShortLink = {
      id: `csl_${Date.now()}_test`,
      slug,
      affiliateWallet: input.affiliateWallet ?? "",
      walletFingerprint: input.walletFingerprint ?? "",
      campaignId: input.campaignId ?? "1",
      campaignName: input.campaignName ?? `Campaign #${input.campaignId}`,
      destinationUrl: input.destinationUrl ?? "",
      trackingParams: input.trackingParams ?? {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      clickCount: 0,
    };
    store.set(slug, link);
    return new Response(JSON.stringify(link), { status: 201 });
  };
}

function makeResolveHandler(store: Map<string, CustomShortLink>) {
  return async (slug: string): Promise<Response> => {
    const link = store.get(slug.toLowerCase());
    if (!link) {
      return new Response(JSON.stringify({ error: `Slug '${slug}' not found.` }), { status: 404 });
    }
    const updated = { ...link, clickCount: link.clickCount + 1 };
    store.set(slug.toLowerCase(), updated);
    return new Response(JSON.stringify(updated), { status: 200 });
  };
}

function makeDeleteHandler(store: Map<string, CustomShortLink>) {
  return async (slug: string, wallet: string): Promise<Response> => {
    const link = store.get(slug.toLowerCase());
    if (!link) {
      return new Response(JSON.stringify({ error: `Slug '${slug}' not found.` }), { status: 404 });
    }
    if (link.affiliateWallet !== wallet) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 403 });
    }
    store.delete(slug.toLowerCase());
    return new Response(JSON.stringify({ deleted: true, slug }), { status: 200 });
  };
}

function makeListHandler(store: Map<string, CustomShortLink>) {
  return async (wallet: string): Promise<Response> => {
    const links = [...store.values()].filter((l) => l.affiliateWallet === wallet);
    return new Response(JSON.stringify(links), { status: 200 });
  };
}

function makeAvailabilityHandler(store: Map<string, CustomShortLink>) {
  return async (slug: string): Promise<Response> => {
    const exists = store.has(slug.toLowerCase());
    return new Response(JSON.stringify({ slug, available: !exists }), { status: 200 });
  };
}

// ---------------------------------------------------------------------------
// Setup: mock global fetch to route to mock handlers
// ---------------------------------------------------------------------------

const originalFetch = globalThis.fetch;

beforeEach(() => {
  mockStore.clear();
  resetCustomLinksStore();

  const registerHandler = makeRegisterHandler(mockStore);
  const availabilityHandler = makeAvailabilityHandler(mockStore);
  const resolveHandler = makeResolveHandler(mockStore);
  const deleteHandler = makeDeleteHandler(mockStore);
  const listHandler = makeListHandler(mockStore);

  globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    const urlObj = new URL(url, "http://localhost");

    if (urlObj.pathname === "/api/custom-links/register" && (init?.method ?? "GET") === "POST") {
      const body = JSON.parse((init?.body as string) ?? "{}");
      return registerHandler(body);
    }
    if (urlObj.pathname === "/api/custom-links/availability") {
      const slug = urlObj.searchParams.get("slug") ?? "";
      return availabilityHandler(slug);
    }
    if (urlObj.pathname === "/api/custom-links/resolve") {
      const slug = urlObj.searchParams.get("slug") ?? "";
      return resolveHandler(slug);
    }
    if (urlObj.pathname === "/api/custom-links/delete") {
      const slug = urlObj.searchParams.get("slug") ?? "";
      const wallet = urlObj.searchParams.get("wallet") ?? "";
      return deleteHandler(slug, wallet);
    }
    if (urlObj.pathname === "/api/custom-links/list") {
      const wallet = urlObj.searchParams.get("wallet") ?? "";
      return listHandler(wallet);
    }

    return new Response(JSON.stringify({ error: "Not Found" }), { status: 404 });
  }) as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

// ---------------------------------------------------------------------------

describe("Custom Short-Link Domain Routing & Cloaked URL Generator (Issue #159)", () => {
  const validStellarWallet = Keypair.random().publicKey();

  // --------------------------------------------------------------------------
  // 1. Slug Sanitization & Format Validation
  // --------------------------------------------------------------------------
  describe("Slug Sanitization & Validation", () => {
    it("normalizes and sanitizes user input slugs", () => {
      expect(normalizeSlug("  Tech Deals  ")).toBe("tech-deals");
      expect(normalizeSlug("Tech_Deals_2026")).toBe("tech-deals-2026");
      expect(normalizeSlug("CRYPTO--PROMO!!!")).toBe("crypto-promo");
      expect(normalizeSlug("-stellar-web3-")).toBe("stellar-web3");
    });

    it("rejects empty or whitespace-only slugs", () => {
      expect(validateSlugFormat("").valid).toBe(false);
      expect(validateSlugFormat("   ").valid).toBe(false);
    });

    it("starts with no fabricated production links when storage is empty", () => {
      expect(getAllCustomLinks()).toEqual([]);
    });

    it("rejects slugs that are too short (< 3 chars) or too long (> 50 chars)", () => {
      expect(validateSlugFormat("ab").valid).toBe(false);
      expect(validateSlugFormat("a".repeat(51)).valid).toBe(false);
      expect(validateSlugFormat("abc").valid).toBe(true);
    });

    it("rejects reserved protocol route slugs", () => {
      expect(validateSlugFormat("c").valid).toBe(false);
      expect(validateSlugFormat("api").valid).toBe(false);
      expect(validateSlugFormat("dashboard").valid).toBe(false);
      expect(validateSlugFormat("affiliate").valid).toBe(false);
      expect(validateSlugFormat("admin").valid).toBe(false);
      expect(validateSlugFormat("auth").valid).toBe(false);
    });

    it("accepts valid alphanumeric slugs with hyphens", () => {
      expect(validateSlugFormat("tech-deals").valid).toBe(true);
      expect(validateSlugFormat("black-friday-2026").valid).toBe(true);
      expect(validateSlugFormat("web3course").valid).toBe(true);
    });
  });

  // --------------------------------------------------------------------------
  // 2. Real-time Collision Detection
  // --------------------------------------------------------------------------
  describe("Real-Time Collision Detection", () => {
    it("reports unused slugs as available (format check)", () => {
      const result = checkSlugAvailability("unique-affiliate-slug-999");
      expect(result.isAvailable).toBe(true);
      expect(result.normalizedSlug).toBe("unique-affiliate-slug-999");
      expect(result.reason).toBeUndefined();
    });

    it("detects collisions against cached links (synchronous cache check)", async () => {
      await createCustomShortLink({
        slug: "tech-deals",
        affiliateWallet: validStellarWallet,
        campaignId: "1",
        destinationUrl: "https://merchant.example.com/tech",
      });

      const result = checkSlugAvailability("tech-deals");
      expect(result.isAvailable).toBe(false);
      expect(result.reason).toContain("already registered");
    });

    it("detects collisions case-insensitively", async () => {
      await createCustomShortLink({
        slug: "tech-deals",
        affiliateWallet: validStellarWallet,
        campaignId: "1",
        destinationUrl: "https://merchant.example.com/tech",
      });

      const result = checkSlugAvailability("TECH-DEALS");
      expect(result.isAvailable).toBe(false);
      expect(result.reason).toContain("already registered");
    });

    it("server rejects a duplicate slug with HTTP 409 (shared-store uniqueness)", async () => {
      await createCustomShortLink({
        slug: "shared-slug",
        affiliateWallet: validStellarWallet,
        campaignId: "1",
        destinationUrl: "https://merchant.example.com/shared",
      });

      // Bypass cache by clearing it, then try to register the same slug again
      resetCustomLinksStore();
      await expect(
        createCustomShortLink({
          slug: "shared-slug",
          affiliateWallet: validStellarWallet,
          campaignId: "1",
          destinationUrl: "https://other.example.com/path",
        }),
      ).rejects.toThrow("Slug 'shared-slug' is already registered by another affiliate.");
    });
  });

  // --------------------------------------------------------------------------
  // 3. Cryptographic Wallet Identifier Binding
  // --------------------------------------------------------------------------
  describe("Cryptographic Wallet Identifier Mapping", () => {
    it("computes a deterministic SHA-256 wallet fingerprint", async () => {
      const fp1 = await computeWalletFingerprint(validStellarWallet);
      const fp2 = await computeWalletFingerprint(validStellarWallet);

      expect(fp1).toBe(fp2);
      expect(fp1).toMatch(/^wf_[a-f0-9]{64}$/);
    });

    it("generates distinct fingerprints for different Stellar wallets", async () => {
      const wallet2 = Keypair.random().publicKey();
      const fp1 = await computeWalletFingerprint(validStellarWallet);
      const fp2 = await computeWalletFingerprint(wallet2);

      expect(fp1).not.toBe(fp2);
    });

    it("rejects creation if cryptographic wallet is invalid", async () => {
      await expect(
        createCustomShortLink({
          slug: "stellar-deals-101",
          affiliateWallet: "0xInvalidEthAddressNotStellar",
          campaignId: "1",
          destinationUrl: "https://merchant.example.com",
        }),
      ).rejects.toThrow(/Invalid cryptographic wallet identifier/);
    });
  });

  // --------------------------------------------------------------------------
  // 4. Custom Short-Link Generation & Shared-Store Persistence
  // --------------------------------------------------------------------------
  describe("Custom Short-Link Generation & Shared-Store Persistence", () => {
    it("successfully creates a short link via the shared API and caches it locally", async () => {
      const created = await createCustomShortLink({
        slug: "super-sale-2026",
        affiliateWallet: validStellarWallet,
        campaignId: "10",
        campaignName: "Hardware Wallet Promo",
        destinationUrl: "https://shop.hardware-demo.org/ledger",
        customUtmCampaign: "hardware_launch",
      });

      expect(created.id).toBeDefined();
      expect(created.slug).toBe("super-sale-2026");
      expect(created.affiliateWallet).toBe(validStellarWallet);
      expect(created.walletFingerprint).toBeDefined();
      expect(created.campaignId).toBe("10");
      expect(created.trackingParams.ref).toBe(validStellarWallet);
      expect(created.trackingParams.utm_campaign).toBe("hardware_launch");

      // Verify retrieval from session cache
      const found = getCustomLinkBySlug("super-sale-2026");
      expect(found).not.toBeNull();
      expect(found?.affiliateWallet).toBe(validStellarWallet);

      const all = getAllCustomLinks();
      expect(all.some((l) => l.slug === "super-sale-2026")).toBe(true);

      // Collision detected in session cache
      const availability = checkSlugAvailability("super-sale-2026");
      expect(availability.isAvailable).toBe(false);
    });

    it("rejects concurrent attempts to claim the same slug (server enforces SET NX)", async () => {
      // Both race to register "race-condition-deal" simultaneously.
      // The mock implements NX: first write wins, second returns 409.
      const input = {
        slug: "race-condition-deal",
        affiliateWallet: validStellarWallet,
        campaignId: "11",
        destinationUrl: "https://merchant.example.com/race",
      };

      const results = await Promise.allSettled([
        createCustomShortLink(input),
        createCustomShortLink(input),
      ]);

      const fulfilled = results.filter((r) => r.status === "fulfilled");
      const rejected = results.filter((r) => r.status === "rejected");

      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);
    });

    it("formats short URL correctly", () => {
      const url = getShortLinkUrl("my-promo-link");
      expect(url).toContain("/c/my-promo-link");
    });

    it("deletes a custom short link from the shared store and session cache", async () => {
      const created = await createCustomShortLink({
        slug: "temporary-flash-deal",
        affiliateWallet: validStellarWallet,
        campaignId: "5",
        destinationUrl: "https://merchant.example.com/flash",
      });

      expect(getCustomLinkBySlug("temporary-flash-deal")).not.toBeNull();

      const deleted = await deleteCustomShortLink(created.slug, validStellarWallet);
      expect(deleted).toBe(true);
      expect(getCustomLinkBySlug("temporary-flash-deal")).toBeNull();

      // Slug freed in session cache
      const avail = checkSlugAvailability("temporary-flash-deal");
      expect(avail.isAvailable).toBe(true);
    });

    it("returns false when deleting a non-existent slug", async () => {
      const result = await deleteCustomShortLink("nonexistent-slug", validStellarWallet);
      expect(result).toBe(false);
    });

    it("fetchAllCustomLinks retrieves the affiliate's links from the shared store", async () => {
      await createCustomShortLink({
        slug: "wallet-link-a",
        affiliateWallet: validStellarWallet,
        campaignId: "1",
        destinationUrl: "https://merchant.example.com/a",
      });
      await createCustomShortLink({
        slug: "wallet-link-b",
        affiliateWallet: validStellarWallet,
        campaignId: "2",
        destinationUrl: "https://merchant.example.com/b",
      });

      // Reset cache then fetch from shared store
      resetCustomLinksStore();
      const links = await fetchAllCustomLinks(validStellarWallet);
      expect(links.length).toBe(2);
      const slugs = links.map((l) => l.slug);
      expect(slugs).toContain("wallet-link-a");
      expect(slugs).toContain("wallet-link-b");
    });

    it("fetchCustomLinkBySlug resolves from shared store and increments click count", async () => {
      await createCustomShortLink({
        slug: "click-counter-test",
        affiliateWallet: validStellarWallet,
        campaignId: "3",
        destinationUrl: "https://merchant.example.com/clicks",
      });

      resetCustomLinksStore();
      const link = await fetchCustomLinkBySlug("click-counter-test");
      expect(link).not.toBeNull();
      expect(link?.clickCount).toBe(1);

      const link2 = await fetchCustomLinkBySlug("click-counter-test");
      expect(link2?.clickCount).toBe(2);
    });

    it("fetchCustomLinkBySlug returns null for an unknown slug", async () => {
      const link = await fetchCustomLinkBySlug("does-not-exist-anywhere");
      expect(link).toBeNull();
    });
  });

  // --------------------------------------------------------------------------
  // 5. Short-URL Redirects with Preserved Tracking Parameters
  // --------------------------------------------------------------------------
  describe("Tracking-Preserving Redirection Engine", () => {
    it("builds destination URL with all required affiliate attribution parameters", async () => {
      const link = await createCustomShortLink({
        slug: "gaming-gear",
        affiliateWallet: validStellarWallet,
        campaignId: "7",
        campaignName: "Gaming Setup Gear",
        destinationUrl: "https://merchant.example.com/gaming?category=monitors",
      });

      const redirectUrl = buildDestinationRedirectUrl(link);
      const parsed = new URL(redirectUrl);

      expect(parsed.hostname).toBe("merchant.example.com");
      expect(parsed.pathname).toBe("/gaming");
      expect(parsed.searchParams.get("category")).toBe("monitors");
      expect(parsed.searchParams.get("ref")).toBe(validStellarWallet);
      expect(parsed.searchParams.get("campaign")).toBe("7");
      expect(parsed.searchParams.get("storm_slug")).toBe("gaming-gear");
      expect(parsed.searchParams.get("utm_source")).toBe("stormsale");
      expect(parsed.searchParams.get("utm_medium")).toBe("affiliate");
    });

    it("preserves inbound visitor parameters while maintaining core tracking", async () => {
      const link = await createCustomShortLink({
        slug: "social-ad-deal",
        affiliateWallet: validStellarWallet,
        campaignId: "8",
        destinationUrl: "https://merchant.example.com/store",
      });

      const inboundQuery =
        "?subid=fb_campaign_42&ad_id=12345&utm_content=banner_red&ref=attacker&campaign=999&storm_slug=other&storm_fp=invalid";
      const redirectUrl = buildDestinationRedirectUrl(link, inboundQuery);
      const parsed = new URL(redirectUrl);

      expect(parsed.searchParams.get("subid")).toBe("fb_campaign_42");
      expect(parsed.searchParams.get("ad_id")).toBe("12345");
      expect(parsed.searchParams.get("utm_content")).toBe("banner_red");
      expect(parsed.searchParams.get("ref")).toBe(validStellarWallet);
      expect(parsed.searchParams.get("campaign")).toBe("8");
      expect(parsed.searchParams.get("storm_slug")).toBe("social-ad-deal");
      expect(parsed.searchParams.get("storm_fp")).toBe(link.walletFingerprint);
    });

    it("rejects invalid persisted destination URLs before creating redirect data", async () => {
      const link = await createCustomShortLink({
        slug: "invalid-destination",
        affiliateWallet: validStellarWallet,
        campaignId: "12",
        destinationUrl: "https://merchant.example.com/safe",
      });
      saveCustomLinks([{ ...link, destinationUrl: "javascript:alert(1)" }]);

      expect(resolveShortLinkRedirect("invalid-destination")).toBeNull();
      expect(() =>
        buildDestinationRedirectUrl({ ...link, destinationUrl: "javascript:alert(1)" }),
      ).toThrow("Merchant destination must use HTTP or HTTPS.");
    });

    it("generates HTTP tracking headers for merchant postback ingestion", async () => {
      const link = await createCustomShortLink({
        slug: "cloud-hosting",
        affiliateWallet: validStellarWallet,
        campaignId: "9",
        destinationUrl: "https://cloud-provider.com/signup",
      });

      const headers = buildTrackingHeaders(link);

      expect(headers["X-StormSale-Affiliate"]).toBe(validStellarWallet);
      expect(headers["X-StormSale-Wallet-Fingerprint"]).toBe(link.walletFingerprint);
      expect(headers["X-StormSale-Campaign"]).toBe("9");
      expect(headers["X-StormSale-Slug"]).toBe("cloud-hosting");
      expect(headers["X-StormSale-Redirect-Timestamp"]).toBeDefined();
    });

    it("resolveShortLinkRedirect (sync) resolves from session cache", async () => {
      await createCustomShortLink({
        slug: "analytics-track-test",
        affiliateWallet: validStellarWallet,
        campaignId: "3",
        destinationUrl: "https://merchant.example.com/item",
      });

      const resolved = resolveShortLinkRedirect("analytics-track-test");

      expect(resolved).not.toBeNull();
      expect(resolved?.slug).toBe("analytics-track-test");
      expect(resolved?.targetUrl).toContain(`ref=${validStellarWallet}`);
      expect(resolved?.trackingHeaders["X-StormSale-Slug"]).toBe("analytics-track-test");
    });

    it("resolveShortLinkRedirectAsync (shared store) resolves and increments click count", async () => {
      await createCustomShortLink({
        slug: "async-redirect-test",
        affiliateWallet: validStellarWallet,
        campaignId: "4",
        destinationUrl: "https://merchant.example.com/async",
      });

      resetCustomLinksStore(); // Clear session cache — must resolve from shared store
      const resolved = await resolveShortLinkRedirectAsync("async-redirect-test");

      expect(resolved).not.toBeNull();
      expect(resolved?.slug).toBe("async-redirect-test");
      expect(resolved?.clickCount).toBe(1);
      expect(resolved?.targetUrl).toContain(`ref=${validStellarWallet}`);

      // Second resolution increments server-side counter
      const resolved2 = await resolveShortLinkRedirectAsync("async-redirect-test");
      expect(resolved2?.clickCount).toBe(2);
    });

    it("resolveShortLinkRedirectAsync returns null for non-existent slug", async () => {
      const resolved = await resolveShortLinkRedirectAsync("non-existent-unknown-slug-404");
      expect(resolved).toBeNull();
    });

    it("returns null for non-existent slug (sync)", () => {
      const resolved = resolveShortLinkRedirect("non-existent-unknown-slug-404");
      expect(resolved).toBeNull();
    });
  });

  // --------------------------------------------------------------------------
  // 6. Protected attribution parameters cannot be overridden by inbound query
  // --------------------------------------------------------------------------
  describe("Protected Attribution Parameter Guard", () => {
    it("inbound ref, campaign, and storm_slug cannot overwrite link attribution", async () => {
      const link = await createCustomShortLink({
        slug: "protected-params-test",
        affiliateWallet: validStellarWallet,
        campaignId: "42",
        destinationUrl: "https://merchant.example.com/protected",
      });

      const inboundQuery = `?ref=GHACKER1234&campaign=999&storm_slug=fake-slug&subid=sub123`;
      const redirectUrl = buildDestinationRedirectUrl(link, inboundQuery);
      const parsed = new URL(redirectUrl);

      // Core attribution must be the link's own values
      expect(parsed.searchParams.get("ref")).toBe(validStellarWallet);
      expect(parsed.searchParams.get("campaign")).toBe("42");
      expect(parsed.searchParams.get("storm_slug")).toBe("protected-params-test");

      // Non-protected params pass through
      expect(parsed.searchParams.get("subid")).toBe("sub123");
    });
  });

  // --------------------------------------------------------------------------
  // 7. Data Integrity & CodeRabbit Review Feedback Regression Tests
  // --------------------------------------------------------------------------
  describe("Data Integrity & Review Regression Tests", () => {
    it("checkSlugAvailabilityRemote queries availability without recording click activity", async () => {
      const link = await createCustomShortLink({
        slug: "no-click-check",
        affiliateWallet: validStellarWallet,
        campaignId: "99",
        destinationUrl: "https://merchant.example.com/item",
      });

      expect(link.clickCount).toBe(0);

      // Probe availability for an already-taken slug
      const result = await checkSlugAvailabilityRemote("no-click-check");
      expect(result.isAvailable).toBe(false);
      expect(result.reason).toContain("already registered");

      // Verify that the click count in the store was NOT incremented
      const stored = mockStore.get("no-click-check");
      expect(stored?.clickCount).toBe(0);

      // Probe availability for an available slug
      const availResult = await checkSlugAvailabilityRemote("completely-free-slug");
      expect(availResult.isAvailable).toBe(true);
    });

    it("createCustomShortLink propagates registration failure without falling back to session link", async () => {
      // Mock fetch to simulate a 400 bad request or network error
      const mockFetchOriginal = globalThis.fetch;
      globalThis.fetch = vi.fn().mockImplementation(async (input: RequestInfo | URL) => {
        const url = typeof input === "string" ? input : input.toString();
        if (url.includes("/api/custom-links/register")) {
          return new Response(JSON.stringify({ error: "Invalid destinationUrl protocol" }), {
            status: 400,
          });
        }
        return new Response("Not found", { status: 404 });
      });

      try {
        await expect(
          createCustomShortLink({
            slug: "fail-slug",
            affiliateWallet: validStellarWallet,
            campaignId: "1",
            destinationUrl: "ftp://unsafe.example.com",
          }),
        ).rejects.toThrow("Invalid destinationUrl protocol");

        // Confirm link was NOT added to session cache
        expect(getCustomLinkBySlug("fail-slug")).toBeNull();
      } finally {
        globalThis.fetch = mockFetchOriginal;
      }
    });

    it("deleteCustomShortLink throws when wallet is missing and preserves cache on server error", async () => {
      // Create a link in mockStore
      await createCustomShortLink({
        slug: "delete-test-slug",
        affiliateWallet: validStellarWallet,
        campaignId: "1",
        destinationUrl: "https://merchant.example.com/target",
      });

      // Clear cache so it has no cached wallet
      resetCustomLinksStore();

      // Missing wallet should throw
      await expect(deleteCustomShortLink("delete-test-slug")).rejects.toThrow(
        "Connect the owning wallet to delete this link.",
      );

      // Re-populate session cache with the link
      const resolved = await fetchCustomLinkBySlug("delete-test-slug");
      expect(resolved).not.toBeNull();
      expect(getCustomLinkBySlug("delete-test-slug")).not.toBeNull();

      // Simulate a server deletion refusal (e.g. 403 Forbidden or 500)
      const mockFetchOriginal = globalThis.fetch;
      globalThis.fetch = vi.fn().mockImplementation(async (input: RequestInfo | URL) => {
        const url = typeof input === "string" ? input : input.toString();
        if (url.includes("/api/custom-links/delete")) {
          return new Response(
            JSON.stringify({ error: "Unauthorized: you do not own this slug." }),
            {
              status: 403,
            },
          );
        }
        return new Response("Not found", { status: 404 });
      });

      try {
        await expect(deleteCustomShortLink("delete-test-slug", validStellarWallet)).rejects.toThrow(
          "Unauthorized: you do not own this slug.",
        );

        // Entry MUST NOT be deleted from session cache on failure
        expect(getCustomLinkBySlug("delete-test-slug")).not.toBeNull();
      } finally {
        globalThis.fetch = mockFetchOriginal;
      }
    });
  });
});
