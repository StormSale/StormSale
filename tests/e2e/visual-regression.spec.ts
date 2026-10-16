import { expect, test, type Page } from '@playwright/test';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
const __dirname = path.dirname(fileURLToPath(import.meta.url));

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { default as config, VISUAL_REGRESSION_DIR_NAME, VIEWPORTS, type ViewportName } from './visual-regression.config';

const ROUTES = [
  { name: 'home', path: '/' },
  { name: 'dashboard', path: '/dashboard' },
  { name: 'marketplace', path: '/marketplace' },
] as const;

const ARTIFACT_ROOT = path.resolve(__dirname, '../..', 'test-results', VISUAL_REGRESSION_DIR_NAME);
const DIFF_ROOT = path.join(ARTIFACT_ROOT, 'diffs');

const slugify = (value: string) => value.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase();

const snapshotPath = (viewport: ViewportName, routeName: string) =>
  path.join(__dirname, '__snapshots__', `${viewport}-${slugify(routeName)}.png`);

const diffPath = (viewport: ViewportName, routeName: string) =>
  path.join(DIFF_ROOT, `${viewport}-${slugify(routeName)}-diff.png`);

const metricPath = (viewport: ViewportName, routeName: string) =>
  path.join(DIFF_ROOT, `${viewport}-${slugify(routeName)}-metrics.json`);

const waitForStable = async (page: Page) => {
  await page.waitForLoadState('networkidle');
  await page.evaluate(async () => {
    if (document.fonts && document.fonts.ready) {
      await document.fonts.ready;
    }
  });
  await page.waitForTimeout(250);
};

const ensureDirs = () => {
  mkdirSync(path.join(__dirname, '__snapshots__'), { recursive: true });
  mkdirSync(DIFF_ROOT, { recursive: true });
};

const writeMetrics = (
  viewport: ViewportName,
  routeName: string,
  metrics: Record<string, number>,
) => {
  writeFileSync(metricPath(viewport, routeName), JSON.stringify(metrics, null, 2));
};

const collectMetrics = async (page: Page) => {
  return page.evaluate(() => {
    const documentEl = document.documentElement;
    const body = document.body;
    const overflowX = Math.max(
      documentEl.scrollWidth - documentEl.clientWidth,
      body.scrollWidth - body.clientWidth,
    );
    return {
      viewportWidth: window.innerWidth,
      documentWidth: documentEl.scrollWidth,
      overflowX,
      scrollHeight: documentEl.scrollHeight,
    };
  });
};

test.beforeAll(() => {
  ensureDirs();
});

for (const route of ROUTES) {
  test.describe(`${route.name} (${route.path})`, () => {
    for (const viewport of Object.keys(VIEWPORTS) as ViewportName[]) {
      test(`${viewport} visual regression`, async ({ page }, testInfo) => {
        await page.setViewportSize(VIEWPORTS[viewport]);
        await page.goto(route.path);
        await waitForStable(page);

        const metrics = await collectMetrics(page);
        writeMetrics(viewport, route.name, metrics);
        expect(metrics.overflowX, `${route.name} should not horizontally overflow at ${viewport}`).toBeLessThanOrEqual(1);

        await expect(page).toHaveScreenshot(snapshotPath(viewport, route.name));

        const snapshotFile = snapshotPath(viewport, route.name);
        if (existsSync(snapshotFile)) {
          testInfo.attach(`${viewport}-snapshot`, {
            path: snapshotFile,
            contentType: 'image/png',
          });
        }
        const diffFile = diffPath(viewport, route.name);
        if (existsSync(diffFile)) {
          testInfo.attach(`${viewport}-diff`, {
            path: diffFile,
            contentType: 'image/png',
          });
        }
        testInfo.attach(`${viewport}-metrics`, {
          body: JSON.stringify(metrics, null, 2),
          contentType: 'application/json',
        });
      });
    }
  });
}

test.describe('multi-resolution comparison', () => {
  test('generates cross-viewport diff report', async () => {
    const report = Object.keys(VIEWPORTS).map((viewport) => {
      const entries = ROUTES.map((route) => {
        const metricFile = metricPath(viewport as ViewportName, route.name);
        const snapshotFile = snapshotPath(viewport as ViewportName, route.name);
        return {
          route: route.name,
          path: route.path,
          snapshot: existsSync(snapshotFile) ? path.relative(ARTIFACT_ROOT, snapshotFile) : null,
          metrics: existsSync(metricFile) ? JSON.parse(readFileSync(metricFile, 'utf-8')) : null,
        };
      });
      return { viewport, width: VIEWPORTS[viewport as ViewportName].width, entries };
    });

    const reportFile = path.join(ARTIFACT_ROOT, 'multi-resolution-report.json');
    writeFileSync(reportFile, JSON.stringify({ generatedAt: new Date().toISOString(), report }, null, 2));

    expect(existsSync(reportFile)).toBeTruthy();
    const parsed = JSON.parse(readFileSync(reportFile, 'utf-8'));
    expect(parsed.report.length).toBe(Object.keys(VIEWPORTS).length);
  });

  test('cleans stale diff artifacts before run', async () => {
    if (existsSync(DIFF_ROOT)) {
      rmSync(DIFF_ROOT, { recursive: true, force: true });
    }
    mkdirSync(DIFF_ROOT, { recursive: true });
    expect(existsSync(DIFF_ROOT)).toBeTruthy();
  });
});

export default config;
