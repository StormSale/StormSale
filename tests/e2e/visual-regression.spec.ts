import { test, expect } from '@playwright/test';
import { VIEWPORTS, PAGES, threshold } from './visual-regression.config';

for (const page of PAGES) {
  for (const viewport of VIEWPORTS) {
    test.describe(`${page} - ${viewport.name}`, () => {
      test.use({
        viewport: { width: viewport.width, height: viewport.height },
      });

      test(`visual regression at ${viewport.width}px`, async ({ page }) => {
        await page.goto(page);
        await page.waitForLoad('networkidle');
        await expect(page).toHaveScreenshot({
          fullPage: true,
          maxDiffPixels: 0,
          threshold,
        });
      });
    });
  }
}
