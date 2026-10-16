import { expect, type Locator, type Page } from "@playwright/test";

export const VALID_WATCH_KEY = "G" + "A".repeat(55);
export const DEMO_ADDRESS_SHORT = "GASTOR...7777";

/** Stub the backend so journeys never depend on a running API or the Stellar network. */
export async function mockBackend(page: Page) {
  await page.route("**/api/users", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ walletAddress: "GASTORMSALE", role: "AFFILIATE" }),
    }),
  );
  await page.route("**/horizon*.stellar.org/**", (route) =>
    route.fulfill({ status: 404, contentType: "application/json", body: "{}" }),
  );
}

/** The sidebar renders a desktop and a mobile copy; return the one that is actually visible. */
export function visible(locator: Locator) {
  return locator.filter({ visible: true }).first();
}

export async function connectWithDemoAccount(page: Page) {
  await page.goto("/");
  await visible(page.getByRole("button", { name: "Connect Wallet" })).click();
  await expect(page.getByRole("heading", { name: "Connect Stellar Wallet" })).toBeVisible();
  await page.getByRole("button", { name: /1-Tap Demo Account/ }).click();
  await expect(page.getByRole("heading", { name: "Select Your Role" })).toBeVisible();
}

export async function assumeRole(page: Page, title: "Advertiser" | "Affiliate" | "Auditor") {
  await page.getByRole("heading", { name: title, exact: true }).click();
  await page.getByRole("button", { name: "Sign & Assume Role" }).click();
}
