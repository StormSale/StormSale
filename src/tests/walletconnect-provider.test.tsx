import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import {
  WalletConnectProvider,
  useWalletConnect,
  WalletConnectSingleton,
  SESSION_WINDOW_MS,
  WALLETCONNECT_SESSION_KEY,
} from "../context/WalletConnectContext";

// Mock Web3 Context & hook
const mockConnectWallet = vi.fn().mockResolvedValue(undefined);
const mockDisconnectWallet = vi.fn();
const mockSwitchToStellarNetwork = vi.fn().mockResolvedValue(true);
let mockIsConnected = false;
let mockIsStellarNetwork = true;

vi.mock("../context/Web3Context", () => ({
  useWeb3: () => ({
    connectWallet: mockConnectWallet,
    disconnectWallet: mockDisconnectWallet,
    switchToStellarNetwork: mockSwitchToStellarNetwork,
    isConnected: mockIsConnected,
    isStellarNetwork: mockIsStellarNetwork,
  }),
}));

const TestConsumer: React.FC = () => {
  const {
    isConnecting,
    isProviderReady,
    isSessionActive,
    sessionRemainingTime,
    error,
    showNetworkModal,
    connect,
    disconnect,
    ensureStellarNetwork,
    clearError,
    setShowNetworkModal,
    formatDeepLink,
    triggerDeepLink,
    isMobileDevice,
  } = useWalletConnect();

  return (
    <div>
      <div data-testid="is-ready">{String(isProviderReady)}</div>
      <div data-testid="is-connecting">{String(isConnecting)}</div>
      <div data-testid="is-session-active">{String(isSessionActive)}</div>
      <div data-testid="remaining-time">{String(sessionRemainingTime)}</div>
      <div data-testid="error-message">{error || "none"}</div>
      <div data-testid="show-network-modal">{String(showNetworkModal)}</div>
      <div data-testid="is-mobile">{String(isMobileDevice())}</div>
      <button data-testid="btn-connect" onClick={() => connect()}>
        Connect
      </button>
      <button data-testid="btn-disconnect" onClick={() => disconnect()}>
        Disconnect
      </button>
      <button data-testid="btn-switch-net" onClick={() => ensureStellarNetwork()}>
        Switch Net
      </button>
      <button data-testid="btn-clear-error" onClick={() => clearError()}>
        Clear Error
      </button>
      <button data-testid="btn-set-modal" onClick={() => setShowNetworkModal(true)}>
        Set Modal
      </button>
      <div data-testid="deep-link">{formatDeepLink("metamask", "wc:sample@2")}</div>
      <button data-testid="btn-trigger" onClick={() => triggerDeepLink("rainbow", "wc:sample@2")}>
        Trigger
      </button>
    </div>
  );
};

describe("WalletConnectProvider & useWalletConnect", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    WalletConnectSingleton.resetInstance();
    localStorage.clear();
    mockIsConnected = false;
    mockIsStellarNetwork = true;
  });

  it("throws when useWalletConnect is called outside provider", () => {
    const BadComponent = () => {
      useWalletConnect();
      return null;
    };
    expect(() => render(<BadComponent />)).toThrow(
      "useWalletConnect must be used within a WalletConnectProvider"
    );
  });

  it("initializes singleton and provides state to consumer", async () => {
    render(
      <WalletConnectProvider>
        <TestConsumer />
      </WalletConnectProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId("is-ready").textContent).toBe("true");
    });
  });

  it("handles connect and updates session state", async () => {
    render(
      <WalletConnectProvider>
        <TestConsumer />
      </WalletConnectProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId("is-ready").textContent).toBe("true");
    });

    fireEvent.click(screen.getByTestId("btn-connect"));

    await waitFor(() => {
      expect(mockConnectWallet).toHaveBeenCalled();
      expect(screen.getByTestId("is-session-active").textContent).toBe("true");
    });
  });

  it("handles disconnect and clears state", async () => {
    render(
      <WalletConnectProvider>
        <TestConsumer />
      </WalletConnectProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId("is-ready").textContent).toBe("true");
    });

    fireEvent.click(screen.getByTestId("btn-connect"));
    await waitFor(() => {
      expect(screen.getByTestId("is-session-active").textContent).toBe("true");
    });

    fireEvent.click(screen.getByTestId("btn-disconnect"));
    expect(mockDisconnectWallet).toHaveBeenCalled();
    expect(screen.getByTestId("is-session-active").textContent).toBe("false");
  });

  it("ensures Stellar network and handles network modal triggers", async () => {
    mockIsStellarNetwork = false;
    render(
      <WalletConnectProvider>
        <TestConsumer />
      </WalletConnectProvider>
    );

    fireEvent.click(screen.getByTestId("btn-switch-net"));
    await waitFor(() => {
      expect(mockSwitchToStellarNetwork).toHaveBeenCalled();
    });

    fireEvent.click(screen.getByTestId("btn-set-modal"));
    expect(screen.getByTestId("show-network-modal").textContent).toBe("true");

    fireEvent.click(screen.getByTestId("btn-clear-error"));
    expect(screen.getByTestId("error-message").textContent).toBe("none");
  });

  it("formats deep link and triggers deep link navigation", () => {
    const assignSpy = vi.fn();
    const testWindow = Object.create(window) as Window;
    Object.defineProperty(testWindow, "location", {
      configurable: true,
      value: { ...window.location, assign: assignSpy },
    });
    vi.stubGlobal("window", testWindow);

    try {
      render(
        <WalletConnectProvider>
          <TestConsumer />
        </WalletConnectProvider>
      );

      expect(screen.getByTestId("deep-link").textContent).toContain("https://metamask.app.link/wc?uri=");

      fireEvent.click(screen.getByTestId("btn-trigger"));
      expect(assignSpy).toHaveBeenCalled();
      expect(assignSpy.mock.calls[0][0]).toContain("https://rainbow.me/wc?uri=");
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("auto-reconnects when valid session exists in storage within 24-hour window", async () => {
    const validSession = {
      topic: "wc_valid_session_999",
      peerMeta: { name: "StormSale Mobile" },
      connectedAt: Date.now() - 3600000, // 1 hour ago
      expiresAt: Date.now() + (SESSION_WINDOW_MS - 3600000), // 23 hours remaining
    };
    localStorage.setItem(WALLETCONNECT_SESSION_KEY, JSON.stringify(validSession));

    render(
      <WalletConnectProvider>
        <TestConsumer />
      </WalletConnectProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId("is-session-active").textContent).toBe("true");
      expect(mockConnectWallet).toHaveBeenCalledWith("mock");
    });
  });
});
