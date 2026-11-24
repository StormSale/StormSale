/**
 * Referral Redirect & Open Redirect Sanitizer (#481)
 *
 * Protects against:
 * 1. Non-HTTP/HTTPS protocols (javascript:, data:, vbscript:, file:, blob:)
 * 2. Double-encoded and multi-encoded bypass attempts (%252f, %253a, etc.)
 * 3. Protocol-relative URL hijacking (//evil.com)
 * 4. Userinfo credential bypasses (https://legit.com@evil.com)
 * 5. Control characters and header injection (CRLF)
 */

export interface SanitizeRedirectResult {
  isValid: boolean;
  sanitizedUrl: string | null;
  targetDomain: string | null;
  isExternal: boolean;
  reason?: string;
}

/**
 * Checks for double or multi-encoded character sequences.
 * For example:
 * - %252f -> %2f -> /
 * - %253a -> %3a -> :
 * - %255c -> %5c -> \
 * - %2500 -> null byte
 */
export function detectDoubleEncoding(rawUrl: string): boolean {
  // Check for %25 followed by hex characters representing URL special characters
  const doubleEncodedPattern = /%25([0-9a-f]{2})/i;
  if (!doubleEncodedPattern.test(rawUrl)) {
    return false;
  }

  // Iteratively decode to see if multiple layers of decoding reveal dangerous tokens
  try {
    const firstDecode = decodeURIComponent(rawUrl);
    if (firstDecode !== rawUrl) {
      // Check if first decode still contains %2f, %3a, %5c, %25 or control characters
      if (/%(2f|3a|5c|25|00|0a|0d|40)/i.test(firstDecode)) {
        return true;
      }
      const secondDecode = decodeURIComponent(firstDecode);
      if (secondDecode !== firstDecode) {
        // Multi-level encoding detected
        return true;
      }
    }
  } catch {
    // Malformed URI encoding is treated as an attack attempt
    return true;
  }

  return false;
}

/**
 * Sanitizes and validates a candidate referral redirect URL.
 */
export function sanitizeRedirectUrl(
  rawUrl: string,
  options?: {
    currentHost?: string;
    allowLocalhost?: boolean;
  },
): SanitizeRedirectResult {
  if (typeof rawUrl !== "string" || rawUrl.trim().length === 0) {
    return {
      isValid: false,
      sanitizedUrl: null,
      targetDomain: null,
      isExternal: false,
      reason: "Destination URL cannot be empty.",
    };
  }

  const trimmed = rawUrl.trim();

  // 1. Check for CRLF / header injection attempts
  if (/[\r\n\0]/.test(trimmed)) {
    return {
      isValid: false,
      sanitizedUrl: null,
      targetDomain: null,
      isExternal: false,
      reason: "URL contains disallowed control characters or CRLF sequence.",
    };
  }

  // 2. Reject protocol-relative URLs (e.g. //evil.com or \\evil.com)
  if (trimmed.startsWith("//") || trimmed.startsWith("\\\\")) {
    return {
      isValid: false,
      sanitizedUrl: null,
      targetDomain: null,
      isExternal: false,
      reason: "Protocol-relative URLs are prohibited. Must specify explicit http:// or https://.",
    };
  }

  // 3. Detect and block double-encoded bypass attempts
  if (detectDoubleEncoding(trimmed)) {
    return {
      isValid: false,
      sanitizedUrl: null,
      targetDomain: null,
      isExternal: false,
      reason: "Double-encoded URL bypass attempt detected (%252f or nested encoding).",
    };
  }

  // 4. Parse URL and validate protocol
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return {
      isValid: false,
      sanitizedUrl: null,
      targetDomain: null,
      isExternal: false,
      reason: "Malformed destination URL.",
    };
  }

  // Strictly enforce HTTP and HTTPS protocols
  const protocol = parsed.protocol.toLowerCase();
  if (protocol !== "http:" && protocol !== "https:") {
    return {
      isValid: false,
      sanitizedUrl: null,
      targetDomain: null,
      isExternal: false,
      reason: `Prohibited URL protocol '${parsed.protocol}'. Only http: and https: are allowed.`,
    };
  }

  // 5. Block userinfo bypass attempts (e.g. https://stormsale.xyz@attacker.com)
  if (parsed.username || parsed.password) {
    return {
      isValid: false,
      sanitizedUrl: null,
      targetDomain: null,
      isExternal: false,
      reason: "URLs with embedded username or password authentication are prohibited.",
    };
  }

  // 6. Check host
  const host = parsed.hostname.toLowerCase();
  if (!host) {
    return {
      isValid: false,
      sanitizedUrl: null,
      targetDomain: null,
      isExternal: false,
      reason: "Missing host in destination URL.",
    };
  }

  const currentHost =
    options?.currentHost ||
    (typeof window !== "undefined" ? window.location.hostname : "stormsale.xyz");

  const isExternal = host !== currentHost && host !== "localhost" && host !== "127.0.0.1";

  return {
    isValid: true,
    sanitizedUrl: parsed.toString(),
    targetDomain: host,
    isExternal,
  };
}
