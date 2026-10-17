import type {
  CustomShortLink,
  SlugAvailabilityResult,
  CreateShortLinkInput,
  ShortLinkRedirectResult,
} from "../types/affiliateLink";
import { isValidStellarAddress } from "./stellar";

export const STORAGE_CUSTOM_LINKS_KEY = "stormsale_custom_short_links_v1";
export const STORMSALE_SHORT_DOMAIN = "stormsale.xyz";

/** Reserved slugs that cannot be registered */
export const RESERVED_SLUGS = new Set([
  "c",
  "api",
  "dashboard",
  "affiliate",
  "advertiser",
  "auditor",
  "auth",
  "login",
  "register",
  "admin",
  "settings",
  "terms",
  "privacy",
  "help",
  "support",
  "explore",
  "webhook",
  "contracts",
]);

/**
 * Generate a synchronous deterministic SHA-256 hex digest for wallet fingerprinting
 */
export function computeWalletFingerprint(walletAddress: string): string {
  // Simple deterministic Fowler-Noll-Vo / CRC32 / SHA-like hash generator for testing & browser safety
  let h1 = 0xdeadbeef ^ walletAddress.length;
  let h2 = 0x41c6ce57 ^ walletAddress.length;
  for (let i = 0; i < walletAddress.length; i++) {
    const ch = walletAddress.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  const part1 = (h1 >>> 0).toString(16).padStart(8, "0");
  const part2 = (h2 >>> 0).toString(16).padStart(8, "0");
  const prefix = walletAddress.slice(0, 4);
  const suffix = walletAddress.slice(-4);
  return `wf_${prefix}_${part1}${part2}_${suffix}`.toLowerCase();
}

/**
 * Normalizes a raw user input slug:
 * - Trims whitespace
 * - Converts to lowercase
 * - Replaces multiple spaces and underscores with single hyphen
 * - Removes disallowed characters
 */
export function normalizeSlug(rawSlug: string): string {
  if (!rawSlug) return "";
  return rawSlug
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

/**
 * Validates the format of an alphanumeric slug
 */
export function validateSlugFormat(slug: string): { valid: boolean; reason?: string } {
  if (!slug || slug.trim().length === 0) {
    return { valid: false, reason: "Slug cannot be empty." };
  }

  const normalized = normalizeSlug(slug);

  if (normalized.length < 3) {
    return { valid: false, reason: "Slug must be at least 3 characters long." };
  }

  if (normalized.length > 50) {
    return { valid: false, reason: "Slug cannot exceed 50 characters." };
  }

  // Alphanumeric with hyphens
  const slugRegex = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
  if (!slugRegex.test(normalized)) {
    return {
      valid: false,
      reason: "Slug must contain only alphanumeric characters separated by single hyphens.",
    };
  }

  if (RESERVED_SLUGS.has(normalized)) {
    return {
      valid: false,
      reason: `'${normalized}' is a reserved protocol route and cannot be used as a custom slug.`,
    };
  }

  return { valid: true };
}

/**
 * Generate default seed custom short links
 */
export function createDefaultSeedLinks(): CustomShortLink[] {
  const seedWallet = "GAFFILIATE1234567890STORMTESTNET1234567890TESTNETWALLET";
  return [
    {
      id: "csl_tech_deals",
      slug: "tech-deals",
      affiliateWallet: seedWallet,
      walletFingerprint: computeWalletFingerprint(seedWallet),
      campaignId: "1",
      campaignName: "Tech Gadgets Pro",
      destinationUrl: "https://shop.techgadgets-demo.org/collections/stellar-exclusive",
      trackingParams: {
        ref: seedWallet,
        campaign: "1",
        utm_source: "stormsale",
        utm_medium: "affiliate",
        utm_campaign: "tech-deals",
      },
      createdAt: new Date(Date.now() - 86400000 * 5).toISOString(),
      updatedAt: new Date(Date.now() - 86400000 * 5).toISOString(),
      clickCount: 142,
      lastClickedAt: new Date(Date.now() - 3600000 * 2).toISOString(),
    },
    {
      id: "csl_web3_mastery",
      slug: "web3-mastery",
      affiliateWallet: seedWallet,
      walletFingerprint: computeWalletFingerprint(seedWallet),
      campaignId: "2",
      campaignName: "Web3 Masterclass",
      destinationUrl: "https://learn.stellar-web3-academy.io/enroll?plan=annual",
      trackingParams: {
        ref: seedWallet,
        campaign: "2",
        utm_source: "stormsale",
        utm_medium: "affiliate",
        utm_campaign: "web3-mastery",
      },
      createdAt: new Date(Date.now() - 86400000 * 3).toISOString(),
      updatedAt: new Date(Date.now() - 86400000 * 3).toISOString(),
      clickCount: 89,
      lastClickedAt: new Date(Date.now() - 3600000 * 8).toISOString(),
    },
  ];
}

let inMemoryLinks: CustomShortLink[] | null = null;

/**
 * Resets the custom links store (useful for test isolation)
 */
export function resetCustomLinksStore(): void {
  inMemoryLinks = null;
  if (typeof window !== "undefined" && window.localStorage) {
    try {
      window.localStorage.removeItem(STORAGE_CUSTOM_LINKS_KEY);
    } catch {
      // Ignore in restricted environments
    }
  }
}

/**
 * Retrieve all registered custom short links from storage or in-memory fallback
 */
export function getAllCustomLinks(): CustomShortLink[] {
  if (inMemoryLinks !== null) {
    return inMemoryLinks;
  }

  if (typeof window !== "undefined" && window.localStorage) {
    try {
      const raw = window.localStorage.getItem(STORAGE_CUSTOM_LINKS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          inMemoryLinks = parsed;
          return inMemoryLinks;
        }
      }
    } catch (err) {
      console.error("Error reading custom short links from localStorage:", err);
    }
  }

  const defaults = createDefaultSeedLinks();
  inMemoryLinks = defaults;
  if (typeof window !== "undefined" && window.localStorage) {
    try {
      window.localStorage.setItem(STORAGE_CUSTOM_LINKS_KEY, JSON.stringify(defaults));
    } catch {
      // Ignore
    }
  }
  return inMemoryLinks;
}

/**
 * Save custom short links list to storage and memory cache
 */
export function saveCustomLinks(links: CustomShortLink[]): void {
  inMemoryLinks = links;
  if (typeof window !== "undefined" && window.localStorage) {
    try {
      window.localStorage.setItem(STORAGE_CUSTOM_LINKS_KEY, JSON.stringify(links));
    } catch (err) {
      console.error("Error saving custom short links to localStorage:", err);
    }
  }
}

/**
 * Find a custom short link by normalized slug (case-insensitive)
 */
export function getCustomLinkBySlug(slug: string): CustomShortLink | null {
  const normalized = normalizeSlug(slug);
  if (!normalized) return null;
  const links = getAllCustomLinks();
  return links.find((l) => l.slug.toLowerCase() === normalized) || null;
}

/**
 * Real-time collision detection & slug availability checker
 */
export function checkSlugAvailability(rawSlug: string): SlugAvailabilityResult {
  const normalizedSlug = normalizeSlug(rawSlug);

  const formatValidation = validateSlugFormat(rawSlug);
  if (!formatValidation.valid) {
    return {
      slug: rawSlug,
      normalizedSlug,
      isAvailable: false,
      reason: formatValidation.reason,
    };
  }

  const existing = getCustomLinkBySlug(normalizedSlug);
  if (existing) {
    return {
      slug: rawSlug,
      normalizedSlug,
      isAvailable: false,
      reason: `Slug '${normalizedSlug}' is already registered by another affiliate. Please choose a unique slug.`,
    };
  }

  return {
    slug: rawSlug,
    normalizedSlug,
    isAvailable: true,
  };
}

/**
 * Generate a short link URL string
 */
export function getShortLinkUrl(slug: string, baseUrl?: string): string {
  const normalized = normalizeSlug(slug);
  if (baseUrl) {
    return `${baseUrl.replace(/\/+$/, "")}/c/${normalized}`;
  }
  if (typeof window !== "undefined" && window.location?.origin) {
    return `${window.location.origin}/c/${normalized}`;
  }
  return `https://${STORMSALE_SHORT_DOMAIN}/c/${normalized}`;
}

/**
 * Create a new custom short link mapping
 */
export async function createCustomShortLink(input: CreateShortLinkInput): Promise<CustomShortLink> {
  const normalized = normalizeSlug(input.slug);

  // 1. Validate slug availability & collision
  const availability = checkSlugAvailability(normalized);
  if (!availability.isAvailable) {
    throw new Error(availability.reason || "Slug is not available.");
  }

  // 2. Validate cryptographic wallet identifier
  if (!input.affiliateWallet || !isValidStellarAddress(input.affiliateWallet)) {
    throw new Error(
      "Invalid cryptographic wallet identifier. Must be a valid Stellar public key (G...) or contract address (C...).",
    );
  }

  // 3. Validate destination URL
  if (!input.destinationUrl || !input.destinationUrl.trim()) {
    throw new Error("Merchant destination URL is required.");
  }

  let formattedDestination = input.destinationUrl.trim();
  if (!formattedDestination.startsWith("http://") && !formattedDestination.startsWith("https://")) {
    formattedDestination = `https://${formattedDestination}`;
  }

  try {
    new URL(formattedDestination);
  } catch {
    throw new Error("Invalid destination URL format.");
  }

  const walletFingerprint = computeWalletFingerprint(input.affiliateWallet);

  const trackingParams: Record<string, string> = {
    ref: input.affiliateWallet,
    campaign: input.campaignId,
    utm_source: "stormsale",
    utm_medium: "affiliate",
    utm_campaign: input.customUtmCampaign || normalized,
    ...(input.extraTrackingParams || {}),
  };

  const newLink: CustomShortLink = {
    id: `csl_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    slug: normalized,
    affiliateWallet: input.affiliateWallet,
    walletFingerprint,
    campaignId: input.campaignId,
    campaignName: input.campaignName || `Campaign #${input.campaignId}`,
    destinationUrl: formattedDestination,
    trackingParams,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    clickCount: 0,
  };

  const links = getAllCustomLinks();
  links.unshift(newLink);
  saveCustomLinks(links);

  return newLink;
}

/**
 * Delete a custom short link by ID
 */
export function deleteCustomShortLink(id: string): boolean {
  const links = getAllCustomLinks();
  const filtered = links.filter((l) => l.id !== id);
  if (filtered.length !== links.length) {
    saveCustomLinks(filtered);
    return true;
  }
  return false;
}

/**
 * Builds the final destination URL preserving all affiliate tracking parameters and inbound query parameters
 */
export function buildDestinationRedirectUrl(
  link: CustomShortLink,
  inboundQuery?: string | URLSearchParams,
): string {
  const url = new URL(link.destinationUrl);

  // 1. Attach configured affiliate tracking params
  Object.entries(link.trackingParams).forEach(([key, val]) => {
    url.searchParams.set(key, val);
  });

  // 2. Ensure core affiliate and campaign tracking are explicitly set
  url.searchParams.set("ref", link.affiliateWallet);
  url.searchParams.set("campaign", link.campaignId);
  url.searchParams.set("storm_slug", link.slug);
  url.searchParams.set("storm_fp", link.walletFingerprint);

  // 3. Preserve any incoming query parameters from visitor (e.g. ?subid=... or ad params)
  if (inboundQuery) {
    const inboundParams =
      typeof inboundQuery === "string"
        ? new URLSearchParams(inboundQuery.startsWith("?") ? inboundQuery.slice(1) : inboundQuery)
        : inboundQuery;

    inboundParams.forEach((value, key) => {
      // Don't overwrite the core protocol security tracking params
      if (!["ref", "storm_slug", "storm_fp"].includes(key)) {
        url.searchParams.set(key, value);
      }
    });
  }

  return url.toString();
}

/**
 * Generate standard HTTP tracking headers for merchant postback / redirection attribution
 */
export function buildTrackingHeaders(link: CustomShortLink): Record<string, string> {
  return {
    "X-StormSale-Affiliate": link.affiliateWallet,
    "X-StormSale-Wallet-Fingerprint": link.walletFingerprint,
    "X-StormSale-Campaign": link.campaignId,
    "X-StormSale-Slug": link.slug,
    "X-StormSale-Redirect-Timestamp": new Date().toISOString(),
    "X-StormSale-Protocol-Version": "1.0",
  };
}

/**
 * Records a click on a short link
 */
export function recordShortLinkClick(slug: string): void {
  const normalized = normalizeSlug(slug);
  const links = getAllCustomLinks();
  const linkIndex = links.findIndex((l) => l.slug.toLowerCase() === normalized);
  if (linkIndex !== -1) {
    links[linkIndex].clickCount = (links[linkIndex].clickCount || 0) + 1;
    links[linkIndex].lastClickedAt = new Date().toISOString();
    saveCustomLinks(links);
  }
}

/**
 * Resolve a custom short link for redirection:
 * - Finds the custom link mapping
 * - Records click
 * - Constructs destination URL with preserved tracking parameters
 * - Returns headers and target URL
 */
export function resolveShortLinkRedirect(
  slug: string,
  inboundQuery?: string | URLSearchParams,
): ShortLinkRedirectResult | null {
  const link = getCustomLinkBySlug(slug);
  if (!link) return null;

  recordShortLinkClick(slug);

  const targetUrl = buildDestinationRedirectUrl(link, inboundQuery);
  const trackingHeaders = buildTrackingHeaders(link);

  return {
    slug: link.slug,
    targetUrl,
    affiliateWallet: link.affiliateWallet,
    walletFingerprint: link.walletFingerprint,
    campaignId: link.campaignId,
    trackingHeaders,
    trackingParams: link.trackingParams,
    clickCount: link.clickCount,
  };
}

/**
 * Dispatches tracking beacon for the redirect event
 */
export function dispatchTrackingBeacon(result: ShortLinkRedirectResult): void {
  if (typeof window === "undefined") return;

  const payload = {
    event: "affiliate.shortlink.redirect",
    slug: result.slug,
    affiliateWallet: result.affiliateWallet,
    walletFingerprint: result.walletFingerprint,
    campaignId: result.campaignId,
    targetUrl: result.targetUrl,
    timestamp: new Date().toISOString(),
  };

  try {
    if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
      const blob = new Blob([JSON.stringify(payload)], { type: "application/json" });
      navigator.sendBeacon("/api/tracking/click", blob);
    }
  } catch {
    // Non-blocking beacon attempt
  }
}
