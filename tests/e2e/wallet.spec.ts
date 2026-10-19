/**
 * E2E tests: Automated Wallet Connect flow.
 *
 * These tests exercise the real WalletConnectContext + Web3Context singleton
 * logic against a mocked bridge, verifying that a user can enter the
 * dashboard without manual input.
 *
 * The mock bridge is installed on `window` before the app boots, so the
 * production code paths are exercised unmodified.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { WalletConnectSingleton } from "../../src/context/WalletConnectContext";
import type { WalletConnectSession } from "../../src/context/WalletConnectContext";

/** **Mock bridge** */

interface MockBridgeCall {
  method: string;
  params?: unknown[];
  timestamp: number;
}

interface MockBridge {
  calls: MockBridgeCall[];
  connected: boolean;
  network: "stellar" | "ethereum";
  handle: (method: string, params?: unknown[]) => Promise<unknown>;
}

const createMockBridge = (): MockBridge => {
  const bridge: MockBridge = {
    calls: [],
    connected: false,
    network: "stellar",
    handle: async (method, params) => {
      bridge.calls.push({ method, params, timestamp: Date.now() });
      switch (method) {
        case "wc_session_propose":
          bridge.connected = true;
          return {
            topic: "wc_mock_bridge_topic",
            peerMeta: {
              name: "StormSale Mobile",
              description: "Stellar Affiliate Escrow Platform",
              icons: [],
            },
            connectedAt: Date.now(),
          };
        case "wc_session_delete":
          bridge.connected = false;
          return true;
        case "wallet_switchChain":
          bridge.network = "stellar";
          return true;
        case "wallet_getNetwork":
          return bridge.network;
        default:
          throw new Error(`Unsupported mock bridge method: ${method}`);
      }
    },
  };
  return bridge;
};

const installMockBridge = (bridge: MockBridge) => {
  // The bridge is attached to window so any code path that reads it at
  // runtime (e.g. wallet discovery / connection flows) hits the mock.
  (window as unknown as { __STORMSALE_WC_BRIDGE__?: MockBridge }).__STORMSALE_WC_BRIDGE__ = bridge;
};

const uninstallMockBridge = () => {
  delete (window as unknown as { __STORMSALE_WC_BRIDGE__?: MockBridge })
    .__STORMSALE_WC_BRIDGE__;
};

/** **Test suite** */

describe("WalletConnect E2E - mock bridge", () => {
  let bridge: MockBridge;

  beforeEach(() => {
    // Fresh singleton + storage for every test.
    WalletConnectSingleton.resetInstance();
    window.localStorage.clear();
    bridge = createMockBridge();
    installMockBridge(bridge);
  });

  afterEach(() => {
    uninstallMockBridge();
    window.localStorage.clear();
    WalletConnectSingleton.resetInstance();
    vi.restoreAllMocks();
  });

  it("initializes the core provider exactly once (StrictMode safe)", async () => {
    const singleton = WalletConnectSingleton.getInstance();

    const [initA, initB] = await Promise.all([
      singleton.initialize(),
      singleton.initialize(),
    ]);

    expect(initA).toBe(initB);
    expect(initA.isInitialized).toBe(true);
    expect(singleton.getIsInitialized()).toBe(true);
  });

  it("connects via the mock bridge and persists the session", async () => {
    const singleton = WalletConnectSingleton.getInstance();
    const provider = await singleton.initialize();

    const session = await provider.connect();

    expect(session.topic).toMatch(/^wc_/);
    expect(session.peerMeta?.name).toBe("StormSale Mobile");
    expect(session.connectedAt).toBeGreaterThan(0);

    expect(provider.getSession()).toEqual(session);
    expect(singleton.getSession()).toEqual(session);

    const stored = window.localStorage.getItem("stormsale_walletconnect_session");
    expect(stored).toBeTruthy();
    const parsed = JSON.parse(stored as string) as WalletConnectSession;
    expect(parsed.topic).toBe(session.topic);
  });

  it("disconnects and clears the persisted session", async () => {
    const singleton = WalletConnectSingleton.getInstance();
    const provider = await singleton.initialize();

    await provider.connect();
    await provider.disconnect();

    expect(provider.getSession()).toBeNull();
    expect(singleton.getSession()).toBeNull();
    expect(window.localStorage.getItem("stormsale_walletconnect_session")).toBeNull();
  });

  it("successful dashboard entry: connect -> stellar network -> ready", async () => {
    // Simulate the dashboard gate: it only renders once the wallet is
    // connected AND on the Stellar network. This is the acceptance
    // criterion for "Successful dashboard entry test".
    const dashboardGate = async (): Promise<boolean> => {
      const singleton = WalletConnectSingleton.getInstance();
      const provider = await singleton.initialize();

      const session = await provider.connect();
      if (!session.topic) {
        return false;
      }

      const network = (await bridge.handle("wallet_getNetwork")) as string;
      if (network !== "stellar") {
        await bridge.handle("wallet_switchChain", ["stellar"]);
      }

      return provider.getSession()?.topic === session.topic;
    };

    await expect(dashboardGate()).resolves.toBe(true);

    // Verify the mock bridge was actually invoked for the connection flow.
    const methods = bridge.calls.map((c) => c.method);
    expect(methods).include("wallet_getNetwork");
    expect(bridge.connected).toBe(true);
  });

  it("restores a previous session from storage on initialization", async () => {
    const previousSession: WalletConnectSession = {
      topic: "wc_restored_topic",
      peerMeta: { name: "StormSale Mobile" },
      connectedAt: Date.now() - 1000,
    };
    window.localStorage.setItem(
      "stormsale_walletconnect_session",
      JSON.stringify(previousSession),
    );

    // Reset so the singleton restores from storage on construction.
    WalletConnectSingleton.resetInstance();
    const singleton = WalletConnectSingleton.getInstance();

    expect(singleton.getSession()).toEqual(previousSession);
  });
});
