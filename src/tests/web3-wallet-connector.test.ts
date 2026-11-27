// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  StellarWalletConnectorStateMachine,
  WALLET_SESSION_STORAGE_KEY,
  type WalletConnectionState,
  type WalletAdapter,
  type SupportedWalletType,
} from "../lib/walletConnector";

// -----------------------------------------------------------------------------
// Mock @stellar/freighter-api
// -----------------------------------------------------------------------------
const mockFreighterApi = vi.hoisted(() => ({
  isConnected: vi.fn(),
  isAllowed: vi.fn(),
  setAllowed: vi.fn(),
  requestAccess: vi.fn(),
  getPublicKey: vi.fn(),
  getNetwork: vi.fn(),
}));

vi.mock("@stellar/freighter-api", () => ({
  isConnected: () => mockFreighterApi.isConnected(),
  isAllowed: () => mockFreighterApi.isAllowed(),
  setAllowed: () => mockFreighterApi.setAllowed(),
  requestAccess: () => mockFreighterApi.requestAccess(),
  getPublicKey: () => mockFreighterApi.getPublicKey(),
  getNetwork: () => mockFreighterApi.getNetwork(),
}));

// -----------------------------------------------------------------------------
// Mock @creit.tech/stellar-wallets-kit
// -----------------------------------------------------------------------------
const mockKit = vi.hoisted(() => ({
  setWallet: vi.fn(),
  getPublicKey: vi.fn(),
  disconnect: vi.fn(),
  sign: vi.fn(),
}));

vi.mock("@creit.tech/stellar-wallets-kit", () => {
  return {
    StellarWalletsKit: class MockStellarWalletsKit {
      constructor(public options?: any) {}
      setWallet(id: string) {
        return mockKit.setWallet(id);
      }
      getPublicKey() {
        return mockKit.getPublicKey();
      }
      disconnect() {
        return mockKit.disconnect();
      }
      sign(params: any) {
        return mockKit.sign(params);
      }
    },
    WalletNetwork: {
      PUBLIC: "PUBLIC",
      TESTNET: "TESTNET",
    },
    WalletType: {
      FREIGHTER: "freighter",
      XBULL: "xbull",
      ALBEDO: "albedo",
      HANA: "hana",
      WALLETCONNECT: "walletconnect",
    },
    FreighterModule: class MockFreighterModule {
      id = "freighter";
      name = "Freighter";
    },
    xBullModule: class MockXBullModule {
      id = "xbull";
      name = "xBull";
    },
    AlbedoModule: class MockAlbedoModule {
      id = "albedo";
      name = "Albedo";
    },
    HanaModule: class MockHanaModule {
      id = "hana";
      name = "Hana";
    },
    WalletConnectModule: class MockWalletConnectModule {
      id = "walletconnect";
      name = "WalletConnect";
    },
  };
});

const ADDR_1 = "GASTORMSALE7PRIMARY7WALLET7ADDRESS777777777777777777777777";
const ADDR_2 = "GACREIT7TECH7STELLAR7WALLET7KIT7SECONDARY7ACCOUNT7777777777";

