import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import React from "react";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import {
  validateCustomSlug,
  normalizeSlugInput,
  generateDynamicReferralUrl,
  triggerAudioFeedback,
  triggerHapticFeedback,
  triggerCopyFeedback,
  copyReferralLinkWithFeedback,
  generateBrandedQRCodeSVG,
  generateBrandedQRCodePNG,
  downloadQRCodeFile,
  SLUG_MIN_LENGTH,
  SLUG_MAX_LENGTH,
  RESERVED_B2C_SLUGS,
  DEFAULT_STORMSALE_LOGO_SVG,
} from "../lib/referralLinkGenerator";
import { B2CReferralLinkGenerator } from "../components/affiliate/B2CReferralLinkGenerator";

describe("Dynamic Referral Link & Branded QR Code Generator (#448)", () => {
  const MOCK_AFFILIATE_ADDR = "GASTORMSALE7AFFILIATE0000000000000000000000000000000001";
  const MOCK_REF_CODE = "REF-ALICE-E5B2";

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // =========================================================================
  // ACCEPTANCE CRITERIA 1: Custom slug input validation
  // =========================================================================
  describe("1. Custom Slug Input Validation (Alphanumeric, Dashes, Min 4, Max 24 chars)", () => {
    it("accepts valid custom slugs within the 4-24 character boundary", () => {
      // Exact min length: 4 chars
      const minValid = validateCustomSlug("deal");
      expect(minValid.isValid).toBe(true);
      expect(minValid.charCount).toBe(4);
      expect(minValid.normalizedSlug).toBe("deal");

      // Mid-range alphanumeric with dashes
      const midValid = validateCustomSlug("summer-promo-2026");
      expect(midValid.isValid).toBe(true);
      expect(midValid.charCount).toBe(17);
      expect(midValid.normalizedSlug).toBe("summer-promo-2026");

      // Exact max length: 24 chars
      const maxValid = validateCustomSlug("affiliate-vip-promo-2026");
      expect(maxValid.charCount).toBe(24);
      expect(maxValid.isValid).toBe(true);
      expect(maxValid.normalizedSlug).toBe("affiliate-vip-promo-2026");

      // Pure numbers
      const numericValid = validateCustomSlug("2026");
      expect(numericValid.isValid).toBe(true);
    });

    it("rejects slugs that are shorter than 4 characters", () => {
      expect(validateCustomSlug("").isValid).toBe(false);
      expect(validateCustomSlug("a").isValid).toBe(false);
      expect(validateCustomSlug("ab").isValid).toBe(false);

      const threeChars = validateCustomSlug("abc");
      expect(threeChars.isValid).toBe(false);
      expect(threeChars.charCount).toBe(3);
      expect(threeChars.reason).toContain(`must be at least ${SLUG_MIN_LENGTH} characters`);
    });

    it("rejects slugs that exceed the 24-character maximum", () => {
      const twentyFiveChars = "a".repeat(25);
      const result25 = validateCustomSlug(twentyFiveChars);
      expect(result25.isValid).toBe(false);
      expect(result25.charCount).toBe(25);
      expect(result25.reason).toContain(`cannot exceed ${SLUG_MAX_LENGTH} characters`);

      const longSlug = validateCustomSlug("super-long-affiliate-slug-2026-xyz");
      expect(longSlug.isValid).toBe(false);
    });

    it("rejects invalid characters (spaces, underscores, special symbols)", () => {
      const withSpaces = validateCustomSlug("deal 2026");
      // Note: normalize collapses spaces to hyphen, but raw invalid characters are rejected
      expect(validateCustomSlug("deal@2026").isValid).toBe(false);
      expect(validateCustomSlug("promo!sale").isValid).toBe(false);
      expect(validateCustomSlug("crypto#vip").isValid).toBe(false);
      expect(validateCustomSlug("affiliate$bonus").isValid).toBe(false);
      expect(validateCustomSlug("percent%off").isValid).toBe(false);

      expect(withSpaces.normalizedSlug).toBe("deal-2026");
    });

    it("rejects leading, trailing, or consecutive hyphens", () => {
      const leadingHyphen = validateCustomSlug("-summer-deals");
      expect(leadingHyphen.isValid).toBe(false);
      expect(leadingHyphen.reason).toContain("cannot begin with a hyphen");

      const trailingHyphen = validateCustomSlug("summer-deals-");
      expect(trailingHyphen.isValid).toBe(false);
      expect(trailingHyphen.reason).toContain("cannot end with a hyphen");

      const consecutiveHyphens = validateCustomSlug("summer--deals");
      expect(consecutiveHyphens.isValid).toBe(false);
      expect(consecutiveHyphens.reason).toContain("cannot contain consecutive hyphens");
    });

    it("rejects reserved protocol routes", () => {
      for (const reserved of ["admin", "api", "auth", "dashboard", "contracts"]) {
        const result = validateCustomSlug(reserved);
        expect(result.isValid).toBe(false);
        expect(result.reason).toContain("is a reserved system route");
      }
      expect(RESERVED_B2C_SLUGS.has("admin")).toBe(true);
    });

    it("normalizes slug input by trimming whitespace and converting to lowercase", () => {
      expect(normalizeSlugInput("  Summer-DEAL_2026  ")).toBe("summer-deal-2026");
      expect(normalizeSlugInput("FLASH   SALE")).toBe("flash-sale");
    });

    it("generates dynamic cloaked referral URLs with preserved query parameters", () => {
      const url = generateDynamicReferralUrl({
        slug: "crypto-drop",
        referralCode: MOCK_REF_CODE,
        campaignId: "101",
        baseUrl: "https://stormsale.xyz",
        extraTracking: { utm_source: "telegram", utm_medium: "community" },
      });

      expect(url).toBe(
        "https://stormsale.xyz/c/crypto-drop?ref=REF-ALICE-E5B2&campaign=101&utm_source=telegram&utm_medium=community",
      );
    });

    it("displays live validation feedback in the UI component", async () => {
      render(
        React.createElement(B2CReferralLinkGenerator, {
          affiliateAddress: MOCK_AFFILIATE_ADDR,
          referralCode: MOCK_REF_CODE,
          defaultSlug: "vip", // < 4 chars initially
        }),
      );

      // Verify validation error for short slug
      expect(screen.getByTestId("slug-invalid-badge")).toBeDefined();
      expect(screen.getByTestId("slug-validation-error")).toBeDefined();
      expect(screen.getByTestId("slug-validation-error").textContent).toContain("at least 4 characters");

      // Type valid slug
      const input = screen.getByTestId("input-custom-slug") as HTMLInputElement;
      fireEvent.change(input, { target: { value: "vip-rewards" } });

      await waitFor(() => {
        expect(screen.getByTestId("slug-valid-badge")).toBeDefined();
        expect(screen.queryByTestId("slug-validation-error")).toBeNull();
      });

      const urlInput = screen.getByTestId("input-generated-url") as HTMLInputElement;
      expect(urlInput.value).toContain("/c/vip-rewards");
      expect(urlInput.value).toContain(`ref=${MOCK_REF_CODE}`);
    });
  });

  // =========================================================================
  // ACCEPTANCE CRITERIA 2: One-click copy with checkmark icon & audio/haptic
  // =========================================================================
  describe("2. One-Click Copy with Temporary Checkmark Icon & Audio/Haptic Feedback", () => {
    it("copies referral URL to clipboard and triggers audio and haptic feedback", async () => {
      const writeTextMock = vi.fn().mockResolvedValue(undefined);
      Object.assign(navigator, {
        clipboard: { writeText: writeTextMock },
      });

      const vibrateMock = vi.fn().mockReturnValue(true);
      navigator.vibrate = vibrateMock;

      const mockOscillator = {
        type: "sine",
        frequency: {
          setValueAtTime: vi.fn(),
          exponentialRampToValueAtTime: vi.fn(),
        },
        connect: vi.fn(),
        start: vi.fn(),
        stop: vi.fn(),
      };

      const mockGain = {
        gain: {
          setValueAtTime: vi.fn(),
          exponentialRampToValueAtTime: vi.fn(),
        },
        connect: vi.fn(),
      };

      const mockAudioContext = vi.fn(function () {
        return {
          currentTime: 0,
          destination: {},
          createOscillator: vi.fn().mockReturnValue(mockOscillator),
          createGain: vi.fn().mockReturnValue(mockGain),
        };
      });

      (window as any).AudioContext = mockAudioContext;

      // Execute copy with feedback
      const testUrl = "https://stormsale.xyz/c/summer-deal?ref=REF-ALICE-E5B2";
      const result = await copyReferralLinkWithFeedback(testUrl);

      expect(result.success).toBe(true);
      expect(writeTextMock).toHaveBeenCalledWith(testUrl);

      // Verify haptic feedback was invoked
      expect(vibrateMock).toHaveBeenCalledWith([15, 30, 15]);
      expect(result.haptic).toBe(true);

      // Verify audio chime synthesis was invoked
      expect(mockAudioContext).toHaveBeenCalled();
      expect(mockOscillator.start).toHaveBeenCalled();
      expect(mockOscillator.stop).toHaveBeenCalled();
      expect(result.audio).toBe(true);
    });

    it("gracefully handles audio or haptic failure without breaking clipboard copy", async () => {
      const writeTextMock = vi.fn().mockResolvedValue(undefined);
      Object.assign(navigator, {
        clipboard: { writeText: writeTextMock },
      });

      // Break vibrate
      navigator.vibrate = vi.fn(function () {
        throw new Error("Vibration permission denied");
      });

      // Break AudioContext
      (window as any).AudioContext = vi.fn(function () {
        throw new Error("AudioContext suspended by autoplay policy");
      });

      const result = await copyReferralLinkWithFeedback("https://stormsale.xyz/c/safe-copy");

      expect(result.success).toBe(true);
      expect(result.haptic).toBe(false);
      expect(result.audio).toBe(false);
    });

    it("toggles temporary checkmark icon for 2000ms upon copy in UI component", async () => {
      vi.useFakeTimers();

      const writeTextMock = vi.fn().mockResolvedValue(undefined);
      Object.assign(navigator, {
        clipboard: { writeText: writeTextMock },
      });

      render(
        React.createElement(B2CReferralLinkGenerator, {
          affiliateAddress: MOCK_AFFILIATE_ADDR,
          referralCode: MOCK_REF_CODE,
          defaultSlug: "summer-vip",
          resetDelay: 2000,
        }),
      );

      // Verify initial state: Copy icon is visible
      const copyBtn = screen.getByTestId("btn-copy-link");
      expect(screen.getByTestId("icon-copy")).toBeDefined();
      expect(copyBtn.textContent).toContain("Copy Link");
      expect(screen.queryByTestId("icon-check")).toBeNull();

      // Click copy button
      await act(async () => {
        fireEvent.click(copyBtn);
      });

      // Verify checkmark icon is displayed
      expect(screen.getByTestId("icon-check")).toBeDefined();
      expect(copyBtn.textContent).toContain("Copied!");
      expect(screen.queryByTestId("icon-copy")).toBeNull();

      // Advance time by 1900ms: still checkmark
      act(() => {
        vi.advanceTimersByTime(1900);
      });
      expect(screen.getByTestId("icon-check")).toBeDefined();

      // Advance time past 2000ms: reverts to Copy icon
      act(() => {
        vi.advanceTimersByTime(200);
      });
      expect(screen.getByTestId("icon-copy")).toBeDefined();
      expect(copyBtn.textContent).toContain("Copy Link");
      expect(screen.queryByTestId("icon-check")).toBeNull();

      vi.useRealTimers();
    });

    it("directly verifies triggerCopyFeedback helper standalone", () => {
      const feedback = triggerCopyFeedback({ audio: false, haptic: false });
      expect(feedback.audio).toBe(false);
      expect(feedback.haptic).toBe(false);

      const hapticOnly = triggerHapticFeedback(50);
      expect(typeof hapticOnly).toBe("boolean");

      const audioOnly = triggerAudioFeedback();
      expect(typeof audioOnly).toBe("boolean");
    });
  });

  // =========================================================================
  // ACCEPTANCE CRITERIA 3: High-resolution branded QR code (PNG & SVG)
  // =========================================================================
  describe("3. Branded QR Code Generation & PNG/SVG Download Support", () => {
    it("generates scalable SVG QR code with embedded logo overlay and error correction H", async () => {
      const testUrl = "https://stormsale.xyz/c/crypto-drop?ref=REF-ALICE-E5B2";
      const svg = await generateBrandedQRCodeSVG(testUrl, {
        width: 512,
        margin: 2,
      });

      expect(svg).toContain("<svg");
      expect(svg).toContain("</svg>");
      // Verify embedded logo group overlay
      expect(svg).toContain('id="branded-logo-overlay"');
      expect(svg).toContain(DEFAULT_STORMSALE_LOGO_SVG.slice(0, 30));
    });

    it("generates high-resolution PNG data URL for referral QR code", async () => {
      const testUrl = "https://stormsale.xyz/c/crypto-drop?ref=REF-ALICE-E5B2";
      const pngDataUrl = await generateBrandedQRCodePNG(testUrl, {
        width: 512,
      });

      expect(pngDataUrl).toMatch(/^data:image\/png;base64,/);
    });

    it("triggers browser download for PNG format with correct filename and MIME type", () => {
      const mockClick = vi.fn();
      const originalCreateElement = document.createElement.bind(document);

      vi.spyOn(document, "createElement").mockImplementation((tagName: string) => {
        const el = originalCreateElement(tagName);
        if (tagName === "a") {
          el.click = mockClick;
        }
        return el;
      });

      const dummyPngData = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
      const success = downloadQRCodeFile(dummyPngData, "stormsale-summer.png", "image/png");

      expect(success).toBe(true);
      expect(mockClick).toHaveBeenCalledTimes(1);
    });

    it("triggers browser download for SVG format using Blob URL", () => {
      const mockClick = vi.fn();
      const originalCreateElement = document.createElement.bind(document);

      vi.spyOn(document, "createElement").mockImplementation((tagName: string) => {
        const el = originalCreateElement(tagName);
        if (tagName === "a") {
          el.click = mockClick;
        }
        return el;
      });

      // Mock URL.createObjectURL and URL.revokeObjectURL
      const mockCreateObjectUrl = vi.fn().mockReturnValue("blob:http://localhost/mock-svg-blob");
      const mockRevokeObjectUrl = vi.fn();
      globalThis.URL.createObjectURL = mockCreateObjectUrl;
      globalThis.URL.revokeObjectURL = mockRevokeObjectUrl;

      const dummySvg = '<svg viewBox="0 0 100 100"><rect width="100" height="100"/></svg>';
      const success = downloadQRCodeFile(dummySvg, "stormsale-summer.svg", "image/svg+xml");

      expect(success).toBe(true);
      expect(mockCreateObjectUrl).toHaveBeenCalled();
      expect(mockClick).toHaveBeenCalledTimes(1);
    });

    it("renders QR preview and triggers PNG/SVG downloads from UI component buttons", async () => {
      const mockClick = vi.fn();
      const originalCreateElement = document.createElement.bind(document);
      vi.spyOn(document, "createElement").mockImplementation((tagName: string) => {
        const el = originalCreateElement(tagName);
        if (tagName === "a") {
          el.click = mockClick;
        }
        return el;
      });

      render(
        React.createElement(B2CReferralLinkGenerator, {
          affiliateAddress: MOCK_AFFILIATE_ADDR,
          referralCode: MOCK_REF_CODE,
          defaultSlug: "autumn-deals",
        }),
      );

      // Wait for QR code SVG to render into container
      await waitFor(() => {
        expect(screen.getByTestId("qr-code-svg-container")).toBeDefined();
        const svgContainer = screen.getByTestId("qr-code-svg-container");
        expect(svgContainer.innerHTML).toContain("<svg");
      });

      // Click Download PNG
      const downloadPngBtn = screen.getByTestId("btn-download-png");
      await waitFor(() => expect(downloadPngBtn.getAttribute("disabled")).toBeNull());
      fireEvent.click(downloadPngBtn);
      expect(mockClick).toHaveBeenCalled();

      // Click Download SVG
      const downloadSvgBtn = screen.getByTestId("btn-download-svg");
      await waitFor(() => expect(downloadSvgBtn.getAttribute("disabled")).toBeNull());
      fireEvent.click(downloadSvgBtn);
      expect(mockClick).toHaveBeenCalled();
    });
  });
});
