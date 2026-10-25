// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { CampaignAnalytics } from "../components/advertiser/CampaignAnalytics";

const mockUseCampaigns = vi.fn();
vi.mock("../hooks/useCampaigns", () => ({
  useCampaigns: () => mockUseCampaigns(),
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

  it("renders campaign list with decimal-safe amounts and top performers", () => {
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
    expect(screen.getByText("Alex Johnson")).toBeTruthy();
    expect(screen.getByTestId("cohort-visualizer")).toBeTruthy();
  });
});
