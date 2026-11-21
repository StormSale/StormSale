// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import {
  sanitizeRedirectUrl,
  detectDoubleEncoding,
} from "../lib/redirectSanitizer";
import { ExternalRedirectModal } from "../components/affiliate/ExternalRedirectModal";

describe("Malicious Referral Redirect & Open Redirect Protection Suite (#481)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe("1. URL sanitizer rejecting non-HTTP/HTTPS protocols", () => {
    it("accepts valid secure HTTPS merchant URLs", () => {
      const validUrls = [
        "https://merchant.example.com/checkout?item=123",
        "https://store.brand.io/products/sneakers?ref=affiliate",
        "https://sub.domain.co.uk/promo#details",
      ];

      for (const url of validUrls) {
        const result = sanitizeRedirectUrl(url);
        expect(result.isValid).toBe(true);
        expect(result.sanitizedUrl).toBe(url);
        expect(result.targetDomain).toBeTruthy();
      }
    });

    it("accepts standard HTTP URLs (e.g. local dev servers)", () => {
      const httpUrl = "http://localhost:3000/callback";
      const result = sanitizeRedirectUrl(httpUrl);
      expect(result.isValid).toBe(true);
      expect(result.sanitizedUrl).toBe(httpUrl);
    });

    it("strictly rejects javascript: pseudo-protocol vectors", () => {
      const xssUrls = [
        "javascript:alert(1)",
        "javascript:alert('XSS')",
        "javascript:window.location='https://attacker.com'",
        "JAVASCRIPT:alert(document.cookie)",
        "javascript://%0aalert(1)",
      ];

      for (const url of xssUrls) {
        const result = sanitizeRedirectUrl(url);
        expect(result.isValid).toBe(false);
        expect(result.sanitizedUrl).toBeNull();
        expect(result.reason).toContain("Only http: and https: are allowed");
      }
    });

    it("strictly rejects data: and blob: URI schemes", () => {
      const dataUrls = [
        "data:text/html,<script>alert(1)</script>",
        "data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==",
        "blob:https://stormsale.xyz/uuid-123",
      ];

      for (const url of dataUrls) {
        const result = sanitizeRedirectUrl(url);
        expect(result.isValid).toBe(false);
        expect(result.reason).toContain("Only http: and https: are allowed");
      }
    });

    it("strictly rejects vbscript:, file:, ftp:, intent:, and about: protocols", () => {
      const dangerousProtocols = [
        "vbscript:msgbox('hi')",
        "file:///etc/passwd",
        "ftp://ftp.example.com/payload.sh",
        "intent:#Intent;scheme=bad;end",
        "about:blank",
      ];

      for (const url of dangerousProtocols) {
        const result = sanitizeRedirectUrl(url);
        expect(result.isValid).toBe(false);
        expect(result.reason).toContain("Only http: and https: are allowed");
      }
    });

    it("rejects protocol-relative URL bypass attempts", () => {
      const protocolRelativeUrls = [
        "//evil.com/phishing",
        "//attacker.com",
        "\\\\evil.com\\share",
      ];

      for (const url of protocolRelativeUrls) {
        const result = sanitizeRedirectUrl(url);
        expect(result.isValid).toBe(false);
        expect(result.reason).toContain("Protocol-relative URLs are prohibited");
      }
    });

    it("rejects userinfo credential injection bypass attempts", () => {
      const userinfoUrls = [
        "https://stormsale.xyz:fake@attacker.com/evil",
        "https://admin:password@malicious.org",
      ];

      for (const url of userinfoUrls) {
        const result = sanitizeRedirectUrl(url);
        expect(result.isValid).toBe(false);
        expect(result.reason).toContain("embedded username or password");
      }
    });

    it("rejects control characters, CRLF, and null bytes", () => {
      const crlfUrls = [
        "https://merchant.com\r\nSet-Cookie: evil=1",
        "https://merchant.com\nLocation: https://evil.com",
        "https://merchant.com\0/bad",
      ];

      for (const url of crlfUrls) {
        const result = sanitizeRedirectUrl(url);
        expect(result.isValid).toBe(false);
        expect(result.reason).toContain("control characters");
      }
    });
  });

  describe("2. Protection against double-encoded bypass attempts (%252f)", () => {
    it("detects and flags %252f double-encoded slashes", () => {
      expect(detectDoubleEncoding("https://legit.com%252fevil.com")).toBe(true);
      expect(detectDoubleEncoding("https://merchant.com%252Fpath")).toBe(true);
      expect(detectDoubleEncoding("https://merchant.com/safe/path")).toBe(false);
    });

    it("rejects URLs containing %252f double-encoded path traversal / authority bypass", () => {
      const doubleEncodedUrls = [
        "https://stormsale.xyz%252f@evil.com",
        "https://legit.example.com%252fevil.com/steal",
        "https://stormsale.xyz%252F%252Fattacker.com",
        "https://trusted.com/%252e%252e/%252e%252e/etc/passwd",
      ];

      for (const url of doubleEncodedUrls) {
        const result = sanitizeRedirectUrl(url);
        expect(result.isValid).toBe(false);
        expect(result.sanitizedUrl).toBeNull();
        expect(result.reason).toContain("Double-encoded URL bypass attempt detected");
      }
    });

    it("rejects double-encoded colon (%253a) and backslash (%255c) bypass vectors", () => {
      const encodedSchemeUrls = [
        "jav%2561script%253aalert(1)",
        "https://stormsale.xyz%255cevil.com",
        "https%253a%252f%252fevil.com",
      ];

      for (const url of encodedSchemeUrls) {
        const result = sanitizeRedirectUrl(url);
        expect(result.isValid).toBe(false);
      }
    });

    it("rejects multi-level nested encoding (%25252f)", () => {
      const tripleEncoded = "https://trusted.com%25252fevil.com";
      const result = sanitizeRedirectUrl(tripleEncoded);
      expect(result.isValid).toBe(false);
    });
  });

  describe("3. External redirect warning modal when navigating to advertiser landing page", () => {
    it("renders external redirect warning modal with target domain and URL", () => {
      const target = "https://partner-brand.com/store/checkout?ref=abc";
      render(
        React.createElement(ExternalRedirectModal, {
          isOpen: true,
          targetUrl: target,
          onConfirm: vi.fn(),
          onCancel: vi.fn(),
        }),
      );

      expect(screen.getByRole("dialog")).toBeTruthy();
      expect(screen.getByTestId("external-redirect-modal")).toBeTruthy();
      expect(screen.getByText("External Redirect Warning")).toBeTruthy();
      expect(screen.getByTestId("target-domain").textContent).toBe("partner-brand.com");
      expect(screen.getByTestId("target-url").textContent).toBe(target);
      expect(screen.getByTestId("btn-confirm-redirect")).toBeTruthy();
      expect(screen.getByTestId("btn-cancel-redirect")).toBeTruthy();
    });

    it("triggers onConfirm callback with sanitized URL when user proceeds", () => {
      const onConfirmSpy = vi.fn();
      const target = "https://partner-brand.com/store/checkout";

      render(
        React.createElement(ExternalRedirectModal, {
          isOpen: true,
          targetUrl: target,
          onConfirm: onConfirmSpy,
          onCancel: vi.fn(),
        }),
      );

      const confirmBtn = screen.getByTestId("btn-confirm-redirect");
      fireEvent.click(confirmBtn);

      expect(onConfirmSpy).toHaveBeenCalledWith(target);
    });

    it("triggers onCancel callback when user cancels and stays on StormSale", () => {
      const onCancelSpy = vi.fn();
      const target = "https://partner-brand.com/store/checkout";

      render(
        React.createElement(ExternalRedirectModal, {
          isOpen: true,
          targetUrl: target,
          onConfirm: vi.fn(),
          onCancel: onCancelSpy,
        }),
      );

      const cancelBtn = screen.getByTestId("btn-cancel-redirect");
      fireEvent.click(cancelBtn);

      expect(onCancelSpy).toHaveBeenCalledTimes(1);
    });

    it("blocks proceed action and displays security violation alert for malicious URLs", () => {
      const maliciousTarget = "javascript:alert(document.cookie)";

      render(
        React.createElement(ExternalRedirectModal, {
          isOpen: true,
          targetUrl: maliciousTarget,
          onConfirm: vi.fn(),
          onCancel: vi.fn(),
        }),
      );

      expect(screen.getByText("Malicious Redirect Blocked")).toBeTruthy();
      expect(screen.getByText(/Security Violation:/i)).toBeTruthy();
      expect(screen.queryByTestId("btn-confirm-redirect")).toBeNull();
    });

    it("does not render when isOpen is false", () => {
      const { container } = render(
        React.createElement(ExternalRedirectModal, {
          isOpen: false,
          targetUrl: "https://partner-brand.com",
          onConfirm: vi.fn(),
          onCancel: vi.fn(),
        }),
      );

      expect(container.firstChild).toBeNull();
      expect(screen.queryByTestId("external-redirect-modal")).toBeNull();
    });
  });
});
