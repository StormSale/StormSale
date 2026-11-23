/**
 * Dynamic Referral Link & Branded QR Code Generator (#448)
 *
 * Implements:
 * 1. B2C custom slug validation (alphanumeric, dashes, min 4, max 24 chars).
 * 2. Link shortener and dynamic referral URL generator.
 * 3. One-click copy with temporary checkmark icon and audio/haptic feedback.
 * 4. High-resolution branded QR code generation (PNG/SVG) with embedded logo and download support.
 */

import QRCode from "qrcode";
import { copyToClipboard } from "../components/ui/copy-button";
import { triggerHaptic } from "./telegram";

export const SLUG_MIN_LENGTH = 4;
export const SLUG_MAX_LENGTH = 24;

export const DEFAULT_SHORT_DOMAIN = "https://stormsale.xyz";

export const RESERVED_B2C_SLUGS = new Set([
  "api",
  "auth",
  "admin",
  "dashboard",
  "affiliate",
  "advertiser",
  "auditor",
  "terms",
  "privacy",
  "login",
  "register",
  "contracts",
  "settings",
  "explore",
  "help",
  "support",
  "c",
]);

export interface SlugValidationResult {
  isValid: boolean;
  normalizedSlug: string;
  reason?: string;
  charCount: number;
}

export interface DynamicReferralOptions {
  slug: string;
  affiliateAddress?: string;
  referralCode?: string;
  parentCode?: string;
  campaignId?: string;
  baseUrl?: string;
  extraTracking?: Record<string, string>;
}

export interface QRCodeBrandingOptions {
  width?: number;
  margin?: number;
  logoSize?: number;
  logoSvg?: string;
  logoDataUrl?: string;
  badgeRadius?: number;
  darkColor?: string;
  lightColor?: string;
}

export const DEFAULT_STORMSALE_LOGO_SVG = `<svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
  <rect width="100" height="100" rx="22" fill="#4F46E5"/>
  <path d="M52 18L26 56H48L42 82L74 44H52L60 18H52Z" fill="#FBBF24"/>
</svg>`;

/**
 * Normalizes user input for custom slug:
 * - Trims whitespace
 * - Converts to lowercase
 * - Collapses multiple spaces and underscores to single hyphen
 */
export function normalizeSlugInput(rawInput: string): string {
  if (!rawInput) return "";
  return rawInput
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, "-");
}

/**
 * Validates B2C custom slug input:
 * - Must be strictly alphanumeric and hyphens.
 * - Minimum 4 characters, maximum 24 characters.
 * - No leading, trailing, or consecutive hyphens.
 * - Cannot conflict with reserved protocol routes.
 */
export function validateCustomSlug(rawSlug: string): SlugValidationResult {
  if (!rawSlug || typeof rawSlug !== "string" || !rawSlug.trim()) {
    return {
      isValid: false,
      normalizedSlug: "",
      reason: "Custom slug cannot be empty.",
      charCount: 0,
    };
  }

  const normalized = normalizeSlugInput(rawSlug);
  const len = normalized.length;

  // 1. Reserved system routes cannot be used regardless of length
  if (RESERVED_B2C_SLUGS.has(normalized)) {
    return {
      isValid: false,
      normalizedSlug: normalized,
      reason: `'${normalized}' is a reserved system route and cannot be used.`,
      charCount: len,
    };
  }

  // 2. Length boundary: min 4, max 24 chars
  if (len < SLUG_MIN_LENGTH) {
    return {
      isValid: false,
      normalizedSlug: normalized,
      reason: `Custom slug must be at least ${SLUG_MIN_LENGTH} characters (currently ${len}).`,
      charCount: len,
    };
  }

  if (len > SLUG_MAX_LENGTH) {
    return {
      isValid: false,
      normalizedSlug: normalized,
      reason: `Custom slug cannot exceed ${SLUG_MAX_LENGTH} characters (currently ${len}).`,
      charCount: len,
    };
  }

  if (normalized.startsWith("-")) {
    return {
      isValid: false,
      normalizedSlug: normalized,
      reason: "Custom slug cannot begin with a hyphen.",
      charCount: len,
    };
  }

  if (normalized.endsWith("-")) {
    return {
      isValid: false,
      normalizedSlug: normalized,
      reason: "Custom slug cannot end with a hyphen.",
      charCount: len,
    };
  }

  if (normalized.includes("--")) {
    return {
      isValid: false,
      normalizedSlug: normalized,
      reason: "Custom slug cannot contain consecutive hyphens.",
      charCount: len,
    };
  }

  // Strictly alphanumeric with single hyphens
  const alphanumericHyphenRegex = /^[a-z0-9]+(-[a-z0-9]+)*$/;
  if (!alphanumericHyphenRegex.test(normalized)) {
    return {
      isValid: false,
      normalizedSlug: normalized,
      reason: "Custom slug can only contain letters, numbers, and hyphens.",
      charCount: len,
    };
  }

  return {
    isValid: true,
    normalizedSlug: normalized,
    charCount: len,
  };
}

