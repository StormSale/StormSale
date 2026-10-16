# @stormsale/next-middleware

Edge-compatible referral attribution for Next.js middleware. It reads the
existing StormSale `ref` query parameter (for example,
`/c/campaign-123?ref=affiliate-wallet-or-slug`) and sets an HTTP-only
`__stormsale_ref` cookie.

## Install

```bash
npm install @stormsale/next-middleware next
```

Requires Node.js 18 or later and Next.js 13.4 or later. The package has no
runtime dependencies; Next.js is a peer dependency.

## Use with Next.js middleware

```ts
// middleware.ts
import { NextResponse, type NextRequest } from "next/server";
import { withStormSaleReferral } from "@stormsale/next-middleware";

const middleware = withStormSaleReferral((request: NextRequest) => {
  // Keep your existing middleware logic here.
  return NextResponse.next();
});

export default middleware;

export const config = {
  matcher: ["/:path*"],
};
```

The wrapper preserves the response produced by your middleware, including its
status and body, and appends the attribution cookie when appropriate. It does
not replace an existing valid attribution cookie unless `overwriteExisting` is
enabled.

## Read attribution in a Server Component or route handler

```ts
import { cookies } from "next/headers";
import { readStormSaleReferralCookie } from "@stormsale/next-middleware";

export async function getReferral() {
  return readStormSaleReferralCookie(await cookies());
}
```

Route handlers can read the same token from a request Cookie header:

```ts
const referral = readStormSaleReferralCookie(request.headers.get("cookie"));
```

The helper validates the value and returns `null` when the cookie is missing or
malformed. It can also read a Next.js `cookies()` store directly.

## Options

Pass options as the second argument to `withStormSaleReferral` or the third
argument to `stormsaleMiddleware`:

| Option              | Default             | Description                                            |
| ------------------- | ------------------- | ------------------------------------------------------ |
| `queryParam`        | `"ref"`             | Query parameter containing the referral token.         |
| `cookieName`        | `"__stormsale_ref"` | Cookie name.                                           |
| `maxAge`            | `2592000` (30 days) | Cookie lifetime in seconds, up to 400 days.            |
| `domain`            | —                   | Optional cookie domain, such as `.example.com`.        |
| `path`              | `"/"`               | Cookie path.                                           |
| `overwriteExisting` | `false`             | Replace a valid existing attribution cookie.           |
| `ignorePaths`       | `[]`                | Exact path strings or regular expressions to skip.     |
| `matcher`           | —                   | Optional predicate that receives the request pathname. |

The cookie always uses `HttpOnly`, `Secure`, and `SameSite=Lax`. Tokens must be
1–64 ASCII letters, digits, underscores, or hyphens. Invalid tokens and invalid
cookie configuration are ignored; middleware-processing failures leave the
response untouched. Errors thrown by a wrapped application middleware are
allowed to propagate as they would without this package.

## Runtime and performance

The implementation uses only Web-standard `Request`, `Response`, `URL`, and
header APIs. It performs no I/O, cryptography, or Node.js-specific operations,
so it can run in Next.js Edge and Node.js middleware runtimes. The unit suite
includes a 1,000-request check for average processing time below 5 ms. This
measures the library logic locally; it is not a guarantee for total middleware
latency or Edge cold starts.

## Nuxt

Nuxt is out of scope for this Next.js package. Nuxt middleware uses a different
event and cookie API; use a dedicated Nuxt/H3 adapter rather than assuming this
Next.js middleware wrapper is compatible.
