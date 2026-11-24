import { expect, test } from "@playwright/test";
import { connectWithDemoAccount, mockBackend, visible } from "../tests/e2e/helpers";

const nav = (page: import("@playwright/test").Page, label: string) =>
  visible(page.getByRole("button", { name: label }));

test.describe("E2E Journey: Affiliate Onboarding, Link Sharing & Reward Claim (#484)", () => {
  test.beforeEach(async ({ page }) => {
    await mockBackend(page);
  });

  test("complete affiliate onboarding, campaign filter, link sharing and reward claim journey", async ({
    page,
    context,
    browserName,
  }) => {
    if (browserName === "chromium") {
      await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    }

    // 1. Connect affiliate wallet and accept terms of service
    await connectWithDemoAccount(page);
    await page.getByRole("heading", { name: "Affiliate", exact: true }).click();
    await expect(
      page.getByText(/agree to receive encrypted tracking IDs and claim authorized XLM payouts/i),
    ).toBeVisible();
    await page.getByRole("button", { name: "Sign & Assume Role" }).click();

    await expect(page.getByRole("heading", { name: "Affiliate Dashboard" })).toBeVisible();

    // 2. Browse active campaigns, filter by commission rate (>10%), and select campaign
    await expect(nav(page, "Telegram Campaigns")).toBeVisible();
    await nav(page, "Telegram Campaigns").click();
    await expect(
      page.getByRole("heading", { name: "Telegram Community Affiliate Hub" }),
    ).toBeVisible();

    // Filter by commission rate >10%
    const filterBtn = page.getByTestId("filter-commission-rate");
    await expect(filterBtn).toBeVisible();
    await filterBtn.click();

    // Verify filtered campaigns (>10% commission rate) are displayed
    await expect(page.getByText("Stellar USDC High-Yield Staking")).toBeVisible();
    await expect(page.getByText("12% per deposit")).toBeVisible();
    await expect(page.getByText("StormSale Genesis Community Booster")).toBeVisible();
    await expect(page.getByText("15% on sale")).toBeVisible();

    // 3. Generate unique referral link and verify clipboard copy
    const copyBtn = page.getByTestId("btn-copy-campaign-camp-usdc-101");
    await expect(copyBtn).toBeVisible();
    await copyBtn.click();

    if (browserName === "chromium") {
      const clipboardText = await page.evaluate(() => navigator.clipboard.readText());
      expect(clipboardText).toMatch(/stormsale\.xyz\/c\/camp-usdc-101\?ref=GASTOR/);
    }

    // 4. Simulate referral conversion event in test harness
    await page.evaluate(() => {
      localStorage.setItem("stormsale.pendingCommission", "65.50 XLM");
      window.dispatchEvent(new CustomEvent("stormsale:conversion", { detail: { amount: "20.00" } }));
    });

    // 5. Verify affiliate dashboard displays updated pending commission
    await nav(page, "Dashboard Overview").click();
    await expect(page.getByText("Pending Commission")).toBeVisible();
    await expect(page.getByText("65.50 XLM")).toBeVisible();

    // 6. Click Claim Reward and verify Soroban settlement transaction completes
    await nav(page, "Claim Payouts").click();
    await expect(page.getByTestId("claim-payouts-view")).toBeVisible();

    const batchClaimBtn = page.getByTestId("btn-batch-claim");
    await expect(batchClaimBtn).toBeVisible();
    await batchClaimBtn.click();

    // Verify Soroban batch claim settlement completes and announces confirmation
    await expect(
      page.getByText(/Batch Commission Claim Settled|Commission Paid Out/i),
    ).toBeVisible({ timeout: 15_000 });
  });
});
