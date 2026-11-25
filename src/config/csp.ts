/**
 * Strict Content Security Policy for production, preview, and development.
 * External scripts are self-hosted or pinned to Telegram with SRI. Network
 * access is limited to exact Stellar/RPC hosts and first-party APIs.
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
    domain: "https://soroban-testnet.stellar.org",
    directive: "connect-src",
    reason: "Official Stellar Development Foundation testnet Soroban RPC endpoint.",
  },
  {
    domain: "https://soroban-rpc.mainnet.stellar.org",
    directive: "connect-src",
    reason: "Official Stellar Development Foundation mainnet Soroban RPC endpoint.",
  },
  {
    domain: "https://horizon-testnet.stellar.org",
    directive: "connect-src",
    reason: "Official Stellar Development Foundation testnet Horizon API.",
  },
  {
    domain: "https://horizon.stellar.org",
    directive: "connect-src",
    reason: "Official Stellar Development Foundation mainnet Horizon API.",
  },
  {
    domain: "https://friendbot.stellar.org",
    directive: "connect-src",
    reason: "Official Stellar Development Foundation testnet Friendbot faucet.",
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
  {
    domain: "https://mainnet.stellar.blockdaemon.com",
    directive: "connect-src",
    reason: "Pinned Blockdaemon mainnet Soroban RPC endpoint used by the fallback pool.",
  },
  {
    domain: "https://testnet.stellar.blockdaemon.com",
    directive: "connect-src",
    reason: "Pinned Blockdaemon testnet Soroban RPC endpoint used by the fallback pool.",
  },
  {
    domain: "https://horizon.blockdaemon.com",
    directive: "connect-src",
    reason: "Pinned Blockdaemon mainnet Horizon endpoint used by the fallback pool.",
  },
  {
    domain: "https://horizon.testnet.stellar.blockdaemon.com",
    directive: "connect-src",
    reason: "Pinned Blockdaemon testnet Horizon endpoint used by the fallback pool.",
  },
  {
    domain: "https://stellar.publicnode.com",
    directive: "connect-src",
    reason: "Pinned PublicNode mainnet gateway used by the fallback pool.",
  },
  {
    domain: "https://stellar-testnet.publicnode.com",
    directive: "connect-src",
    reason: "Pinned PublicNode testnet gateway used by the fallback pool.",
  },
  {
    domain: "https://rpc.blockdag.network",
    directive: "connect-src",
    reason: "BlockDAG network testnet Soroban RPC gateway.",
  },
  {
    domain: "https://public.chainalysis.com",
    directive: "connect-src",
    reason: "Chainalysis sanctions screening for connected wallet addresses when configured.",
  },
  {
    domain: "https://api.coingecko.com",
    directive: "connect-src",
    reason: "Primary live Stellar price feed used by the advertiser sale oracle.",
  },
  {
    domain: "https://hermes.pyth.network",
    directive: "connect-src",
    reason: "Pyth Hermès fallback price feed used when CoinGecko is unavailable.",
  },
  {
    domain: "http://localhost:8000, http://127.0.0.1:8000",
    directive: "connect-src (development only)",
    reason: "Local standalone Soroban developer node and Horizon container.",
  },
  {
    domain:
      "http://localhost:3000, http://127.0.0.1:3000, http://localhost:3001, http://127.0.0.1:3001, ws://localhost:3001, ws://127.0.0.1:3001",
    directive: "connect-src (development only)",
    reason: "StormSale local backend API and WebSocket development servers.",
  },
] as const;

export const TRUSTED_NETWORK_ORIGINS = [
  "https://soroban-testnet.stellar.org",
  "https://soroban-rpc.mainnet.stellar.org",
  "https://horizon-testnet.stellar.org",
  "https://horizon.stellar.org",
  "https://friendbot.stellar.org",
  "https://albedo.link",
  "https://stellar.expert",
  "https://mainnet.stellar.blockdaemon.com",
  "https://testnet.stellar.blockdaemon.com",
  "https://horizon.blockdaemon.com",
  "https://horizon.testnet.stellar.blockdaemon.com",
  "https://stellar.publicnode.com",
  "https://stellar-testnet.publicnode.com",
  "https://rpc.blockdag.network",
  "https://public.chainalysis.com",
  "https://api.coingecko.com",
  "https://hermes.pyth.network",
] as const;

export const BASE_CSP_DIRECTIVES: Record<string, string[]> = {
  "default-src": ["'self'"],
  "script-src": ["'self'", "https://telegram.org"],
  "connect-src": ["'self'", ...TRUSTED_NETWORK_ORIGINS],
};

export const STRICT_CSP_DIRECTIVES: Record<string, string[]> = {
  "default-src": ["'self'"],
  "script-src": ["'self'", "https://telegram.org"],
  "connect-src": ["'self'", ...TRUSTED_NETWORK_ORIGINS],
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
  "style-src-attr": ["'unsafe-inline'"],
  "font-src": ["'self'"],
  "worker-src": ["'self'"],
  "manifest-src": ["'self'"],
  "object-src": ["'none'"],
  "base-uri": ["'self'"],
  "form-action": ["'self'"],
  "frame-ancestors": ["'none'"],
  "frame-src": ["'self'", "https://albedo.link"],
};

export const DEVELOPMENT_CSP_DIRECTIVES: Record<string, string[]> = {
  ...STRICT_CSP_DIRECTIVES,
  "connect-src": [
    ...STRICT_CSP_DIRECTIVES["connect-src"],
    "http://localhost:8000",
    "http://127.0.0.1:8000",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:3001",
    "http://127.0.0.1:3001",
    "ws://localhost:3000",
    "ws://127.0.0.1:3000",
    "ws://localhost:3001",
    "ws://127.0.0.1:3001",
  ],
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
 * - 'unsafe-inline' is limited to style-src-attr
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
    const sanitizedSources = sources.filter(
      (source) =>
        source !== "'unsafe-eval'" &&
        (source !== "'unsafe-inline'" || directive === "style-src-attr"),
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
 * 1. No inline scripts or stylesheets; style attributes remain available to React
 * 2. No 'unsafe-eval' anywhere
 * 3. Contains required directives: default-src 'self', script-src 'self', connect-src 'self' with pinned RPC hosts
 */
