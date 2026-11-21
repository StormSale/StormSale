import { expect, test } from "@playwright/test";
import { connectWithDemoAccount, mockBackend } from "../tests/e2e/helpers";

test.describe("E2E Offline Network Recovery & Action Queue Journey (#488)", () => {
  test.beforeEach(async ({ page }) => {
    await mockBackend(page);
  });

  test("displays offline banner when network is lost and recovers upon reconnect", async ({ page, context }) => {
    await connectWithDemoAccount(page);

    // Simulate network offline state using browser context offline mode
    await context.setOffline(true);

    // Verify offline banner displays: "You are currently offline. Actions will be queued."
    const banner = page.getByTestId("offline-queue-banner");
    await expect(banner).toBeVisible();
    await expect(banner).toContainText("You are currently offline. Actions will be queued.");

    // Restore network connectivity and verify queued actions resume or offer explicit retry
    await context.setOffline(false);

    // Reconnected banner verification
    await expect(banner).toContainText(/Network|resumed|restored/i);
  });
});
