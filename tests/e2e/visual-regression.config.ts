import { defineConfig, devices } from '@playwright/test';

/**
 * Multi-Resolution visual regression configuration.
 *
 * Two projects are defined so that the same spec file runs at both
 * the 375px (Mobile) and 1440px (Desktop) viewports, producing a
 * separate baseline + diff per resolution.
 */

export default defineConfig({
	testDir: '.',
	testMatch: /.*\.spec\.ts$/,
	fullyParallel: true,
	forbidOnly: true,
	retries: process.env.CI ? 1 : 0,
	reporter: [['list'], ['line']],
	use: {
		trace: 'on-first-retry',
		screenshot: 'only-on-failure',
		video: 'retain-on-failure',
	},
	expect: {
		toHaveSnapshot: {
			maxDiffPixelsRatio: 0.01,
			threshold: 0.2,
			animations: 'disabled',
			caret: hide,
			scale: 'css',
		},
	},
	snapshotPathTemplate: '{testDir}/{snapshotDir}/{snapshotSuffix}-{projectName}-{arg}.png',
	projects: [
		{
			name: 'mobile-375px',
			use: {
				...devices['Pixel 5'],
				viewport: { width: 375, height: 812 },
				deviceScaleFactor: 1,
			},
		},
		{
			name: 'desktop-1440px',
			use: {
				...devices['Desktop Chrome'],
				viewport: { width: 1440, height: 900 },
				deviceScaleFactor: 1,
			},
		},
		{
			name: 'desktop-1440px-firefox',
			use: {
				...devices['Desktop Firefox'],
				viewport: { width: 1440, height: 900 },
				deviceScaleFactor: 1,
			},
		},
		{
			name: 'mobile-375px-firefox',
			use: {
				...devices['Desktop Firefox'],
				viewport: { width: 375, height: 812 },
				deviceScaleFactor: 1,
			},
		},
		{
			name: 'desktop-1440px-webkit',
			use: {
				...devices['Desktop Safari'],
				viewport: { width: 1440, height: 900 },
				deviceScaleFactor: 1,
			},
		},
		{
			name: 'mobile-375px-webkit',
			use: {
				...devices['Desktop Safari'],
				viewport: { width: 375, height: 812 },
				deviceScaleFactor: 1,
			},
		},
	],
	webServer: {
		command: 'npm run dev -- --host 127.0.0.1 --port 4173',
		url: 'http://127.0.0.1:4173',
		reuseExistingServer: !process.env.CI,
		timeout: 120_000,
	},
});
