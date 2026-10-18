/**
 * src/lib/customLinks.ts
 *
 * Custom short-link client library.
 *
 * Storage strategy (priority order):
 *  1. Shared Upstash Redis via Vercel Serverless Functions (/api/custom-links/*)
 *     — provides globally persistent, cross-device, server-enforced unique slugs.
 *  2. In-memory cache — per-page session cache populated from API responses,
 *     used for synchronous lookup operations (e.g. ShortLinkRedirect render).
 *
 * Callers that need cross-device resolution should use the async API functions
 * (createCustomShortLink, fetchCustomLinkBySlug, fetchAllCustomLinks, etc.).
 * Synchronous helpers (getCustomLinkBySlug, getAllCustomLinks) operate on the
 * in-memory cache populated by prior async calls.
 *
 * NOTE: window.localStorage is NOT used for persistence. It is retained only
 * for an in-memory session cache warm-up on the ShortLinkRedirect path to
 * avoid an extra network round-trip when the link is already resolved.
 */
import type {
  CustomShortLink,
  SlugAvailabilityResult,
  CreateShortLinkInput,
  ShortLinkRedirectResult,
} from "../types/affiliateLink";
import { isValidStellarAddress } from "./stellar";

export const STORMSALE_SHORT_DOMAIN = "stormsale.xyz";

// ---------------------------------------------------------------------------
// API base resolution
// ---------------------------------------------------------------------------
function apiBase(): string {
  if (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_URL) {
    // Point to the same origin for /api/* paths in Vite-served apps
    return "";
  }
  return "";
}

export const CUSTOM_LINKS_API = {
  register: () => `${apiBase()}/api/custom-links/register`,
  availability: (slug: string) =>
    `${apiBase()}/api/custom-links/availability?slug=${encodeURIComponent(slug)}`,
  resolve: (slug: string) =>
    `${apiBase()}/api/custom-links/resolve?slug=${encodeURIComponent(slug)}`,
  list: (wallet: string) =>
    `${apiBase()}/api/custom-links/list?wallet=${encodeURIComponent(wallet)}`,
  delete: (slug: string, wallet: string) =>
    `${apiBase()}/api/custom-links/delete?slug=${encodeURIComponent(slug)}&wallet=${encodeURIComponent(wallet)}`,
} as const;

// ---------------------------------------------------------------------------
// Reserved slugs / constants
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// Crypto helpers
// ---------------------------------------------------------------------------

/** Generate a deterministic SHA-256 fingerprint for a Stellar wallet address. */
export async function computeWalletFingerprint(walletAddress: string): Promise<string> {
  const bytes = new TextEncoder().encode(walletAddress.trim());
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  const hex = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join(
    "",
  );
  return `wf_${hex}`;
}

// ---------------------------------------------------------------------------
// Slug utilities
// ---------------------------------------------------------------------------

/**
 * Normalizes a raw user input slug:
 * - Trims whitespace
 * - Converts to lowercase
 * - Replaces spaces and underscores with single hyphen
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

/** Validates the format of an alphanumeric slug */
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

// ---------------------------------------------------------------------------
// In-memory session cache (NOT the authoritative store — that is Redis via API)
// ---------------------------------------------------------------------------

/** Per-page session cache populated from API responses */
let inMemoryLinks: CustomShortLink[] | null = null;

/** Resets the session cache (for test isolation) */
export function resetCustomLinksStore(): void {
  inMemoryLinks = null;
}

/**
 * Returns the current in-memory session cache.
 * This reflects only the links fetched during this page session.
 * For globally accurate listings, call fetchAllCustomLinks() first.
 */
export function getAllCustomLinks(): CustomShortLink[] {
  return inMemoryLinks ?? [];
}

/** Updates the in-memory session cache */
export function saveCustomLinks(links: CustomShortLink[]): void {
  inMemoryLinks = links;
}

/**
 * Synchronous lookup of a slug from the in-memory session cache.
 * Returns null if the link hasn't been fetched yet; call fetchCustomLinkBySlug()
 * for a definitive network-backed lookup.
 */
