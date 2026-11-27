import { expect, test } from "@playwright/test";
import { assumeRole, connectWithDemoAccount, mockBackend, visible } from "../tests/e2e/helpers";

test.describe("E2E Session Restore and State Recovery (#487)", () => {
  test.beforeEach(async ({ page }) => {
    await mockBackend(page);
  });

  test("persists multi-step form at step 3, wallet connection, and syncs across tabs", async ({ page, context }) => {
    // 1. Log in with wallet
    await connectWithDemoAccount(page);
    await assumeRole(page, "Advertiser");

    // Open Create Campaign
    const createBtn = visible(page.getByRole("button", { name: "Create Campaign" }));
    await expect(createBtn).toBeVisible();
    await createBtn.click();

    // Fill Step 1 details
    await expect(page.getByRole("heading", { name: /Create Campaign: Step 1/i })).toBeVisible();
    await page.locator("#wizard-title").fill("Restored Campaign 2026");
    await page.locator("#wizard-description").fill("Persistent campaign description across session reloads.");
    await page.getByRole("button", { name: /Next: Budget & Rules/i }).click();

    // Fill Step 2 details and advance to Step 3
    await expect(page.getByText("Step 2: Budget & Rewards", { exact: false })).toBeVisible();
    await page.locator("#wizard-budget").fill("4500");
    await page.locator("#wizard-commission-rate").fill("15");
    await page.getByRole("button", { name: /Next: Escrow Deposit/i }).click();

    // Verify reached Step 3
    await expect(page.getByTestId("wizard-step-3-card")).toBeVisible();
    await expect(page.getByText("Step 3: Soroban Escrow Funding", { exact: false })).toBeVisible();

    // 2. Trigger page reload
    await page.reload();

    // 3. Verify wallet remains connected without requiring re-approval
    await expect(page.getByRole("button", { name: "Connect Wallet" })).not.toBeVisible();

    // Verify user returns to Step 3 with pre-filled inputs intact
    await expect(page.getByTestId("wizard-step-3-card")).toBeVisible();
    await expect(page.getByText("Step 3: Soroban Escrow Funding", { exact: false })).toBeVisible();

    // Check pre-filled inputs when navigating back to step 1 and step 2
    await page.getByTestId("wizard-step-tab-1").click();
    await expect(page.locator("#wizard-title")).toHaveValue("Restored Campaign 2026");
    await expect(page.locator("#wizard-description")).toHaveValue("Persistent campaign description across session reloads.");

    await page.getByTestId("wizard-step-tab-2").click();
    await expect(page.locator("#wizard-budget")).toHaveValue("4500");
    await expect(page.locator("#wizard-commission-rate")).toHaveValue("15");

    // Return to step 3
    await page.getByTestId("wizard-step-tab-3").click();
    await expect(page.getByTestId("wizard-step-3-card")).toBeVisible();

    // 4. Test state synchronization across two simultaneously open browser tabs
    const page2 = await context.newPage();
    await mockBackend(page2);
    await page2.goto("/");

    // Second tab should recognize connected session
    await expect(page2.getByRole("button", { name: "Connect Wallet" })).not.toBeVisible();

    // Navigate to Advertiser on tab 2
    const createBtnTab2 = visible(page2.getByRole("button", { name: "Create Campaign" }));
    if (await createBtnTab2.isVisible()) {
      await createBtnTab2.click();
      await expect(page2.getByTestId("wizard-step-3-card")).toBeVisible();
    }

    await page2.close();
  });
});
