import { defineConfig, devices } from '@playwright/test';

/**
 * Multi-Resolution Visual Regression Config.
 *
 * Runs the same spec against two viewports (Mobile 375px vs Desktop 1440px).
 * Snapshots are stored under a per-project directory so diffs are isolated per resolution.
 */

export const MOBILE_VIEWPORT = { width: 375, height: 812 } as const;
export const DESKTOP_VIEWPORT = { width: 1440, height: 900 } as const;

export default defineConfig({
	testDir: '.',
	testMatch: /.*\.visual-regression\.spec\.ts$/,
	fullyParallelized: true,
	forbidOnly: process.env.CI ? 'on' : 'warn',
	reporter: [['list'], ['html', { outputFolder: 'playwright-html-report', open: 'never' }]],
	use: {
		baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:4173',
		trace: 'retain-on-failure',
		screenshot: 'only-on-failure',
		video: 'retain-on-failure',
	},
	expect: {
		toHaveSnapshot: {
			// Allow small anti-aliasing diffs but fail on real UI breaks.
			maxDiffPixels: 100,
			threshold: 0.2,
			animations: 'disabled',
			caret: 'hide',
			scale: 'css',
		},
	},
	projects: [
		{
			name: 'mobile-375',
			use: {
				...devices['iPhone 12'],
				viewport: MOBILE_VIEWPORT,
			},
		},
		{
			name: 'desktop-1440',
			use: {
				...devices['Desktop Chrome'],
				viewport: DESKTOP_VIEWPORT,
			},
		},
],
});
