// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import React from "react";
import { Auditor } from "../pages/Auditor";

const mocks = vi.hoisted(() => ({
  org: { id: "org-1", name: "Test Org", saleIds: ["sale-1"] },
  organizations: [
    { id: "org-1", name: "Test Org", saleIds: ["sale-1"] },
    { id: "org-2", name: "Other Org", saleIds: ["sale-2"] },
  ],
  switchTenant: vi.fn(),
  cachedKeyIds: [],
}));

vi.mock("../context/NotificationContext", () => ({
  NotificationProvider: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock("../context/AuditorTenancyContext", () => ({
  AuditorTenancyProvider: ({ children }: { children: React.ReactNode }) => children,
  useAuditorTenancy: () => mocks,
}));
vi.mock("../hooks/usePreference", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../hooks/usePreference")>();
  return {
    ...actual,
    usePreference: (_key: string, initialValue: unknown) =>
      [initialValue, vi.fn()] as [unknown, (val: unknown) => void]
  };
});

vi.mock("../components/shared/Sidebar", () => ({
  Sidebar: ({
    activeTab,
    onTabChange,
    tabs,
    onBack,
    roleName,
  }: {
    activeTab: string;
    onTabChange: (tab: string) => void;
    tabs: Array<{ id: string; label: string; icon: React.ComponentType }>;
    onBack?: () => void;
    roleName?: string;
  }) => (
    <div data-testid="auditor-sidebar">
      {tabs.map((t) => (
        <button
          key={t.id}
          onClick={() => onTabChange(t.id)}
          data-tab={t.id}
          aria-pressed={activeTab === t.id}
        >
          {t.label}
        </button>
      ))}
    </div>
  ),
}));
vi.mock("../components/auditor/AuditorOverview", () => ({
  AuditorOverview: () => <div data-testid="auditor-overview">Auditor Overview</div>,
}));
vi.mock("../components/auditor/VerifyAccess", () => ({
  VerifyAccess: () => <div data-testid="verify-access">Verify Access</div>,
}));
vi.mock("../components/auditor/AuditHistory", () => ({
  AuditHistory: () => <div data-testid="audit-history">Audit History</div>,
}));
vi.mock("../components/auditor/ComplianceReport", () => ({
  ComplianceReport: () => <div data-testid="compliance-report">Compliance Report</div>,
}));
vi.mock("../components/auditor/MerkleTreeVisualizer", () => ({
  MerkleTreeVisualizer: () => (
    <div data-testid="merkle-tree">Merkle Tree Visualizer</div>
  ),
}));
vi.mock("../components/auditor/Soc2EvidenceExport", () => ({
  Soc2EvidenceExport: () => <div data-testid="soc2-evidence">SOC 2 Evidence</div>,
}));
vi.mock("../components/auditor/NetworkRiskVisualizer", () => ({
  NetworkRiskVisualizer: () => (
    <div data-testid="network-risk">Network Risk Visualizer</div>,
  ),
}));
vi.mock("../components/auditor/PrivacyVerification", () => ({
  PrivacyVerification: () => (
    <div data-testid="privacy-verification">Privacy Verification</div>
  ),
}));
vi.mock("../components/shopify/ShopifyWebhookGateway", () => ({
  ShopifyWebhookGateway: () => (
    <div data-testid="shopify-webhook">Shopify Webhook Gateway</div>
  ),
}));

describe("Auditor Page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("renders auditor layout with sidebar and default overview tab", () => {
    render(<Auditor onBack={vi.fn()} />);

    expect(screen.getByTestId("auditor-sidebar")).toBeTruthy();
    expect(screen.getByTestId("auditor-overview")).toBeTruthy();
  });

  it("switches tabs when clicking sidebar buttons", () => {
    render(<Auditor onBack={vi.fn()} />);

    const verifyButton = screen.getByRole("button", { name: "Verify Access" });
    fireEvent.click(verifyButton);

    expect(screen.getByTestId("verify-access")).toBeTruthy();
  });

  it("renders Merkle Tree tab", () => {
    render(<Auditor onBack={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "Merkle Tree Proofs" }));
    expect(screen.getByTestId("merkle-tree")).toBeTruthy();
  });

  it("renders Compliance Report tab", () => {
    render(<Auditor onBack={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "Compliance Report" }));
    expect(screen.getByTestId("compliance-report")).toBeTruthy();
  });

  it("renders Network Risk tab", () => {
    render(<Auditor onBack={vi.fn()} />);

    fireEvent.click(
      screen.getByRole("button", { name: "Transaction Network" }),
    );
    expect(screen.getByTestId("network-risk")).toBeTruthy();
  });

  it("renders SOC 2 Evidence tab", () => {
    render(<Auditor onBack={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "SOC 2 Evidence" }));
    expect(screen.getByTestId("soc2-evidence")).toBeTruthy();
  });

  it("renders Privacy Verification tab", () => {
    render(<Auditor onBack={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "Privacy" }));
    expect(screen.getByTestId("privacy-verification")).toBeTruthy();
  });

  it("renders Shopify Webhook tab", () => {
    render(<Auditor onBack={vi.fn()} />);

    fireEvent.click(
      screen.getByRole("button", { name: "Shopify Integration" }),
    );
    expect(screen.getByTestId("shopify-webhook")).toBeTruthy();
  });

  it("renders organization selector with tenant info", () => {
    render(<Auditor onBack={vi.fn()} />);

    expect(screen.getByText("Test Org")).toBeTruthy();
  });
});
