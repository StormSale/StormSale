import { expect, test } from "@playwright/test";
import { mockBackend } from "../tests/e2e/helpers";

test.describe("E2E Mobile Viewport Drawer Navigation Journey (#492)", () => {
  test.beforeEach(async ({ page }) => {
    await mockBackend(page);
    // Simulate mobile viewport 375x812 (iPhone 13 / SE)
    await page.setViewportSize({ width: 375, height: 812 });
  });

  test("desktop navbar collapses, drawer opens, overlay and escape key close drawer", async ({ page }) => {
    await page.goto("/");

    // 1. Verify desktop nav links are hidden and hamburger menu is visible
    const hamburgerBtn = page.getByRole("button", { name: "Toggle Menu" });
    await expect(hamburgerBtn).toBeVisible();

    const desktopNav = page.locator("nav.hidden.lg\\:flex");
    await expect(desktopNav).toBeHidden();

    // 2. Open drawer
    await hamburgerBtn.click();
    const drawer = page.getByTestId("mobile-navigation-drawer");
    await expect(drawer).toBeVisible();

    const overlay = page.getByTestId("mobile-drawer-overlay");
    await expect(overlay).toBeVisible();

    // 3. Verify no horizontal scrolling exists
    const hasHorizontalOverflow = await page.evaluate(() => {
      return document.documentElement.scrollWidth > window.innerWidth;
    });
    expect(hasHorizontalOverflow).toBe(false);

    // 4. Test closing drawer via overlay click
    await overlay.click({ force: true });
    await expect(drawer).not.toBeVisible();

    // 5. Test opening drawer again and closing via Escape key
    await hamburgerBtn.click();
    await expect(drawer).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(drawer).not.toBeVisible();
  });
});
