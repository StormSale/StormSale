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
  ALLOWED_URI_REGEXP: /^(?:(?:(?:f|ht)tps?|mailto):|[^a-z]|[a-z+.-]+(?:[^a-z+.:-]|$))/i,
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
  return typeof window !== "undefined" ? DOMPurify : null;
}

/**
 * Fallback sanitizer for environments without DOM support (e.g. Node / SSR).
 * Without a DOM, escapes all HTML characters to ensure no malicious markup or scripts execute.
 */
function fallbackSanitize(dirty: string): string {
  return dirty
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
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