import { describe, it, expect, beforeEach } from "vitest";
import {
  normalizeSlug,
  validateSlugFormat,
  computeWalletFingerprint,
  checkSlugAvailability,
  createCustomShortLink,
  getCustomLinkBySlug,
  getAllCustomLinks,
  deleteCustomShortLink,
  buildDestinationRedirectUrl,
  buildTrackingHeaders,
  resolveShortLinkRedirect,
  getShortLinkUrl,
  resetCustomLinksStore,
  saveCustomLinks,
} from "../lib/customLinks";
import { Keypair } from "@stellar/stellar-sdk";

describe("Custom Short-Link Domain Routing & Cloaked URL Generator (Issue #159)", () => {
  const validStellarWallet = Keypair.random().publicKey();

  beforeEach(() => {
    resetCustomLinksStore();
  });

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
    it("reports unused slugs as available", () => {
      const result = checkSlugAvailability("unique-affiliate-slug-999");
      expect(result.isAvailable).toBe(true);
      expect(result.normalizedSlug).toBe("unique-affiliate-slug-999");
      expect(result.reason).toBeUndefined();
    });

    it("detects collisions against existing custom links", async () => {
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
  // 4. Custom Short-Link Generation & Persistence
  // --------------------------------------------------------------------------
  describe("Custom Short-Link Generation", () => {
    it("successfully creates and stores a new custom short link", async () => {
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

      // Verify retrieval
      const found = getCustomLinkBySlug("super-sale-2026");
      expect(found).not.toBeNull();
      expect(found?.affiliateWallet).toBe(validStellarWallet);

      const all = getAllCustomLinks();
      expect(all.some((l) => l.slug === "super-sale-2026")).toBe(true);

      // Verify collision detection now prevents duplicate
      const availability = checkSlugAvailability("super-sale-2026");
      expect(availability.isAvailable).toBe(false);
    });

    it("rejects concurrent attempts to claim the same slug", async () => {
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

      expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
      expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
      expect(getAllCustomLinks().filter((link) => link.slug === input.slug)).toHaveLength(1);
    });

    it("formats short URL correctly", () => {
      const url = getShortLinkUrl("my-promo-link");
      expect(url).toContain("/c/my-promo-link");
    });

    it("supports deleting a custom short link and frees the slug", async () => {
      const created = await createCustomShortLink({
        slug: "temporary-flash-deal",
        affiliateWallet: validStellarWallet,
        campaignId: "5",
        destinationUrl: "https://merchant.example.com/flash",
      });

      expect(getCustomLinkBySlug("temporary-flash-deal")).not.toBeNull();

      const deleted = deleteCustomShortLink(created.id);
      expect(deleted).toBe(true);
      expect(getCustomLinkBySlug("temporary-flash-deal")).toBeNull();

      // Slug is available again after deletion
      const avail = checkSlugAvailability("temporary-flash-deal");
      expect(avail.isAvailable).toBe(true);
    });
  });

  // --------------------------------------------------------------------------
  // 5. Short-URL Redirects with Preserved Tracking Headers & Query Params
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

    it("resolves redirect and increments click counter", async () => {
      await createCustomShortLink({
        slug: "analytics-track-test",
        affiliateWallet: validStellarWallet,
        campaignId: "3",
        destinationUrl: "https://merchant.example.com/item",
      });

      const resolved = resolveShortLinkRedirect("analytics-track-test");

      expect(resolved).not.toBeNull();
      expect(resolved?.slug).toBe("analytics-track-test");
      expect(resolved?.clickCount).toBe(1);
      expect(resolved?.targetUrl).toContain(`ref=${validStellarWallet}`);
      expect(resolved?.trackingHeaders["X-StormSale-Slug"]).toBe("analytics-track-test");

      // Resolving again increments count
      const resolvedAgain = resolveShortLinkRedirect("analytics-track-test");
      expect(resolvedAgain?.clickCount).toBe(2);
    });

    it("returns null for non-existent slug", () => {
      const resolved = resolveShortLinkRedirect("non-existent-unknown-slug-404");
      expect(resolved).toBeNull();
    });
  });
});
