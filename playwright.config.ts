import { defineConfig, devices } from "@playwright/test";

const PORT = 4173;

export default defineConfig({
  timeout: 60_000,
  testDir: "./tests/e2e",
  testMatch: "**/*.e2e.ts",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI
    ? [["list"], ["html", { open: "never" }], ["json", { outputFile: "e2e-results.json" }]]
    : [["list"], ["html", { open: "never" }]],
  outputDir: "test-results/e2e",
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    // Acceptance criteria: keep a video of every failing test.
    video: "retain-on-failure",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  // Acceptance criteria: multi-browser support.
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "firefox", use: { ...devices["Desktop Firefox"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
  ],
  webServer: {
    command: `npm run preview -- --host 127.0.0.1 --port ${PORT} --strictPort`,
    url: `http://127.0.0.1:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
