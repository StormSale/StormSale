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
  // 4. Custom Short-Link Generation & Share
  // --------------------------------------------------------------------------
  // NOTE: The source provided for this file was truncated at this point.
  // The remaining tests for section 4 onward were not included in the input
  // and are intentionally not reconstructed here.
});