describe("Stellar Wallet Kit Multi-Wallet Connector State Machine (#420)", () => {
  let connector: StellarWalletConnectorStateMachine;

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();

    mockFreighterApi.isConnected.mockResolvedValue(true);
    mockFreighterApi.isAllowed.mockResolvedValue(true);
    mockFreighterApi.setAllowed.mockResolvedValue(true);
    mockFreighterApi.requestAccess.mockResolvedValue({ address: ADDR_1 });
    mockFreighterApi.getPublicKey.mockResolvedValue(ADDR_1);
    mockFreighterApi.getNetwork.mockResolvedValue("TESTNET");

    mockKit.setWallet.mockResolvedValue(undefined);
    mockKit.getPublicKey.mockResolvedValue(ADDR_1);
    mockKit.disconnect.mockResolvedValue(undefined);

    connector = new StellarWalletConnectorStateMachine({ autoRestore: false });
  });

  afterEach(() => {
    localStorage.clear();
  });

  // ===========================================================================
  // 1. Mock all supported wallet adapters using Freighter & Stellar Wallets Kit
  // ===========================================================================
  describe("1. Mock Supported Wallet Adapters (@stellar/freighter-api & @creit.tech/stellar-wallets-kit)", () => {
    it("connects through StellarWalletsKit adapter for Freighter, xBull, Albedo, Hana, and WalletConnect", async () => {
      const kit = {
        setWallet: mockKit.setWallet,
        getPublicKey: mockKit.getPublicKey,
        disconnect: mockKit.disconnect,
      };

      const kitConnector = new StellarWalletConnectorStateMachine({
        kit,
        autoRestore: false,
      });

      const wallets: SupportedWalletType[] = [
        "freighter",
        "xbull",
        "albedo",
        "hana",
        "walletconnect",
      ];

      for (const wallet of wallets) {
        mockKit.getPublicKey.mockResolvedValueOnce(ADDR_1);
        const address = await kitConnector.connect(wallet);

        expect(mockKit.setWallet).toHaveBeenCalledWith(wallet);
        expect(mockKit.getPublicKey).toHaveBeenCalled();
        expect(address).toBe(ADDR_1);
        expect(kitConnector.getState()).toBe("connected");
        expect(kitConnector.getWalletType()).toBe(wallet);

        await kitConnector.disconnect();
        expect(kitConnector.getState()).toBe("disconnected");
      }
    });

    it("connects through individual registered custom adapters", async () => {
      const customAdapter: WalletAdapter = {
        id: "hana",
        name: "Hana Wallet",
        isAvailable: vi.fn().mockResolvedValue(true),
        connect: vi.fn().mockResolvedValue({ address: ADDR_1, network: "PUBLIC" }),
        disconnect: vi.fn().mockResolvedValue(undefined),
      };

      connector.registerAdapter(customAdapter);

      const address = await connector.connect("hana");
      expect(customAdapter.isAvailable).toHaveBeenCalled();
      expect(customAdapter.connect).toHaveBeenCalled();
      expect(address).toBe(ADDR_1);
      expect(connector.getState()).toBe("connected");
    });
  });

  // ===========================================================================
  // 2. Verify state transitions: idle -> connecting -> connected -> disconnecting -> disconnected
  // ===========================================================================
  describe("2. State Machine Transitions Lifecycle", () => {
    it("follows exact sequence: idle -> connecting -> connected -> disconnecting -> disconnected", async () => {
      const recordedStates: WalletConnectionState[] = [];

      connector.onStateChange((state) => {
        recordedStates.push(state);
      });

      expect(connector.getState()).toBe("idle");

      // Register adapter with simulated connection delay
      const adapter: WalletAdapter = {
        id: "freighter",
        name: "Freighter",
        isAvailable: () => true,
        connect: async () => {
          expect(connector.getState()).toBe("connecting");
          return { address: ADDR_1 };
        },
        disconnect: async () => {
          expect(connector.getState()).toBe("disconnecting");
        },
      };

      connector.registerAdapter(adapter);

      // 1. Connect
      const address = await connector.connect("freighter");
      expect(address).toBe(ADDR_1);
      expect(connector.getState()).toBe("connected");

      // 2. Disconnect
      await connector.disconnect("User logged out");
      expect(connector.getState()).toBe("disconnected");

      // Check transition sequence
      expect(recordedStates).toEqual([
        "idle", // initial state on subscription
        "connecting",
        "connected",
        "disconnecting",
        "disconnected",
      ]);
    });

    it("prevents overlapping concurrent connect calls while connecting", async () => {
      const slowAdapter: WalletAdapter = {
        id: "xbull",
        name: "xBull",
        isAvailable: () => true,
        connect: () => new Promise((resolve) => setTimeout(() => resolve({ address: ADDR_1 }), 50)),
      };
      connector.registerAdapter(slowAdapter);

      const p1 = connector.connect("xbull");
      await expect(connector.connect("xbull")).rejects.toThrow(/Already connecting/);
      await p1;
    });
  });

  // ===========================================================================
  // 3. Test graceful handling when user denies connection request in wallet popup
  // ===========================================================================
  describe("3. User Rejection and Denial Handling in Wallet Popup", () => {
    it("handles user denial in Freighter popup and cleanly returns state to idle", async () => {
      const rejectionAdapter: WalletAdapter = {
        id: "freighter",
        name: "Freighter",
        isAvailable: () => true,
        connect: vi.fn().mockRejectedValue(new Error("User declined access to wallet")),
      };

      connector.registerAdapter(rejectionAdapter);

      await expect(connector.connect("freighter")).rejects.toThrow(
        "User denied connection request in freighter wallet popup.",
      );

      // Verify clean rollback to idle with error captured in context
      expect(connector.getState()).toBe("idle");
      expect(connector.getAddress()).toBeNull();
      expect(connector.getContext().error).toContain("User denied connection request");
      expect(localStorage.getItem(WALLET_SESSION_STORAGE_KEY)).toBeNull();
    });

    it("handles Albedo popup cancellation and surfaces clean rejection guidance", async () => {
      const albedoAdapter: WalletAdapter = {
        id: "albedo",
        name: "Albedo",
        isAvailable: () => true,
        connect: vi.fn().mockRejectedValue(new Error("Albedo login was canceled by user")),
      };

      connector.registerAdapter(albedoAdapter);

      await expect(connector.connect("albedo")).rejects.toThrow(
        "User denied connection request in albedo wallet popup.",
      );

      expect(connector.getState()).toBe("idle");
      expect(connector.isConnected()).toBe(false);
    });

    it("handles xBull condition-of-use or user-rejected popup", async () => {
      const xbullAdapter: WalletAdapter = {
        id: "xbull",
        name: "xBull",
        isAvailable: () => true,
        connect: vi.fn().mockRejectedValue(new Error("condition of use not satisfied")),
      };

      connector.registerAdapter(xbullAdapter);

      await expect(connector.connect("xbull")).rejects.toThrow(
        "User denied connection request in xbull wallet popup.",
      );

      expect(connector.getState()).toBe("idle");
    });
  });

  // ===========================================================================
  // 4. Test auto-reconnection behavior on page reload with valid session in localStorage
  // ===========================================================================
  describe("4. Auto-Reconnection on Page Reload via localStorage", () => {
    it("auto-reconnects immediately when a valid unexpired session exists", () => {
      const validSession = {
        walletType: "freighter",
        address: ADDR_1,
        sessionToken: "sess_freighter_GASTORMS_1732400000000",
        network: "TESTNET",
        connectedAt: Date.now() - 1000,
        expiresAt: Date.now() + 86400000, // +24 hours
      };

      localStorage.setItem(WALLET_SESSION_STORAGE_KEY, JSON.stringify(validSession));

      const reloadedConnector = new StellarWalletConnectorStateMachine({ autoRestore: true });

      expect(reloadedConnector.getState()).toBe("connected");
      expect(reloadedConnector.getAddress()).toBe(ADDR_1);
      expect(reloadedConnector.getWalletType()).toBe("freighter");
      expect(reloadedConnector.isConnected()).toBe(true);
      expect(reloadedConnector.getContext().session?.sessionToken).toBe(validSession.sessionToken);
    });

    it("ignores and purges expired sessions from localStorage on reload", () => {
      const expiredSession = {
        walletType: "albedo",
        address: ADDR_1,
        sessionToken: "sess_expired",
        network: "TESTNET",
        connectedAt: Date.now() - 200000,
        expiresAt: Date.now() - 5000, // Expired 5 seconds ago
      };

      localStorage.setItem(WALLET_SESSION_STORAGE_KEY, JSON.stringify(expiredSession));

      const reloadedConnector = new StellarWalletConnectorStateMachine({ autoRestore: true });

      expect(reloadedConnector.getState()).toBe("idle");
      expect(reloadedConnector.isConnected()).toBe(false);
      expect(localStorage.getItem(WALLET_SESSION_STORAGE_KEY)).toBeNull();
    });

    it("ignores corrupted or invalid session tokens in localStorage", () => {
      localStorage.setItem(WALLET_SESSION_STORAGE_KEY, "invalid-non-json-token");

      const reloadedConnector = new StellarWalletConnectorStateMachine({ autoRestore: true });

      expect(reloadedConnector.getState()).toBe("idle");
      expect(reloadedConnector.getAddress()).toBeNull();
      expect(localStorage.getItem(WALLET_SESSION_STORAGE_KEY)).toBeNull();
    });
  });

  // ===========================================================================
  // 5. Test account switching event emission & synchronized UI state updates
  // ===========================================================================
  describe("5. Account Switching Event Emission & Unexpected Disconnect", () => {
    it("emits accountChanged event and updates synchronized state when user switches account", async () => {
      let adapterAccountHandler: ((addr: string) => void) | undefined;

      const switchingAdapter: WalletAdapter = {
        id: "freighter",
        name: "Freighter",
        isAvailable: () => true,
        connect: async () => ({ address: ADDR_1 }),
        onAccountChange: (handler) => {
          adapterAccountHandler = handler;
          return () => {
            adapterAccountHandler = undefined;
          };
        },
      };

      connector.registerAdapter(switchingAdapter);
      await connector.connect("freighter");

      expect(connector.getAddress()).toBe(ADDR_1);

      // Track account switch event
      const accountChangeSpy = vi.fn();
      connector.onAccountChange(accountChangeSpy);

      // Simulate account switch in wallet extension
      expect(adapterAccountHandler).toBeDefined();
      adapterAccountHandler!(ADDR_2);

      // Verify event was emitted
      expect(accountChangeSpy).toHaveBeenCalledWith(ADDR_2);

      // Verify connector updated internal state
      expect(connector.getAddress()).toBe(ADDR_2);

      // Verify session in localStorage was updated
      const rawSession = localStorage.getItem(WALLET_SESSION_STORAGE_KEY);
      expect(rawSession).not.toBeNull();
      const updatedSession = JSON.parse(rawSession!);
      expect(updatedSession.address).toBe(ADDR_2);
    });

    it("handles unexpected disconnect event from wallet adapter and clears session", async () => {
      let adapterDisconnectHandler: ((reason?: string) => void) | undefined;

      const disconnectAdapter: WalletAdapter = {
        id: "walletconnect",
        name: "WalletConnect",
        isAvailable: () => true,
        connect: async () => ({ address: ADDR_1 }),
        onDisconnect: (handler) => {
          adapterDisconnectHandler = handler;
          return () => {
            adapterDisconnectHandler = undefined;
          };
        },
      };

      connector.registerAdapter(disconnectAdapter);
      await connector.connect("walletconnect");
      expect(connector.isConnected()).toBe(true);

      const disconnectSpy = vi.fn();
      connector.onDisconnect(disconnectSpy);

      // Simulate mobile wallet closing connection abruptly
      expect(adapterDisconnectHandler).toBeDefined();
      adapterDisconnectHandler!("Peer disconnected session");

      expect(disconnectSpy).toHaveBeenCalledWith("Peer disconnected session");
      expect(connector.getState()).toBe("disconnected");
      expect(connector.getAddress()).toBeNull();
      expect(connector.isConnected()).toBe(false);
      expect(localStorage.getItem(WALLET_SESSION_STORAGE_KEY)).toBeNull();
    });
  });
});
