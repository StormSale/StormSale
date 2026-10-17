const DEFAULT_COOKIE_NAME = "__stormsale_ref";
const DEFAULT_QUERY_PARAM = "ref";
const DEFAULT_MAX_AGE = 60 * 60 * 24 * 30;
const MAX_SLUG_LENGTH = 64;
const MAX_COOKIE_AGE = 60 * 60 * 24 * 400;
const SLUG_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
const COOKIE_NAME_PATTERN = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/;
const COOKIE_PATH_PATTERN = /^\/[^;\r\n]*$/;
const COOKIE_DOMAIN_PATTERN = /^\.?[A-Za-z0-9.-]+$/;

export interface StormSaleReferralOptions {
  /** Query parameter that contains the referral token. Defaults to `ref`. */
  queryParam?: string;
  /** Attribution cookie name. Defaults to `__stormsale_ref`. */
  cookieName?: string;
  /** Cookie lifetime in seconds. Defaults to 30 days; maximum is 400 days. */
  maxAge?: number;
  /** Optional cookie domain, such as `.example.com`. */
  domain?: string;
  /** Cookie path. Defaults to `/`. */
  path?: string;
  /** Replace a valid existing attribution cookie. Defaults to `false`. */
  overwriteExisting?: boolean;
  /** Skip matching URL paths. String entries are exact paths. */
  ignorePaths?: readonly (string | RegExp)[];
  /** Return `false` to skip attribution handling for a pathname. */
  matcher?: (pathname: string) => boolean;
}

export interface StormSaleCookieStore {
  get(name: string): { readonly value: string } | undefined;
}

/**
 * Middleware handler function type compatible with Next.js middleware.
 * Callers specify the request type and any additional arguments (such as NextFetchEvent)
 * to maintain strict type safety under function parameter contravariance.
 *
 * @template RequestType - Type of incoming request object extending Web `Request`.
 * @template Rest - Array or tuple of additional argument types passed to the handler.
 */
export type StormSaleMiddlewareHandler<RequestType extends Request, Rest extends unknown[]> = (
  request: RequestType,
  ...rest: Rest
) => Response | void | undefined | Promise<Response | void | undefined>;

/**
 * Validates whether a given string is a valid referral token slug.
 *
 * @param value - Candidate referral slug to validate.
 * @returns True if the slug conforms to length and character set limits.
 */
function isValidSlug(value: string): boolean {
  return value.length <= MAX_SLUG_LENGTH && SLUG_PATTERN.test(value);
}

/**
 * Validates whether a cookie name complies with RFC 6265 token rules.
 *
 * @param value - Candidate cookie name to validate.
 * @returns True if the cookie name contains only valid characters.
 */
function isValidCookieName(value: string): boolean {
  return COOKIE_NAME_PATTERN.test(value);
}

/**
 * Extracts and decodes a specific cookie value from a Cookie header string.
 *
 * @param cookieHeader - Raw Cookie header value from the request.
 * @param cookieName - Name of the cookie to search for.
 * @returns The validated cookie value, or null if missing or invalid.
 */
function parseCookie(cookieHeader: string | null, cookieName: string): string | null {
  if (!cookieHeader) {
    return null;
  }

  for (const part of cookieHeader.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0 || part.slice(0, separator).trim() !== cookieName) {
      continue;
    }

    const value = part.slice(separator + 1).trim();
    try {
      const decodedValue = decodeURIComponent(value);
      return isValidSlug(decodedValue) ? decodedValue : null;
    } catch {
      return null;
    }
  }

  return null;
}

/**
 * Determines whether the given URL pathname should be skipped based on
 * configured ignore paths or custom matcher functions.
 *
 * @param pathname - URL pathname to check.
 * @param options - Referral options containing ignorePaths and matcher.
 * @returns True if the pathname should be skipped.
 */
function isIgnoredPath(pathname: string, options: StormSaleReferralOptions): boolean {
  if (options.matcher && !options.matcher(pathname)) {
    return true;
  }

  return (options.ignorePaths ?? []).some((ignoredPath) => {
    if (typeof ignoredPath === "string") {
      return ignoredPath === pathname;
    }

    const flags = ignoredPath.flags.replace(/[gy]/g, "");
    return new RegExp(ignoredPath.source, flags).test(pathname);
  });
}

/**
 * Formats and validates a Set-Cookie header attribute string for the attribution cookie.
 *
 * @param cookieName - Name of the cookie.
 * @param slug - Referral slug to store.
 * @param options - Cookie configuration options (maxAge, path, domain).
 * @returns Formatted Set-Cookie header string, or null if configuration is invalid.
 */
