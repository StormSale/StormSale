import { expect, test } from "@playwright/test";
import { mockBackend } from "../tests/e2e/helpers";

test.describe("E2E Marketplace Search, Filter and Pagination Journey (#493)", () => {
  test.beforeEach(async ({ page }) => {
    await mockBackend(page);
  });

  test("performs debounced keyword search, category filtering, URL query syncing and pagination", async ({ page }) => {
    await page.goto("/marketplace");
    await expect(page.getByTestId("marketplace-explorer")).toBeVisible();

    // 1. Category chip selection: filter by DeFi
    const defiChip = page.getByTestId("category-chip-defi");
    await expect(defiChip).toBeVisible();
    await defiChip.click();

    // 2. Verify URL query parameters reflect active filters (?cat=defi&sort=comm_desc)
    await expect(page).toHaveURL(/cat=defi/);
    await expect(page).toHaveURL(/sort=comm_desc/);

    // Verify campaigns list displays DeFi campaigns
    const campaignsList = page.getByTestId("marketplace-campaigns-list");
    await expect(campaignsList).toContainText("Soroban Liquid Staking Pool");

    // 3. Debounced search query
    const searchInput = page.getByTestId("marketplace-search-input");
    await searchInput.fill("AMM Liquidity");

    // Wait for debounce update
    await expect(campaignsList).toContainText("DeFi AMM Liquidity Incentives");
    await expect(page).toHaveURL(/q=AMM\+Liquidity|q=AMM%20Liquidity/);

    // Clear search to test pagination
    await searchInput.clear();
    const allChip = page.getByTestId("category-chip-all");
    await allChip.click();

    // 4. Test pagination controls
    const pagination = page.getByTestId("marketplace-pagination");
    await expect(pagination).toBeVisible();

    const nextBtn = page.getByTestId("pagination-next");
    const prevBtn = page.getByTestId("pagination-prev");

    // Direct page number selection
    const page2Btn = page.getByTestId("pagination-page-2");
    await expect(page2Btn).toBeVisible();
    await page2Btn.click();

    // Next / Previous controls
    await expect(prevBtn).toBeEnabled();
    await prevBtn.click();
    await expect(page.getByTestId("pagination-page-1")).toBeVisible();
  });
});
