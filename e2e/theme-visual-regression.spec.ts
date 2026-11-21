import { expect, test } from "@playwright/test";
import { connectWithDemoAccount, mockBackend } from "../tests/e2e/helpers";

test.describe("E2E Dark/Light Theme Switching and Regression (#491)", () => {
  test.beforeEach(async ({ page }) => {
    await mockBackend(page);
  });

  test("toggles theme and respects system preference and persistence across pages", async ({ page }) => {
    // 1. Test Home page
    await page.goto("/");
    const themeBtn = page.getByTestId("theme-toggle").first();
    await expect(themeBtn).toBeVisible();

    // Initial state check
    const isInitiallyDark = await page.evaluate(() =>
      document.documentElement.classList.contains("dark"),
    );

    // Toggle theme via UI switch
    await themeBtn.click();
    const isDarkAfterToggle = await page.evaluate(() =>
      document.documentElement.classList.contains("dark"),
    );
    expect(isDarkAfterToggle).toBe(!isInitiallyDark);

    // Capture visual baseline
    await page.screenshot({ path: "test-results/home-theme.png" });

    // 2. Test Marketplace page theme
    await page.goto("/marketplace");
    await expect(page.getByTestId("marketplace-explorer")).toBeVisible();
    const marketplaceDark = await page.evaluate(() =>
      document.documentElement.classList.contains("dark"),
    );
    expect(marketplaceDark).toBe(isDarkAfterToggle);
    await page.screenshot({ path: "test-results/marketplace-theme.png" });

    // 3. Test Dashboard page theme
    await page.goto("/");
    await connectWithDemoAccount(page);
    await expect(page.locator("body")).toBeVisible();
    await page.screenshot({ path: "test-results/dashboard-theme.png" });
  });

  test("ensures system preference prefers-color-scheme is respected on first visit", async ({ page }) => {
    // Emulate dark mode system preference
    await page.emulateMedia({ colorScheme: "dark" });
    await page.goto("/");
    const isDark = await page.evaluate(() =>
      document.documentElement.classList.contains("dark"),
    );
    expect(isDark).toBe(true);

    // Emulate light mode system preference on clean session
    await page.evaluate(() => {
      localStorage.removeItem("stormsale.theme.dark");
      localStorage.removeItem("darkMode");
    });
    await page.emulateMedia({ colorScheme: "light" });
    await page.reload();
    const isLight = await page.evaluate(() =>
      document.documentElement.classList.contains("dark"),
    );
    expect(isLight).toBe(false);
  });
});
