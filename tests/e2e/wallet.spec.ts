import { test, expect, type Page } from "@playwright/test";

/**
 * End-to-end coverage for the WalletConnect flow.
 *
 * The app is driven through a mock WalletConnect bridge injected before the
 * application boots. The mock implements the same surface as the real
 * bridge (init / connect / disconnect / getSession) and persists the session
 * in localStorage under the same key the app uses, so the connection flow
 * is exercised without manual input.
 */

const WALLETCONNECT_SESSION_KEY = "stormsale_walletconnect_session";

interface MockBridgeConfig {
  /** Delay in ms before the mock bridge resolves a connection. */
  connectDelayMs?: number;
  /** Force the mock bridge to reject connection requests. */
  failConnect?: boolean;
}

/**
 * Installs a mock WalletConnect bridge on the page before any app code runs.
 * Exposes the bridge on `window.__stormsaleWalletConnectBridge` and on
 * `window.ethereum` in a WalletConnect-shaped envelope so the app can detect
 * it through the standard provider discovery path.
 */
async function installMockWalletConnectBridge(
  page: Page,
  config: MockBridgeConfig = {},
): Promise<void> {
  const { connectDelayMs = 0, failConnect = false } = config;

  await page.addInitScript(
    ({ sessionKey, connectDelayMs, failConnect }) => {
      const storage = window.localStorage;
      const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

      const readSession = (): any => {
        try {
          const raw = storage.getItem(sessionKey);
          return raw ? JSON.parse(raw) : null;
        } catch {
          return null;
        }
      };

      const bridge = {
        isInitialized: false,
        async init() {
          bridge.isInitialized = true;
        },
        async connect() {
          if (connectDelayMs > 0) {
            await delay(connectDelayMs);
          }
          if (failConnect) {
            throw new Error("Mock WalletConnect bridge rejected the connection request");
          }
          const session = {
            topic: "wc_mock_" + Math.random().toString(36).substring(2, 12),
            peerMeta: {
              name: "StormSale Mock Wallet",
              description: "Mock WalletConnect bridge for E-2E tests",
            },
            connectedAt: Date.now(),
          };
          storage.setItem(sessionKey, JSON.stringify(session));
          return session;
        },
        async disconnect() {
          storage.removeItem(sessionKey);
        },
        getSession() {
          return readSession();
        },
      };

      // Expose the mock bridge for the app to consume.
      (window as any).__stormsaleWalletConnectBridge = bridge;

      // Also expose a WalletConnect-shaped envelope on window.ethereum so the
      // app's provider discovery path finds it.
      const envelope = {
        isWalletConnect: true,
        chainId: 1,
        accounts: [],
        async enable() {
          const session = await bridge.connect();
          envelope.accounts = ["GDOCKETMOCKWALLET2222222222222222222222222222222222"];
          return envelope.accounts;
        },
        async disable() {
          await bridge.disconnect();
          envelope.accounts = [];
        },
      };
      (window as any).ethereum = envelope;
    },
    { sessionKey: WALLETCONNECT_SESSION_KEY, connectDelayMs, failConnect },
  );
}

/**
 * Returns the connect button by role or accessible name, falling back to a
 * text-match so the test is resilient to minor label changes.
 */
function connectButton(page: Page) {
  return page.getByRole("button", { name: /connect wallet/i });
}

test.describe("WalletConnect E2E", () => {
  test.beforeEach(async ({ page }) => {
    await installMockWalletConnectBridge(page);
  });

  test("connects via the mock bridge and enters the dashboard", async ({
    page,
  }) => {
    await page.goto("/");

    // The mock bridge must be available before the connect flow is triggered.
    const bridgeReady = await page.evaluate(
      () => typeof (window as any).__stormsaleWalletConnectBridge !== "undefined",
    );
    expect(bridgeReady).toBeTrue();

    const connect = connectButton(page);
    await expect(connect).toBeVisible();
    await connect.click();

    // The mock bridge persists the session in localStorage under the same key
    // the app uses, and the app routes to the dashboard on successful connection.
    await page.waitForFunction(
      (key) => window.localStorage.getItem(key) !== null,
      WALLETCONNECT_SESSION_KEY,
    );

    const session = await page.evaluate(
      (key) => JSON.parse(window.localStorage.getItem(key)!),
      WALLETCONNECT_SESSION_KEY,
    );
    expect(session.topic).match(/^wc_mock_/);
    expect(session.peerMeta.name).toBe("StormSale Mock Wallet");

    // Successful dashboard entry.
    await expect(page).toHaveURL(/dashboard/i);
    await expect(page.getByRole("heading", { name: /dashboard/i })).toBeVisible();
  });

  test("shows an error when the mock bridge rejects the connection", async ({
    page,
  }) => {
    await page.context().addInitScript(() => {
      const bridge = (window as any).__stormsaleWalletConnectBridge;
      if (bridge) {
        bridge.connect = async () => {
          throw new Error("Mock WalletConnect bridge rejected the connection request");
        };
      }
    });

    await page.goto("/");
    await connectButton(page).click();

    await expect(page.getBuText(/Mock WalletConnect bridge rejected/i)).toBeVisible();
    await expect(page).not.toHaveURL(/dashboard/i);
  });
});
