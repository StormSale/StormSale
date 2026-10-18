import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { WalletConnectSingleton } from "../context/WalletConnectContext";

// Simple in-memory localStorage polyfill for Node.js Vitest environment
class MockLocalStorage {
  private store: Record<string, string> = {};

  getItem(key: string): string | null {
    return Object.prototype.hasOwnProperty.call(this.store, key) ? this.store[key] : null;
  }

  setItem(key: string, value: string): void {
    this.store[key] = String(value);
  }

  removeItem(key: string): void {
    delete this.store[key];
  }

  clear(): void {
    this.store = {};
  }
}

describe("WalletConnectSingleton", () => {
  const originalWindow = globalThis.window;
  let mockStorage: MockLocalStorage;

  beforeEach(() => {
    mockStorage = new MockLocalStorage();
    (globalThis as any).window = {
      localStorage: mockStorage,
    };
    (globalThis as any).localStorage = mockStorage;

    WalletConnectSingleton.resetInstance();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    (globalThis as any).window = originalWindow;
    delete (globalThis as any).localStorage;
  });

  it("initializes exactly once and returns the same provider instance", async () => {
    const singleton1 = WalletConnectSingleton.getInstance();
    const singleton2 = WalletConnectSingleton.getInstance();

    expect(singleton1).toBe(singleton2);

    const provider1 = await singleton1.initialize();
    const provider2 = await singleton2.initialize();

    expect(provider1).toBe(provider2);
    expect(singleton1.getIsInitialized()).toBe(true);
  });

  it("handles concurrent initializations (Strict Mode double-mount simulation) safely", async () => {
    const singleton = WalletConnectSingleton.getInstance();

    // Trigger two initializations concurrently like React 18/19 StrictMode mounting twice
    const [p1, p2] = await Promise.all([
      singleton.initialize(),
      singleton.initialize(),
    ]);

    expect(p1).toBe(p2);
    expect(p1.isInitialized).toBe(true);
  });

  it("stores and restores session across simulated page refresh", async () => {
    const singleton = WalletConnectSingleton.getInstance();
    const provider = await singleton.initialize();

    const session = await provider.connect();
    expect(session.topic).toBeDefined();

    // Verify localStorage has persisted the session
    const stored = mockStorage.getItem("stormsale_walletconnect_session");
    expect(stored).toBeTruthy();
    expect(JSON.parse(stored!).topic).toBe(session.topic);

    // Simulate page refresh by resetting the singleton in-memory
    WalletConnectSingleton.resetInstance();
    const newSingleton = WalletConnectSingleton.getInstance();
    expect(newSingleton.getSession()?.topic).toBe(session.topic);
  });

  it("cleans up session in storage upon disconnect", async () => {
    const singleton = WalletConnectSingleton.getInstance();
    const provider = await singleton.initialize();

    await provider.connect();
    expect(mockStorage.getItem("stormsale_walletconnect_session")).toBeTruthy();

    await provider.disconnect();
    expect(mockStorage.getItem("stormsale_walletconnect_session")).toBeNull();
    expect(singleton.getSession()).toBeNull();
  });

  it("handles localStorage quota/permission errors gracefully without failing connect or disconnect", async () => {
    const singleton = WalletConnectSingleton.getInstance();
    const provider = await singleton.initialize();

    // Mock storage failure
    vi.spyOn(mockStorage, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceededError: storage quota exceeded");
    });
    vi.spyOn(mockStorage, "removeItem").mockImplementation(() => {
      throw new Error("SecurityError: storage access denied");
    });

    // connect should not throw despite setItem failing
    const session = await provider.connect();
    expect(session.topic).toBeDefined();

    // disconnect should not throw despite removeItem failing
    await expect(provider.disconnect()).resolves.toBeUndefined();
    expect(singleton.getSession()).toBeNull();
  });

  it("returns the exact same initPromise directly across concurrent calls", async () => {
    WalletConnectSingleton.resetInstance();
    const singleton = WalletConnectSingleton.getInstance();

    const p1 = singleton.initialize();
    const p2 = singleton.initialize();

    expect(p1).toBe(p2);
    const [res1, res2] = await Promise.all([p1, p2]);
    expect(res1).toBe(res2);
    expect(res1.isInitialized).toBe(true);
  });
});
