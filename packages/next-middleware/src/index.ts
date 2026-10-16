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

export type StormSaleMiddlewareHandler = (request: Request) => Response | Promise<Response>;

function isValidSlug(value: string): boolean {
  return value.length <= MAX_SLUG_LENGTH && SLUG_PATTERN.test(value);
}

function isValidCookieName(value: string): boolean {
  return COOKIE_NAME_PATTERN.test(value);
}

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
 */
export function withStormSaleReferral<RequestType extends Request>(
  handler: (request: RequestType) => Response | Promise<Response>,
  options: StormSaleReferralOptions = {},
): (request: RequestType) => Promise<Response> {
  return async (request) => {
    const response = await handler(request);
    return stormsaleMiddleware(request, response, options);
  };
}

/**
 * Reads and validates the attribution cookie from a Cookie header or a cookie
 * store such as the value returned by Next.js `cookies()`.
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