export function validateCspHeader(header: string): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!header || typeof header !== "string") {
    errors.push("CSP header is empty or not a string");
    return { isValid: false, errors };
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

  const hasUnsafeInline = Object.entries(directives).some(
    ([directive, sources]) => directive !== "style-src-attr" && sources.includes("'unsafe-inline'"),
  );
  if (hasUnsafeInline) {
    errors.push("CSP header contains prohibited 'unsafe-inline'");
  }

  if (!directives["default-src"] || !directives["default-src"].includes("'self'")) {
    errors.push("Missing required 'default-src 'self'' directive");
  }

  if (!directives["script-src"] || !directives["script-src"].includes("'self'")) {
    errors.push("Missing required 'script-src' directive with ''self''");
  }

  const requiredRpcOrigins = [
    "https://soroban-testnet.stellar.org",
    "https://soroban-rpc.mainnet.stellar.org",
  ];
  const connectSrc = directives["connect-src"] || [];
  if (
    !connectSrc.includes("'self'") ||
    requiredRpcOrigins.some((origin) => !connectSrc.includes(origin))
  ) {
    errors.push("Missing required 'connect-src' with pinned Stellar RPC origins");
  }

  const untrustedOrigins = connectSrc.filter(
    (source) =>
      source !== "'self'" && !(TRUSTED_NETWORK_ORIGINS as readonly string[]).includes(source),
  );
  if (untrustedOrigins.length > 0) {
    errors.push(`'connect-src' contains untrusted network origins: ${untrustedOrigins.join(", ")}`);
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}
