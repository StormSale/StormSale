import { expect, test } from "@playwright/test";
import { VALID_WATCH_KEY, connectWithDemoAccount, mockBackend, visible } from "./helpers";

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
    await expect(page.getByText("GASTOR...7777")).toBeVisible();

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

    await expect(page.getByText("Connection Notice")).toBeVisible();
    await expect(page.getByText(/Invalid Stellar public key format/)).toBeVisible();
    await expect(page.getByRole("heading", { name: "Select Your Role" })).toBeHidden();
  });

  test("read-only mode accepts a well-formed Stellar key", async ({ page }) => {
    await page.goto("/");
    await visible(page.getByRole("button", { name: "Connect Wallet" })).click();
    await page.getByRole("button", { name: /Read-Only Watch Mode/ }).click();
    await page.getByPlaceholder(/^GXXXX/).fill(VALID_WATCH_KEY);
    await page.getByRole("button", { name: "Connect Watch Key" }).click();

    await expect(page.getByRole("heading", { name: "Select Your Role" })).toBeVisible();
    await expect(page.getByText("GAAAAA...AAAA")).toBeVisible();
  });
});
