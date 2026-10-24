import { expect, type Locator, type Page } from "@playwright/test";

export const VALID_WATCH_KEY = "G" + "A".repeat(55);
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
      body: "",
    }),
  );
  await page.route("**/*pravatar.cc/**", (route) =>
    route.fulfill({ status: 200, contentType: "image/jpeg", headers: corsHeaders, body: "" }),
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
