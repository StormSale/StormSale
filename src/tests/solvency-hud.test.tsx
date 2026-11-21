// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { SolvencyHUD } from "../components/auditor/SolvencyHUD";

vi.mock("../context/Web3Context", () => ({
  useWeb3: () => ({
    userAddress: "GASTORMSALE7TESTNET7AFFILIATE7MERCHANT7ESCROW7XLM77777",
    isConnected: true,
  }),
}));

vi.mock("../context/NotificationContext", () => ({
  useNotification: () => ({
    showNotification: vi.fn(),
  }),
  NotificationProvider: ({ children }: any) => <>{children}</>,
}));

vi.mock("../context/AuditorTenancyContext", () => ({
  useAuditorTenancy: () => ({
    org: { id: "org-1", name: "Default Org" },
    organizations: [{ id: "org-1", name: "Default Org" }],
    cachedKeyIds: [],
    switchTenant: vi.fn(),
  }),
  AuditorTenancyProvider: ({ children }: any) => <>{children}</>,
}));

describe("Protocol Solvency Proof & TVL Oracle UI (#81)", () => {
  it("renders SolvencyHUD with TVL metrics and vault tables", async () => {
    render(<SolvencyHUD autoRefresh={false} />);

    await waitFor(() => {
      expect(screen.getByText(/Total Value Locked \(TVL\)/i)).toBeDefined();
    });

    expect(screen.getByText(/Escrow Vault Reserves/i)).toBeDefined();
    expect(screen.getByText(/Pending Affiliate Claims/i)).toBeDefined();
    expect(screen.getByText(/Solvency Ratio/i)).toBeDefined();
    expect(screen.getByText(/Audited Escrow Vaults vs\. Clearing Windows/i)).toBeDefined();
  });

  it("handles auto-refresh subscription updates", async () => {
    render(<SolvencyHUD autoRefresh={true} />);

    await waitFor(() => {
      expect(screen.getByText(/Total Value Locked \(TVL\)/i)).toBeDefined();
    });
  });
});
