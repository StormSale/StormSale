/**
 * Content Security Policy (CSP) & Subresource Integrity (SRI) Configuration
 *
 * Issue #211: Implement strict Content Security Policy headers and Subresource Integrity hashes.
 *
 * --- Subresource Integrity (SRI) Audit ---
 * External scripts loaded in the application (such as the Telegram WebApp SDK from https://telegram.org)
 * have verified Subresource Integrity hashes generated via:
 * openssl dgst -sha384 -binary <file> | openssl base64 -A
 * and attached via integrity="sha384-..." and crossorigin="anonymous" in index.html.
 * All other application code, styles, and dependencies are bundled locally via Vite and served from 'self'.
 *
 * --- Domain Allowlist Audit ---
 * 1. 'self': Allows loading first-party assets, scripts, stylesheets, and local API requests.
 * 2. https://telegram.org (script-src):
 *    - Telegram Mini App WebApp SDK script asset loaded in index.html with SRI integrity hash
 * 3. https://*.stellar.org (connect-src):
 *    - Stellar Horizon APIs (https://horizon-testnet.stellar.org, https://horizon.stellar.org)
 *    - Soroban RPC nodes (https://soroban-testnet.stellar.org, https://soroban-rpc.mainnet.stellar.org)
 *    - Stellar Friendbot faucet (https://friendbot.stellar.org)
 * 4. https://albedo.link (connect-src, frame-src, img-src):
 *    - Web-based Stellar/Soroban wallet signer bridge for popup authentication and transaction signing
 *    - Official Albedo wallet SVG logo in wallet connection selector
 * 5. https://stellar.expert (connect-src, img-src):
 *    - Stellar Expert blockchain explorer API & transaction verification links
 *    - Official Freighter wallet SVG logo
 * 6. https://xbull.app (img-src):
 *    - Official xBull wallet SVG logo in wallet connection selector
 * 7. https://images.unsplash.com (img-src):
 *    - Branded campaign view banners and advertiser promotional images
 * 8. https://i.pravatar.cc (img-src):
 *    - Testimonial and user profile avatar placeholders on landing page
 * 9. data: & blob: (img-src):
 *    - data:: Inline SVG and Base64 encoded icon representations
 *    - blob:: Client-side Blob URLs generated for compliance PDF/CSV audit report exports
 *
 * --- Prohibited Tokens ---
 * Neither 'unsafe-inline' nor 'unsafe-eval' is permitted under any circumstances.
 */

export interface CspOptions {
  nonce?: string;
  directives?: Record<string, string[]>;
}

/**
 * Audited documentation of every external domain allowed in the CSP directives.
 */
export const DOMAIN_ALLOWLIST_DOCUMENTATION = [
  {
    domain: "https://telegram.org",
    directive: "script-src",
    reason:
      "Telegram Mini App WebApp SDK script asset loaded in index.html with SRI integrity hash.",
  },
  {
    domain: "https://*.stellar.org",
    directive: "connect-src",
    reason:
      "Stellar Horizon REST APIs, Soroban RPC JSON-RPC endpoints, and Friendbot testnet faucet.",
  },
  {
    domain: "https://albedo.link",
    directive: "connect-src, frame-src, img-src",
    reason:
      "Albedo web-based wallet integration for user key generation, popup transaction signing, and wallet icon.",
  },
  {
    domain: "https://stellar.expert",
    directive: "connect-src, img-src",
    reason:
      "Stellar Expert blockchain explorer API for public transaction verification and Freighter wallet logo asset.",
  },
  {
    domain: "https://xbull.app",
    directive: "img-src",
    reason: "xBull wallet brand SVG logo in ConnectWalletModal.",
  },
  {
    domain: "https://images.unsplash.com",
    directive: "img-src",
    reason: "Advertiser campaign banner imagery and branded campaign themes.",
  },
  {
    domain: "https://i.pravatar.cc",
    directive: "img-src",
    reason: "Landing page user testimonials and profile avatars.",
  },
] as const;

/**
 * Required base CSP directives according to specification:
 * default-src 'self'; script-src 'self'; connect-src 'self' https://*.stellar.org;
 */
export const BASE_CSP_DIRECTIVES: Record<string, string[]> = {
  "default-src": ["'self'"],
  "script-src": ["'self'", "https://telegram.org"],
  "connect-src": [
    "'self'",
    "https://*.stellar.org",
    "https://albedo.link",
    "https://stellar.expert",
  ],
};

