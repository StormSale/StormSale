// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";

/**
 * Auditor page wiring: every sidebar tab renders its panel, the enterprise
 * compliance checklist tab (#64) is reachable, and the Audit History panel
 * keeps its navigation callbacks (tab change + "view Merkle proof").
 */

vi.mock("framer-motion", () => ({
  motion: { div: ({ children }: { children: ReactNode }) => <div>{children}</div> },
  AnimatePresence: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock("../components/shared/Sidebar", () => ({
  Sidebar: ({
    tabs,
    activeTab,
    onTabChange,
    onBack,
  }: {
    tabs: { id: string; label: string }[];
    activeTab: string;
    onTabChange: (tab: string) => void;
    onBack?: () => void;
  }) => (
    <nav>
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          aria-current={activeTab === tab.id ? "page" : undefined}
          onClick={() => onTabChange(tab.id)}
        >
          {tab.label}
        </button>
      ))}
      <button type="button" onClick={() => onTabChange("not-a-tab")}>
        Unknown tab
      </button>
      <button type="button" onClick={onBack}>
        Back
      </button>
    </nav>
  ),
}));

vi.mock("../components/auditor/AuditorOverview", () => ({
  AuditorOverview: ({ onTabChange }: { onTabChange: (tab: string) => void }) => (
    <div>
      Overview panel
      <button type="button" onClick={() => onTabChange("checklist")}>
        Overview to checklist
      </button>
    </div>
  ),
}));
vi.mock("../components/auditor/VerifyAccess", () => ({
  VerifyAccess: () => <div>Verify panel</div>,
}));
vi.mock("../components/auditor/AuditHistory", () => ({
  AuditHistory: ({
    onTabChange,
    onViewMerkleProof,
  }: {
    onTabChange?: (tab: string) => void;
    onViewMerkleProof?: (saleId: string, campaign: string) => void;
  }) => (
    <div>
      History panel
      <button type="button" disabled={!onTabChange} onClick={() => onTabChange?.("compliance")}>
        History to compliance
      </button>
      <button
        type="button"
        disabled={!onViewMerkleProof}
        onClick={() => onViewMerkleProof?.("988", "Web3 Masterclass")}
      >
        History view proof
      </button>
    </div>
  ),
}));
vi.mock("../components/auditor/ComplianceReport", () => ({
  ComplianceReport: () => <div>Compliance report panel</div>,
}));
vi.mock("../components/auditor/ComplianceChecklist", () => ({
  ComplianceChecklist: () => <div>Checklist panel</div>,
}));
vi.mock("../components/auditor/MerkleTreeVisualizer", () => ({
  MerkleTreeVisualizer: ({ initialSaleId }: { initialSaleId?: string }) => (
    <div>Merkle panel sale:{initialSaleId ?? "none"}</div>
  ),
}));
vi.mock("../components/auditor/Soc2EvidenceExport", () => ({
  Soc2EvidenceExport: () => <div>SOC2 panel</div>,
}));
vi.mock("../components/auditor/NetworkRiskVisualizer", () => ({
  NetworkRiskVisualizer: () => <div>Network panel</div>,
}));
vi.mock("../components/auditor/PrivacyVerification", () => ({
  PrivacyVerification: () => <div>Privacy panel</div>,
}));

import { Auditor } from "../pages/Auditor";

beforeEach(() => {
  localStorage.clear();
});
afterEach(() => cleanup());

const openTab = (label: string) => fireEvent.click(screen.getByRole("button", { name: label }));

describe("Auditor page", () => {
  it("renders every tab's panel from the sidebar", () => {
    render(<Auditor onBack={() => {}} />);
    expect(screen.getByText("Overview panel")).toBeTruthy();
    expect(screen.getByText("Organization scope")).toBeTruthy();

    const panels: Array<[string, string | RegExp]> = [
      ["Merkle Tree Proofs", /Merkle panel sale:none/],
      ["Verify Access", "Verify panel"],
      ["Audit History", "History panel"],
      ["Audit Checklist", "Checklist panel"],
      ["Compliance Report", "Compliance report panel"],
      ["Transaction Network", "Network panel"],
      ["SOC 2 Evidence", "SOC2 panel"],
      ["Privacy", "Privacy panel"],
      ["Dashboard Overview", "Overview panel"],
    ];
    for (const [label, panel] of panels) {
      openTab(label);
      expect(screen.getByText(panel)).toBeTruthy();
    }
  });

  it("opens the compliance checklist and remembers it as the active tab", () => {
    render(<Auditor onBack={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Overview to checklist" }));
    expect(screen.getByText("Checklist panel")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Audit Checklist" }).getAttribute("aria-current"),
    ).toBe("page");

    cleanup();
    render(<Auditor onBack={() => {}} />);
    expect(screen.getByText("Checklist panel")).toBeTruthy();
  });

  it("passes navigation callbacks to Audit History", () => {
    render(<Auditor onBack={() => {}} />);
    openTab("Audit History");

    const toCompliance = screen.getByRole("button", { name: "History to compliance" });
    const viewProof = screen.getByRole("button", { name: "History view proof" });
    expect((toCompliance as HTMLButtonElement).disabled).toBe(false);
    expect((viewProof as HTMLButtonElement).disabled).toBe(false);

    fireEvent.click(viewProof);
    expect(screen.getByText("Merkle panel sale:988")).toBeTruthy();

    openTab("Audit History");
    fireEvent.click(screen.getByRole("button", { name: "History to compliance" }));
    expect(screen.getByText("Compliance report panel")).toBeTruthy();
  });

  it("ignores unknown tabs and forwards the back action", () => {
    const onBack = vi.fn();
    render(<Auditor onBack={onBack} />);
    openTab("Unknown tab");
    expect(screen.getByText("Overview panel")).toBeTruthy();
    openTab("Back");
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});
