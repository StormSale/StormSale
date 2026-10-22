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
  AffiliateOverview: ({ onNavigate }: { onNavigate?: (tab: string) => void }) => (
    <div>
      Overview content
      <button onClick={() => onNavigate?.("custom-links")}>Open short links</button>
    </div>
  ),
}));
vi.mock("../components/affiliate/TelegramCampaignBrowser", () => ({
  TelegramCampaignBrowser: () => <div>Telegram campaign content</div>,
}));
vi.mock("../components/affiliate/CustomLinksManager", () => ({
  CustomLinksManager: () => <div>Short-link manager content</div>,
}));
vi.mock("../components/affiliate/AffiliateSettings", () => ({
  AffiliateSettings: () => <div>Affiliate settings content</div>,
}));
vi.mock("../context/NotificationContext", () => ({
  NotificationProvider: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock("../lib/telegram", () => ({ isTelegramMiniApp: () => false }));

describe("Affiliate page navigation", () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => cleanup());

  it("navigates between affiliate sections, settings, and the default overview", async () => {
    const onBack = vi.fn();
    render(<Affiliate onBack={onBack} />);
    expect(screen.getByText("Overview content")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Telegram Campaigns" }));
    expect(await screen.findByText("Telegram campaign content")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Custom Short Links" }));
    expect(await screen.findByText("Short-link manager content")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Join Campaign" }));
    expect(await screen.findByText("Join campaign content")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "My Sales & Commissions" }));
    expect(await screen.findByText("Sales content")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Claim Payouts" }));
    expect(await screen.findByText("Payout content")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Personalized Settings" }));
    expect(await screen.findByText("Affiliate settings content")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Preferences" }));
    expect(screen.getByText("Affiliate settings content")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Security & Keys" }));
    expect(await screen.findByText("Overview content")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Open short links" }));
    expect(await screen.findByText("Short-link manager content")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Go back" }));
    expect(onBack).toHaveBeenCalledOnce();
  });
});