function serializeCookie(
  cookieName: string,
  slug: string,
  options: StormSaleReferralOptions,
): string | null {
  const maxAge = options.maxAge ?? DEFAULT_MAX_AGE;
  const path = options.path ?? "/";
  const domain = options.domain;

  if (
    !isValidCookieName(cookieName) ||
    !Number.isSafeInteger(maxAge) ||
    maxAge <= 0 ||
    maxAge > MAX_COOKIE_AGE ||
    !COOKIE_PATH_PATTERN.test(path) ||
    (domain !== undefined && !COOKIE_DOMAIN_PATTERN.test(domain))
  ) {
    return null;
  }

  const attributes = [
    `${cookieName}=${encodeURIComponent(slug)}`,
    `Path=${path}`,
    `Max-Age=${maxAge}`,
    "HttpOnly",
    "Secure",
    "SameSite=Lax",
  ];

  if (domain) {
    attributes.push(`Domain=${domain}`);
  }

  return attributes.join("; ");
}

/**
 * Adds a secure attribution cookie to an existing middleware response.
 * On invalid input or processing errors, returns the original response unchanged.
 *
 * @param request - Incoming HTTP request containing query parameters and headers.
 * @param response - Outgoing HTTP response to append the Set-Cookie header to.
 * @param options - Optional configuration for query parameter name, cookie attributes, and matching.
 * @returns The response with the attribution cookie appended if valid, or unchanged otherwise.
 */
export function stormsaleMiddleware(
  request: Request,
  response: Response,
  options: StormSaleReferralOptions = {},
): Response {
  try {
    const url = new URL(request.url);
    if (isIgnoredPath(url.pathname, options)) {
      return response;
    }

    const queryParam = options.queryParam ?? DEFAULT_QUERY_PARAM;
    if (!queryParam) {
      return response;
    }

    const slug = url.searchParams.get(queryParam);
    if (!slug || !isValidSlug(slug)) {
      return response;
    }

    const cookieName = options.cookieName ?? DEFAULT_COOKIE_NAME;
    if (!isValidCookieName(cookieName)) {
      return response;
    }

    if (
      !options.overwriteExisting &&
      parseCookie(request.headers.get("cookie"), cookieName) !== null
    ) {
      return response;
    }

    const cookie = serializeCookie(cookieName, slug, options);
    if (!cookie) {
      return response;
    }

    response.headers.append("Set-Cookie", cookie);
  } catch {
    return response;
  }

  return response;
}

/**
 * Wraps a Next.js-compatible middleware handler and adds referral attribution to
 * the response it returns. Errors thrown by the wrapped handler are not swallowed.
 *
 * Forwards additional middleware arguments (such as `NextFetchEvent`) to the
 * wrapped handler. If the handler returns `void` or `undefined`, a pass-through
 * response with Next.js's continue header (`x-middleware-next: "1"`) is created
 * so attribution can still be attached.
 *
 * @template RequestType - Type of the incoming Request object.
 * @template Rest - Types of additional arguments passed to the handler.
 * @param handler - Next.js middleware handler function to wrap.
 * @param options - Configuration options for referral cookie handling.
 * @returns A Next.js-compatible middleware function.
 */
export function withStormSaleReferral<RequestType extends Request, Rest extends unknown[]>(
  handler: (
    request: RequestType,
    ...rest: Rest
  ) => Response | void | undefined | Promise<Response | void | undefined>,
  options: StormSaleReferralOptions = {},
): (request: RequestType, ...rest: Rest) => Promise<Response> {
  return async (request, ...rest) => {
    const response =
      (await handler(request, ...rest)) ??
      new Response(null, { headers: { "x-middleware-next": "1" } });
    return stormsaleMiddleware(request, response, options);
  };
}

/**
 * Reads and validates the attribution cookie from a Cookie header or a cookie
 * store such as the value returned by Next.js `cookies()`.
 *
 * @param cookieSource - Raw Cookie header string, null, or a cookie store object with a `get` method.
 * @param options - Options containing custom cookieName if configured differently.
 * @returns The decoded and validated referral slug string, or null if missing/invalid.
 */
export function readStormSaleReferralCookie(
  cookieSource: string | null | StormSaleCookieStore,
  options: Pick<StormSaleReferralOptions, "cookieName"> = {},
): string | null {
  try {
    const cookieName = options.cookieName ?? DEFAULT_COOKIE_NAME;
    if (!isValidCookieName(cookieName)) {
      return null;
    }

    if (typeof cookieSource === "string" || cookieSource === null) {
      return parseCookie(cookieSource, cookieName);
    }

    const value = cookieSource.get(cookieName)?.value;
    if (!value) {
      return null;
    }

    const decodedValue = decodeURIComponent(value);
    return isValidSlug(decodedValue) ? decodedValue : null;
  } catch {
    return null;
  }
}
