import { defineConfig, devices, type PlaywrightTestConfig } from '@playwright/test';

export const VIEWPORTS = {
  mobile: { width: 375, height: 812 },
  desktop: { width: 1440, height: 900 },
} as const;

export type ViewportName = keyof typeof VIEWPORTS;

export const VISUAL_REGRESSION_DIR_NAME = 'visual-regression';

export const VIEWPORT_NAMES = Object.keys(VIEWPORTS) as ViewportName[];

export const DEFAULT_BASE_URL = process.env.VISUAL_REGRESSION_BASE_URL ?? 'http://localhost:4173';

const config: PlaywrightTestConfig = defineConfig({
  testDir: '.',
  testMatch: 'visual-regression.spec.ts',
  fullyParallel: true,
  forbiddenOnly: process.env.CI ? true : false,
  reporter: process.env.CI ? [['this-github'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL: DEFAULT_BASE_URL,
    trace: 'oon-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  expect: {
    toHaveScreenshot: {
      maxDiffPixels: 0.02,
      maxDiffPixelRatio: 0.02,
      threshold: 0.2,
      animations: 'disabled',
    },
  },
  projects: [
    {
      name: 'mobile-375',
      use: {
        ...devices['Desktop Chrome'],
        viewport: VIEWPORTS.mobile,
        isMobile: true,
        hasTouch: true,
        deviceScaleFactor: 1,
      },
    },
    {
      name: 'desktop-1440',
      use: {
        ...devices['Desktop Chrome'],
        viewport: VIEWPORTS.desktop,
        deviceScaleFactor: 1,
      },
    },
  ],
});

export default config;