export function getCustomLinkBySlug(slug: string): CustomShortLink | null {
  const normalized = normalizeSlug(slug);
  if (!normalized) return null;
  return (inMemoryLinks ?? []).find((l) => l.slug.toLowerCase() === normalized) ?? null;
}

// ---------------------------------------------------------------------------
// Shared-store API functions (use these for authoritative operations)
// ---------------------------------------------------------------------------

/**
 * Fetches all custom short-links for an affiliate wallet from the shared store.
 * Populates the in-memory session cache.
 */
export async function fetchAllCustomLinks(affiliateWallet: string): Promise<CustomShortLink[]> {
  const res = await fetch(CUSTOM_LINKS_API.list(affiliateWallet));
  if (!res.ok) {
    throw new Error(`Failed to fetch custom links: ${res.status} ${res.statusText}`);
  }
  const links: CustomShortLink[] = await res.json();
  inMemoryLinks = links;
  return links;
}

/**
 * Resolves a slug from the shared store and increments its global click counter.
 * Populates the in-memory session cache entry for this slug.
 */
export async function fetchCustomLinkBySlug(slug: string): Promise<CustomShortLink | null> {
  const normalized = normalizeSlug(slug);
  if (!normalized) return null;

  try {
    const res = await fetch(CUSTOM_LINKS_API.resolve(normalized));
    if (res.status === 404) return null;
    if (!res.ok) {
      throw new Error(`Failed to resolve slug '${normalized}': ${res.status} ${res.statusText}`);
    }

    const link: CustomShortLink = await res.json();

    // Update session cache
    if (inMemoryLinks === null) {
      inMemoryLinks = [link];
    } else {
      const idx = inMemoryLinks.findIndex((l) => l.slug === link.slug);
      if (idx >= 0) {
        inMemoryLinks[idx] = link;
      } else {
        inMemoryLinks.unshift(link);
      }
    }

    return link;
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes("Failed to resolve slug")) {
      throw err;
    }
    return getCustomLinkBySlug(normalized);
  }
}

/**
 * Checks format validity of a slug client-side, then queries the shared store
 * to determine real-time availability.
 */
export async function checkSlugAvailabilityRemote(
  rawSlug: string,
): Promise<SlugAvailabilityResult> {
  const normalizedSlug = normalizeSlug(rawSlug);

  const formatValidation = validateSlugFormat(rawSlug);
  if (!formatValidation.valid) {
    return { slug: rawSlug, normalizedSlug, isAvailable: false, reason: formatValidation.reason };
  }

  try {
    const res = await fetch(CUSTOM_LINKS_API.availability(normalizedSlug));
    if (res.ok) {
      const data = await res.json().catch(() => ({}));
      if (typeof data.available === "boolean") {
        if (data.available) {
          return { slug: rawSlug, normalizedSlug, isAvailable: true };
        } else {
          return {
            slug: rawSlug,
            normalizedSlug,
            isAvailable: false,
            reason: `Slug '${normalizedSlug}' is already registered by another affiliate.`,
          };
        }
      }
    }
    throw new Error(`Unexpected status ${res.status}`);
  } catch {
    return {
      slug: rawSlug,
      normalizedSlug,
      isAvailable: false,
      reason: "Could not verify slug availability. Please try again.",
    };
  }
}

/**
 * Synchronous format-only availability check (does NOT query the shared store).
 * Use checkSlugAvailabilityRemote() for authoritative uniqueness checking.
 */
export function checkSlugAvailability(rawSlug: string): SlugAvailabilityResult {
  const normalizedSlug = normalizeSlug(rawSlug);
  const formatValidation = validateSlugFormat(rawSlug);
  if (!formatValidation.valid) {
    return { slug: rawSlug, normalizedSlug, isAvailable: false, reason: formatValidation.reason };
  }

  const existing = getCustomLinkBySlug(normalizedSlug);
  if (existing) {
    return {
      slug: rawSlug,
      normalizedSlug,
      isAvailable: false,
      reason: `Slug '${normalizedSlug}' is already registered by another affiliate.`,
    };
  }

  return { slug: rawSlug, normalizedSlug, isAvailable: true };
}

