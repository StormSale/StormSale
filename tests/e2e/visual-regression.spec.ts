import { test, expect, type Page } from '@playwright/test';
import { MOBILE_VIEWPORT, DESKTOP_VIEWPORT } from './visual-regression.config';

/**
 * Multi-Resolution Visual Regression Spec.
 *
 * The same spec is executed once per Playwright project (mobile-375 / desktop-1440).
 * Each snapshot is named after the current viewport width so diffs are generated per resolution.
 */

const ROUTES = [{ path: '/', name: 'home' }] as const;

async function stabilize(page: Page): Promise<void> {
  // Wait for the app root to mount and fonts to settle so snapshots are deterministic.
  await page.waitForLoadState('networkidle');
  await page.evaluate(() => document.fonts.ready);
  // Disable animations that could cause flakey diffs.
  await page.addStyleTag({ content: '* { animation: none !important; transition: none !important; }' });
}

test.describe('multi-resolution visual regression', () => {
  for (const route of ROUTES) {
    test(`${route.name} page matches snapshot at ${test.info().project.name}`, async ({ page }) => {
      const viewport = page.viewportSize();
      expect(viewport, 'viewport must be one of the two target resolutions').toBeTruthy();
      const width = viewport?.width;
      expect([MOBILE_VIEWPORT.width, DESKTOP_VIEWPORT.width]).toContain(width);

      await page.goto(route.path);
      await stabilize(page);

      // Full-page snapshot captures vertical overflow bugs at either resolution.
      await expect(page).toHaveSnapshot(`${route.name}-${width}-fullPage.png`, {
        fullPage: true,
        maxDiffPixels: 100,
        threshold: 0.2,
      });

      // Viewport-only snapshot catches above-the-fold layout breaks.
      await expect(page).toHaveSnapshot(`${route.name}-${width}-viewport.png`, {
        fullPage: false,
        maxDiffPixels: 100,
        threshold: 0.2,
      });
    });
  }
});
