import { describe, it, expect } from "vitest";
import {
  WHITELIST_CONFIG,
  WHITELIST_TAGS,
  WHITELIST_ATTRS,
  sanitizeContent,
  sanitizeMarkdown,
  getSanitizedHtml,
  parseBasicMarkdown,
} from "../utils/security";

describe("Fallback & Parser Security Suite (#78, Node / Non-DOM environment)", () => {
  describe("Whitelist Configuration", () => {
    it("should define strict allowed tags and attributes", () => {
      expect(WHITELIST_CONFIG.ALLOWED_TAGS).toBeDefined();
      expect(WHITELIST_CONFIG.ALLOWED_ATTR).toBeDefined();
      expect(WHITELIST_TAGS).toContain("p");
      expect(WHITELIST_TAGS).toContain("strong");
      expect(WHITELIST_TAGS).toContain("a");
      expect(WHITELIST_TAGS).toContain("code");
      expect(WHITELIST_ATTRS).toContain("href");
      expect(WHITELIST_ATTRS).toContain("title");
    });

    it("should explicitly forbid script, iframe, and dangerous event handlers", () => {
      expect(WHITELIST_CONFIG.FORBID_TAGS).toContain("script");
      expect(WHITELIST_CONFIG.FORBID_TAGS).toContain("iframe");
      expect(WHITELIST_CONFIG.FORBID_TAGS).toContain("object");
      expect(WHITELIST_CONFIG.FORBID_ATTR).toContain("onerror");
      expect(WHITELIST_CONFIG.FORBID_ATTR).toContain("onload");
    });

    it("should have clean ALLOWED_URI_REGEXP without unnecessary escapes", () => {
      expect(WHITELIST_CONFIG.ALLOWED_URI_REGEXP).toBeInstanceOf(RegExp);
      expect(WHITELIST_CONFIG.ALLOWED_URI_REGEXP?.test("https://stellar.org")).toBe(true);
      expect(WHITELIST_CONFIG.ALLOWED_URI_REGEXP?.test("javascript:alert(1)")).toBe(false);
    });
  });

  describe("sanitizeContent (Fallback Path in Node/SSR)", () => {
    it("should handle empty or falsy inputs gracefully", () => {
      expect(sanitizeContent("")).toBe("");
      expect(sanitizeContent(null as unknown as string)).toBe("");
      expect(sanitizeContent(undefined as unknown as string)).toBe("");
    });

    it("should safely HTML-escape script tags preventing tag execution", () => {
      const malicious = '<p>Safe</p><script>alert("XSS")</script>';
      const result = sanitizeContent(malicious);
      expect(result).not.toContain("<script");
      expect(result).toContain("&lt;script&gt;");
      expect(result).toContain("&lt;/script&gt;");
    });

    it("should safely HTML-escape elements with inline event handlers", () => {
      const malicious = '<b onclick="stealCookies()">Click</b>';
      const result = sanitizeContent(malicious);
      expect(result).not.toContain("<b");
      expect(result).toContain("&lt;b");
      expect(result).toContain("&quot;stealCookies()&quot;");
    });

    it("should neutralize javascript: links by escaping markup and attributes", () => {
      const malicious = '<a href="javascript:alert(document.cookie)">Malicious Link</a>';
      const result = sanitizeContent(malicious);
      expect(result).not.toContain("<a ");
      expect(result).toContain("&lt;a href=&quot;javascript:alert(document.cookie)&quot;&gt;");
    });

    it("should neutralize obfuscated javascript: URLs by escaping markup without trusting regexes", () => {
      const obfuscated = '<a href="&#106;avascript:alert(1)">x</a>';
      const result = sanitizeContent(obfuscated);
      expect(result).not.toContain("<a ");
      expect(result).toContain("&lt;a href=&quot;&amp;#106;avascript:alert(1)&quot;&gt;");
    });

    it("should safely escape quotes, ampersands, and angle brackets", () => {
      const input = `& < > " '`;
      const result = sanitizeContent(input);
      expect(result).toBe("&amp; &lt; &gt; &quot; &#39;");
    });
  });

  describe("parseBasicMarkdown", () => {
    it("should handle empty or falsy markdown gracefully", () => {
      expect(sanitizeMarkdown("")).toBe("");
      expect(sanitizeMarkdown(null as unknown as string)).toBe("");
    });

    it("should parse all markdown header levels", () => {
      expect(parseBasicMarkdown("# H1")).toContain("<h1>H1</h1>");
      expect(parseBasicMarkdown("## H2")).toContain("<h2>H2</h2>");
      expect(parseBasicMarkdown("### H3")).toContain("<h3>H3</h3>");
      expect(parseBasicMarkdown("#### H4")).toContain("<h4>H4</h4>");
      expect(parseBasicMarkdown("##### H5")).toContain("<h5>H5</h5>");
      expect(parseBasicMarkdown("###### H6")).toContain("<h6>H6</h6>");
    });

    it("should convert markdown bold, italics, code, and links to HTML", () => {
      const markdown = "Here is **bold** and __bold2__ text and *italic* and _italic2_ with `code` and ```block code``` and [Docs](https://example.com)";
      const parsed = parseBasicMarkdown(markdown);
      expect(parsed).toContain("<strong>bold</strong>");
      expect(parsed).toContain("<strong>bold2</strong>");
      expect(parsed).toContain("<em>italic</em>");
      expect(parsed).toContain("<em>italic2</em>");
      expect(parsed).toContain("<code>code</code>");
      expect(parsed).toContain("<pre><code>block code</code></pre>");
      expect(parsed).toContain('href="https://example.com"');
    });
  });

  describe("getSanitizedHtml", () => {
    it("should wrap escaped string in __html object", () => {
      const output = getSanitizedHtml("<b>Bold</b>");
      expect(output).toEqual({ __html: "&lt;b&gt;Bold&lt;/b&gt;" });
    });

    it("should escape parsed markdown when running fallback", () => {
      const output = getSanitizedHtml("**Bold**", true);
      expect(output.__html).toContain("&lt;strong&gt;Bold&lt;/strong&gt;");
    });
  });
});