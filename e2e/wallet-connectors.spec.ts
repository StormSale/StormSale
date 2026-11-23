import { expect, test } from "@playwright/test";
import { assumeRole, connectWithDemoAccount, mockBackend, visible } from "../tests/e2e/helpers";

test.describe("E2E Automated Smoke Tests: Wallet Connectors & Core Flows", () => {
  test.beforeEach(async ({ page }) => {
    await mockBackend(page);
  });

  test("wallet modal opens and displays all supported connectors", async ({ page }) => {
    await page.goto("/");
    await visible(page.getByRole("button", { name: /Connect Wallet/i })).click();
    await expect(page.getByRole("heading", { name: "Connect Stellar Wallet" })).toBeVisible();

    // Verify all wallet connectors are listed and visible
    await expect(page.getByText("Freighter", { exact: true })).toBeVisible();
    await expect(page.getByText("Albedo", { exact: true })).toBeVisible();
    await expect(page.getByText("xBull Wallet", { exact: true })).toBeVisible();
    await expect(page.getByText("1-Tap Demo Account", { exact: true })).toBeVisible();
  });

  test("demo account connects and navigates to role selection", async ({ page }) => {
    await connectWithDemoAccount(page);

    await expect(page.getByRole("heading", { name: "Select Your Role" })).toBeVisible();
    await expect(
      page.getByRole("button", { name: /Account menu for GASTOR\.\.\.7777/i }),
    ).toBeVisible();
  });

  test("campaign view is accessible from advertiser dashboard", async ({ page }) => {
    await connectWithDemoAccount(page);
    await assumeRole(page, "Advertiser");
    await expect(page.getByRole("heading", { name: "Advertiser Command Center" })).toBeVisible();

    // Open and verify Create Campaign form view
    const createBtn = visible(page.getByRole("button", { name: "Create Campaign" }));
    await expect(createBtn).toBeVisible();
    await createBtn.click();
    await expect(page.getByRole("heading", { name: /Create/i }).first()).toBeVisible();

    // Verify campaigns navigation
    const myCampaignsBtn = visible(page.getByRole("button", { name: "My Campaigns" }));
    await expect(myCampaignsBtn).toBeVisible();
    await myCampaignsBtn.click();
    await expect(
      page.getByRole("heading", { name: "My Campaigns & Escrow Monitor" }),
    ).toBeVisible();
  });

  test("affiliate referral link can be generated and copied", async ({
    page,
    context,
    browserName,
  }) => {
    if (browserName === "chromium") {
      await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    }

    await connectWithDemoAccount(page);
    await assumeRole(page, "Affiliate");

    // In Affiliate Overview, fill in campaign identifier and generate encrypted link
    const campaignInput = page.getByLabel("Campaign ID");
    await expect(campaignInput).toBeVisible();
    await campaignInput.fill("spring-launch");

    const generateBtn = page.getByRole("button", { name: /generate link & qr code/i });
    await expect(generateBtn).toBeVisible();
    await generateBtn.click();

    // Assert that the share link input is rendered with the encrypted payload
    const shareLinkInput = page.locator("#share-link");
    await expect(shareLinkInput).toBeVisible();
    await expect(shareLinkInput).toHaveValue(/ref=v1\./);

    // Click the copy affiliate link button
    const copyBtn = page.getByRole("button", { name: "Copy affiliate link" });
    await expect(copyBtn).toBeVisible();
    await copyBtn.click();

    // Assert copy confirmation feedback
    const statusNotice = page.getByText(
      /Link copied to clipboard|Clipboard access is unavailable/i,
    );
    await expect(statusNotice).toBeVisible();
    if (browserName === "chromium") {
      await expect(statusNotice).toHaveText(/Link copied to clipboard/i);
      const clipboardText = await page.evaluate(() => navigator.clipboard.readText());
      const expectedLink = await shareLinkInput.inputValue();
      expect(clipboardText).toBe(expectedLink);
    } else {
      await expect(statusNotice).toHaveText(
        /Link copied to clipboard|Clipboard access is unavailable/i,
      );
    }
  });
});
