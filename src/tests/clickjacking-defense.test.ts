// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import {
  isWindowEmbedded,
  enforceFrameBusting,
  verifyCspFrameAncestors,
  verifyXFrameOptions,
} from "../lib/clickjackingDefense";
import { ClickjackingWarning } from "../components/security/ClickjackingWarning";
import { STATIC_CSP_HEADER, STRICT_CSP_DIRECTIVES } from "../config/csp";

describe("Click Hijacking & Iframe Embedding Defense Suite (#478)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe("1. Frame-busting script redirection tests", () => {
    it("redirects top window to window.self location if window.self !== window.top", () => {
      const mockTop = {
        location: {
          href: "https://evil-iframe-phishing.com/scam",
        },
      };

      const mockSelf = {
        location: {
          href: "https://stormsale.xyz/dashboard",
        },
      };

      const mockWindow = {
        self: mockSelf,
        top: mockTop,
      } as unknown as Window;

      const result = enforceFrameBusting(mockWindow);

      expect(result.isEmbedded).toBe(true);
      expect(result.redirected).toBe(true);
      expect(mockTop.location.href).toBe("https://stormsale.xyz/dashboard");
      expect(result.targetUrl).toBe("https://stormsale.xyz/dashboard");
    });

    it("does not trigger redirection when window is top-level (window.self === window.top)", () => {
      const topSelf = {
        location: {
          href: "https://stormsale.xyz/dashboard",
        },
      };

      const mockWindow = {
        self: topSelf,
        top: topSelf,
      } as unknown as Window;

      const result = enforceFrameBusting(mockWindow);

      expect(result.isEmbedded).toBe(false);
      expect(result.redirected).toBe(false);
    });

    it("handles sandboxed iframes where accessing top throws a SecurityError", () => {
      const mockSelf = {
        location: { href: "https://stormsale.xyz" },
      };

      const mockWindow = {
        self: mockSelf,
        get top() {
          throw new Error("SecurityError: Blocked a frame with origin from accessing a cross-origin frame");
        },
      } as unknown as Window;

      expect(isWindowEmbedded(mockWindow)).toBe(true);

      const result = enforceFrameBusting(mockWindow);
      expect(result.isEmbedded).toBe(true);
      expect(result.redirected).toBe(false);
      expect(result.error).toContain("SecurityError");
    });
  });

  describe("2. Content Security Policy frame-ancestors 'none' enforcement", () => {
    it("verifies that STATIC_CSP_HEADER contains frame-ancestors 'none'", () => {
      expect(STATIC_CSP_HEADER).toContain("frame-ancestors 'none'");
    });

    it("verifies STRICT_CSP_DIRECTIVES explicitly specifies 'none' for frame-ancestors", () => {
      expect(STRICT_CSP_DIRECTIVES["frame-ancestors"]).toEqual(["'none'"]);
    });

    it("verifyCspFrameAncestors approves valid strict frame-ancestors 'none'", () => {
      const check = verifyCspFrameAncestors(STATIC_CSP_HEADER);
      expect(check.isProtected).toBe(true);
      expect(check.directiveValue).toBe("'none'");
      expect(check.errors).toHaveLength(0);
    });

    it("verifyCspFrameAncestors rejects CSP policies allowing arbitrary origins", () => {
      const weakCsp = "default-src 'self'; frame-ancestors https://untrusted.com *;";
      const check = verifyCspFrameAncestors(weakCsp);
      expect(check.isProtected).toBe(false);
      expect(check.errors.length).toBeGreaterThan(0);
    });

    it("verifyCspFrameAncestors rejects CSP policies missing frame-ancestors entirely", () => {
      const missingCsp = "default-src 'self'; script-src 'self';";
      const check = verifyCspFrameAncestors(missingCsp);
      expect(check.isProtected).toBe(false);
      expect(check.errors[0]).toContain("Missing 'frame-ancestors'");
    });

    it("verifies X-Frame-Options DENY compliance", () => {
      expect(verifyXFrameOptions("DENY").isProtected).toBe(true);
      expect(verifyXFrameOptions("SAMEORIGIN").isProtected).toBe(true);
      expect(verifyXFrameOptions("ALLOW-FROM https://evil.com").isProtected).toBe(false);
    });
  });

  describe("3. Alert warning displayed when embedding attempt is detected", () => {
    it("displays alert warning banner when window is embedded in an iframe", () => {
      const mockTop = { location: { href: "https://evil.com" } };
      const mockSelf = { location: { href: "https://stormsale.xyz" } };
      const framedWindow = {
        self: mockSelf,
        top: mockTop,
      } as unknown as Window;

      render(React.createElement(ClickjackingWarning, { customWindow: framedWindow }));

      const alertBanner = screen.getByRole("alert");
      expect(alertBanner).toBeTruthy();
      expect(screen.getByTestId("clickjacking-warning")).toBeTruthy();
      expect(
        screen.getByText(/Unauthorized Iframe Embedding Detected \(Clickjacking Defense\)/i),
      ).toBeTruthy();
    });

    it("does not render alert warning banner when running in top-level window", () => {
      const topSelf = { location: { href: "https://stormsale.xyz" } };
      const topWindow = {
        self: topSelf,
        top: topSelf,
      } as unknown as Window;

      const { container } = render(React.createElement(ClickjackingWarning, { customWindow: topWindow }));
      expect(container.firstChild).toBeNull();
      expect(screen.queryByRole("alert")).toBeNull();
    });

    it("allows user to trigger breakout from alert warning banner", () => {
      const breakoutSpy = vi.fn();
      const mockTop = { location: { href: "https://evil.com" } };
      const mockSelf = { location: { href: "https://stormsale.xyz" } };
      const framedWindow = {
        self: mockSelf,
        top: mockTop,
      } as unknown as Window;

      render(
        React.createElement(ClickjackingWarning, {
          customWindow: framedWindow,
          onBreakout: breakoutSpy,
        }),
      );

      const breakoutBtn = screen.getByTestId("btn-breakout");
      fireEvent.click(breakoutBtn);

      expect(breakoutSpy).toHaveBeenCalledTimes(1);
    });

    it("allows user to dismiss warning alert", () => {
      const mockTop = { location: { href: "https://evil.com" } };
      const mockSelf = { location: { href: "https://stormsale.xyz" } };
      const framedWindow = {
        self: mockSelf,
        top: mockTop,
      } as unknown as Window;

      render(React.createElement(ClickjackingWarning, { customWindow: framedWindow }));

      expect(screen.getByTestId("clickjacking-warning")).toBeTruthy();
      const dismissBtn = screen.getByTestId("btn-dismiss-warning");
      fireEvent.click(dismissBtn);

      expect(screen.queryByTestId("clickjacking-warning")).toBeNull();
    });
  });
});
