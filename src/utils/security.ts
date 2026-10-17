import DOMPurify, { type Config } from "dompurify";

/**
 * Strict whitelist configuration for user-generated content and markdown.
 * Whitelists only safe typography, structural tags, and links while stripping
 * script execution vectors, inline handlers, object/embed/iframe tags, and unsafe URI schemes.
 */
export const WHITELIST_TAGS = [
  "a",
  "b",
  "blockquote",
  "br",
  "code",
  "em",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "hr",
  "i",
  "li",
  "ol",
  "p",
  "pre",
  "span",
  "strong",
  "table",
  "tbody",
  "td",
  "th",
  "thead",
  "tr",
  "ul",
] as const;

export const WHITELIST_ATTRS = ["href", "title", "target", "rel", "class"] as const;

export const WHITELIST_CONFIG: Config = {
  ALLOWED_TAGS: [...WHITELIST_TAGS],
  ALLOWED_ATTR: [...WHITELIST_ATTRS],
  ALLOWED_URI_REGEXP: /^(?:(?:(?:f|ht)tps?|mailto):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i,
  FORBID_TAGS: [
    "script",
    "style",
    "iframe",
    "object",
    "embed",
    "form",
    "input",
    "textarea",
    "button",
    "link",
    "meta",
  ],
  FORBID_ATTR: ["onerror", "onload", "onclick", "onmouseover", "onfocus", "onblur", "style"],
};

/**
 * Returns the DOMPurify instance if running in an environment with DOM support.
 */
function getPurifier(): typeof DOMPurify | null {
  if (typeof window !== "undefined") {
    if (typeof DOMPurify === "function") {
      return (DOMPurify as unknown as (win: Window) => typeof DOMPurify)(window);
    }
    return DOMPurify;
  }
  return null;
}

/**
 * Fallback sanitizer for environments without DOM support (e.g. Node / SSR).
 * Enforces the whitelist of tags and strips event handlers and script protocols.
 */
function fallbackSanitize(dirty: string): string {
  let cleaned = dirty
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "")
    .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, "")
    .replace(/<object\b[^<]*(?:(?!<\/object>)<[^<]*)*<\/object>/gi, "")
    .replace(/<embed\b[^>]*>/gi, "");

  // Strip all on* attributes
  cleaned = cleaned.replace(/\s+on[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "");

  // Strip javascript:, vbscript:, and data: URLs in href/src
  cleaned = cleaned.replace(
    /\s+(?:href|src)\s*=\s*(?:"\s*(?:javascript|vbscript|data):[^"]*"|'\s*(?:javascript|vbscript|data):[^']*'|\s*(?:javascript|vbscript|data):[^\s>]+)/gi,
    ""
  );

  // Strip tags not in whitelist
  const tagRegex = new RegExp("<(\\/?[a-z0-9]+)\\b([^>]*)>", "gi");
  cleaned = cleaned.replace(tagRegex, (match, tagPart, attrs) => {
    const isClosing = tagPart.startsWith("/");
    const lowerTag = (isClosing ? tagPart.slice(1) : tagPart).toLowerCase();
    if (!WHITELIST_TAGS.includes(lowerTag as (typeof WHITELIST_TAGS)[number])) {
      return "";
    }

    if (isClosing) {
      return `</${lowerTag}>`;
    }

    // Filter attributes to only allowed ones
    const cleanAttrs = (attrs as string).replace(
      /([a-z0-9_-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi,
      (_attrMatch: string, attrName: string, val1: string, val2: string, val3: string) => {
        const lowerAttr = attrName.toLowerCase();
        if (!WHITELIST_ATTRS.includes(lowerAttr as (typeof WHITELIST_ATTRS)[number])) {
          return "";
        }
        const val = val1 ?? val2 ?? val3 ?? "";
        return ` ${lowerAttr}="${val.replace(/"/g, "&quot;")}"`;
      }
    );

    const isSelfClosing = match.endsWith("/>") || lowerTag === "br" || lowerTag === "hr";
    return isSelfClosing ? `<${lowerTag}${cleanAttrs} />` : `<${lowerTag}${cleanAttrs}>`;
  });

  return cleaned;
}

/**
 * Lightweight parser converting basic markdown syntax to HTML.
 */
export function parseBasicMarkdown(markdown: string): string {
  let html = markdown
    // Code blocks
    .replace(/```([\s\S]*?)```/g, "<pre><code>$1</code></pre>")
    // Inline code
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    // Headers (# to ######)
    .replace(/^######\s*(.+)$/gm, "<h6>$1</h6>")
    .replace(/^#####\s*(.+)$/gm, "<h5>$1</h5>")
    .replace(/^####\s*(.+)$/gm, "<h4>$1</h4>")
    .replace(/^###\s*(.+)$/gm, "<h3>$1</h3>")
    .replace(/^##\s*(.+)$/gm, "<h2>$1</h2>")
    .replace(/^#\s*(.+)$/gm, "<h1>$1</h1>")
    // Bold & italic
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/__([^_]+)__/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>")
    .replace(/_([^_]+)_/g, "<em>$1</em>")
    // Links [text](url)
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>')
    // Line breaks
    .replace(/\n\n/g, "</p><p>")
    .replace(/\n/g, "<br />");

  html = `<p>${html}</p>`;
  // Clean up empty paragraphs
  return html.replace(/<p>\s*<\/p>/g, "");
}

/**
 * Sanitizes user-generated HTML or text using DOMPurify with strict whitelist configuration.
 *
 * @param dirty Unsafe user input string
 * @param customConfig Optional DOMPurify configuration override
 * @returns Safe sanitized HTML string
 */
export function sanitizeContent(dirty: string, customConfig?: Config): string {
  if (!dirty || typeof dirty !== "string") return "";

  const purifier = getPurifier();
  if (purifier && purifier.isSupported) {
    const config = { ...WHITELIST_CONFIG, ...customConfig };
    return String(purifier.sanitize(dirty, config));
  }

  return fallbackSanitize(dirty);
}

/**
 * Converts user-generated markdown into safe sanitized HTML using whitelist-only rendering.
 *
 * @param markdown User markdown input string
 * @returns Safe sanitized HTML
 */
export function sanitizeMarkdown(markdown: string): string {
  if (!markdown || typeof markdown !== "string") return "";
  const rawHtml = parseBasicMarkdown(markdown);
  return sanitizeContent(rawHtml);
}

/**
 * Prepares sanitized content for React `dangerouslySetInnerHTML`.
 *
 * @param input Raw content or markdown
 * @param isMarkdown Whether input should be parsed as markdown
 * @returns Object with safe `__html`
 */
export function getSanitizedHtml(
  input: string,
  isMarkdown = false
): { __html: string } {
  return {
    __html: isMarkdown ? sanitizeMarkdown(input) : sanitizeContent(input),
  };
}