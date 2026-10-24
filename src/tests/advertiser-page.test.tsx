// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../config/stellar", () => ({
  STELLAR_CONFIG: { contractId: "CCONTRACT", network: "TESTNET" },
}));
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
          {`tab:${tab.label}`}
        </button>
      ))}
      <button onClick={onBack}>Go back</button>
    </nav>
  ),
}));
vi.mock("../context/NotificationContext", () => ({
  NotificationProvider: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock("../components/advertiser/ContractTTLRestorer", () => ({
  ContractTTLRestorer: () => <div>TTL restorer</div>,
}));

const { stub } = vi.hoisted(() => ({
  stub: (name: string) => () => <div>{`${name} content`}</div>,
}));
vi.mock("../components/advertiser/CreateCampaignForm", () => ({
  CreateCampaignForm: stub("Create"),
}));
vi.mock("../components/advertiser/LogSaleForm", () => ({ LogSaleForm: stub("Log sale") }));
vi.mock("../components/advertiser/GrantAccessForm", () => ({ GrantAccessForm: stub("Grant") }));
vi.mock("../components/advertiser/CampaignAnalytics", () => ({
  CampaignAnalytics: stub("Analytics"),
}));
vi.mock("../components/advertiser/MyCampaignsList", () => ({
  MyCampaignsList: stub("My campaigns"),
}));
vi.mock("../components/advertiser/WebhookManager", () => ({ WebhookManager: stub("Webhooks") }));
vi.mock("../components/advertiser/BrandCustomizer", () => ({ BrandCustomizer: stub("Branding") }));
vi.mock("../components/advertiser/AuditAccessPortal", () => ({
  AuditAccessPortal: stub("Audit logs"),
}));
vi.mock("../components/advertiser/CohortVisualizer", () => ({ CohortVisualizer: stub("Cohort") }));
vi.mock("../components/advertiser/AffiliateApplicationsQueue", () => ({
  AffiliateApplicationsQueue: stub("Applications"),
}));

import { Advertiser } from "../pages/Advertiser";

describe("Advertiser page navigation", () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => cleanup());

  it("opens every section from the sidebar, including Affiliate Applications", async () => {
    const onBack = vi.fn();
    render(<Advertiser onBack={onBack} />);
    expect(screen.getByText("TTL restorer")).toBeTruthy();

    const sections: Array<[string, string]> = [
      ["Create Campaign", "Create content"],
      ["My Campaigns", "My campaigns content"],
      ["Affiliate Applications", "Applications content"],
      ["Storefront & Branding", "Branding content"],
      ["Log Encrypted Sale", "Log sale content"],
      ["Cohort & LTV Analysis", "Cohort content"],
      ["Postback Webhooks", "Webhooks content"],
      ["Grant Audit Access", "Grant content"],
      ["Audit Access Logs", "Audit logs content"],
      ["Campaign Analytics", "Analytics content"],
    ];
    for (const [tab, content] of sections) {
      fireEvent.click(screen.getByRole("button", { name: `tab:${tab}` }));
      expect(await screen.findByText(content)).toBeTruthy();
    }

    fireEvent.click(screen.getByRole("button", { name: "tab:Dashboard Overview" }));
    expect(await screen.findByText("TTL restorer")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Go back" }));
    expect(onBack).toHaveBeenCalledOnce();
  });

  it("remembers the Affiliate Applications tab across reloads", async () => {
    render(<Advertiser onBack={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "tab:Affiliate Applications" }));
    expect(await screen.findByText("Applications content")).toBeTruthy();
    cleanup();

    render(<Advertiser onBack={vi.fn()} />);
    expect(await screen.findByText("Applications content")).toBeTruthy();
  });

  it("navigates from the overview's shortcuts", async () => {
    render(<Advertiser onBack={vi.fn()} />);
    const shortcuts = () =>
      screen
        .getAllByRole("button")
        .filter((b) => !b.textContent?.startsWith("tab:") && b.textContent !== "Go back");
    const count = shortcuts().length;
    expect(count).toBeGreaterThan(0);
    for (let i = 0; i < count; i++) {
      fireEvent.click(shortcuts()[i]);
      // Each shortcut leaves the overview for a section; return to try the next.
      fireEvent.click(screen.getByRole("button", { name: "tab:Dashboard Overview" }));
      await screen.findByText("TTL restorer");
    }
  });
});
