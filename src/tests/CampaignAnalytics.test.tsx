// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { CampaignAnalytics } from "../components/advertiser/CampaignAnalytics";

const mockUseCampaigns = vi.fn();
vi.mock("../hooks/useCampaigns", () => ({
  useCampaigns: () => mockUseCampaigns(),
}));

const mockUserAddress = "GA7QW5KXGPTR4N2K9J2M3N4P5Q6R7S8T9U0V1W2X3Y4Z5A6B7C8D";
vi.mock("../hooks/useWeb3", () => ({
  useWeb3: () => ({
    userAddress: mockUserAddress,
  }),
}));

vi.mock("../components/advertiser/CohortVisualizer", () => ({
  CohortVisualizer: () => <div data-testid="cohort-visualizer">Cohort Visualizer</div>,
}));

describe("CampaignAnalytics Component", () => {
  it("renders loading state", () => {
    mockUseCampaigns.mockReturnValue({
      campaigns: [],
      isLoading: true,
      error: null,
    });

    render(<CampaignAnalytics />);
    expect(screen.getByText("Loading campaign performance...")).toBeTruthy();
  });

  it("renders error state", () => {
    mockUseCampaigns.mockReturnValue({
      campaigns: [],
      isLoading: false,
      error: new Error("Network error"),
    });

    render(<CampaignAnalytics />);
    expect(screen.getByText("Failed to load campaign performance.")).toBeTruthy();
  });

  it("renders genuine empty state when no campaigns exist", () => {
    mockUseCampaigns.mockReturnValue({
      campaigns: [],
      isLoading: false,
      error: null,
    });

    render(<CampaignAnalytics />);
    expect(screen.getByText("No campaigns found.")).toBeTruthy();
    expect(screen.getByText("Create a campaign to start tracking performance metrics.")).toBeTruthy();
  });

  it("renders campaign list with decimal-safe amounts and empty affiliate state", () => {
    mockUseCampaigns.mockReturnValue({
      campaigns: [
        {
          id: "1",
          name: "Spring Tech Promo",
          status: "Active",
          commissionRate: 10,
          clearingPeriod: "14 Days",
          totalSales: 150,
          totalRevenue: "$12,345.50",
          totalCommissions: "$1,234.55",
          affiliates: 15,
          createdAt: "2026-03-01",
          contractAddress: "CA1234",
          escrowInitial: 5000,
          escrowBalance: 3500,
          advertiserAddress: mockUserAddress,
        },
        {
          id: "2",
          name: "Number Format Test",
          status: "Active",
          commissionRate: 5,
          clearingPeriod: "7 Days",
          totalSales: 20,
          totalRevenue: 5000,
          totalCommissions: 250,
          affiliates: 3,
          createdAt: "2026-03-05",
          contractAddress: "CA5678",
          escrowInitial: 1000,
          escrowBalance: 750,
          advertiserAddress: mockUserAddress,
        },
      ],
      isLoading: false,
      error: null,
    });

    render(<CampaignAnalytics />);

    expect(screen.getByText("Campaign Analytics")).toBeTruthy();
    expect(screen.getByText("Spring Tech Promo")).toBeTruthy();
    expect(screen.getByText("15 affiliates • 150 sales")).toBeTruthy();
    expect(screen.getByText("$12,345.5")).toBeTruthy();
    expect(screen.getByText("$1,234.55 comms")).toBeTruthy();

    expect(screen.getByText("Number Format Test")).toBeTruthy();
    expect(screen.getByText("No affiliates enrolled yet")).toBeTruthy();
    expect(screen.getByTestId("cohort-visualizer")).toBeTruthy();
  });

  it("excludes ownerless campaigns and other merchants' campaigns from aggregated totals", () => {
    mockUseCampaigns.mockReturnValue({
      campaigns: [
        {
          id: "1",
          name: "My Campaign",
          status: "Active",
          commissionRate: 10,
          clearingPeriod: "14 Days",
          totalSales: 100,
          totalRevenue: "$1,000",
          totalCommissions: "$100",
          affiliates: 10,
          createdAt: "2026-03-01",
          contractAddress: "CA1",
          escrowInitial: 5000,
          escrowBalance: 3500,
          advertiserAddress: mockUserAddress,
        },
        {
          id: "2",
          name: "Other Merchant Campaign",
          status: "Active",
          commissionRate: 10,
          clearingPeriod: "14 Days",
          totalSales: 500,
          totalRevenue: "$50,000",
          totalCommissions: "$5,000",
          affiliates: 50,
          createdAt: "2026-03-01",
          contractAddress: "CA2",
          escrowInitial: 5000,
          escrowBalance: 3500,
          advertiserAddress: "GOTHERMERCHANTADDRESS999999999999999999999999999999999",
        },
        {
          id: "3",
          name: "Ownerless Campaign",
          status: "Active",
          commissionRate: 10,
          clearingPeriod: "14 Days",
          totalSales: 200,
          totalRevenue: "$20,000",
          totalCommissions: "$2,000",
          affiliates: 20,
          createdAt: "2026-03-01",
          contractAddress: "CA3",
          escrowInitial: 5000,
          escrowBalance: 3500,
          advertiserAddress: undefined,
        },
      ],
      isLoading: false,
      error: null,
    });

    render(<CampaignAnalytics />);

    // Total revenue should only include My Campaign ($1,000)
    expect(screen.getAllByText("$1,000").length).toBeGreaterThanOrEqual(1);
    // Total sales should only include My Campaign (100)
    expect(screen.getAllByText("100").length).toBeGreaterThanOrEqual(1);
    // Active affiliates should only include My Campaign (10)
    expect(screen.getByText("10")).toBeTruthy();

    // Verify other merchant and ownerless campaigns are NOT rendered in the owned list
    expect(screen.queryByText("Other Merchant Campaign")).toBeNull();
    expect(screen.queryByText("Ownerless Campaign")).toBeNull();
  });
});
