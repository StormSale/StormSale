import { expect, test } from "@playwright/test";
import {
  mockBackend,
  connectWithDemoAccount,
  assumeRole,
  visible,
  DEMO_ADDRESS_SHORT,
} from "./helpers";

test.describe("Automated Wallet Connect E2E & Dashboard Entry (#92)", () => {
  test.beforeEach(async ({ page }) => {
    await mockBackend(page);
  });

  test("automated connection flow via mock bridge without manual input", async ({ page }) => {
    // 1. Visit landing page
    await page.goto("/");
    await expect(page).toHaveTitle(/StormSale/i);

    // 2. Automated connection without manual popup input
    const connectBtn = visible(page.getByRole("button", { name: "Connect Wallet" }));
    await expect(connectBtn).toBeVisible();
    await connectBtn.click();

    await expect(page.getByRole("heading", { name: "Connect Stellar Wallet" })).toBeVisible();
    const demoConnector = page.getByRole("button", { name: /1-Tap Demo Account/i });
    await expect(demoConnector).toBeVisible();
    await demoConnector.click();

    // 3. Acceptance criteria: Verified connection via mock bridge
    const accountMenu = page.getByRole("button", {
      name: new RegExp(`Account menu for ${DEMO_ADDRESS_SHORT}`, "i"),
    });
    await expect(accountMenu).toBeVisible();
  });

  test("successful dashboard entry and role configuration test", async ({ page }) => {
    // 1. Execute automated mock bridge connection
    await connectWithDemoAccount(page);

    // 2. Acceptance criteria: Successful dashboard entry test
    await expect(page.getByRole("heading", { name: "Select Your Role" })).toBeVisible();

    // Verify HUD elements rendered on dashboard
    await expect(page.getByText(/Stellar Testnet/i)).toBeVisible();
    await expect(page.getByText(/XLM/i).first()).toBeVisible();

    // Verify all primary persona options exist on the dashboard
    await expect(page.getByRole("heading", { name: "Advertiser", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Affiliate", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Auditor", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Admin", exact: true })).toBeVisible();

    // 3. Disconnect cleanly from dashboard returns to Landing view
    await page.getByRole("button", { name: "Disconnect" }).first().click();
    await expect(visible(page.getByRole("button", { name: "Connect Wallet" }))).toBeVisible();
  });

  test("admin emergency kill-switch route access via dashboard role selection", async ({
    page,
  }) => {
    await connectWithDemoAccount(page);
    await expect(page.getByRole("heading", { name: "Select Your Role" })).toBeVisible();

    // Click Admin role card
    await page.getByRole("heading", { name: "Admin", exact: true }).click();
    await page.getByRole("button", { name: "Sign & Assume Role" }).click();

    // Verify Admin Command Center loads
    await expect(
      page.getByRole("heading", { name: "Platform Admin Command Center" }),
    ).toBeVisible();
    await expect(page.getByText("ADMIN ONLY")).toBeVisible();
    await expect(page.getByText(/Protocol Normal Operations/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /Emergency Global Kill-Switch/i })).toBeVisible();
  });
});
