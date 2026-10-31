// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import DOMPurify from "dompurify";
import {
  WHITELIST_CONFIG,
  WHITELIST_TAGS,
  WHITELIST_ATTRS,
  sanitizeContent,
  sanitizeMarkdown,
  getSanitizedHtml,
} from "../utils/security";

describe("DOM-backed Security & Sanitization Suite (#78, CodeRabbit)", () => {
  describe("DOM Environment & Sanitizer Verification", () => {
    it("should run with window and DOMPurify support", () => {
      expect(typeof window).toBe("object");
      expect(DOMPurify.isSupported).toBe(true);
    });

    it("should export strict whitelist configuration", () => {
      expect(WHITELIST_CONFIG.ALLOWED_TAGS).toBeDefined();
      expect(WHITELIST_CONFIG.ALLOWED_ATTR).toBeDefined();
      expect(WHITELIST_TAGS).toContain("p");
      expect(WHITELIST_TAGS).toContain("strong");
      expect(WHITELIST_TAGS).toContain("a");
      expect(WHITELIST_ATTRS).toContain("href");
    });
  });

  describe("sanitizeContent with DOMPurify", () => {
    it("should handle empty or falsy inputs gracefully", () => {
      expect(sanitizeContent("")).toBe("");
      expect(sanitizeContent(null as unknown as string)).toBe("");
      expect(sanitizeContent(undefined as unknown as string)).toBe("");
    });

    it("should strip malicious script tags completely while keeping safe markup", () => {
      const malicious = '<p>Safe</p><script>alert("XSS")</script>';
      const result = sanitizeContent(malicious);
      expect(result).not.toContain("<script");
      expect(result).not.toContain("alert");
      expect(result).toContain("<p>Safe</p>");
    });

    it("should strip inline event handlers", () => {
      const malicious = '<b onclick="stealCookies()" onmouseover="evil()" onerror="fail()">Click</b>';
      const result = sanitizeContent(malicious);
      expect(result).not.toContain("onclick");
      expect(result).not.toContain("onmouseover");
      expect(result).not.toContain("onerror");
      expect(result).not.toContain("stealCookies");
      expect(result).toContain("<b>Click</b>");
    });

    it("should strip standard javascript: pseudo-protocols in links", () => {
      const malicious = '<a href="javascript:alert(document.cookie)">Malicious Link</a>';
      const result = sanitizeContent(malicious);
      expect(result).not.toContain("javascript:");
      expect(result).toContain("Malicious Link");
    });

    it("should neutralize entity-encoded and obfuscated javascript: URLs", () => {
      const obfuscated1 = '<a href="&#106;avascript:alert(1)">Encoded Link</a>';
      const obfuscated2 = '<a href="java&#x09;script:alert(2)">Tab Link</a>';
      const obfuscated3 = '<a href="javascript&#x3a;alert(3)">Colon Encoded</a>';

      const result1 = sanitizeContent(obfuscated1);
      const result2 = sanitizeContent(obfuscated2);
      const result3 = sanitizeContent(obfuscated3);

      expect(result1).not.toContain("href");
      expect(result1).toContain("Encoded Link");
      expect(result2).not.toContain("href");
      expect(result2).toContain("Tab Link");
      expect(result3).not.toContain("href");
      expect(result3).toContain("Colon Encoded");
    });

    it("should strip disallowed elements like iframe, object, embed, style, and form", () => {
      const malicious = '<iframe src="https://evil.com"></iframe><embed src="evil.swf"><object data="x"></object><style>body{color:red}</style><form action="/steal"><input name="p"></form>';
      const result = sanitizeContent(malicious);
      expect(result).not.toContain("<iframe");
      expect(result).not.toContain("<embed");
      expect(result).not.toContain("<object");
      expect(result).not.toContain("<style");
      expect(result).not.toContain("<form");
      expect(result).not.toContain("<input");
    });

    it("should preserve allowed whitelist tags and safe attributes", () => {
      const safe = '<p class="lead">Hello <strong>World</strong> and <a href="https://stellar.org" title="Stellar">Stellar</a></p>';
      const result = sanitizeContent(safe);
      expect(result).toContain("<p");
      expect(result).toContain("<strong>World</strong>");
      expect(result).toContain('href="https://stellar.org"');
      expect(result).toContain('title="Stellar"');
    });
  });

  describe("sanitizeMarkdown with DOMPurify", () => {
    it("should handle empty or null markdown", () => {
      expect(sanitizeMarkdown("")).toBe("");
      expect(sanitizeMarkdown(null as unknown as string)).toBe("");
    });

    it("should parse and safely sanitize basic markdown into DOM elements", () => {
      const markdown = "# Title\n\nThis is **bold** and *italic* with [Link](https://example.com)";
      const sanitized = sanitizeMarkdown(markdown);
      expect(sanitized).toContain("<h1>Title</h1>");
      expect(sanitized).toContain("<strong>bold</strong>");
      expect(sanitized).toContain("<em>italic</em>");
      expect(sanitized).toContain('href="https://example.com"');
    });

    it("should strip script injections embedded inside markdown inputs", () => {
      const attack = "## Secure Section\n<script>evil()</script>\n[Clean](https://example.com)";
      const sanitized = sanitizeMarkdown(attack);
      expect(sanitized).not.toContain("<script");
      expect(sanitized).not.toContain("evil()");
      expect(sanitized).toContain("<h2>Secure Section</h2>");
      expect(sanitized).toContain('href="https://example.com"');
    });
  });

  describe("getSanitizedHtml", () => {
    it("should return object with safe __html string", () => {
      const output = getSanitizedHtml("<em>Text</em>");
      expect(output).toEqual({ __html: "<em>Text</em>" });
    });

    it("should support markdown mode", () => {
      const output = getSanitizedHtml("**Markdown**", true);
      expect(output.__html).toContain("<strong>Markdown</strong>");
    });
  });
});
