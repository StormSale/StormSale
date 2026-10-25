import { expect, test } from "@playwright/test";
import { assumeRole, connectWithDemoAccount, mockBackend, visible } from "./helpers";

const nav = (page: import("@playwright/test").Page, label: string) =>
  visible(page.getByRole("button", { name: label }));

test.describe("Journey: role selection and dashboards", () => {
  test.beforeEach(async ({ page }) => {
    await mockBackend(page);
    await connectWithDemoAccount(page);
  });

  test("role card asks for consent before assuming the role and can be cancelled", async ({
    page,
  }) => {
    await page.getByRole("heading", { name: "Advertiser", exact: true }).click();
    await expect(page.getByText(/agree to deploy smart contracts/)).toBeVisible();

    await page.getByRole("button", { name: "Cancel" }).click();
    await expect(page.getByText(/agree to deploy smart contracts/)).toBeHidden();
    await expect(page.getByRole("heading", { name: "Select Your Role" })).toBeVisible();
  });

  test("advertiser opens the campaign form and returns to the role picker", async ({ page }) => {
    await assumeRole(page, "Advertiser");

    await expect(nav(page, "Create Campaign")).toBeVisible();
    await nav(page, "Create Campaign").click();
    await expect(page.getByRole("heading", { name: /Create/ }).first()).toBeVisible();

    await nav(page, "My Campaigns").click();
    await nav(page, "Log Encrypted Sale").click();
    await expect(nav(page, "Grant Audit Access")).toBeVisible();

    await visible(page.getByRole("button", { name: "Role Selector" })).click();
    await expect(page.getByRole("heading", { name: "Select Your Role" })).toBeVisible();
  });

  test("affiliate browses join, sales and payout screens", async ({ page }) => {
    await assumeRole(page, "Affiliate");

    await expect(nav(page, "Join Campaign")).toBeVisible();
    await nav(page, "Join Campaign").click();
    await expect(page.getByRole("heading", { name: /Join/ }).first()).toBeVisible();

    await nav(page, "My Sales & Commissions").click();
    await nav(page, "Claim Payouts").click();
    await expect(nav(page, "Dashboard Overview")).toBeVisible();
  });

  test("auditor walks through verify, history and compliance tabs", async ({ page }) => {
    await assumeRole(page, "Auditor");

    await expect(nav(page, "Verify Access")).toBeVisible();
    await nav(page, "Verify Access").click();
    await nav(page, "Audit History").click();
    await expect(page.getByRole("heading", { name: /History/i }).first()).toBeVisible();

    await nav(page, "Compliance Report").click();
    await expect(page.getByRole("heading", { name: /Compliance/i }).first()).toBeVisible();
  });
});
