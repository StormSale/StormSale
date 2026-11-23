import { describe, it, expect } from "vitest";
import {
  STATIC_CSP_HEADER,
  STRICT_CSP_DIRECTIVES,
  DOMAIN_ALLOWLIST_DOCUMENTATION,
  validateCspHeader,
  buildCspHeader,
  generateNonce,
} from "../config/csp";

describe("CSP Compliance and Zero-Eval Test Suite (#508)", () => {
  describe("1. Forbidden string patterns in bundled code", () => {
    it("buildCspHeader strips unsafe-eval from directives", () => {
      const header = buildCspHeader({
        directives: {
          "script-src": ["'self'", "'unsafe-eval'", "https://example.com"],
        },
      });
      expect(header).not.toContain("unsafe-eval");
      expect(header).toContain("script-src 'self' https://example.com");
    });

    it("buildCspHeader strips unsafe-inline from directives", () => {
      const header = buildCspHeader({
        directives: {
          "script-src": ["'self'", "'unsafe-inline'"],
          "style-src": ["'self'", "'unsafe-inline'"],
        },
      });
      expect(header).not.toContain("unsafe-inline");
    });

    it("STATIC_CSP_HEADER itself contains no eval(", () => {
      expect(STATIC_CSP_HEADER).not.toContain("eval(");
    });

    it("STATIC_CSP_HEADER contains no new Function(", () => {
      expect(STATIC_CSP_HEADER).not.toContain("new Function(");
    });

    it("STATIC_CSP_HEADER contains no document.write(", () => {
      expect(STATIC_CSP_HEADER).not.toContain("document.write(");
    });
  });

  describe("2. CSP meta tag header enforcement", () => {
    it("enforces default-src 'self'", () => {
      expect(STATIC_CSP_HEADER).toContain("default-src 'self'");
      expect(STRICT_CSP_DIRECTIVES["default-src"]).toEqual(["'self'"]);
    });

    it("enforces script-src 'self'", () => {
      expect(STATIC_CSP_HEADER).toContain("script-src 'self'");
      expect(STRICT_CSP_DIRECTIVES["script-src"]).toContain("'self'");
    });

    it("enforces object-src 'none'", () => {
      expect(STATIC_CSP_HEADER).toContain("object-src 'none'");
      expect(STRICT_CSP_DIRECTIVES["object-src"]).toEqual(["'none'"]);
    });

    it("enforces base-uri 'self'", () => {
      expect(STATIC_CSP_HEADER).toContain("base-uri 'self'");
    });

    it("enforces frame-ancestors 'none'", () => {
      expect(STATIC_CSP_HEADER).toContain("frame-ancestors 'none'");
    });

    it("does not contain unsafe-inline", () => {
      expect(STATIC_CSP_HEADER).not.toContain("unsafe-inline");
    });

    it("does not contain unsafe-eval", () => {
      expect(STATIC_CSP_HEADER).not.toContain("unsafe-eval");
    });

    it("passes full validateCspHeader validation", () => {
      const result = validateCspHeader(STATIC_CSP_HEADER);
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("validateCspHeader rejects header missing script-src self", () => {
      const bad =
        "default-src 'self'; script-src https://evil.com; connect-src 'self' https://*.stellar.org;";
      const result = validateCspHeader(bad);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain("Missing required 'script-src' directive with ''self''");
    });

    it("validateCspHeader rejects header with unsafe-inline", () => {
      const bad =
        "default-src 'self'; script-src 'self' 'unsafe-inline'; connect-src 'self' https://*.stellar.org;";
      const result = validateCspHeader(bad);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain("CSP header contains prohibited 'unsafe-inline'");
    });
  });

  describe("3. External asset domains explicitly whitelisted", () => {
    it("connect-src includes Stellar network", () => {
      expect(STRICT_CSP_DIRECTIVES["connect-src"]).toContain("https://*.stellar.org");
    });

    it("connect-src includes Albedo wallet", () => {
      expect(STRICT_CSP_DIRECTIVES["connect-src"]).toContain("https://albedo.link");
    });

    it("connect-src includes Stellar Expert explorer", () => {
      expect(STRICT_CSP_DIRECTIVES["connect-src"]).toContain("https://stellar.expert");
    });

    it("img-src includes Unsplash for campaign banners", () => {
      expect(STRICT_CSP_DIRECTIVES["img-src"]).toContain("https://images.unsplash.com");
    });

    it("img-src includes Pravatar for profile avatars", () => {
      expect(STRICT_CSP_DIRECTIVES["img-src"]).toContain("https://i.pravatar.cc");
    });

    it("script-src only allows self and telegram.org", () => {
      expect(STRICT_CSP_DIRECTIVES["script-src"]).toEqual(["'self'", "https://telegram.org"]);
    });

    it("style-src only allows self", () => {
      expect(STRICT_CSP_DIRECTIVES["style-src"]).toEqual(["'self'"]);
    });

    it("font-src only allows self", () => {
      expect(STRICT_CSP_DIRECTIVES["font-src"]).toEqual(["'self'"]);
    });

    it("all documented external domains have reason and directive", () => {
      expect(DOMAIN_ALLOWLIST_DOCUMENTATION.length).toBeGreaterThan(0);
      for (const entry of DOMAIN_ALLOWLIST_DOCUMENTATION) {
        expect(typeof entry.reason).toBe("string");
        expect(entry.reason.length).toBeGreaterThan(0);
        expect(typeof entry.directive).toBe("string");
        expect(entry.directive.length).toBeGreaterThan(0);
      }
    });

    it("documentation covers all major external domains", () => {
      const auditedDomains = DOMAIN_ALLOWLIST_DOCUMENTATION.map((d) => d.domain);
      expect(auditedDomains).toContain("https://telegram.org");
      expect(auditedDomains).toContain("https://*.stellar.org");
      expect(auditedDomains).toContain("https://albedo.link");
      expect(auditedDomains).toContain("https://stellar.expert");
      expect(auditedDomains).toContain("https://xbull.app");
      expect(auditedDomains).toContain("https://images.unsplash.com");
      expect(auditedDomains).toContain("https://i.pravatar.cc");
    });
  });

  describe("4. Nonce generation and injection", () => {
    it("generateNonce returns a valid base64 string of at least 16 chars", () => {
      const nonce = generateNonce();
      expect(typeof nonce).toBe("string");
      expect(nonce.length).toBeGreaterThanOrEqual(16);
      expect(/^[A-Za-z0-9+/=]+$/.test(nonce)).toBe(true);
    });

    it("generateNonce produces unique values on 50 successive calls", () => {
      const nonces = new Set<string>();
      for (let i = 0; i < 50; i++) {
        nonces.add(generateNonce());
      }
      expect(nonces.size).toBe(50);
    });

    it("buildCspHeader injects nonce into script-src without unsafe keywords", () => {
      const nonce = generateNonce();
      const header = buildCspHeader({ nonce });
      expect(header).toContain(`'nonce-${nonce}'`);
      expect(header).toContain("script-src 'self'");
      expect(header).not.toContain("unsafe-eval");
      expect(header).not.toContain("unsafe-inline");
    });
  });
});
