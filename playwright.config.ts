import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright configuration for the StormSale E2E suite.
 *
 * The claim spec (tests/e2e/claim.spec.ts) exercises the real batch-claim code
 * path in a headless browser context. The dev server is started automatically.
 */
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallelized: true,
  forbidOnly: true,
  retries: process.env.CI ? 2 : 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://127.0.0.1:5173",
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
    command: "npm run dev -- --host 127.0.0.1 --port 5173",
    url: "http://127.0.0.1:5173",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
