import { defineConfig, devices } from '@playwright/test';
import type { PlaywrightTestConfig } from '@playwright/test';

/**
 * Multi-resolution visual regression config.
 *
 * Two projects are defined so the same spec runs at both breakpoints:
 *   - mobile  : 375px wide (iPhone 12 viewport)
 *   - desktop : 1440px wide
 *
 * Playwright's built-in snapshot assertions (`toHaveScreenshot`) generate
 * per-pixel diff images automatically when a comparison fails. Those artifacts
 * are written to `test-results/visual-diffs/<resolution>/` by the spec.
 */

const baseURL = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:4173';

const config: PlaywrightTestConfig = {
  testDir: '.',
  testMatch: /.*\.spec\.ts$/,
  fullyParallelized: true,
  forbidOnly: process.env.CI ? true : false,
  retries: process.env.CI ? 1 : 0,
  timeout: 30_000,
  expect: {
    // Allow a small amount of anti-aliasing noise between runs/platforms.
    toHaveScreenshot: {
      maxDiffPixelRatio: 0.01,
      threshold: 0.2,
    },
  },
  // Artifacts (including diff images) are always preserved on failure.
  preserveOutput: 'always',
  outputDir: 'test-results/visual-diff',
  snapshotPath: 'tests/e2e/__snapshots__/{projectName}',
  updateSnapshots: 'missing',
  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'off',
  },
  projects: [
    {
      name: 'mobile',
      use: {
        ...devices['iPhone 12'],
        viewport: { width: 375, height: 812 },
        deviceScaleFactor: 1,
      },
    },
    {
      name: 'desktop',
      use: {
        viewport: { width: 1440, height: 900 },
        deviceScaleFactor: 1,
      },
    },
  ],
};

export default config;
