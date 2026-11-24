/**
 * Click Hijacking & Iframe Embedding Defense Utility (#478)
 *
 * Provides:
 * 1. Frame-busting script that redirects top window if window.self !== window.top.
 * 2. CSP frame-ancestors 'none' and X-Frame-Options DENY verification.
 * 3. Alert warning state detection for untrusted embedding attempts.
 */

import { STATIC_CSP_HEADER } from "../config/csp";

/**
 * Checks if the current window is running inside an iframe or embedded frame.
 * Catches cross-origin SecurityError when accessing window.top.
 */
export function isWindowEmbedded(targetWindow?: Window): boolean {
  const win = targetWindow ?? (typeof window !== "undefined" ? window : null);
  if (!win) return false;

  try {
    return win.self !== win.top;
  } catch {
    // Cross-origin restriction when accessing win.top proves window is framed cross-origin
    return true;
  }
}

export interface FrameBustingResult {
  isEmbedded: boolean;
  redirected: boolean;
  targetUrl?: string;
  error?: string;
}

/**
 * Executes the frame-busting routine.
 * If embedded, attempts to break out by redirecting the top-level window.
 * If top-level navigation is prohibited by iframe sandbox, handles error gracefully.
 */
export function enforceFrameBusting(targetWindow?: Window): FrameBustingResult {
  const win = targetWindow ?? (typeof window !== "undefined" ? window : null);
  if (!win) {
    return { isEmbedded: false, redirected: false };
  }

  const embedded = isWindowEmbedded(win);
  if (!embedded) {
    return { isEmbedded: false, redirected: false };
  }

  try {
    if (win.top && win.top.location) {
      const destination = win.self.location.href;
      win.top.location.href = destination;
      return {
        isEmbedded: true,
        redirected: true,
        targetUrl: destination,
      };
    }
    return { isEmbedded: true, redirected: false, error: "Top window is unavailable" };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return {
      isEmbedded: true,
      redirected: false,
      error: errorMsg,
    };
  }
}

/**
 * Verifies that Content Security Policy enforces `frame-ancestors 'none'`.
 */
export function verifyCspFrameAncestors(cspHeaderString: string = STATIC_CSP_HEADER): {
  isProtected: boolean;
  directiveValue: string | null;
  errors: string[];
} {
  const errors: string[] = [];
  const match = cspHeaderString.match(/frame-ancestors\s+([^;]+)/i);

  if (!match) {
    errors.push("Missing 'frame-ancestors' directive in CSP header.");
    return { isProtected: false, directiveValue: null, errors };
  }

  const directiveValue = match[1].trim();
  const tokens = directiveValue.split(/\s+/);

  const isNone = tokens.includes("'none'") || tokens.includes("none");
  if (!isNone) {
    errors.push(
      `Insecure frame-ancestors value '${directiveValue}'. Must strictly enforce ''none''.`,
    );
  }

  return {
    isProtected: isNone,
    directiveValue,
    errors,
  };
}

/**
 * Verifies that X-Frame-Options is set to DENY or SAMEORIGIN.
 */
export function verifyXFrameOptions(xfoHeaderValue: string = "DENY"): {
  isProtected: boolean;
  value: string;
} {
  const upper = xfoHeaderValue.trim().toUpperCase();
  const isProtected = upper === "DENY" || upper === "SAMEORIGIN";
  return {
    isProtected,
    value: upper,
  };
}
