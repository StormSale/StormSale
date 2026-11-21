import { expect, test } from "@playwright/test";
import { mockBackend } from "../tests/e2e/helpers";

test.describe("E2E Auditor Cryptographic Evidence Pack Download & Verification Journey (#485)", () => {
  test.beforeEach(async ({ page }) => {
    await mockBackend(page);
  });

  test("public auditor access, filtering, evidence pack zip download and verification", async ({ page }) => {
    // Navigate directly to public read-only auditor compliance portal without wallet connection
    await page.goto("/compliance/auditor");
    await expect(page.getByRole("heading", { name: "Auditor Compliance Portal" })).toBeVisible();
    await expect(page.getByText("Public Read-Only")).toBeVisible();

    // Filter audit records by date range and campaign ID
    const campaignFilter = page.locator("#audit-campaign-id");
    await expect(campaignFilter).toBeVisible();
    await campaignFilter.fill("101");

    const startDate = page.locator("#audit-start-date");
    await startDate.fill("2026-01-01");

    const endDate = page.locator("#audit-end-date");
    await endDate.fill("2026-12-31");

    // Verify table displays filtered records
    await expect(page.getByTestId("audit-records-table")).toBeVisible();
    await expect(page.getByText("#101 (Summer Promo 2026)").first()).toBeVisible();

    // Click Download Evidence Pack and verify zip archive generation
    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: /Download Evidence Pack/i }).click();
    const download = await downloadPromise;

    expect(download.suggestedFilename()).toContain("evidence-pack");
    expect(download.suggestedFilename()).toContain(".zip");

    // Run client verification script confirming package authenticity
    const verifyBtn = page.getByTestId("verify-authenticity-btn");
    await expect(verifyBtn).toBeVisible();
    await verifyBtn.click();

    await expect(page.getByTestId("verification-status")).toContainText("VERIFIED AUTHENTIC");
  });
});
