// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AffiliateEarningsCharts } from "../components/affiliate/AffiliateEarningsCharts";

const mocks = vi.hoisted(() => ({
  useWeb3: vi.fn(),
  fetchAffiliateEarningsReport: vi.fn(),
  downloadPayoutHistoryCsv: vi.fn(),
}));

vi.mock("../hooks/useWeb3", () => ({ useWeb3: mocks.useWeb3 }));
vi.mock("../lib/affiliateEarningsData", async () => {
  const actual = await vi.importActual<typeof import("../lib/affiliateEarningsData")>(
    "../lib/affiliateEarningsData",
  );
  return {
    ...actual,
    fetchAffiliateEarningsReport: mocks.fetchAffiliateEarningsReport,
    downloadPayoutHistoryCsv: mocks.downloadPayoutHistoryCsv,
  };
});

const mockReportFixture = {
  balances: {
    totalEarningsXlm: 1250.5,
    totalEarningsUsd: 156.31,
    withdrawableXlm: 155.75,
    withdrawableUsd: 19.47,
    inClearingXlm: 240.0,
    inClearingUsd: 30.0,
    totalPaidOutXlm: 854.75,
    totalPaidOutUsd: 106.84,
    payoutCount: 5,
    lastSyncedAt: 1700000000000,
    xlmUsdRate: 0.125,
  },
  daily: [
    {
      date: "2026-11-19",
      label: "Nov 19",
      timestamp: 1700000000000 - 86400000,
      commissionXlm: 45.0,
      commissionUsd: 5.63,
      grossSalesXlm: 450.0,
      grossSalesUsd: 56.25,
      salesCount: 3,
      conversionRate: 4.5,
    },
    {
      date: "2026-11-20",
      label: "Nov 20",
      timestamp: 1700000000000,
      commissionXlm: 65.5,
      commissionUsd: 8.19,
      grossSalesXlm: 650.0,
      grossSalesUsd: 81.25,
      salesCount: 5,
      conversionRate: 5.2,
    },
  ],
  monthly: [
    {
      monthKey: "2026-10",
      label: "Oct 2026",
      year: 2026,
      month: 10,
      timestamp: 1698000000000,
      commissionXlm: 540.0,
      commissionUsd: 67.5,
      grossSalesXlm: 5400.0,
      grossSalesUsd: 675.0,
      salesCount: 28,
      conversionRate: 4.8,
    },
    {
      monthKey: "2026-11",
      label: "Nov 2026",
      year: 2026,
      month: 11,
      timestamp: 1700000000000,
      commissionXlm: 710.5,
      commissionUsd: 88.81,
      grossSalesXlm: 7105.0,
      grossSalesUsd: 888.13,
      salesCount: 36,
      conversionRate: 5.1,
    },
  ],
  payouts: [
    {
      id: "claim_1",
      campaignId: 101,
      campaignName: "Apex Alpha Performance Tech",
      amountXlm: 120.0,
      amountUsd: 15.0,
      asset: "XLM" as const,
      timestamp: 1700000000000 - 86400000 * 2,
      txHash: "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
      status: "completed" as const,
      recipient: "GUSER123",
    },
    {
      id: "claim_2",
      campaignId: 204,
      campaignName: "Nova Quantum Cloud Services",
      amountXlm: 350.0,
      amountUsd: 43.75,
      asset: "USDC" as const,
      timestamp: 1700000000000 - 86400000 * 5,
      txHash: "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
      status: "completed" as const,
      recipient: "GUSER123",
    },
  ],
  source: "indexer" as const,
};

