import { expect, test } from "@playwright/test";
import { assumeRole, connectWithDemoAccount, mockBackend, visible } from "../tests/e2e/helpers";

const nav = (page: import("@playwright/test").Page, label: string) =>
  visible(page.getByRole("button", { name: label }));

test.describe("E2E Journey: Affiliate Dispute Resolution & Mediation (#490)", () => {
  test.beforeEach(async ({ page }) => {
    await mockBackend(page);
  });

  test("affiliate submits dispute, advertiser views 48h SLA badge, accepts dispute and resolves escrow", async ({
    page,
  }) => {
    test.setTimeout(120_000);

    // 1. Connect wallet and assume Affiliate role
    await connectWithDemoAccount(page);
    await assumeRole(page, "Affiliate");
    await expect(page.getByRole("heading", { name: "Affiliate Dashboard" })).toBeVisible();

    // 2. Affiliate navigates to Disputes & Mediation and submits a dispute ticket
    await expect(nav(page, "Disputes & Mediation")).toBeVisible();
    await nav(page, "Disputes & Mediation").click();
    await expect(
      page.getByRole("heading", { name: /Affiliate Dispute & Mediation Hub/i }),
    ).toBeVisible();

    const sampleTxHash = "7a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b";
    await page.getByTestId("input-dispute-txhash").fill(sampleTxHash);
    await page.getByTestId("select-dispute-reason").selectOption("unpaid_commission");
    await page.getByTestId("input-dispute-amount").fill("150 XLM");
    await page
      .getByTestId("textarea-dispute-description")
      .fill("Commission for qualified sale was not disbursed after clearing period completion.");

    await page.getByTestId("btn-submit-dispute").click();
    await expect(page.getByText(/Dispute ticket submitted successfully/i)).toBeVisible();

    // Verify dispute appears in affiliate ticket list with OPEN status
    await expect(page.getByText(sampleTxHash)).toBeVisible();
    await expect(page.getByText("OPEN").first()).toBeVisible();

    // 3. Switch role to Advertiser
    await visible(page.getByRole("button", { name: "Role Selector" })).click();
    await expect(page.getByRole("heading", { name: "Select Your Role" })).toBeVisible();

    await assumeRole(page, "Advertiser");
    await expect(page.getByRole("heading", { name: "Advertiser Command Center" })).toBeVisible();

    // 4. Advertiser dashboard displays dispute badge with 48h resolution SLA counter
    const disputeBadge = page.getByTestId("dispute-badge");
    await expect(disputeBadge).toBeVisible();
    await expect(disputeBadge).toContainText(/1 Active Dispute|Dispute/i);

    const slaCounter = page.getByTestId("dispute-sla-counter");
    await expect(slaCounter).toBeVisible();
    await expect(slaCounter).toContainText(/48h|SLA/i);

    await expect(page.getByText(sampleTxHash)).toBeVisible();

    // 5. Advertiser accepts dispute and triggers release of escrowed commission
    const acceptBtn = page.getByTestId("btn-accept-dispute");
    await expect(acceptBtn).toBeVisible();
    await acceptBtn.click();

    // 6. Verify dispute status updates to RESOLVED on Advertiser dashboard
    await expect(page.getByText(/Escrow Released/i).first()).toBeVisible();
    await expect(page.getByText("RESOLVED").first()).toBeVisible();

    // 7. Switch back to Affiliate and verify dispute status updates to RESOLVED
    await visible(page.getByRole("button", { name: "Role Selector" })).click();
    await expect(page.getByRole("heading", { name: "Select Your Role" })).toBeVisible();

    await assumeRole(page, "Affiliate");

    // 8. Verify dispute status updates to RESOLVED on Affiliate dashboard
    const isDisputesHub = await page
      .getByRole("heading", { name: /Affiliate Dispute & Mediation Hub/i })
      .isVisible();
    if (!isDisputesHub) {
      await nav(page, "Disputes & Mediation").click();
    }
    await expect(page.getByText(sampleTxHash)).toBeVisible();
    await expect(page.getByText("RESOLVED").first()).toBeVisible();
    await expect(page.getByText(/Escrow Released & Resolved/i)).toBeVisible();
  });
});
