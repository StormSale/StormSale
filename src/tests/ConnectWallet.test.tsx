import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ConnectWallet } from "../components/shared/ConnectWallet";

// Mock Web3 Context & hook
const mockConnectWallet = vi.fn().mockResolvedValue(undefined);
let mockIsConnected = false;
let mockUserAddress: string | null = null;

vi.mock("../hooks/useWeb3", () => ({
  useWeb3: () => ({
    connectWallet: mockConnectWallet,
    isConnected: mockIsConnected,
    userAddress: mockUserAddress,
  }),
}));

// Mock WalletConnect Context & hook
const mockConnectWC = vi.fn().mockResolvedValue(undefined);
vi.mock("../context/WalletConnectContext", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../context/WalletConnectContext")>();
  return {
    ...actual,
    useWalletConnect: () => ({
      connect: mockConnectWC,
      disconnect: vi.fn(),
      ensureStellarNetwork: vi.fn().mockResolvedValue(true),
      clearError: vi.fn(),
      setShowNetworkModal: vi.fn(),
      provider: null,
      session: null,
      isConnecting: false,
      isSwitchingNetwork: false,
      error: null,
      showNetworkModal: false,
      isProviderReady: true,
    }),
  };
});

describe("[Web3] ConnectWallet QR Code Desktop-to-Mobile Component (#31)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsConnected = false;
    mockUserAddress = null;
  });

  it("renders default extension wallet buttons when not connected", () => {
    render(<ConnectWallet />);

    expect(screen.getByText("Connect Freighter")).toBeDefined();
    expect(screen.getByText("Mobile Wallet (Scan QR)")).toBeDefined();
    expect(screen.getByText("Demo Testnet Mode")).toBeDefined();
  });

  it("connects with freighter and mock connectors", async () => {
    render(<ConnectWallet />);

    const freighterBtn = screen.getByRole("button", { name: /Connect Freighter/i }) as HTMLButtonElement;
    fireEvent.click(freighterBtn);
    expect(mockConnectWallet).toHaveBeenCalledWith("freighter");

    await waitFor(() => {
      expect(freighterBtn.disabled).toBe(false);
    });

    const demoBtn = screen.getByRole("button", { name: /Demo Testnet Mode/i }) as HTMLButtonElement;
    fireEvent.click(demoBtn);
    expect(mockConnectWallet).toHaveBeenCalledWith("mock");
  });

  it("renders user address badge when connected", () => {
    mockIsConnected = true;
    mockUserAddress = "GABCD1234567890STORMTESTNET9876543210XYZW";

    render(<ConnectWallet />);

    expect(screen.getByTestId("connected-wallet-badge")).toBeDefined();
    expect(screen.getByText("GABCD1...XYZW")).toBeDefined();
  });

  it("opens desktop-to-mobile scanning interface with real-time QR generation", async () => {
    render(<ConnectWallet />);

    const openQrBtn = screen.getByTestId("open-mobile-pairing-button");
    fireEvent.click(openQrBtn);

    expect(screen.getByTestId("desktop-to-mobile-qr-interface")).toBeDefined();
    expect(screen.getByText("Scan with Mobile Wallet")).toBeDefined();
    expect(screen.getByTestId("connection-status-text")).toBeDefined();

    // Verify real-time QR code image generation
    await waitFor(() => {
      const qrImg = screen.getByTestId("pairing-qr-code");
      expect(qrImg).toBeDefined();
      expect(qrImg.getAttribute("src")).toMatch(/^data:image\/png;base64,/);
    });

    // Verify pairing code input populated with WalletConnect URI
    const codeInput = screen.getByTestId("pairing-code-input") as HTMLInputElement;
    expect(codeInput.value).toMatch(/^wc:wc_[a-z0-9]+@2\?relay-protocol=irn&symKey=[a-f0-9]{64}/);
  });

  it("copies pairing code to clipboard using fallback button with user feedback", async () => {
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: {
        writeText: writeTextMock,
      },
    });

    render(<ConnectWallet />);

    fireEvent.click(screen.getByTestId("open-mobile-pairing-button"));

    await waitFor(() => {
      expect(screen.getByTestId("pairing-qr-code")).toBeDefined();
    });

    const copyBtn = screen.getByTestId("copy-pairing-code-button");
    expect(screen.getByText("Copy Pairing Code")).toBeDefined();

    fireEvent.click(copyBtn);

    expect(writeTextMock).toHaveBeenCalled();
    await waitFor(() => {
      expect(screen.getByText("Copied!")).toBeDefined();
    });
  });

  it("provides direct deep-linking links for MetaMask and Rainbow", async () => {
    render(<ConnectWallet />);

    fireEvent.click(screen.getByTestId("open-mobile-pairing-button"));

    await waitFor(() => {
      expect(screen.getByTestId("pairing-qr-code")).toBeDefined();
    });

    const metamaskLink = screen.getByTestId("deep-link-metamask");
    const rainbowLink = screen.getByTestId("deep-link-rainbow");

    expect(metamaskLink.getAttribute("href")).toContain("https://metamask.app.link/wc?uri=wc%3A");
    expect(rainbowLink.getAttribute("href")).toContain("https://rainbow.me/wc?uri=wc%3A");
  });

  it("refreshes pairing code and regenerates dynamic QR code", async () => {
    render(<ConnectWallet />);

    fireEvent.click(screen.getByTestId("open-mobile-pairing-button"));

    await waitFor(() => {
      expect(screen.getByTestId("pairing-qr-code")).toBeDefined();
    });

    const initialUri = (screen.getByTestId("pairing-code-input") as HTMLInputElement).value;
    const refreshBtn = screen.getByLabelText("Refresh pairing code");

    fireEvent.click(refreshBtn);

    await waitFor(() => {
      const refreshedUri = (screen.getByTestId("pairing-code-input") as HTMLInputElement).value;
      expect(refreshedUri).not.toBe(initialUri);
      expect(refreshedUri).toMatch(/^wc:wc_[a-z0-9]+@2\?/);
    });
  });

  it("allows navigating back to standard wallet selection view", () => {
    render(<ConnectWallet />);

    fireEvent.click(screen.getByTestId("open-mobile-pairing-button"));
    expect(screen.getByTestId("desktop-to-mobile-qr-interface")).toBeDefined();

    const backBtn = screen.getByLabelText("Back to standard wallet options");
    fireEvent.click(backBtn);

    expect(screen.queryByTestId("desktop-to-mobile-qr-interface")).toBeNull();
    expect(screen.getByText("Connect Freighter")).toBeDefined();
  });

  it("completes WalletConnect connection from modal action", async () => {
    render(<ConnectWallet />);

    fireEvent.click(screen.getByTestId("open-mobile-pairing-button"));

    const completeBtn = screen.getByText("I've Approved on Mobile");
    fireEvent.click(completeBtn);

    expect(mockConnectWC).toHaveBeenCalled();
  });
});
