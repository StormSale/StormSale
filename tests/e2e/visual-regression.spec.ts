import { test, expect, Page } from '@playwright/test';
import { fs, promises as fsPromises } from 'fs';
const path = require('path');

/**
 * Multi-Resolution Visual Regression Tests
 *
 * Compares the UI at Mobile (375px) vs Desktop (1440px) viewports and
 * generates automated pixel diff artifacts for any visual breaks.
 */

const VIEWPORTS = {
  mobile: { width: 375, height: 812 },
  desktop: { width: 1440, height: 900 },
} as const;

const PAGES = [
  { name: 'home', path: '/' },
] as const;

const ARTIFACT_DIR = path.join(process.cwd(), 'test-results', 'visual-regression');

async function captureSnapshot(page: Page, name: string): Promise<Buffer> {
  await page.waitForLoadState('networkidle');
  // Disable animations so snapshots are deterministic.
  await page.addStyleTag({
    content: '*.animations, *.transition { animation: none !important; transition: none !important; }',
  });
  const buffer = await page.screenshot({ fullPage: true, animations: 'disabled' });
  await fsPromises.mkdir(ARTIFACT_DIR, { recursive: true });
  await fsPromises.writeFile(path.join(ARTIFACT_DIR, `${name}.png`), buffer);
  return buffer;
}

/**
 * Computes a pixel diff between two PNG buffers using Playwright's built-in
 * image comparison engine and writes the diff artifact to disk.
 */
async function generateDiff(
  expectFn: typeof expect,
  actual: Buffer,
  expected: Buffer,
  name: string,
): Promise<void> {
  const diffPath = path.join(ARTIFACT_DIR, `${name}-diff.png`);
  try {
    expectFn(actual).toMatchSnapshot(expected, {
      maxDiffPixels: 0,
      threshold: 0.2,
    });
  } catch (err) {
    // Playwright writes the diff image next to the expected snapshot on failure.
    // Copy it into our artifact directory for easy consumption.
    const candidates = [
      diffPath,
      path.join(ARTIFACT_DIR, `${name}-actual.png`),
    ];
    for (const c of candidates) {
      if (fs.existsSync(c)) {
        await fsPromises.copyFile(c, diffPath);
        break;
      }
    }
    throw err;
  }
}

test.describe('Multi-Resolution Visual Regression', () => {
  for (const pageDef of PAGES) {
    test.describe(`Page: ${pageDef.name}`, () => {
      for (const [viewportName, size] of Object.entries(VIEWPORTS)) {
        test(`${viewportName} (${size.width}px) visual snapshot`, async ({ page }) => {
          await page.setViewportSize(size);
          await page.goto(pageDef.path);
          const snapshot = await captureSnapshot(
            page,
            `${pageDef.name}-${viewportName}`,
          );
          expect(snapshot).toMatchSnapshot({
            maxDiffPixels: 0,
            threshold: 0.2,
          });
        });
      }

      test('generates automated diff between Mobile and Desktop', async ({ page }) => {
        await page.setViewportSize(VIEWPORTS.mobile);
        await page.goto(pageDef.path);
        const mobile = await captureSnapshot(page, `${pageDef.name}-mobile-diff-source`);

        await page.setViewportSize(VIEWPORTS.desktop);
        await page.goto(pageDef.path);
        const desktop = await captureSnapshot(page, `${pageDef.name}-desktop-diff-source`);

        // The two resolutions are expected to differ structurally. We generate
        // the diff artifact regardless so reviewers can inspect it.
        await generateDiff(expect, mobile, desktop, `${pageDef.name}-mobile-vs-desktop`);
      });
    });
  }
});