/**
 * Builds a dynamic cloaked referral URL incorporating the custom slug and optional tracking params.
 */
export function generateDynamicReferralUrl(options: DynamicReferralOptions): string {
  const base = options.baseUrl || (typeof window !== "undefined" ? window.location.origin : DEFAULT_SHORT_DOMAIN);
  const normalizedSlug = normalizeSlugInput(options.slug);
  const url = new URL(`/c/${normalizedSlug}`, base);

  if (options.referralCode) {
    url.searchParams.set("ref", options.referralCode.trim());
  } else if (options.affiliateAddress) {
    url.searchParams.set("ref", options.affiliateAddress.trim());
  }

  if (options.parentCode) {
    url.searchParams.set("parent", options.parentCode.trim());
  }

  if (options.campaignId) {
    url.searchParams.set("campaign", options.campaignId.trim());
  }

  if (options.extraTracking) {
    for (const [key, value] of Object.entries(options.extraTracking)) {
      if (value) url.searchParams.set(key, value);
    }
  }

  return url.toString();
}

/**
 * Synthesizes subtle audio confirmation feedback using Web Audio API oscillator.
 * Gracefully degrades in environments without audio support.
 */
export function triggerAudioFeedback(customAudioCtx?: any): boolean {
  try {
    const AudioContextClass =
      customAudioCtx ||
      (typeof window !== "undefined"
        ? window.AudioContext || (window as any).webkitAudioContext
        : null);

    if (!AudioContextClass) return false;

    let ctx: any;
    try {
      ctx = new AudioContextClass();
    } catch {
      ctx = typeof AudioContextClass === "function" ? AudioContextClass() : AudioContextClass;
    }

    if (!ctx || typeof ctx.createOscillator !== "function") return false;

    // Pleasant high-frequency confirmation chime: 880Hz (A5) -> 1760Hz (A6)
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "sine";
    const now = ctx.currentTime || 0;
    osc.frequency.setValueAtTime(880, now);
    if (typeof osc.frequency.exponentialRampToValueAtTime === "function") {
      osc.frequency.exponentialRampToValueAtTime(1760, now + 0.08);
    }

    gain.gain.setValueAtTime(0.12, now);
    if (typeof gain.gain.exponentialRampToValueAtTime === "function") {
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
    }

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.12);

    return true;
  } catch {
    return false;
  }
}

/**
 * Triggers native haptic vibration feedback.
 * Supports Navigator Vibration API and Telegram Mini App haptics.
 */
export function triggerHapticFeedback(pattern: number | number[] = [15, 30, 15]): boolean {
  let triggered = false;

  // 1. Try Navigator Vibration API
  if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
    try {
      navigator.vibrate(pattern);
      triggered = true;
    } catch {
      // Ignore vibration error
    }
  }

  // 2. Try Telegram Mini App Haptic Feedback
  try {
    const telegramHaptic = triggerHaptic("success");
    if (telegramHaptic) triggered = true;
  } catch {
    // Ignore telegram error
  }

  return triggered;
}

/**
 * Fires both audio and haptic feedback on successful copy.
 */
export function triggerCopyFeedback(options: { audio?: boolean; haptic?: boolean } = {}): {
  audio: boolean;
  haptic: boolean;
} {
  const audio = options.audio !== false ? triggerAudioFeedback() : false;
  const haptic = options.haptic !== false ? triggerHapticFeedback() : false;
  return { audio, haptic };
}

/**
 * Copies referral link to clipboard and triggers audio and haptic feedback.
 */
export async function copyReferralLinkWithFeedback(
  url: string,
  options: { audio?: boolean; haptic?: boolean } = {},
): Promise<{ success: boolean; audio: boolean; haptic: boolean }> {
  const success = await copyToClipboard(url);
  let audio = false;
  let haptic = false;

  if (success) {
    const feedback = triggerCopyFeedback(options);
    audio = feedback.audio;
    haptic = feedback.haptic;
  }

  return { success, audio, haptic };
}

/**
 * Generates high-resolution Scalable Vector Graphics (SVG) QR code with embedded brand logo.
 */
