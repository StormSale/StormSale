// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import App, { PageLoader } from "../App";

const mockState = vi.hoisted(() => ({
  connected: false,
  telegram: false,
  throwLanding: false,
  initTelegram: vi.fn(),
  cleanupTheme: vi.fn(),
}));

vi.mock("../context/Web3Context", () => ({
  Web3Provider: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock("../context/WalletConnectContext", () => ({
  WalletConnectProvider: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock("../context/NotificationContext", () => ({
  NotificationProvider: ({ children }: { children: React.ReactNode }) => children,
  NotificationWrapper: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock("../hooks/useWeb3", () => ({
  useWeb3: () => ({ isConnected: mockState.connected }),
}));
vi.mock("../lib/telegram", () => ({
  initTelegramWebApp: mockState.initTelegram,
  syncTelegramTheme: () => mockState.cleanupTheme,
  isTelegramMiniApp: () => mockState.telegram,
}));
vi.mock("../components/shared/ConnectWalletModal", () => ({ ConnectWalletModal: () => null }));
vi.mock("../components/shared/MultiSigApprovalModal", () => ({
  MultiSigApprovalModal: () => null,
}));
vi.mock("../components/shared/RpcStatusModal", () => ({ RpcStatusModal: () => null }));
vi.mock("../components/shared/Header", () => ({
  Header: ({ onNavigate }: { onNavigate: (page: string) => void }) => (
    <button onClick={() => onNavigate("advertiser")}>Header navigate</button>
  ),
}));
vi.mock("../components/auth/ProtectedRoute", () => ({
  ProtectedRoute: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock("../components/ui/tooltip", () => ({
  TooltipProvider: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock("../components/affiliate/ShortLinkRedirect", () => ({
  ShortLinkRedirect: () => null,
}));
vi.mock("../lib/branding", () => ({ loadBrandConfig: (slug: string) => ({ slug }) }));
vi.mock("../pages/Landing", () => ({
  Landing: () => {
    if (mockState.throwLanding) throw new Error("Landing render failed");
    return <div>Landing page</div>;
  },
}));
vi.mock("../pages/Dashboard", () => ({
  Dashboard: ({ onNavigate }: { onNavigate: (page: string) => void }) => (
    <div>
      <p>Dashboard page</p>
      <button onClick={() => onNavigate("advertiser")}>Open advertiser</button>
      <button onClick={() => onNavigate("affiliate")}>Open affiliate</button>
      <button onClick={() => onNavigate("auditor")}>Open auditor</button>
      <button onClick={() => onNavigate("invalid")}>Open invalid page</button>
    </div>
  ),
}));
vi.mock("../pages/Advertiser", () => ({
  Advertiser: ({ onBack }: { onBack: () => void }) => (
    <button onClick={onBack}>Advertiser page</button>
  ),
}));
vi.mock("../pages/Affiliate", () => ({
  Affiliate: ({ onBack }: { onBack: () => void }) => (
    <button onClick={onBack}>Affiliate page</button>
  ),
}));
vi.mock("../pages/Auditor", () => ({
  Auditor: ({ onBack }: { onBack: () => void }) => <button onClick={onBack}>Auditor page</button>,
}));
vi.mock("../components/shared/BrandedCampaignView", () => ({
  BrandedCampaignView: ({
    brandConfig,
    onClose,
  }: {
    brandConfig: { slug: string };
    onClose: () => void;
  }) => (
    <div>
      <span>Brand: {brandConfig.slug}</span>
      <button onClick={onClose}>Close brand</button>
    </div>
  ),
}));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

beforeEach(() => {
  mockState.connected = false;
  mockState.telegram = false;
  mockState.throwLanding = false;
  window.localStorage.clear();
  window.history.replaceState({}, "", "/");
});

describe("App router integration", () => {
  it("renders the loading fallback with an accessible status", () => {
    render(<PageLoader />);
    expect(screen.getByRole("status", { name: "Loading page" })).toBeTruthy();
    expect(screen.getByText("Loading view...")).toBeTruthy();
  });

  it("shows the landing page when disconnected outside Telegram", async () => {
    render(<App />);
    expect(await screen.findByText("Landing page")).toBeTruthy();
    expect(mockState.initTelegram).toHaveBeenCalledOnce();
  });

  it("routes through each authenticated dashboard and ignores invalid destinations", async () => {
    mockState.connected = true;
    const view = render(<App />);
    expect(await screen.findByText("Dashboard page")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Header navigate" }));
    expect(await screen.findByRole("button", { name: "Advertiser page" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Advertiser page" }));
    expect(await screen.findByText("Dashboard page")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Open affiliate" }));
    expect(await screen.findByRole("button", { name: "Affiliate page" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Affiliate page" }));
    expect(await screen.findByText("Dashboard page")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Open auditor" }));
    expect(await screen.findByRole("button", { name: "Auditor page" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Auditor page" }));
    expect(await screen.findByText("Dashboard page")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Open invalid page" }));
    expect(screen.getByText("Dashboard page")).toBeTruthy();
    view.unmount();
  });

  it("uses affiliate as the Telegram default and can return to landing", async () => {
    mockState.telegram = true;
    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: "Affiliate page" }));
    expect(await screen.findByText("Landing page")).toBeTruthy();
  });

  it("opens and closes a branded campaign selected by query parameter", async () => {
    window.history.replaceState({}, "", "/?c=campaign-42");
    render(<App />);
    expect(await screen.findByText("Brand: campaign-42")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Close brand" }));
    await waitFor(() => expect(window.location.search).toBe(""));
    expect(await screen.findByText("Landing page")).toBeTruthy();
  });

  it("shows the error boundary fallback when a page throws", async () => {
    mockState.throwLanding = true;
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const reload = vi.fn();
    const testWindow = Object.create(window) as Window;
    Object.defineProperty(testWindow, "location", {
      configurable: true,
      value: { ...window.location, reload },
    });
    vi.stubGlobal("window", testWindow);

    render(<App />);
    expect(await screen.findByText("Something went wrong")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Reload" }));
    expect(reload).toHaveBeenCalledOnce();
    expect(errorSpy).toHaveBeenCalled();
  });
});
