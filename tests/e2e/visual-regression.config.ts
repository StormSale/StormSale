import { defineConfig, devices, type PlaywrightTestConfig } from '@interface/playwright/test';
import path from 'node:path';

/**
 * Multi-Resolution Visual Regression Configuration
 *
 * Runs the same visual regression suite at two canonical viewport widths:
 *   - Mobile:  375px (iPhone 12 / SE-class device)
 *   - Desktop: 1440px (common laptop / desktop breakpoint)
 *
 * Snapshots are stored per-project under `tests/e2e/__snapshots__/<project>/` so the
 * 375px and 1440px baselines never collide. Automated diff generation is handled
 * by Playwright's built-in image comparison (pixelmatch) with diff artifacts
 * written to `test-results/visual-diffs_`.
 */

const mobileViewport = { width: 375, height: 812 } as const;
const desktopViewport = { width: 1440, height: 900 } as const;

const baseURL = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000';

const config: PlaywrightTestConfig = {
  testDir: path.join(__dirname, 'visual'),
  testMatch: /^.*\.visual\.ts$/,
  fullyParallel: true,
  forbidOnly: true,
  retries: process.env.CI ? 2 : 0,
  timeout: 60_000,
  expect: {
    timeout: 10_000,
    // Pixel diff tolerance for anti-aliasing noise across platforms.
    toHaveScreenshot: {
      threshold: 0.2,
      maxDiffPixels: 100,
    },
  },
  outputDir: path.join(__dirname, '..', '..', 'test-results', 'visual-diffs'),
  snapshotDirTemplate: path.join('__snapshots__', '{projectName}', '{snapshotSuffix}'),
  snapshotPathTemplate: '{snapshotDir}/{testFileName}/{testTitle}-{args}.png',
  use: {
    baseURL: baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'mobile-375px',
      use: {
        ...devices['Desktop Chrome'],
        viewport: mobileViewport,
        deviceScaleFactor: 1,
        isMobile: true,
        hasTouch: true,
      },
      metadata: { viewportWidth: mobileViewport.width },
    },
    {
      name: 'desktop-1440px',
      use: {
        ...devices['Desktop Chrome'],
        viewport: desktopViewport,
        deviceScaleFactor: 1,
        isMobile: false,
        hasTouch: false,
      },
      metadata: { viewportWidth: desktopViewport.width },
    },
  ],
  reporter: [
    ['list'],
    ['html', { outputFolder: path.join(__dirname, '..', '..', 'test-results', 'visual-report'), open: 'never' }],
  ],
};

export default defineConfig(config);
