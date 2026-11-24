import { expect, type Locator, type Page } from "@playwright/test";

// A checksum-valid ed25519 public key (the all-zero key). The read-only flow now
// validates keys with StrKey, so a "G" + 55 x "A" string is correctly rejected.
export const VALID_WATCH_KEY = "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF";
export const VALID_WATCH_KEY_SHORT = "GAAAAA...AWHF";
export const DEMO_ADDRESS_SHORT = "GASTOR...7777";

/** Stub the backend so journeys never depend on a running API or the Stellar network. */
export async function mockBackend(page: Page) {
  page.on("pageerror", (err) => console.error("[BROWSER ERROR]:", err));
  page.on("console", (msg) => console.log("[BROWSER CONSOLE]:", msg.type(), msg.text()));

  const corsHeaders = {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET, POST, PUT, DELETE, OPTIONS",
    "access-control-allow-headers": "Content-Type, Authorization",
  };

  await page.route(
    (url) => url.pathname === "/" || url.pathname.endsWith("/index.html"),
    async (route) => {
      const response = await route.fetch();
      const body = await response.text();
      // In E2E tests, telegram.org is mocked by Playwright; strip integrity from the external script so SRI passes on mock response
      const modified = body.replace(
        /(<script\b[^>]*src=["']https:\/\/telegram\.org\/js\/telegram-web-app\.js["'][^>]*)integrity=["'][^"']*["']([^>]*>)/i,
        "$1$2",
      );
      await route.fulfill({
        response,
        body: modified,
      });
    },
  );

  await page.route("**/api/users", async (route) => {
    if (route.request().method() === "OPTIONS") {
      return route.fulfill({ status: 204, headers: corsHeaders });
    }
    let role = "AFFILIATE";
    let walletAddress = "GASTORMSALE7TESTNET7AFFILIATE7MERCHANT7ESCROW7XLM77777";
    try {
      const data = route.request().postDataJSON();
      if (data?.role) role = data.role;
      if (data?.walletAddress) walletAddress = data.walletAddress;
    } catch {
      // fallback
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: corsHeaders,
      body: JSON.stringify({ walletAddress, role }),
    });
  });

  await page.route("**/api/campaigns**", (route) => {
    if (route.request().method() === "OPTIONS") {
      return route.fulfill({ status: 204, headers: corsHeaders });
    }
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: corsHeaders,
      body: "[]",
    });
  });

  await page.route("**/api/conversions**", (route) => {
    if (route.request().method() === "OPTIONS") {
      return route.fulfill({ status: 204, headers: corsHeaders });
    }
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: corsHeaders,
      body: "[]",
    });
  });

  const healthyRpc = JSON.stringify({ jsonrpc: "2.0", id: 1, result: { status: "healthy" } });

  await page.route("**/soroban*/**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: corsHeaders,
      body: healthyRpc,
    }),
  );
  await page.route("**/*stellar*.org/**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: corsHeaders,
      body: healthyRpc,
    }),
  );
  await page.route("**/*blockdaemon.com/**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: corsHeaders,
      body: healthyRpc,
    }),
  );
  await page.route("**/*publicnode.com/**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: corsHeaders,
      body: healthyRpc,
    }),
  );
  await page.route("**/*blockdag.network/**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: corsHeaders,
      body: healthyRpc,
    }),
  );
  await page.route("**/telegram.org/**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/javascript",
      headers: corsHeaders,
      body: "window.Telegram = { WebApp: { ready: () => {}, close: () => {}, expand: () => {}, themeParams: {} } };",
    }),
  );
  await page.route("**/*pravatar.cc/**", (route) =>
    route.fulfill({ status: 200, contentType: "image/jpeg", headers: corsHeaders, body: "" }),
  );
  await page.route("**/*coingecko.com/**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: corsHeaders,
      body: JSON.stringify({
        stellar: { usd: 0.12, eur: 0.11, usdc: 0.12, last_updated_at: Math.floor(Date.now() / 1000) },
      }),
    }),
  );
  await page.route("**/*pyth.network/**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: corsHeaders,
      body: JSON.stringify({ parsed: [{ price: { price: "12000000", expo: -8 } }] }),
    }),
  );
}

/** The sidebar renders a desktop and a mobile copy; return the one that is actually visible. */
export function visible(locator: Locator) {
  return locator.filter({ visible: true }).first();
}

export async function connectWithDemoAccount(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Connect Wallet" }).first().click();
  await expect(page.getByRole("heading", { name: "Connect Stellar Wallet" })).toBeVisible();
  await page.getByRole("button", { name: /1-Tap Demo Account/ }).click();
  await expect(page.getByRole("heading", { name: "Select Your Role" })).toBeVisible();
}

export async function assumeRole(page: Page, title: "Advertiser" | "Affiliate" | "Auditor") {
  await page.getByRole("heading", { name: title, exact: true }).click();
  await page.getByRole("button", { name: "Sign & Assume Role" }).click();
}
