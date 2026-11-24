/**
 * HTML and Markdown XSS Sanitization Utility
 * Issue #509: user-generated HTML and Markdown XSS sanitization
 *
 * Uses regex-based sanitization for Node.js/jsdom compatibility,
 * stripping dangerous elements/attributes while preserving safe markdown tags.
 * This approach works in both browser and test environments (jsdom/happy-dom).
 */

/** Tags that must be completely removed including their content. */
const DANGEROUS_TAG_PATTERN =
  /<(script|iframe|object|embed|svg|math|style|base|link|meta|applet|form|input|textarea|button|select)(\s[^>]*)?>[\s\S]*?<\/\1>|<(script|iframe|object|embed|svg|math|style|base|link|meta|applet|form|input|textarea|button|select)(\s[^>]*)?\/?>|<\/(script|iframe|object|embed|svg|math|style|base|link|meta|applet|form|input|textarea|button|select)>/gi;

/** Event handler attributes: on* */
const EVENT_HANDLER_PATTERN = /\s+on\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]*)/gi;

/** Dangerous URL protocols in attribute values. */
const DANGEROUS_PROTOCOL_IN_ATTR =
  /\s+(?:href|src|action|formaction|data|xlink:href)\s*=\s*(?:"[^"]*(?:javascript|vbscript|data:text\/html)[^"]*"|'[^']*(?:javascript|vbscript|data:text\/html)[^']*')/gi;

/**
 * Sanitizes an HTML string, stripping dangerous elements and attributes
 * while preserving safe markdown-compatible tags.
 */
export function sanitizeHtml(html: string): string {
  if (typeof html !== "string" || html.length === 0) return "";

  let result = html;

  // Step 1: Remove dangerous tags and their content (multiple passes for nested)
  let prev = "";
  while (prev !== result) {
    prev = result;
    result = result.replace(DANGEROUS_TAG_PATTERN, "");
  }

  // Step 2: Remove all event handler attributes (onclick, onload, onerror, etc.)
  result = result.replace(EVENT_HANDLER_PATTERN, "");

  // Step 3: Remove dangerous URL protocols from attributes
  result = result.replace(DANGEROUS_PROTOCOL_IN_ATTR, "");

  // Step 4: Sanitize anchor links — force rel and target on all <a href="...">
  result = result.replace(/<a(\s[^>]*)?>/gi, (match) => {
    // Check if this anchor has an href
    const hasHref = /\bhref\s*=/i.test(match);
    if (!hasHref) return match;

    // Remove any existing rel and target attributes
    let sanitized = match.replace(/\s+rel\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]*)/gi, "");
    sanitized = sanitized.replace(/\s+target\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]*)/gi, "");

    // Add secure rel and target before closing >
    sanitized = sanitized.replace(/>$/, ' rel="noopener noreferrer" target="_blank">');
    return sanitized;
  });

  return result;
}

/**
 * Validates that an HTML string does not contain any dangerous patterns.
 */
export function isSafeHtml(html: string): boolean {
  const dangerousPatterns = [
    /<script\b/i,
    /<iframe\b/i,
    /<object\b/i,
    /<embed\b/i,
    /\son\w+\s*=/i,
    /javascript:/i,
    /vbscript:/i,
    /document\.write/i,
  ];
  return !dangerousPatterns.some((p) => p.test(html));
}

/**
 * Sanitizes HTML and returns empty string if the result still contains
 * dangerous content (defense in depth).
 */
export function sanitizeAndVerify(html: string): string {
  const sanitized = sanitizeHtml(html);
  return isSafeHtml(sanitized) ? sanitized : "";
}
