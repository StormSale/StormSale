import { test, expect, type Page } from "@playwright/test";
import { mockBackend } from "../tests/e2e/helpers";

const DEMO_PREFIX = "/c/1?ref=GASTORMSALE7";

/**
 * Connects the 1-Tap Demo Account wallet connector via the modal.
 *
 * @param page - Playwright page object
 */
const connectDemoWallet = async (page: Page) => {
  await page
    .getByRole("button", { name: /connect wallet/i })
    .first()
    .click();
  await page.getByRole("button", { name: /1-tap demo account/i }).click();
  await expect(page.getByRole("heading", { name: "Select Your Role" })).toBeVisible();
};

/**
 * Assumes a role by selecting its card and signing the role confirmation.
 *
 * @param page - Playwright page object
 * @param role - Role title to assume (e.g., 'Advertiser', 'Affiliate')
 */
const assumeRole = async (page: Page, role: string) => {
  await page.getByRole("heading", { name: role, exact: true }).click();
  await page.getByRole("button", { name: /sign & assume role/i }).click();
};

test.describe("StormSale wallet connector smoke tests", () => {
  test.beforeEach(async ({ page }) => {
    await mockBackend(page);
    await page.goto("/");
  });

  test("opens the wallet connection modal with all connectors", async ({ page }) => {
    await page
      .getByRole("button", { name: /connect wallet/i })
      .first()
      .click();

    await expect(page.getByRole("heading", { name: "Connect Stellar Wallet" })).toBeVisible();
    for (const wallet of ["Albedo", "Freighter", "xBull Wallet", "1-Tap Demo Account"]) {
      await expect(page.getByRole("button", { name: new RegExp(wallet, "i") })).toBeVisible();
    }
  });

  test("connects a demo account and lands on the role dashboard", async ({ page }) => {
    await connectDemoWallet(page);

    await expect(page.getByText("10000.00 XLM")).toBeVisible();
  });

  test("views campaigns from the advertiser dashboard", async ({ page }) => {
    await connectDemoWallet(page);
    await assumeRole(page, "Advertiser");

    await page.getByRole("button", { name: "My Campaigns" }).click();
    await expect(page.getByRole("heading", { name: "My Campaigns" })).toBeVisible();
    await expect(page.getByText("Tech Gadgets Pro")).toBeVisible();
  });

  test("copies the affiliate referral link", async ({ page, context, browserName, baseURL }) => {
    if (browserName === "chromium") {
      await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: baseURL });
    }

    await connectDemoWallet(page);
    await assumeRole(page, "Affiliate");

    const referralLink = page.getByTestId("referral-link");
    await expect(referralLink).toBeVisible();
    await expect(referralLink).toContainText(DEMO_PREFIX);

    await page.getByRole("button", { name: /copy link/i }).click();
    await expect(page.getByRole("button", { name: /copied/i })).toBeVisible();

    if (browserName === "chromium") {
      const clipboard = await page.evaluate(() => navigator.clipboard.readText());
      expect(clipboard).toContain(DEMO_PREFIX);
    } else {
      // Multi-browser fallback for Firefox and WebKit where clipboard-read permission is restricted
      await page.evaluate(() => {
        const input = document.createElement("textarea");
        input.id = "playwright-clipboard-check";
        document.body.appendChild(input);
      });
      await page.focus("#playwright-clipboard-check");
      const modifier = process.platform === "darwin" ? "Meta" : "Control";
      await page.keyboard.press(`${modifier}+v`);
      const clipboard = await page.inputValue("#playwright-clipboard-check");
      await page.evaluate(() => {
        document.getElementById("playwright-clipboard-check")?.remove();
      });
      expect(clipboard).toContain(DEMO_PREFIX);
    }
  });
});

