import { expect, test } from "@playwright/test";
import {
  VALID_WATCH_KEY,
  VALID_WATCH_KEY_SHORT,
  connectWithDemoAccount,
  mockBackend,
  visible,
} from "./helpers";

test.describe("Journey: wallet connection", () => {
  test.beforeEach(async ({ page }) => {
    await mockBackend(page);
  });

  test("visitor opens the wallet modal and closes it again", async ({ page }) => {
    await page.goto("/");
    await visible(page.getByRole("button", { name: "Connect Wallet" })).click();
    await expect(page.getByRole("heading", { name: "Connect Stellar Wallet" })).toBeVisible();
    await expect(page.getByText("Freighter", { exact: true })).toBeVisible();
    await expect(page.getByText("Albedo", { exact: true })).toBeVisible();

    await page.mouse.click(5, 5); // backdrop
    await expect(page.getByRole("heading", { name: "Connect Stellar Wallet" })).toBeHidden();
  });

  test("visitor connects with the demo account and disconnects", async ({ page }) => {
    await connectWithDemoAccount(page);
    // Once SRI is intact the app fully boots and the truncated address renders
    // in both the account menu button (header) and the responsive dashboard
    // header inside `<main>`. Playwright strict mode rejects a locator that
    // resolves to more than one element, so scope to the visible account-menu
    // copy which is the canonical "am I connected?" affordance.
    await expect(
      page.getByRole("button", { name: /Account menu for GASTOR\.\.\.7777/ }),
    ).toBeVisible();

    await page.getByRole("button", { name: "Disconnect" }).click();
    await expect(page.getByRole("heading", { name: "Select Your Role" })).toBeHidden();
    await expect(visible(page.getByRole("button", { name: "Connect Wallet" }))).toBeVisible();
  });

  test("read-only mode rejects a malformed Stellar key", async ({ page }) => {
    await page.goto("/");
    await visible(page.getByRole("button", { name: "Connect Wallet" })).click();
    await page.getByRole("button", { name: /Read-Only Watch Mode/ }).click();
    await page.getByPlaceholder(/^GXXXX/).fill("not-a-key");
    await page.getByRole("button", { name: "Connect Watch Key" }).click();

    const notice = page.getByText("Connection Notice");
    await expect(notice).toBeVisible();
    // The read-only input also accepts name*domain.com federation addresses, so
    // the shared resolver's validation copy is surfaced in the notice banner. The
    // same copy can also appear as inline helper text under the input, so scope
    // the assertion to the banner to stay strict-mode safe.
    await expect(
      notice
        .locator("..")
        .getByText(/Enter a valid G\.\.\. public key or name\*domain\.com federation address/),
    ).toBeVisible();
    await expect(page.getByRole("heading", { name: "Select Your Role" })).toBeHidden();
  });

  test("read-only mode accepts a well-formed Stellar key", async ({ page }) => {
    await page.goto("/");
    await visible(page.getByRole("button", { name: "Connect Wallet" })).click();
    await page.getByRole("button", { name: /Read-Only Watch Mode/ }).click();
    await page.getByPlaceholder(/^GXXXX/).fill(VALID_WATCH_KEY);
    await page.getByRole("button", { name: "Connect Watch Key" }).click();

    await expect(page.getByRole("heading", { name: "Select Your Role" })).toBeVisible();
    // Same strict-mode reason as the demo-account test above — the watch key
    // is echoed in the account menu button and inside `<main>`.
    await expect(
      page.getByRole("button", { name: `Account menu for ${VALID_WATCH_KEY_SHORT}` }),
    ).toBeVisible();
  });
});