export async function generateBrandedQRCodeSVG(
  url: string,
  options: QRCodeBrandingOptions = {},
): Promise<string> {
  const width = options.width || 512;
  const margin = options.margin ?? 2;
  const darkColor = options.darkColor || "#0f172a";
  const lightColor = options.lightColor || "#ffffff";
  const logoSize = options.logoSize || Math.round(width * 0.22); // 22% of QR width

  // 1. Generate base high-correction SVG from QRCode library
  const rawSvg = await QRCode.toString(url, {
    type: "svg",
    errorCorrectionLevel: "H",
    margin,
    width,
    color: {
      dark: darkColor,
      light: lightColor,
    },
  });

  // Calculate center coordinates
  const centerX = width / 2;
  const centerY = width / 2;
  const badgeSize = logoSize + 16;
  const badgeRadius = options.badgeRadius || 14;

  const badgeX = centerX - badgeSize / 2;
  const badgeY = centerY - badgeSize / 2;
  const logoX = centerX - logoSize / 2;
  const logoY = centerY - logoSize / 2;

  const logoMarkup = options.logoSvg || DEFAULT_STORMSALE_LOGO_SVG;

  // Insert embedded brand center plate & logo before closing </svg>
  const embeddedLogoGroup = `
  <g id="branded-logo-overlay">
    <!-- Center protective shield badge -->
    <rect x="${badgeX}" y="${badgeY}" width="${badgeSize}" height="${badgeSize}" rx="${badgeRadius}" fill="${lightColor}" stroke="${darkColor}" stroke-width="2" stroke-opacity="0.08"/>
    <!-- Center brand icon -->
    <g transform="translate(${logoX}, ${logoY}) scale(${logoSize / 100})">
      ${logoMarkup}
    </g>
  </g>
</svg>`;

  return rawSvg.replace("</svg>", embeddedLogoGroup);
}

/**
 * Generates high-resolution PNG data URL for referral QR code with embedded logo plate.
 */
export async function generateBrandedQRCodePNG(
  url: string,
  options: QRCodeBrandingOptions = {},
): Promise<string> {
  const width = options.width || 512;
  const margin = options.margin ?? 2;
  const darkColor = options.darkColor || "#0f172a";
  const lightColor = options.lightColor || "#ffffff";

  // Generate high-resolution base QR PNG data URL
  const baseDataUrl = await QRCode.toDataURL(url, {
    errorCorrectionLevel: "H",
    margin,
    width,
    color: {
      dark: darkColor,
      light: lightColor,
    },
  });

  // If running in DOM environment with canvas, stamp the center logo onto the canvas
  if (typeof document !== "undefined") {
    try {
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = width;
      const ctx = canvas.getContext("2d");

      if (ctx) {
        // Draw base QR code image
        const img = new Image();
        img.src = baseDataUrl;

        await new Promise<void>((resolve, reject) => {
          img.onload = () => resolve();
          img.onerror = () => reject(new Error("Failed to load base QR code image"));
        });

        ctx.drawImage(img, 0, 0, width, width);

        // Draw center logo shield
        const logoSize = options.logoSize || Math.round(width * 0.22);
        const badgeSize = logoSize + 16;
        const centerX = width / 2;
        const centerY = width / 2;
        const badgeX = centerX - badgeSize / 2;
        const badgeY = centerY - badgeSize / 2;

        ctx.fillStyle = lightColor;
        ctx.beginPath();
        if (typeof ctx.roundRect === "function") {
          ctx.roundRect(badgeX, badgeY, badgeSize, badgeSize, 12);
        } else {
          ctx.rect(badgeX, badgeY, badgeSize, badgeSize);
        }
        ctx.fill();

        // Draw border around badge
        ctx.strokeStyle = "rgba(15, 23, 42, 0.1)";
        ctx.lineWidth = 2;
        ctx.stroke();

        // Fill badge with indigo brand accent
        ctx.fillStyle = "#4F46E5";
        ctx.beginPath();
        if (typeof ctx.roundRect === "function") {
          ctx.roundRect(centerX - logoSize / 2, centerY - logoSize / 2, logoSize, logoSize, 8);
        } else {
          ctx.rect(centerX - logoSize / 2, centerY - logoSize / 2, logoSize, logoSize);
        }
        ctx.fill();

        return canvas.toDataURL("image/png");
      }
    } catch {
      // Fallback to base data URL if canvas manipulation fails
      return baseDataUrl;
    }
  }

  return baseDataUrl;
}

/**
 * Triggers file download in the browser for PNG or SVG QR code files.
 */
export function downloadQRCodeFile(
  content: string,
  filename: string,
  mimeType: "image/png" | "image/svg+xml" = "image/png",
): boolean {
  if (typeof document === "undefined") return false;

  try {
    let href = content;
    let shouldRevoke = false;

    if (mimeType === "image/svg+xml" && !content.startsWith("data:")) {
      const blob = new Blob([content], { type: "image/svg+xml;charset=utf-8" });
      href = URL.createObjectURL(blob);
      shouldRevoke = true;
    }

    const a = document.createElement("a");
    a.href = href;
    a.download = filename;
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    if (shouldRevoke) {
      setTimeout(() => URL.revokeObjectURL(href), 1000);
    }

    return true;
  } catch (err) {
    console.error("Failed to initiate QR code download:", err);
    return false;
  }
}
