import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  WalletConnectSingleton,
  SESSION_WINDOW_MS,
  WALLETCONNECT_SESSION_KEY,
  formatMobileDeepLink,
  triggerMobileDeepLink,
  isMobileDevice,
} from "../context/WalletConnectContext";

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

describe("WalletConnectSingleton & Mobile Deep Linking", () => {
  const originalWindow = globalThis.window;
  let mockStorage: MockLocalStorage;

  beforeEach(() => {
    mockStorage = new MockLocalStorage();
    Object.defineProperty(window, "localStorage", {
      value: mockStorage,
      configurable: true,
      writable: true,
    });
    Object.defineProperty(globalThis, "localStorage", {
      value: mockStorage,
      configurable: true,
      writable: true,
    });

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
    const [p1, p2] = await Promise.all([singleton.initialize(), singleton.initialize()]);

    expect(p1).toBe(p2);
    expect(p1.isInitialized).toBe(true);
  });

  it("stores and restores session across simulated page refresh with 24-hour expiration window", async () => {
    const singleton = WalletConnectSingleton.getInstance();
    const provider = await singleton.initialize();

    const before = Date.now();
    const session = await provider.connect();
    expect(session.topic).toBeDefined();
    expect(session.expiresAt).toBeGreaterThanOrEqual(before + SESSION_WINDOW_MS);
    expect(singleton.isSessionValid()).toBe(true);
    expect(singleton.getSessionRemainingTime()).toBeGreaterThan(0);

    // Verify localStorage has persisted the session
    const stored = mockStorage.getItem(WALLETCONNECT_SESSION_KEY);
    expect(stored).toBeTruthy();
    expect(JSON.parse(stored!).topic).toBe(session.topic);

    // Simulate page refresh by resetting the singleton in-memory
    WalletConnectSingleton.resetInstance();
    const newSingleton = WalletConnectSingleton.getInstance();
    expect(newSingleton.getSession()?.topic).toBe(session.topic);
    expect(newSingleton.isSessionValid()).toBe(true);
  });

  it("prunes expired sessions older than the 24-hour window upon restore", () => {
    const expiredSession = {
      topic: "wc_expired_12345",
      peerMeta: { name: "StormSale Mobile" },
      connectedAt: Date.now() - (SESSION_WINDOW_MS + 60000), // 24 hours + 1 min ago
      expiresAt: Date.now() - 60000,
    };
    mockStorage.setItem(WALLETCONNECT_SESSION_KEY, JSON.stringify(expiredSession));

    WalletConnectSingleton.resetInstance();
    const singleton = WalletConnectSingleton.getInstance();

    expect(singleton.getSession()).toBeNull();
    expect(singleton.isSessionValid()).toBe(false);
    expect(singleton.getSessionRemainingTime()).toBe(0);
    expect(mockStorage.getItem(WALLETCONNECT_SESSION_KEY)).toBeNull();
  });

  it("cleans up session in storage upon disconnect", async () => {
    const singleton = WalletConnectSingleton.getInstance();
    const provider = await singleton.initialize();

    await provider.connect();
    expect(mockStorage.getItem(WALLETCONNECT_SESSION_KEY)).toBeTruthy();

    await provider.disconnect();
    expect(mockStorage.getItem(WALLETCONNECT_SESSION_KEY)).toBeNull();
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

  describe("Verified Deep-Linking for MetaMask and Rainbow", () => {
    const sampleWcUri = "wc:test-topic-12345@2?relay-protocol=irn&symKey=abcdef1234567890";

    it("verifies universal links for MetaMask", () => {
      const link = formatMobileDeepLink("metamask", sampleWcUri);
      expect(link).toBe(
        `https://metamask.app.link/wc?uri=${encodeURIComponent(sampleWcUri)}`
      );
    });

    it("verifies native scheme deep-linking for MetaMask", () => {
      const link = formatMobileDeepLink("metamask", sampleWcUri, { nativeScheme: true });
      expect(link).toBe(`metamask://wc?uri=${encodeURIComponent(sampleWcUri)}`);
    });

    it("verifies universal links for Rainbow", () => {
      const link = formatMobileDeepLink("rainbow", sampleWcUri);
      expect(link).toBe(`https://rainbow.me/wc?uri=${encodeURIComponent(sampleWcUri)}`);
    });

    it("verifies native scheme deep-linking for Rainbow", () => {
      const link = formatMobileDeepLink("rainbow", sampleWcUri, { nativeScheme: true });
      expect(link).toBe(`rainbow://wc?uri=${encodeURIComponent(sampleWcUri)}`);
    });

    it("verifies fallback for unsupported wallet or empty uri", () => {
      expect(formatMobileDeepLink("unknown" as any, sampleWcUri)).toBe(sampleWcUri);
      expect(formatMobileDeepLink("metamask", "")).toBe("");
    });

    it("triggers mobile deep link navigation safely", () => {
      const assignSpy = vi.fn();
      const testWindow = Object.create(window) as Window;
      Object.defineProperty(testWindow, "location", {
        configurable: true,
        value: { ...window.location, assign: assignSpy },
      });
      vi.stubGlobal("window", testWindow);

      try {
        const triggered = triggerMobileDeepLink("metamask", sampleWcUri);
        expect(triggered).toBe(true);
        expect(assignSpy).toHaveBeenCalled();
        expect(assignSpy.mock.calls[0][0]).toContain("https://metamask.app.link/wc");
      } finally {
        vi.unstubAllGlobals();
      }
    });

    it("detects mobile devices from user agent accurately", () => {
      const originalUa = navigator.userAgent;

      // iPhone
      Object.defineProperty(navigator, "userAgent", {
        value: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)",
        configurable: true,
      });
      expect(isMobileDevice()).toBe(true);

      // Desktop Chrome
      Object.defineProperty(navigator, "userAgent", {
        value: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        configurable: true,
      });
      expect(isMobileDevice()).toBe(false);

      Object.defineProperty(navigator, "userAgent", {
        value: originalUa,
        configurable: true,
      });
    });
  });
});
