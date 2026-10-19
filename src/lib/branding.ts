export interface AdvertiserBrandConfig {
  subdomain: string;
  brandName: string;
  tagline: string;
  logoUrl: string;
  bannerUrl: string;
  primaryColor: string;
  secondaryColor: string;
  heroHeadline: string;
  heroSubtitle: string;
  ctaText: string;
  contactEmail: string;
  ipfsHash?: string;
  updatedAt: number;
}

export interface WcagContrastResult {
  contrastRatioWithWhite: number;
  contrastRatioWithDark: number;
  passesAaNormalText: boolean;
  passesAaLargeText: boolean;
  recommendedTextColor: "#ffffff" | "#09090b";
  complianceStatus: "AA Passed" | "AA Large Only" | "Failed";
}

export const DEFAULT_BRAND_CONFIG: AdvertiserBrandConfig = {
  subdomain: "storm-affiliate",
  brandName: "Apex Performance Gear",
  tagline: "Empowering Next-Gen Marketers on the Stellar Network",
  logoUrl:
    "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=200&auto=format&fit=crop&q=80",
  bannerUrl:
    "https://images.unsplash.com/photo-1550745165-9bc0b252726f?w=1200&auto=format&fit=crop&q=80",
  primaryColor: "#4F46E5", // Indigo
  secondaryColor: "#06B6D4", // Cyan
  heroHeadline: "Earn Up to 25% Lifetime Commissions on Stellar Escrow",
  heroSubtitle:
    "Instant Soroban-cleared payouts, automated postback tracking, and decentralized cryptographic audit logs.",
  ctaText: "Join Brand Marketplace",
  contactEmail: "partnerships@apexgear.io",
  updatedAt: Date.now(),
};

/**
 * Calculates relative luminance for a given sRGB component.
 */
function sRgbLuminance(c: number): number {
  const norm = c / 255;
  return norm <= 0.04045 ? norm / 12.92 : Math.pow((norm + 0.055) / 1.055, 2.4);
}

/**
 * Parses Hex color (e.g. #4F46E5 or #FFF) into [r, g, b].
 */
export function parseHexColor(hex: string): [number, number, number] {
  let cleaned = hex.replace("#", "").trim();
  if (cleaned.length === 3) {
    cleaned = cleaned
      .split("")
      .map((c) => c + c)
      .join("");
  }
  if (cleaned.length !== 6) {
    return [79, 70, 229]; // fallback default indigo
  }
  const r = parseInt(cleaned.slice(0, 2), 16) || 0;
  const g = parseInt(cleaned.slice(2, 4), 16) || 0;
  const b = parseInt(cleaned.slice(4, 6), 16) || 0;
  return [r, g, b];
}

/**
 * Calculates relative luminance of a color as defined by WCAG 2.1.
 * L = 0.2126 * R + 0.7152 * G + 0.0722 * B
 */
export function calculateRelativeLuminance(hex: string): number {
  const [r, g, b] = parseHexColor(hex);
  return 0.2126 * sRgbLuminance(r) + 0.7152 * sRgbLuminance(g) + 0.0722 * sRgbLuminance(b);
}

/**
 * Computes WCAG 2.1 contrast ratio between two hex colors:
 * Ratio = (L1 + 0.05) / (L2 + 0.05) where L1 is lighter.
 */
export function calculateContrastRatio(hex1: string, hex2: string): number {
  const l1 = calculateRelativeLuminance(hex1);
  const l2 = calculateRelativeLuminance(hex2);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  const ratio = (lighter + 0.05) / (darker + 0.05);
  return Math.round(ratio * 100) / 100;
}

/**
 * Evaluates WCAG 2.1 AA Compliance for a brand primary color:
 * - Normal text requires >= 4.5:1
 * - Large text requires >= 3.0:1
 */
