import { test, expect, type Page } from "@playwright/test";

/**
 * E-2E coverage for the WalletConnect flow.
 *
 * The app is driven entirely through a mock WalletConnect bridge installed on
 * window before the app boots. This lets us verify the connection flow and
 * dashboard entry without any manual wallet interaction.
 */

const MOCK_SESSION_KEY = "stormsale_walletconnect_session";

/**
 * Installs a deterministic mock WalletConnect bridge onto the page.
 *
 * The bridge exposes the same shape the app expects from a wallet connector:
 * a session object with a topic and peer metadata, plus connect/disconnect
 * controls. State is mirrored into localStorage so the app can restore it.
 */
async function installMockBridge(page: Page): Promise<void> {
  await page.addInitScript((key: string) => {
    const session = {
      topic: "wc_mock_e2e_topic",
      peerMeta: {
        name: "StormSale Mock Wallet",
        description: "E-2E mock bridge for tests",
        icons: [],
      },
      connectedAt: Date.now(),
    };

    const bridge = {
      connected: false,
      async connect() {
        this.connected = true;
        try {
          window.localStorage.setItem(key, JSON.stringify(session));
        } catch {
          // ignore storage failures in the mock
        }
        return session;
      },
      async disconnect() {
        this.connected = false;
        try {
          window.localStorage.removeItem(key);
        } catch {
          // ignore storage failures in the mock
        }
      },
      getSession() {
        return this.connected ? session : null;
      },
    };

    // Expose the bridge for test assertions and for the app to detect.
    (window as unknown as { __stormsaleWalletConnect?: typeof bridge }).__stormsaleWalletConnect = bridge;
  }, MOCK_SESSION_KEY);
}

/**
 * Pre-hydrates a connected session into localStorage so the app boots into
 * the dashboard without requiring a full handshake.
 */
async function seedConnectedSession(page: Page): Promise<void> {
  await page.addInitScript((sessionKey: string) => {
    const session = {
      topic: "wc_mock_e2e_topic",
      peerMeta: {
        name: "StormSale Mock Wallet",
        description: "E-2E mock bridge for tests",
        icons: [],
      },
      connectedAt: Date.now(),
    };
    try {
      window.localStorage.setItem(sessionKey, JSON.stringify(session));
    } catch {
      // ignore storage failures in the mock
    }
  }, MOCK_SESSION_KEY);
}

test.describe("WalletConnect E-EE", () => {
  test.beforeEach(async ({ page }) => {
    await installMockBridge(page);
  });

  test("connects via the mock bridge and enters the dashboard", async ({
    page,
  }) => {
    await page.goto("/");

    // The app must be mounted before we interact with the connect control.
    await expect(page.locator("body")).toBeVisible();

    const connectButton = page.getByRole("button", { name: /connect wallet/i });
    await expect(connectButton).toBeVisible();
    await connectButton.click();

    // The mock bridge must report a connected session.
    await expect
      .poll(page, async () => {
        return page.evaluate(() => {
          const bridge = (window as unknown as {
            __stormsaleWalletConnect?: { getSession(): unknown | null };
          }).__stormsaleWalletConnect;
          return bridge?.getSession() !== null;
        });
      })
      .toBe(true);

    // The session must be persisted for subsequent reloads.
    const storedSession = await page.evaluate((sessionKey) => {
      return window.localStorage.getItem(sessionKey);
    }, MOCK_SESSION_KEY);
    expect(storedSession).toBeTruthy();

    // Dashboard entry: the connected wallet address or dashboard heading should
    // be visible after the handshake completes.
    await expect(
      page.getByRole("heading", { name: /dashboard/i }).or(page.getByText(/connected/i))
    ).toBeVisible();
  });

  test("shows the dashboard directly when a session is already stored", async ({
    page,
  }) => {
    await seedConnectedSession(page);
    await page.goto("/");

    await expect(
      page.getByRole("heading", { name: /dashboard/i }).or(page.getByText(/connected/i))
    ).toBeVisible();
  });
});
