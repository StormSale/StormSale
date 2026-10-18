import { describe, it, expect } from "vitest";
import {
  parseHexColor,
  calculateRelativeLuminance,
  calculateContrastRatio,
  evaluateWcagCompliance,
  uploadBrandConfigToIpfs,
  isValidSubdomain,
  DEFAULT_BRAND_CONFIG,
} from "../lib/branding";

describe("Advertiser Brand Customizer & Dynamic Subdomains (#149)", () => {
  describe("Hex Color Parsing & Luminance", () => {
    it("should parse 6-character hex colors accurately", () => {
      expect(parseHexColor("#FFFFFF")).toEqual([255, 255, 255]);
      expect(parseHexColor("#000000")).toEqual([0, 0, 0]);
      expect(parseHexColor("#4F46E5")).toEqual([79, 70, 229]);
    });

    it("should parse 3-character hex colors accurately", () => {
      expect(parseHexColor("#FFF")).toEqual([255, 255, 255]);
      expect(parseHexColor("#000")).toEqual([0, 0, 0]);
    });

    it("should compute accurate relative luminance according to WCAG 2.1", () => {
      expect(calculateRelativeLuminance("#FFFFFF")).toBeCloseTo(1, 2);
      expect(calculateRelativeLuminance("#000000")).toBeCloseTo(0, 2);
    });
  });

  describe("WCAG 2.1 Contrast Ratio & AA Compliance", () => {
    it("should calculate exact 21:1 ratio between pure white and pure black", () => {
      const ratio = calculateContrastRatio("#FFFFFF", "#000000");
      expect(ratio).toBe(21);
    });

    it("should calculate 1:1 ratio between identical colors", () => {
      const ratio = calculateContrastRatio("#4F46E5", "#4F46E5");
      expect(ratio).toBe(1);
    });

    it("should evaluate AA compliance for brand colors", () => {
      // Dark navy passes normal text on white
      const darkNavy = evaluateWcagCompliance("#0F172A");
      expect(darkNavy.passesAaNormalText).toBe(true);
      expect(darkNavy.recommendedTextColor).toBe("#ffffff");

      // Yellow on white fails normal text (low contrast)
      const brightYellow = evaluateWcagCompliance("#FEF08A");
      expect(brightYellow.contrastRatioWithWhite).toBeLessThan(4.5);
      expect(brightYellow.recommendedTextColor).toBe("#09090b");
    });
  });

  describe("Subdomain Validation", () => {
    it("should accept valid lowercase alphanumeric subdomains", () => {
      expect(isValidSubdomain("acme")).toBe(true);
      expect(isValidSubdomain("nike-affiliates")).toBe(true);
      expect(isValidSubdomain("crypto-shop-2026")).toBe(true);
    });

    it("should reject invalid subdomains", () => {
      expect(isValidSubdomain("")).toBe(false);
      expect(isValidSubdomain("a")).toBe(false); // too short (<3)
      expect(isValidSubdomain("-acme")).toBe(false); // starts with hyphen
      expect(isValidSubdomain("acme-")).toBe(false); // ends with hyphen
      expect(isValidSubdomain("acme_store")).toBe(false); // underscore not allowed
      expect(isValidSubdomain("acme.store")).toBe(false); // dot not allowed
      expect(isValidSubdomain("ACME")).toBe(false); // uppercase
    });
  });

  describe("IPFS Metadata Packaging", () => {
    it("should generate a valid decentralized IPFS CID URI", async () => {
      const result = await uploadBrandConfigToIpfs(DEFAULT_BRAND_CONFIG);

      expect(result.ipfsUri.startsWith("ipfs://bafybeih")).toBe(true);
      expect(result.cid).toBeDefined();
      expect(result.timestamp).toBeGreaterThan(0);
    });
  });
});