export function evaluateWcagCompliance(hexColor: string): WcagContrastResult {
  const ratioWithWhite = calculateContrastRatio(hexColor, "#FFFFFF");
  const ratioWithDark = calculateContrastRatio(hexColor, "#09090B");

  const bestRatio = Math.max(ratioWithWhite, ratioWithDark);
  const recommendedTextColor = ratioWithWhite >= ratioWithDark ? "#ffffff" : "#09090b";

  const passesAaNormalText = bestRatio >= 4.5;
  const passesAaLargeText = bestRatio >= 3.0;

  let complianceStatus: "AA Passed" | "AA Large Only" | "Failed" = "Failed";
  if (passesAaNormalText) {
    complianceStatus = "AA Passed";
  } else if (passesAaLargeText) {
    complianceStatus = "AA Large Only";
  }

  return {
    contrastRatioWithWhite: ratioWithWhite,
    contrastRatioWithDark: ratioWithDark,
    passesAaNormalText,
    passesAaLargeText,
    recommendedTextColor,
    complianceStatus,
  };
}

/**
 * Simulates decentralized IPFS metadata upload and returns a standard CIDv1 URI.
 */
export async function uploadBrandConfigToIpfs(
  config: AdvertiserBrandConfig,
): Promise<{ ipfsUri: string; cid: string; timestamp: number }> {
  // Produce deterministic CID based on config content
  const jsonStr = JSON.stringify(config);
  let hashVal = 0;
  for (let i = 0; i < jsonStr.length; i++) {
    hashVal = (hashVal << 5) - hashVal + jsonStr.charCodeAt(i);
    hashVal |= 0;
  }
  const hexPart = Math.abs(hashVal).toString(16).padStart(8, "0");
  const cid = `bafybeih${hexPart}${Date.now().toString(16)}stormsalebrand`;
  const ipfsUri = `ipfs://${cid}`;

  return {
    ipfsUri,
    cid,
    timestamp: Date.now(),
  };
}

const BRAND_STORAGE_PREFIX = "stormsale_advertiser_brand_";

/**
 * Saves brand configuration for an advertiser or subdomain.
 */
export function saveBrandConfig(advertiserAddress: string, config: AdvertiserBrandConfig): void {
  if (typeof window === "undefined") return;
  const key = `${BRAND_STORAGE_PREFIX}${advertiserAddress.toLowerCase()}`;
  const subdomainKey = `${BRAND_STORAGE_PREFIX}subdomain_${config.subdomain.toLowerCase()}`;
  const json = JSON.stringify(config);
  localStorage.setItem(key, json);
  localStorage.setItem(subdomainKey, json);
  localStorage.setItem(`${BRAND_STORAGE_PREFIX}active`, json);
}

/**
 * Loads brand configuration by advertiser address or subdomain.
 */
export function loadBrandConfig(identifier?: string): AdvertiserBrandConfig {
  if (typeof window === "undefined") return DEFAULT_BRAND_CONFIG;
  if (!identifier) {
    const active = localStorage.getItem(`${BRAND_STORAGE_PREFIX}active`);
    if (active) {
      try {
        return JSON.parse(active);
      } catch {
        // Fallback
      }
    }
    return DEFAULT_BRAND_CONFIG;
  }

  const byAddr = localStorage.getItem(`${BRAND_STORAGE_PREFIX}${identifier.toLowerCase()}`);
  if (byAddr) {
    try {
      return JSON.parse(byAddr);
    } catch {
      // Ignore
    }
  }

  const bySubdomain = localStorage.getItem(
    `${BRAND_STORAGE_PREFIX}subdomain_${identifier.toLowerCase()}`,
  );
  if (bySubdomain) {
    try {
      return JSON.parse(bySubdomain);
    } catch {
      // Ignore
    }
  }

  return DEFAULT_BRAND_CONFIG;
}

/**
 * Validates subdomain format (alphanumeric, hyphens, 3-30 chars).
 */
export function isValidSubdomain(subdomain: string): boolean {
  if (!subdomain) return false;
  return /^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$/.test(subdomain);
}