/**
 * Full strict CSP directives for StormSale production and preview environments.
 */
export const STRICT_CSP_DIRECTIVES: Record<string, string[]> = {
  "default-src": ["'self'"],
  "script-src": ["'self'", "https://telegram.org"],
  "connect-src": [
    "'self'",
    "https://*.stellar.org",
    "https://albedo.link",
    "https://stellar.expert",
  ],
  "img-src": [
    "'self'",
    "data:",
    "blob:",
    "https://images.unsplash.com",
    "https://i.pravatar.cc",
    "https://stellar.expert",
    "https://albedo.link",
    "https://xbull.app",
  ],
  "style-src": ["'self'"],
  "font-src": ["'self'"],
  "object-src": ["'none'"],
  "base-uri": ["'self'"],
  "form-action": ["'self'"],
  "frame-ancestors": ["'none'"],
  "frame-src": ["'self'", "https://albedo.link"],
};

/**
 * Generates a cryptographically random nonce per request.
 * Uses Web Crypto API (crypto.getRandomValues).
 * Never reuses nonces across requests. Throws if Web Crypto is unavailable.
 */
export function generateNonce(): string {
  if (typeof crypto === "undefined" || typeof crypto.getRandomValues !== "function") {
    throw new Error("Cryptographically secure random number generator is unavailable.");
  }
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Builds a Content-Security-Policy header string from directives.
 * If a nonce is supplied, it is appended to the script-src directive.
 * Strict guarantees:
 * - 'unsafe-inline' is never added
 * - 'unsafe-eval' is never added
 */
export function buildCspHeader(options?: CspOptions): string {
  const sourceDirectives = options?.directives || STRICT_CSP_DIRECTIVES;
  const directives: Record<string, string[]> = {};

  for (const [key, values] of Object.entries(sourceDirectives)) {
    directives[key] = [...values];
  }

  if (options?.nonce) {
    const nonceToken = `'nonce-${options.nonce}'`;
    if (directives["script-src"]) {
      if (!directives["script-src"].includes(nonceToken)) {
        directives["script-src"].push(nonceToken);
      }
    } else {
      directives["script-src"] = ["'self'", nonceToken];
    }
  }

  const parts: string[] = [];
  for (const [directive, sources] of Object.entries(directives)) {
    // Safety check: assert no unsafe keywords
    const sanitizedSources = sources.filter(
      (s) => s !== "'unsafe-inline'" && s !== "'unsafe-eval'",
    );
    if (sanitizedSources.length > 0) {
      parts.push(`${directive} ${sanitizedSources.join(" ")}`);
    } else {
      parts.push(directive);
    }
  }

  return parts.join("; ") + ";";
}

/**
 * Precomputed static strict CSP header for production web servers (Nginx, Vercel).
 */
export const STATIC_CSP_HEADER = buildCspHeader();

/**
 * Validates a CSP header string against security requirements:
 * 1. No 'unsafe-inline' anywhere
 * 2. No 'unsafe-eval' anywhere
 * 3. Contains required directives: default-src 'self', script-src 'self', connect-src 'self' https://*.stellar.org
 */
export function validateCspHeader(header: string): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!header || typeof header !== "string") {
    errors.push("CSP header is empty or not a string");
    return { isValid: false, errors };
  }

  if (header.includes("'unsafe-inline'")) {
    errors.push("CSP header contains prohibited 'unsafe-inline'");
  }

  if (header.includes("'unsafe-eval'")) {
    errors.push("CSP header contains prohibited 'unsafe-eval'");
  }

  // Parse directives into scoped key -> source tokens mapping
  const directives: Record<string, string[]> = {};
  header
    .split(";")
    .map((d) => d.trim())
    .filter(Boolean)
    .forEach((part) => {
      const tokens = part.split(/\s+/);
      const name = tokens[0];
      const values = tokens.slice(1);
      directives[name] = values;
    });

  if (!directives["default-src"] || !directives["default-src"].includes("'self'")) {
    errors.push("Missing required 'default-src 'self'' directive");
  }

  if (!directives["script-src"] || !directives["script-src"].includes("'self'")) {
    errors.push("Missing required 'script-src' directive with ''self''");
  }

  if (
    !directives["connect-src"] ||
    !directives["connect-src"].includes("'self'") ||
    !directives["connect-src"].includes("https://*.stellar.org")
  ) {
    errors.push("Missing required 'connect-src' with 'https://*.stellar.org'");
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}
