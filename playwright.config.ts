import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright configuration for the StormSale E2E suite.
 *
 * The dev server is started automatically and the app is exercised through a
 * mock WalletConnect bridge injected via addInitScript, so no manual wallet
 * interaction is required.
 */
export default defineConfig( {
  testDir: "./tests/e2e",
  fullyParallelized: true,
  forbidOnly: process.env.CI ? true : false,
  retries: process.env.CI ? 2 : 0,
  timeout: 30_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: process.env.E2E_BASE_URL || "http://localhost:5173",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: "npm run dev -- --host 127.0.0.1 ---port 5173 ---strictPort",
    url: "http://localhost:5173",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
