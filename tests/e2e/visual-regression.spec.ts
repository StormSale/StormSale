import { test, expect, type Page } from '@playwright/test';
import { promises as fs } from 'node:fs';
import path from 'node:path';

/**
 * Multi-Resolution Visual Regression
 *
 * Runs the same page at 375px (Mobile) and 1440px (Desktop), captures
 * full-page screenshots, and generates an automated pixel diff against
 * the committed baseline images. Diff images are written to
 * `test-results/visual-diffs/` in addition to Playwright's own artifacts.
 */

const ROOT = path.resolve(__dirname, '..');
const BASELINE_DIR = path.resolve(__dirname, 'visual-baselines');
const DIFF_DIR = path.resolve(ROOT, 'test-results', 'visual-diff');


const VIEWPORTS = [
  { name: 'mobile', width: 375, height: 812 },
  { name: 'desktop', width: 1440, height: 900 },
] as const;

const PAGES = [
  { name: 'home', path: '/' },
  { name: 'dashboard', path: '/dashboard' },
  { name: 'marketplace', path: '/marketplace' },
] as const;

async function stabilizePage(page: Page): Promise<void> {
  await page.addStyleTag({
    content: `
      *,
      *::before,
      *::after {
        animation-duration: 0s !important;
        animation-delay: 0s !important;
        transition-duration: 0s !important;
        transition-delay: 0s !important;
        caret-color: transparent !important;
      }
    `,
  });
  // Wait for fonts and network idle so layout is stable.
  await page.evaluate(() => document.fonts.ready);
  await page.waitForLoadState('networkidle');
}

async function ensureDir(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
}

for (const viewport of VIEWPORTS) {
  test.describe(`${viewport.name} (${viewport.width}px)`, () => {
    test.beforeEach(async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
    });

    for (const target of PAGES) {
      test(`${target.name} matches ${viewport.name} baseline`, async ({ page }) => {
        const response = await page.goto(target.path, { waitUntil: 'domcontentloaded' });
        // Allow either 200x or a soft redirect to a valid page.
        expect(response?.status() ?? 200).toBeLessThan(400);
        await stabilizePage(page);

        const snapshotName = `${target.name}-${viewport.width}px.png`;
        const baselinePath = path.join(BASELINE_DIR, snapshotName);

        // Playwright handles baseline creation + comparison and writes
        // its own diff artifacts into test-results/.
        await expect(page).toHaveScreenshot(snapshotName, {
          fullPage: true,
          animations: 'disabled',
        });

        // Additional automated diff generation for classic image diffs.
        // This is opt-in via VISUAL_DIFF=1 so the default run stays fast.
        if (process.env.VISUAL_DIFF === '1') {
          await ensureDir(DIFF_DIR);
          const actualPath = path.join(DIFF_DIR, `${target.name}-${viewport.width}px-actual.png`);
          await page.screenshot({ fullPage: true, path: actualPath });

          const diffPath = path.join(DIFF_DIR, `${target.name}-${viewport.width}px-diff.png`);
          await writePixelDiff(baselinePath, actualPath, diffPath);
        }
      });
    }
  });
}

/**
 * Lightweight pixel diff writer.
 *
 * This is a pure-Node implementation that compares two PNG files and
 * writes a diff image where changed pixels are highlighted in red.
 * It avoids adding a heavy dependency like pixelmatch/sharp to the
 * repo by reusing the browser's canvas via Playwright.
 */
async function writePixelDiff(
  baselinePath: string,
  actualPath: string,
  outPath: string,
): Promise<void> {
  const baselineExists = await fs
    .access(baselinePath)
    .then(() => true)
    .catch(() => false);
  if (!baselineExists) {
    // No baseline yet -- nothing to diff against.
    return;
  }

  const { chromium } = await import('@playwright/test');
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    const baselineBase64 = (await fs.readFile(baselinePath)).toString('base64');
    const actualBase64 = (await fs.readFile(actualPath)).toString('base64');

    const diffResult = await page.evaluate(
      async ({ baselineBase64, actualBase64 }) => {
        const loadImg = (src: string) =>
          new Promise<HTMLImageElement>((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = () => reject(new Error('failed to load image'));
            img.src = `data:image/png;base64,${src}`;
          });

        const [a, b] = await Promise.all([loadImg(baselineBase64), loadImg(actualBase64)]);
        const w = Math.max(a.width, b.width);
        const h = Math.max(a.height, b.height);

        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d')!;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(a, 0, 0);
        const dataA = ctx.getImageData(0, 0, w, h);
        ctx.clearRect(0, 0, w, h);
        ctx.drawImage(b, 0, 0);
        const dataB = ctx.getImageData(0, 0, w, h);

        const out = ctx.createImageData(w, h);
        let diffCount = 0;
        for (let i = 0; i < dataA.data.length; i += 4) {
          const dr = Math.abs(dataA.data[i] - dataB.data[i]);
          const dg = Math.abs(dataA.data[i + 1] - dataB.data[i + 1]);
          const db = Math.abs(dataA.data[i + 2] - dataB.data[i + 2]);
          const da = Math.abs(dataA.data[i + 3] - dataB.data[i + 3]);
          const diff = dr + dg + db + da;
          if (diff > 30) {
            diffCount++;
            out.data[i] = 255;
            out.data[i + 1] = 0;
            out.data[i + 2] = 0;
            out.data[i + 3] = 255;
          } else {
            // Faded gray background for unchanged pixels.
            out.data[i] = 240;
            out.data[i + 1] = 240;
            out.data[i + 2] = 240;
            out.data[i + 3] = 255;
          }
        }
        ctx.clearRect(0, 0, w, h);
        ctx.putImageData(out, 0, 0);
        return { dataUrl: canvas.toDataURL('image/png'), diffCount };
      },
      { baselineBase64, actualBase64 },
    );

    const base64 = diffResult.dataUrl.split(',')[1];
    await fs.writeFile(outPath, Buffer.from(base64, 'base64'));
    // Emit a sidecar metadata file so CI can report the diff count.
    await fs.writeFile(
      outPath.replace(/\.png$/, '.json'),
      JSON.stringify({ diffCount: diffResult.diffCount }, null, 2),
    );
  } finally {
    await browser.close();
  }
}
