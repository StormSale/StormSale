// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "../App";

const mocks = vi.hoisted(() => ({
  isConnected: false,
  telegramMode: false,
  throwDashboard: false,
  initTelegramWebApp: vi.fn(),
  syncTelegramTheme: vi.fn(() => vi.fn()),
  loadBrandConfig: vi.fn(() => ({ name: "Campaign" })),
  openWalletModal: vi.fn(),
}));

vi.mock("../context/Web3Context", () => ({
  useWeb3: () => ({ isConnected: mocks.isConnected, openWalletModal: mocks.openWalletModal }),
  Web3Provider: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock("../context/WalletConnectContext", () => ({
  WalletConnectProvider: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock("../context/NotificationContext", () => ({
  NotificationProvider: ({ children }: { children: React.ReactNode }) => children,
  NotificationWrapper: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock("../hooks/usePreference", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../hooks/usePreference")>();
  const React = await import("react");
  return {
    ...actual,
    usePreference: (_key: string, initialValue: unknown) => React.useState(initialValue),
  };
});
vi.mock("../lib/telegram", () => ({
  initTelegramWebApp: mocks.initTelegramWebApp,
  syncTelegramTheme: mocks.syncTelegramTheme,
  isTelegramMiniApp: () => mocks.telegramMode,
}));
vi.mock("../lib/branding", () => ({ loadBrandConfig: mocks.loadBrandConfig }));
vi.mock("../components/shared/ConnectWalletModal", () => ({ ConnectWalletModal: () => null }));
vi.mock("../components/shared/MultiSigApprovalModal", () => ({
  MultiSigApprovalModal: () => null,
}));
vi.mock("../components/shared/RpcStatusModal", () => ({ RpcStatusModal: () => null }));
vi.mock("../components/shared/Header", () => ({ Header: () => null }));
vi.mock("../components/auth/ProtectedRoute", () => ({
  ProtectedRoute: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock("../components/ui/tooltip", () => ({
  TooltipProvider: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock("../components/affiliate/ShortLinkRedirect", () => ({
  ShortLinkRedirect: () => <div>Short-link redirect view</div>,
}));
vi.mock("../components/shared/BrandedCampaignView", () => ({
  BrandedCampaignView: ({ onClose }: { onClose: () => void }) => (
    <div>
      Branded campaign view
      <button onClick={onClose}>Close campaign</button>
    </div>
  ),
}));
vi.mock("../pages/Landing", () => ({ Landing: () => <div>Landing page</div> }));
vi.mock("../components/affiliate/AffiliateLeaderboard", () => ({
  AffiliateLeaderboard: ({ onSelectMilestones }: { onSelectMilestones?: () => void }) => (
    <div>
      Public leaderboard stub
      <button onClick={() => onSelectMilestones?.()}>Stub claim milestones</button>
    </div>
  ),
}));
vi.mock("../pages/Dashboard", () => ({
  Dashboard: ({ onNavigate }: { onNavigate: (page: string) => void }) => {
    if (mocks.throwDashboard) throw new Error("dashboard failed");
    return (
      <div>
        Dashboard page
        <button onClick={() => onNavigate("advertiser")}>Open advertiser</button>
        <button onClick={() => onNavigate("affiliate")}>Open affiliate</button>
        <button onClick={() => onNavigate("leaderboard")}>Open leaderboard page</button>
        <button onClick={() => onNavigate("milestones")}>Open milestones page</button>
        <button onClick={() => onNavigate("auditor")}>Open auditor</button>
        <button onClick={() => onNavigate("not-a-page")}>Invalid destination</button>
        <button
          onClick={() => {
            mocks.isConnected = false;
            onNavigate("affiliate");
          }}
        >
          Disconnect wallet
        </button>
      </div>
    );
  },
}));
vi.mock("../pages/Advertiser", () => ({
  Advertiser: ({ onBack }: { onBack: () => void }) => (
    <div>
      Advertiser page
      <button onClick={onBack}>Back to dashboard</button>
    </div>
  ),
}));
vi.mock("../pages/Affiliate", () => ({
  Affiliate: ({ onBack }: { onBack: () => void }) => (
    <div>
      Affiliate page
      <button onClick={onBack}>Back to dashboard</button>
    </div>
  ),
}));
vi.mock("../pages/Auditor", () => ({
  Auditor: ({ onBack }: { onBack: () => void }) => (
    <div>
      Auditor page
      <button onClick={onBack}>Back to dashboard</button>
    </div>
  ),
}));

describe("App routing", () => {
  beforeEach(() => {
    mocks.isConnected = false;
    mocks.telegramMode = false;
    mocks.throwDashboard = false;
    localStorage.clear();
    window.history.replaceState({}, "", "/");
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("renders the landing route and navigates through protected role pages", async () => {
    mocks.isConnected = true;
    render(<App />);
    expect(await screen.findByText("Dashboard page")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Open advertiser" }));
    expect(await screen.findByText("Advertiser page")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Back to dashboard" }));

    fireEvent.click(await screen.findByRole("button", { name: "Open affiliate" }));
    expect(await screen.findByText("Affiliate page")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Back to dashboard" }));

    fireEvent.click(await screen.findByRole("button", { name: "Open auditor" }));
    expect(await screen.findByText("Auditor page")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Back to dashboard" }));

    fireEvent.click(await screen.findByRole("button", { name: "Invalid destination" }));
    expect(screen.getByText("Dashboard page")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Disconnect wallet" }));
    expect(await screen.findByText("Landing page")).toBeTruthy();
  });

  it("renders short links and branded campaign routes without dashboard providers", async () => {
    window.history.replaceState({}, "", "/c/custom-slug?source=share");
    const { unmount } = render(<App />);
    expect(screen.getByText("Short-link redirect view")).toBeTruthy();
    unmount();

    window.history.replaceState({}, "", "/?brand=partner-campaign");
    render(<App />);
    expect(await screen.findByText("Branded campaign view")).toBeTruthy();
    expect(mocks.loadBrandConfig).toHaveBeenCalledWith("partner-campaign");
    fireEvent.click(screen.getByRole("button", { name: "Close campaign" }));
    expect(await screen.findByText("Landing page")).toBeTruthy();
  });

  it("routes Telegram mini-app sessions to the affiliate page", async () => {
    mocks.telegramMode = true;
    render(<App />);
    expect(await screen.findByText("Affiliate page")).toBeTruthy();
  });

  it("renders the public leaderboard view and its disconnected actions", async () => {
    mocks.isConnected = false;
    window.history.replaceState({}, "", "/?view=leaderboard");
    render(<App />);
    expect(await screen.findByText("Public leaderboard stub")).toBeTruthy();

    // onSelectMilestones without a wallet should open the connect modal.
    fireEvent.click(screen.getByRole("button", { name: "Stub claim milestones" }));
    expect(mocks.openWalletModal).toHaveBeenCalled();

    // Back to StormSale drops out of the public leaderboard view.
    fireEvent.click(screen.getByRole("button", { name: /Back to StormSale/ }));
    expect(await screen.findByText("Landing page")).toBeTruthy();
  });

  it("renders the public leaderboard view actions for a connected wallet", async () => {
    mocks.isConnected = true;
    window.history.replaceState({}, "", "/?view=leaderboard");
    render(<App />);
    expect(await screen.findByText("Public leaderboard stub")).toBeTruthy();

    // The header CTA enters the affiliate dashboard.
    fireEvent.click(screen.getByRole("button", { name: /Affiliate Dashboard/ }));
    expect(await screen.findByText("Affiliate page")).toBeTruthy();
  });

  it("routes leaderboard and milestone roles to the affiliate page", async () => {
    mocks.isConnected = true;
    render(<App />);
    expect(await screen.findByText("Dashboard page")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Open leaderboard page" }));
    expect(await screen.findByText("Affiliate page")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Back to dashboard" }));
    expect(await screen.findByText("Dashboard page")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Open milestones page" }));
    expect(await screen.findByText("Affiliate page")).toBeTruthy();
  });

  it("shows the error boundary when a page throws", async () => {
    mocks.isConnected = true;
    mocks.throwDashboard = true;
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    render(<App />);
    expect(await screen.findByText("Something went wrong")).toBeTruthy();
    expect(error).toHaveBeenCalled();
  });
});