describe("AffiliateEarningsCharts Component (#48)", () => {
  const writeText = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.useWeb3.mockReturnValue({ userAddress: "Gaffiliate-demo-wallet" });
    mocks.fetchAffiliateEarningsReport.mockResolvedValue(mockReportFixture);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
  });

  afterEach(() => {
    cleanup();
  });

  it("renders the 4 real-time balance widgets with accurate values", async () => {
    render(<AffiliateEarningsCharts />);

    await waitFor(() => {
      expect(screen.getByTestId("stat-total-earnings").textContent).toContain("1250.50");
      expect(screen.getByTestId("stat-withdrawable").textContent).toContain("155.75");
      expect(screen.getByTestId("stat-in-clearing").textContent).toContain("240.00");
      expect(screen.getByTestId("stat-total-payouts").textContent).toContain("854.75");
    });

    expect(screen.getByTestId("live-escrow-badge").textContent).toContain("Live Escrow Sync: Active");
  });

  it("toggles currency between XLM and USD across balance cards and charts", async () => {
    render(<AffiliateEarningsCharts />);

    await waitFor(() => {
      expect(screen.getByTestId("stat-total-earnings").textContent).toContain("1250.50");
    });

    // Switch to USD
    fireEvent.click(screen.getByRole("button", { name: "View in USD" }));

    await waitFor(() => {
      expect(screen.getByTestId("stat-total-earnings").textContent).toContain("$156.31");
      expect(screen.getByTestId("stat-withdrawable").textContent).toContain("$19.47");
      expect(screen.getByTestId("stat-in-clearing").textContent).toContain("$30.00");
      expect(screen.getByTestId("stat-total-payouts").textContent).toContain("$106.84");
    });

    // Switch back to XLM
    fireEvent.click(screen.getByRole("button", { name: "View in XLM" }));
    await waitFor(() => {
      expect(screen.getByTestId("stat-total-earnings").textContent).toContain("1250.50");
    });
  });

  it("switches between daily and monthly timeframes", async () => {
    render(<AffiliateEarningsCharts />);

    await screen.findByTestId("performance-bars-container");
    expect(screen.getByText("Nov 19")).toBeTruthy();
    expect(screen.getByText("Nov 20")).toBeTruthy();

    // Toggle to Monthly
    fireEvent.click(screen.getByTestId("toggle-timeframe-monthly"));

    await waitFor(() => {
      expect(screen.getByText("Oct 2026")).toBeTruthy();
      expect(screen.getByText("Nov 2026")).toBeTruthy();
    });

    // Toggle back to Daily
    fireEvent.click(screen.getByTestId("toggle-timeframe-daily"));
    await waitFor(() => {
      expect(screen.getByText("Nov 19")).toBeTruthy();
    });
  });

  it("shows interactive tooltip when hovering or focusing on chart bars", async () => {
    render(<AffiliateEarningsCharts />);

    await screen.findByTestId("performance-bars-container");
    const bar = screen.getByRole("button", { name: /Nov 20: 65.5 commission/i });

    fireEvent.mouseEnter(bar);

    await waitFor(() => {
      const tooltip = screen.getByTestId("interactive-chart-tooltip");
      expect(tooltip.textContent).toContain("Nov 20");
      expect(tooltip.textContent).toContain("65.50 XLM");
      expect(tooltip.textContent).toContain("5 Sales");
      expect(tooltip.textContent).toContain("5.2%");
    });

    fireEvent.mouseLeave(bar);
    await waitFor(() => {
      expect(screen.queryByTestId("interactive-chart-tooltip")).toBeNull();
    });
  });

  it("renders payout history table, filters by search, copies tx hash, and exports CSV", async () => {
    render(<AffiliateEarningsCharts />);

    await screen.findByTestId("payout-history-card");
    expect(screen.getByText("Apex Alpha Performance Tech")).toBeTruthy();
    expect(screen.getByText("Nova Quantum Cloud Services")).toBeTruthy();
    expect(screen.getByText("120.00 XLM")).toBeTruthy();
    expect(screen.getByText("350.00 XLM")).toBeTruthy();

    // Test filter search
    const searchInput = screen.getByLabelText("Filter payout history");
    fireEvent.change(searchInput, { target: { value: "Apex" } });

    expect(screen.getByText("Apex Alpha Performance Tech")).toBeTruthy();
    expect(screen.queryByText("Nova Quantum Cloud Services")).toBeNull();

    // Clear search
    fireEvent.change(searchInput, { target: { value: "" } });
    expect(screen.getByText("Nova Quantum Cloud Services")).toBeTruthy();

    // Test copy tx hash
    const copyBtns = screen.getAllByRole("button", { name: "Copy transaction hash" });
    fireEvent.click(copyBtns[0]);
    expect(writeText).toHaveBeenCalledWith(mockReportFixture.payouts[0].txHash);

    // Test export CSV
    const exportBtn = screen.getByRole("button", { name: "Export Payout History as CSV" });
    fireEvent.click(exportBtn);
    expect(mocks.downloadPayoutHistoryCsv).toHaveBeenCalledTimes(1);
    expect(mocks.downloadPayoutHistoryCsv).toHaveBeenCalledWith(
      mockReportFixture.payouts,
      expect.stringContaining("stormsale-payouts-"),
    );
  });

  it("triggers onNavigateToClaim callback when clicking claim link", async () => {
    const onNavigateToClaim = vi.fn();
    render(<AffiliateEarningsCharts onNavigateToClaim={onNavigateToClaim} />);

    await screen.findByTestId("stat-withdrawable");
    const claimLink = screen.getByRole("button", { name: /Claim Matured Payouts/i });
    fireEvent.click(claimLink);

    expect(onNavigateToClaim).toHaveBeenCalledOnce();
  });

  it("handles empty chart dataset and error state with retry", async () => {
    mocks.fetchAffiliateEarningsReport.mockRejectedValueOnce(new Error("RPC Timeout"));

    render(<AffiliateEarningsCharts />);

    await waitFor(() => {
      const alert = screen.getByRole("alert");
      expect(alert.textContent).toContain("Could not fetch fresh indexer data: RPC Timeout");
    });

    // Click retry
    mocks.fetchAffiliateEarningsReport.mockResolvedValueOnce({
      ...mockReportFixture,
      daily: [],
      monthly: [],
    });

    fireEvent.click(screen.getByRole("button", { name: "Retry" }));

    await waitFor(() => {
      const emptyState = screen.getByTestId("empty-chart-state");
      expect(emptyState.textContent).toContain("No Performance Activity In This Window");
    });
  });
});