/** Generate a short link URL string */
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

// ---------------------------------------------------------------------------
// Create / Delete  (go directly to shared store)
// ---------------------------------------------------------------------------

/**
 * Creates a new custom short link in the shared store.
 * The server enforces slug uniqueness atomically — concurrent registrations
 * of the same slug from any client are safely rejected with a 409 response.
 */
export async function createCustomShortLink(input: CreateShortLinkInput): Promise<CustomShortLink> {
  const normalized = normalizeSlug(input.slug);

  // 1. Client-side format validation (fast path before network call)
  const formatCheck = validateSlugFormat(normalized);
  if (!formatCheck.valid) {
    throw new Error(formatCheck.reason ?? "Invalid slug format.");
  }

  // 2. Wallet validation
  if (!input.affiliateWallet || !isValidStellarAddress(input.affiliateWallet)) {
    throw new Error(
      "Invalid cryptographic wallet identifier. Must be a valid Stellar public key (G...) or contract address (C...).",
    );
  }

  // 3. Destination URL validation
  if (!input.destinationUrl?.trim()) {
    throw new Error("Merchant destination URL is required.");
  }

  let formattedDestination = input.destinationUrl.trim();
  if (!formattedDestination.startsWith("http://") && !formattedDestination.startsWith("https://")) {
    formattedDestination = `https://${formattedDestination}`;
  }

  try {
    const parsed = new URL(formattedDestination);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      throw new Error("Invalid destination URL format.");
    }
  } catch {
    throw new Error("Invalid destination URL format.");
  }

  const walletFingerprint = await computeWalletFingerprint(input.affiliateWallet);

  const trackingParams: Record<string, string> = {
    ref: input.affiliateWallet,
    campaign: input.campaignId,
    utm_source: "stormsale",
    utm_medium: "affiliate",
    utm_campaign: input.customUtmCampaign ?? normalized,
    ...(input.extraTrackingParams ?? {}),
  };

  const payload = {
    slug: normalized,
    affiliateWallet: input.affiliateWallet,
    walletFingerprint,
    campaignId: input.campaignId,
    campaignName: input.campaignName ?? `Campaign #${input.campaignId}`,
    destinationUrl: formattedDestination,
    trackingParams,
  };

  // 4. POST to shared store — server enforces uniqueness via Redis SET NX
  try {
    const res = await fetch(CUSTOM_LINKS_API.register(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (res.status === 409) {
      const data = await res.json().catch(() => ({}));
      throw new Error(
        data.error ?? `Slug '${normalized}' is already registered by another affiliate.`,
      );
    }
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error ?? `Registration failed: ${res.status} ${res.statusText}`);
    }

    const newLink: CustomShortLink = await res.json();

    // Update session cache
    if (inMemoryLinks === null) {
      inMemoryLinks = [newLink];
    } else {
      inMemoryLinks.unshift(newLink);
    }

    return newLink;
  } catch (err: unknown) {
    if (err instanceof Error) throw err;
    throw new Error("Could not reach the short-link service. Please try again.", { cause: err });
  }
}

/**
 * Deletes a custom short link from the shared store.
 * Only the owning affiliate wallet can delete its own slugs.
 */
export async function deleteCustomShortLink(
  slugOrId: string,
  affiliateWallet?: string,
): Promise<boolean> {
  // Resolve slug from session cache if an ID was passed
  let slug = slugOrId;
  const cached = (inMemoryLinks ?? []).find((l) => l.id === slugOrId || l.slug === slugOrId);
  if (cached) {
    slug = cached.slug;
  }
  const wallet = affiliateWallet || cached?.affiliateWallet;

  if (!wallet) {
    throw new Error("Connect the owning wallet to delete this link.");
  }

  const res = await fetch(CUSTOM_LINKS_API.delete(slug, wallet), {
    method: "DELETE",
  });

  if (res.status === 404) return false;
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error ?? `Deletion failed: ${res.status} ${res.statusText}`);
  }

  // Update session cache only on successful 2xx response
  if (inMemoryLinks) {
    const prevLen = inMemoryLinks.length;
    inMemoryLinks = inMemoryLinks.filter((l) => l.slug !== slug && l.id !== slugOrId);
    return inMemoryLinks.length < prevLen;
  }

  return true;
}

