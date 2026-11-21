/**
 * HTML and Markdown XSS Sanitization Utility
 * Issue #509: user-generated HTML and Markdown XSS sanitization
 *
 * Uses the browser's built-in DOMParser to sanitize user-supplied HTML,
 * stripping dangerous elements/attributes while preserving safe markdown tags.
 */

const SAFE_TAGS = new Set([
  "p", "br", "strong", "em", "b", "i", "u", "s",
  "ul", "ol", "li", "a", "code", "pre", "blockquote",
  "h1", "h2", "h3", "h4", "h5", "h6", "hr",
  "span", "div", "table", "thead", "tbody", "tr", "th", "td", "img",
]);

const DANGEROUS_TAGS = new Set([
  "script", "iframe", "object", "embed", "form",
  "input", "textarea", "button", "select", "applet",
  "meta", "link", "style", "base", "svg", "math",
]);

const URL_ATTRS = new Set(["href", "src", "action", "formaction", "data"]);

export function sanitizeHtml(html: string): string {
  if (typeof html !== "string" || html.length === 0) return "";

  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");

  for (const tag of DANGEROUS_TAGS) {
    doc.querySelectorAll(tag).forEach((el) => el.remove());
  }

  doc.querySelectorAll("*").forEach((el) => {
    const tag = el.tagName.toLowerCase();

    if (!SAFE_TAGS.has(tag)) {
      el.replaceWith(doc.createTextNode(el.textContent || ""));
      return;
    }

    Array.from(el.attributes).forEach((attr) => {
      const name = attr.name;
      const value = attr.value;

      if (/^on/i.test(name) || /^style$/i.test(name)) {
        el.removeAttribute(name);
        return;
      }

      if (URL_ATTRS.has(name.toLowerCase())) {
        const low = value.trim().toLowerCase();
        if (
          low.startsWith("javascript:") ||
          low.startsWith("vbscript:") ||
          low.startsWith("data:text/html")
        ) {
          el.removeAttribute(name);
        }
      }
    });

    if (tag === "a" && el.getAttribute("href")) {
      el.setAttribute("rel", "noopener noreferrer");
      el.setAttribute("target", "_blank");
    }

    if (tag === "img") {
      const src = el.getAttribute("src");
      if (src) {
        const low = src.trim().toLowerCase();
        if (low.startsWith("javascript:") || low.startsWith("vbscript:")) {
          el.removeAttribute("src");
        }
      }
    }
  });

  return doc.body.innerHTML;
}

export function isSafeHtml(html: string): boolean {
  return ![
    /<script\b/i, /<iframe\b/i, /<object\b/i, /<embed\b/i,
    /\son\w+\s*=/i, /javascript:/i, /vbscript:/i, /document\.write/i,
  ].some((p) => p.test(html));
}

export function sanitizeAndVerify(html: string): string {
  const sanitized = sanitizeHtml(html);
  return isSafeHtml(sanitized) ? sanitized : "";
}
