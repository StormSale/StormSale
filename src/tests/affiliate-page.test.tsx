// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Affiliate } from "../pages/Affiliate";

vi.mock("../components/shared/Sidebar", () => ({
  Sidebar: ({
    tabs,
    onTabChange,
    onBack,
  }: {
    tabs: Array<{ id: string; label: string }>;
    onTabChange: (tab: string) => void;
    onBack: () => void;
  }) => (
    <nav>
      {tabs.map((tab) => (
        <button key={tab.id} onClick={() => onTabChange(tab.id)}>
          {tab.label}
        </button>
      ))}
      <button onClick={onBack}>Go back</button>
    </nav>
  ),
}));
vi.mock("../components/shared/ThemeToggle", () => ({ ThemeToggle: () => <span>Theme</span> }));
vi.mock("../components/affiliate/JoinCampaignButton", () => ({
  JoinCampaignButton: () => <div>Join campaign content</div>,
}));
vi.mock("../components/affiliate/SalesList", () => ({
  SalesList: () => <div>Sales content</div>,
}));
vi.mock("../components/affiliate/ClaimPayouts", () => ({
  ClaimPayouts: () => <div>Payout content</div>,
}));
vi.mock("../components/affiliate/AffiliateOverview", () => ({
  AffiliateOverview: ({
    onNavigate,
    onNavigateToLeaderboard,
    onNavigateToMilestones,
  }: {
    onNavigate?: (tab: string) => void;
    onNavigateToLeaderboard?: () => void;
    onNavigateToMilestones?: () => void;
  }) => (
    <div>
      Overview content
      <button onClick={() => onNavigate?.("custom-links")}>Open short links</button>
      <button onClick={() => onNavigateToLeaderboard?.()}>Go to leaderboard</button>
      <button onClick={() => onNavigateToMilestones?.()}>Go to milestones</button>
    </div>
  ),
}));
vi.mock("../components/affiliate/ClickStreamHeatmap", () => ({
  AffiliateClickStreamHeatmap: () => <div>Click heatmap content</div>,
}));
vi.mock("../components/affiliate/TelegramCampaignBrowser", () => ({
  TelegramCampaignBrowser: () => <div>Telegram campaign content</div>,
}));
vi.mock("../components/affiliate/CustomLinksManager", () => ({
  CustomLinksManager: () => <div>Short-link manager content</div>,
}));
vi.mock("../components/affiliate/CampaignApplication", () => ({
  CampaignApplication: () => <div>Campaign application content</div>,
}));
vi.mock("../components/affiliate/AffiliateLeaderboard", () => ({
  AffiliateLeaderboard: ({ onSelectMilestones }: { onSelectMilestones?: () => void }) => (
    <div>
      Leaderboard content
      <button onClick={() => onSelectMilestones?.()}>Claim from leaderboard</button>
    </div>
  ),
}));
vi.mock("../components/affiliate/MilestoneBadges", () => ({
  MilestoneBadges: () => <div>Milestone badges content</div>,
}));
vi.mock("../components/affiliate/AffiliateSettings", () => ({
  AffiliateSettings: () => <div>Affiliate settings content</div>,
}));
vi.mock("../components/affiliate/TelegramAlertsCard", () => ({
  TelegramAlertsCard: () => <div>Telegram alerts content</div>,
}));
vi.mock("../components/affiliate/AffiliatePerformanceCharts", () => ({
  AffiliatePerformanceCharts: () => <div>Performance charts content</div>,
}));
vi.mock("../context/NotificationContext", () => ({
  NotificationProvider: ({ children }: { children: React.ReactNode }) => children,
  useNotification: () => ({ showNotification: () => "", dismissNotification: () => {} }),
}));
vi.mock("../lib/telegram", () => ({ isTelegramMiniApp: () => false }));

describe("Affiliate page navigation", () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => cleanup());

  it("navigates between affiliate sections, settings, and the default overview", async () => {
    const onBack = vi.fn();
    render(<Affiliate onBack={onBack} />);
    expect(screen.getByText("Overview content")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Click Heatmap" }));
    expect(await screen.findByText("Click heatmap content")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Telegram Campaigns" }));
    expect(await screen.findByText("Telegram campaign content")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Custom Short Links" }));
    expect(await screen.findByText("Short-link manager content")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Join Campaign" }));
    expect(await screen.findByText("Join campaign content")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Apply & Tracking Links" }));
    expect(await screen.findByText("Campaign application content")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "My Sales & Commissions" }));
    expect(await screen.findByText("Sales content")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Claim Payouts" }));
    expect(await screen.findByText("Payout content")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Performance Analytics" }));
    expect(await screen.findByText("Performance charts content")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Personalized Settings" }));
    expect(await screen.findByText("Affiliate settings content")).toBeTruthy();
    expect(screen.getByText("Telegram alerts content")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Preferences" }));
    expect(screen.getByText("Affiliate settings content")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Security & Keys" }));
    expect(await screen.findByText("Overview content")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Open short links" }));
    expect(await screen.findByText("Short-link manager content")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Go back" }));
    expect(onBack).toHaveBeenCalledOnce();
  });

  it("routes the leaderboard and milestone tabs and their cross-navigation", async () => {
    render(<Affiliate onBack={vi.fn()} />);

    // From overview, jump straight to the leaderboard tab (covers overview callbacks).
    fireEvent.click(screen.getByRole("button", { name: "Go to leaderboard" }));
    expect(await screen.findByText("Leaderboard content")).toBeTruthy();

    // Leaderboard can deep-link to milestones.
    fireEvent.click(screen.getByRole("button", { name: "Claim from leaderboard" }));
    expect(await screen.findByText("Milestone badges content")).toBeTruthy();

    // Back to overview, then straight to milestones.
    fireEvent.click(screen.getByRole("button", { name: "Dashboard Overview" }));
    await screen.findByText("Overview content");
    fireEvent.click(screen.getByRole("button", { name: "Go to milestones" }));
    expect(await screen.findByText("Milestone badges content")).toBeTruthy();
  });

  it("honors an initial tab and ignores unknown initial tabs", () => {
    const { unmount } = render(<Affiliate onBack={vi.fn()} initialTab="milestones" />);
    expect(screen.getByText("Milestone badges content")).toBeTruthy();
    unmount();

    localStorage.clear();
    render(<Affiliate onBack={vi.fn()} initialTab="not-a-tab" />);
    expect(screen.getByText("Overview content")).toBeTruthy();
  });
});