// ---------------------------------------------------------------------------
// URL building & tracking helpers (pure / synchronous)
// ---------------------------------------------------------------------------

function parseHttpDestination(destinationUrl: string): URL | null {
  try {
    const url = new URL(destinationUrl);
    return url.protocol === "http:" || url.protocol === "https:" ? url : null;
  } catch {
    return null;
  }
}

export function isHttpDestination(destinationUrl: string): boolean {
  return parseHttpDestination(destinationUrl) !== null;
}

/**
 * Builds the final destination URL preserving all affiliate tracking parameters
 * and inbound query parameters. Core attribution parameters (ref, campaign,
 * storm_slug, storm_fp) cannot be overridden by inbound visitor query strings.
 */
export function buildDestinationRedirectUrl(
  link: CustomShortLink,
  inboundQuery?: string | URLSearchParams,
): string {
  const url = parseHttpDestination(link.destinationUrl);
  if (!url) {
    throw new Error("Merchant destination must use HTTP or HTTPS.");
  }

  // 1. Attach configured affiliate tracking params
  Object.entries(link.trackingParams).forEach(([key, val]) => {
    url.searchParams.set(key, val);
  });

  // 2. Ensure core attribution is explicitly set (cannot be overridden)
  url.searchParams.set("ref", link.affiliateWallet);
  url.searchParams.set("campaign", link.campaignId);
  url.searchParams.set("storm_slug", link.slug);
  url.searchParams.set("storm_fp", link.walletFingerprint);

  // 3. Preserve inbound visitor parameters — protected params are skipped
  if (inboundQuery) {
    const PROTECTED_PARAMS = new Set(["ref", "campaign", "storm_slug", "storm_fp"]);
    const inboundParams =
      typeof inboundQuery === "string"
        ? new URLSearchParams(inboundQuery.startsWith("?") ? inboundQuery.slice(1) : inboundQuery)
        : inboundQuery;

    inboundParams.forEach((value, key) => {
      if (!PROTECTED_PARAMS.has(key)) {
        url.searchParams.set(key, value);
      }
    });
  }

  return url.toString();
}

/** Generate standard HTTP tracking header metadata for merchant attribution */
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
 * Records a click on a short link in the session cache.
 * The authoritative click count is incremented server-side by fetchCustomLinkBySlug().
 */
export function recordShortLinkClick(slug: string): void {
  const normalized = normalizeSlug(slug);
  if (!inMemoryLinks) return;
  const linkIndex = inMemoryLinks.findIndex((l) => l.slug.toLowerCase() === normalized);
  if (linkIndex !== -1) {
    inMemoryLinks[linkIndex].clickCount = (inMemoryLinks[linkIndex].clickCount || 0) + 1;
    inMemoryLinks[linkIndex].lastClickedAt = new Date().toISOString();
  }
}

/**
 * Synchronous resolve from session cache only.
 * Use resolveShortLinkRedirectAsync() for authoritative cross-device resolution.
 */
export function resolveShortLinkRedirect(
  slug: string,
  inboundQuery?: string | URLSearchParams,
): ShortLinkRedirectResult | null {
  const link = getCustomLinkBySlug(slug);
  if (!link || !parseHttpDestination(link.destinationUrl)) return null;

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
 * Asynchronous resolve that queries the shared store for authoritative cross-device
 * resolution. Increments the global click counter server-side.
 */
export async function resolveShortLinkRedirectAsync(
  slug: string,
  inboundQuery?: string | URLSearchParams,
): Promise<ShortLinkRedirectResult | null> {
  const link = await fetchCustomLinkBySlug(slug);
  if (!link || !parseHttpDestination(link.destinationUrl)) return null;

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

/** Dispatches tracking beacon for the redirect event */
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
