/**
 * E2E — Affiliate Claim Lifecycle (#93)
 *
 * Tests the full path for earning and claiming commission:
 *   1. Claim-payouts view loads and shows matured campaigns.
 *   2. Batch claim increases the wallet XLM balance and displays settlement receipt.
 *   3. Single-campaign claim resolves successfully.
 *   4. Low-gas (tx_insufficient_fee) error path surfaces an error notification.
 *   5. A frozen affiliate cannot initiate a claim (banner visible and button disabled).
 *
 * Visual proof screenshot is captured after the batch-claim test and written to
 * tests/e2e/__proof__/claim-lifecycle.png for inclusion in the PR.
 */

import { expect, test } from "@playwright/test";
import { assumeRole, connectWithDemoAccount, mockBackend, visible } from "./helpers";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Click the visible copy of a nav button (desktop sidebar duplicates it). */
const nav = (page: import("@playwright/test").Page, label: string) =>
  visible(page.getByRole("button", { name: label }));

/**
 * Full setup: mock backend → connect demo wallet → assume Affiliate role →
 * navigate to Claim Payouts → assert the view is ready.
 */
async function setupAffiliateClaims(page: import("@playwright/test").Page) {
  await mockBackend(page);
  await connectWithDemoAccount(page);
  await assumeRole(page, "Affiliate");
  await nav(page, "Claim Payouts").click();
  await expect(page.getByTestId("claim-payouts-view")).toBeVisible({ timeout: 15_000 });
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

test.describe("Affiliate Claim Lifecycle E2E (#93)", () => {
  // -------------------------------------------------------------------------
  // Test 1 — View loads with all three matured campaigns
  // -------------------------------------------------------------------------
  test("claim-payouts view loads and displays matured campaigns", async ({ page }) => {
    await setupAffiliateClaims(page);

    // The batch-claim button must be present (proves matured campaigns exist)
    await expect(page.getByTestId("btn-batch-claim")).toBeVisible({ timeout: 10_000 });

    // All three mock campaigns should have individual claim buttons
    for (const id of [101, 204, 309]) {
      await expect(page.getByTestId(`btn-claim-single-${id}`)).toBeVisible({ timeout: 10_000 });
    }
  });

  // -------------------------------------------------------------------------
  // Test 2 — Batch claim increases wallet XLM balance
  //          Mock initial balance: 10 000.00 XLM
  //          Mock campaigns total: 155.75 XLM  → expected: 10 155.75 XLM
  // -------------------------------------------------------------------------
  test("batch claim increases wallet XLM balance", async ({ page }) => {
    await setupAffiliateClaims(page);

    // ---- Read initial balance from UserMenu ----
    const accountMenuBtn = visible(page.getByRole("button", { name: /account menu/i }));
    await accountMenuBtn.click();
    const balanceLocator = page.getByTestId("user-xlm-balance");
    await expect(balanceLocator).toBeVisible({ timeout: 10_000 });
    const initialText = (await balanceLocator.textContent()) ?? "0 XLM";
    const initialBalance = parseFloat(initialText.replace(/[^0-9.]/g, ""));

    // Close the menu before interacting with the main view
    await page.keyboard.press("Escape");
    await expect(balanceLocator).toBeHidden({ timeout: 5_000 });

    // ---- Trigger batch claim ----
    await page.getByTestId("btn-batch-claim").click();

    // The settlement receipt modal must appear (shows "Batch Payout Complete!" and "+155.75 XLM")
    await expect(page.getByText(/Batch Payout Complete!/i)).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(/Total Commission Received/i)).toBeVisible();

    // ---- Take visual proof screenshot with receipt modal showing full proof ----
    await page.screenshot({ path: "tests/e2e/__proof__/claim-lifecycle.png", fullPage: false });

    // Dismiss receipt modal
    await page.getByRole("button", { name: "Done" }).click();
    await expect(page.getByText(/Batch Payout Complete!/i)).toBeHidden({ timeout: 5_000 });

    // ---- Verify balance increased ----
    await accountMenuBtn.click();
    await expect(balanceLocator).toBeVisible({ timeout: 10_000 });
    const updatedText = (await balanceLocator.textContent()) ?? "0 XLM";
    const updatedBalance = parseFloat(updatedText.replace(/[^0-9.]/g, ""));

    expect(updatedBalance, "XLM balance must increase after batch claim").toBeGreaterThan(
      initialBalance,
    );

    // Delta should match the total of the matured mock campaigns (155.75 XLM)
    expect(updatedBalance - initialBalance).toBeGreaterThanOrEqual(155.0);
  });

  // -------------------------------------------------------------------------
  // Test 3 — Single-campaign claim resolves successfully
  // -------------------------------------------------------------------------
  test("single campaign claim resolves successfully", async ({ page }) => {
    await setupAffiliateClaims(page);

    // Claim campaign 101 individually
    await page.getByTestId("btn-claim-single-101").click();

    // A success notification should appear
    const successToast = page
      .getByTestId("notification-toast")
      .filter({ hasText: /success|settled|claimed/i })
      .first();
    await expect(successToast).toBeVisible({ timeout: 15_000 });

    // The claimed campaign row should update to claimed
    const claimBtn = page.getByTestId("btn-claim-single-101");
    const isStillVisible = await claimBtn.isVisible().catch(() => false);
    if (isStillVisible) {
      await expect(claimBtn).toBeDisabled();
    }
  });

  // -------------------------------------------------------------------------
  // Test 4 — Low-gas error path: tx_insufficient_fee
  // -------------------------------------------------------------------------
  test("low-gas error shows error notification with tx_insufficient_fee", async ({ page }) => {
    await setupAffiliateClaims(page);

    // Inject the low-gas flag into the browser context BEFORE triggering a claim
    await page.evaluate(() => {
      (window as unknown as Record<string, unknown>).__SIMULATE_LOW_GAS__ = true;
    });

    // Trigger batch claim — it must fail with an insufficient-fee error
    await page.getByTestId("btn-batch-claim").click();

    // An error notification must appear
    const errorToast = page
      .getByTestId("notification-toast")
      .filter({ hasText: /tx_insufficient_fee|insufficient.*fee|insufficient.*gas|failed/i })
      .first();
    await expect(errorToast).toBeVisible({ timeout: 15_000 });

    // The balance must NOT have changed (error path preserves state)
    const accountMenuBtn = visible(page.getByRole("button", { name: /account menu/i }));
    await accountMenuBtn.click();
    const balanceText = (await page.getByTestId("user-xlm-balance").textContent()) ?? "0 XLM";
    const balanceAfterError = parseFloat(balanceText.replace(/[^0-9.]/g, ""));
    // Initial mock balance is 10 000.00; it must not have increased
    expect(balanceAfterError).toBeLessThanOrEqual(10_000.0);
  });

  // -------------------------------------------------------------------------
  // Test 5 — Frozen affiliate cannot claim
  // -------------------------------------------------------------------------
  test("frozen affiliate sees frozen banner and claim buttons are disabled", async ({ page }) => {
    await mockBackend(page);

    // Intercept fraud pause API status check to return isPaused: true
    await page.route("**/api/affiliate/pause-status**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ isPaused: true }),
      });
    });

    // Also seed localStorage with paused state
    await page.addInitScript(() => {
      localStorage.setItem(
        "stormsale.fraud.paused_affiliates",
        JSON.stringify({
          GASTORMSALE7TESTNET7AFFILIATE7MERCHANT7ESCROW7XLM77777: {
            affiliateAddress: "GASTORMSALE7TESTNET7AFFILIATE7MERCHANT7ESCROW7XLM77777",
            reason: "Conversion velocity anomaly & fraud risk review",
            pausedAt: new Date().toISOString(),
            pausedBy: "Compliance Admin",
          },
        }),
      );
    });

    await connectWithDemoAccount(page);
    await assumeRole(page, "Affiliate");
    await nav(page, "Claim Payouts").click();
    await expect(page.getByTestId("claim-payouts-view")).toBeVisible({ timeout: 15_000 });

    // Frozen banner must be visible
    const frozenBanner = page.getByTestId("banner-affiliate-frozen");
    await expect(frozenBanner).toBeVisible({ timeout: 10_000 });

    // Batch claim button must be disabled
    const batchClaimBtn = page.getByTestId("btn-batch-claim");
    await expect(batchClaimBtn).toBeDisabled();
  });
});
