import { test, expect, type Page } from '@playwright/test';
import { promises as fs } from 'node:fs';
import path from 'node:path';

/**
 * Multi-resolution visual regression tests.
 *
 * The same spec is executed once per Playwright project (`mobile` @ 375px and
 * `desktop` @1440px). Snapshots are stored per-project so each resolution
 * has its own baseline and its own diff output.
 */

const ROUTES: Array<{ name: string; path: string }> = [
  { name: 'home', path: '/' },
  { name: 'deals', path: '/deals' },
  { name: 'dashboard', path: '/dashboard' },
];

const DIFF_ROOT = path.resolve(process.cwd(), 'test-results/visual-diff');

async function waitForStableView(page: Page): Promise<void> {
  // Wait for the DOM to settle and for any fonts to finish loading.
  await page.waitForLoadState('networkidle');
  await page.evaluate(() => document.fonts.ready);
  // Disable animations/transitions so snapshots are deterministic.
  await page.addStyleTag({ content: `*, *::before, *::after { animation: none !important; transition: none !important; }` });
}

async function captureDiffArtifact(
  page: Page,
  projectName: string,
  routeName: string,
): Promise<void> {
  const dirForProject = path.join(DIFF_ROOT, projectName);
  await fs.mkdir(dirForProject, { recursive: true });
  const file = path.join(dirForProject, `${routeName}-actual.png`);
  await page.screenshot({ path: file, fullPage: true });
}

for (const route of ROUTES) {
  test.describe(`${route.name} (${route.path})`, () => {
    test('renders without visual regressions', async (
      { page },
      testInfo,
    ) => {
      const projectName = testInfo.project.name;
      const response = await page.goto(route.path, { waitUntil: 'domcontentloaded' });
      // Allow either 200x or a soft redirect to a client-routed page.
      expect(response?.status() ?? 200).toBeLessThan(400);

      await waitForStableView(page);

      try {
        await expect(page).toHaveScreenshot(`${route.name}.png`, {
          fullPage: true,
        });
      } catch (err) {
        // Playwright already writes the expected/actual/diff triplet to the
        // configured outputDir. We additionally stash a full-page capture
        // under a stable path so CI artifacts are easy to collect.
        await captureDiffArtifact(page, projectName, route.name);
        throw err;
      }
    });
  });
}
