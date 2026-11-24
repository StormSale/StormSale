import { describe, it, expect } from "vitest";
import { sanitizeHtml, isSafeHtml, sanitizeAndVerify } from "../lib/sanitize";

describe("User-Generated HTML and Markdown XSS Sanitization (#509)", () => {
  describe("1. Script injection payloads", () => {
    it("strips <script> tags and their content", () => {
      const result = sanitizeHtml('<p>hello</p><script>alert("xss")</script><p>world</p>');
      expect(result).not.toContain("<script");
      expect(result).not.toContain("alert");
      expect(result).toContain("hello");
      expect(result).toContain("world");
    });

    it("strips nested <script> tags", () => {
      const result = sanitizeHtml("<div><script>alert(1)</script></div>");
      expect(result).not.toContain("<script");
      expect(result).not.toContain("alert");
    });

    it("strips <script> with eval payload", () => {
      const result = sanitizeHtml('<script>eval(atob("YWxlcnQoMSk="))</script>');
      expect(result).not.toContain("<script");
    });
  });

  describe("2. Event handler payloads (onload, onclick, onerror)", () => {
    it("strips onload from img", () => {
      const result = sanitizeHtml('<img src="x" onload="alert(1)">');
      expect(result).not.toContain("onload");
    });

    it("strips onerror from img", () => {
      const result = sanitizeHtml('<img src="x" onerror="alert(1)">');
      expect(result).not.toContain("onerror");
    });

    it("strips onclick from anchor", () => {
      const result = sanitizeHtml('<a href="https://example.com" onclick="alert(1)">link</a>');
      expect(result).not.toContain("onclick");
      expect(result).toContain("link");
    });

    it("strips all on* event handlers from any element", () => {
      const result = sanitizeHtml('<p onfocus="a(1)" onblur="a(2)" onchange="a(3)">text</p>');
      expect(result).not.toContain("onfocus");
      expect(result).not.toContain("onblur");
      expect(result).not.toContain("onchange");
      expect(result).toContain("text");
    });
  });

  describe("3. javascript: protocol payloads", () => {
    it("strips javascript: protocol from href", () => {
      const result = sanitizeHtml('<a href="javascript:alert(1)">click me</a>');
      expect(result).not.toContain("javascript:");
    });

    it("strips javascript: protocol from img src", () => {
      const result = sanitizeHtml('<img src="javascript:alert(1)">');
      expect(result).not.toContain("javascript:");
    });

    it("strips vbscript: protocol from href", () => {
      const result = sanitizeHtml('<a href="vbscript:msgbox(1)">click</a>');
      expect(result).not.toContain("vbscript:");
    });

    it("preserves safe https href", () => {
      const result = sanitizeHtml('<a href="https://example.com">link</a>');
      expect(result).toContain("https://example.com");
      expect(result).toContain("link");
    });
  });

  describe("4. Nested SVG exploit payloads", () => {
    it("strips <svg> with embedded script", () => {
      const result = sanitizeHtml('<svg><script>alert(1)</script></svg>');
      expect(result).not.toContain("<svg");
      expect(result).not.toContain("alert");
    });

    it("strips <svg> with onload handler", () => {
      const result = sanitizeHtml('<svg onload="alert(1)"></svg>');
      expect(result).not.toContain("<svg");
    });

    it("strips <svg> with foreignObject containing script", () => {
      const result = sanitizeHtml(
        '<svg><foreignObject><body><script>alert(1)</script></body></foreignObject></svg>',
      );
      expect(result).not.toContain("<svg");
      expect(result).not.toContain("alert");
    });
  });

  describe("5. Iframe and object embed payloads", () => {
    it("strips <iframe> tags", () => {
      const result = sanitizeHtml('<iframe src="javascript:alert(1)"></iframe>');
      expect(result).not.toContain("<iframe");
    });

    it("strips <object> tags", () => {
      const result = sanitizeHtml('<object data="javascript:alert(1)"></object>');
      expect(result).not.toContain("<object");
    });

    it("strips <embed> tags", () => {
      const result = sanitizeHtml('<embed src="javascript:alert(1)">');
      expect(result).not.toContain("<embed");
    });
  });

  describe("6. Safe markdown tag preservation", () => {
    it("preserves <p> tags", () => {
      const result = sanitizeHtml("<p>paragraph</p>");
      expect(result).toContain("<p>");
      expect(result).toContain("paragraph");
    });

    it("preserves <strong> and <em>", () => {
      const result = sanitizeHtml("<p><strong>bold</strong> and <em>italic</em></p>");
      expect(result).toContain("<strong>bold</strong>");
      expect(result).toContain("<em>italic</em>");
    });

    it("preserves <ul> and <li>", () => {
      const result = sanitizeHtml("<ul><li>item 1</li><li>item 2</li></ul>");
      expect(result).toContain("<ul>");
      expect(result).toContain("<li>item 1</li>");
    });

    it("preserves <a> with safe href", () => {
      const result = sanitizeHtml('<a href="https://example.com">link</a>');
      expect(result).toContain("https://example.com");
      expect(result).toContain("link");
    });

    it("preserves <code> and <pre>", () => {
      const result = sanitizeHtml("<pre><code>const x = 1;</code></pre>");
      expect(result).toContain("<pre>");
      expect(result).toContain("<code>");
    });

    it("preserves <blockquote>", () => {
      const result = sanitizeHtml("<blockquote>quoted</blockquote>");
      expect(result).toContain("<blockquote>");
    });
  });

  describe("7. Link sanitization: rel and target attributes", () => {
    it("adds rel='noopener noreferrer' to anchor links", () => {
      const result = sanitizeHtml('<a href="https://example.com">link</a>');
      expect(result).toContain('rel="noopener noreferrer"');
    });

    it("adds target='_blank' to anchor links", () => {
      const result = sanitizeHtml('<a href="https://example.com">link</a>');
      expect(result).toContain('target="_blank"');
    });

    it("overwrites existing rel with noopener noreferrer", () => {
      const result = sanitizeHtml('<a href="https://example.com" rel="noopener">link</a>');
      expect(result).toContain('rel="noopener noreferrer"');
      expect(result).not.toContain('rel="noopener"');
    });
  });

  describe("8. isSafeHtml validator", () => {
    it("returns true for clean HTML", () => {
      expect(isSafeHtml("<p>safe</p>")).toBe(true);
    });

    it("returns false for <script>", () => {
      expect(isSafeHtml("<script>alert(1)</script>")).toBe(false);
    });

    it("returns false for event handlers", () => {
      expect(isSafeHtml('<img onload="alert(1)">')).toBe(false);
    });

    it("returns false for javascript: protocol", () => {
      expect(isSafeHtml('<a href="javascript:alert(1)">x</a>')).toBe(false);
    });

    it("returns false for <iframe>", () => {
      expect(isSafeHtml('<iframe src="x"></iframe>')).toBe(false);
    });
  });

  describe("9. sanitizeAndVerify integration", () => {
    it("returns sanitized HTML for mixed dangerous and safe content", () => {
      const payload = '<p>safe</p><script>alert(1)</script><img src="x" onload="alert(2)">';
      const result = sanitizeAndVerify(payload);
      expect(result).toContain("safe");
      expect(result).not.toContain("alert");
      expect(result).not.toContain("onload");
      expect(isSafeHtml(result)).toBe(true);
    });

    it("returns non-empty string for safe HTML input", () => {
      const result = sanitizeAndVerify("<p>safe</p>");
      expect(result).toContain("safe");
    });
  });
});
