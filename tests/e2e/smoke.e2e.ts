import { test, expect } from "@playwright/test";

test.describe("App smoke", () => {
  test("loads the landing page", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/StormSale/);
    await expect(page.locator("#root")).not.toBeEmpty();
  });

  test("renders without uncaught page errors", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    expect(errors).toEqual([]);
  });
});
