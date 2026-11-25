import { expect, test } from "@playwright/test";
import { assumeRole, connectWithDemoAccount, mockBackend, visible } from "../tests/e2e/helpers";

test.describe("E2E Advertiser Campaign Creation Journey (#483)", () => {
  test.beforeEach(async ({ page }) => {
    await mockBackend(page);
  });

  test("completes 5-step campaign creation wizard and generates shareable link", async ({
    page,
  }) => {
    await connectWithDemoAccount(page);
    await assumeRole(page, "Advertiser");

    // Open Campaign Creation Wizard
    const createBtn = visible(page.getByRole("button", { name: "Create Campaign" }));
    await expect(createBtn).toBeVisible();
    await createBtn.click();

    // Step 1: Input details
    await expect(page.getByRole("heading", { name: /Create Campaign: Step 1/i })).toBeVisible();
    await page.locator("#wizard-title").fill("Summer Growth Campaign 2026");
    await page
      .locator("#wizard-description")
      .fill("High-converting seasonal promotion for premium Web3 services.");
    await page.locator("#wizard-banner-image").fill("https://example.com/banner.png");
    await page.locator("#wizard-external-url").fill("https://stormsale.io/promo");

    await page.getByRole("button", { name: /Next: Budget & Allocation/i }).click();

    // Step 2: Configure budget & commission
    await expect(
      page.getByText("Step 2: Budget & Referral Rewards", { exact: false }),
    ).toBeVisible();
    await page.locator("#wizard-budget").fill("1000");
    await page.locator("#wizard-commission").fill("10");
    await page.locator("#wizard-referral-depth").selectOption("2");

    await page.getByRole("button", { name: /Next: Escrow Funding/i }).click();

    // Step 3: Mock wallet signature and escrow deposit
    await expect(
      page.getByText("Step 3: Escrow Funding & Signature", { exact: false }),
    ).toBeVisible();
    const signBtn = page.getByRole("button", { name: /Sign & Confirm Escrow Deposit/i });
    await expect(signBtn).toBeVisible();
    await signBtn.click();

    // Verify confirmation and status
    await expect(page.getByText("Escrow Deposit Confirmed", { exact: false })).toBeVisible();
    await page.getByRole("button", { name: /Next: Review Campaign/i }).click();

    // Step 4: Verify campaign appears with status ACTIVE
    await expect(page.getByTestId("campaign-status-badge")).toHaveText("ACTIVE");
    await page.getByRole("button", { name: /Next: Generate Affiliate Link/i }).click();

    // Step 5: Verify shareable affiliate campaign link is generated and functional
    await expect(
      page.getByText("Step 5: Shareable Affiliate Campaign Link", { exact: false }),
    ).toBeVisible();
    const shareInput = page.getByTestId("shareable-affiliate-link");
    await expect(shareInput).toBeVisible();
    await expect(shareInput).toHaveValue(/\/c\/\d+\?ref=/);
  });
});
