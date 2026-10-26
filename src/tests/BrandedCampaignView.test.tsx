// @vitest-environment jsdom
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { BrandedCampaignView } from "../components/shared/BrandedCampaignView";
import { DEFAULT_BRAND_CONFIG } from "../lib/branding";
import type { UseCampaignsOptions } from "../hooks/useCampaigns";

const mockUseCampaigns = vi.fn();
vi.mock("../hooks/useCampaigns", () => ({
  useCampaigns: (params?: UseCampaignsOptions) => mockUseCampaigns(params),
}));

describe("BrandedCampaignView Component", () => {
  const brandConfig = {
    ...DEFAULT_BRAND_CONFIG,
    merchantAddress: "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
    brandName: "Acme Gear",
    tagline: "Quality outdoor equipment",
    subdomain: "acme-gear",
    heroHeadline: "Earn up to 25% with Acme",
    heroSubtitle: "Join our high-converting affiliate program",
  };

  it("renders loading state while campaigns are loading", () => {
    mockUseCampaigns.mockReturnValue({ campaigns: [], isLoading: true, error: null });

    render(<BrandedCampaignView brandConfig={brandConfig} />);

    expect(screen.getByText("Loading active campaigns...")).toBeTruthy();
    expect(screen.getByText("Fetching campaigns from the Stellar network.")).toBeTruthy();
  });

  it("renders error state when campaign query fails", () => {
    mockUseCampaigns.mockReturnValue({
      campaigns: [],
      isLoading: false,
      error: new Error("Failed to reach Stellar Horizon node"),
    });

    render(<BrandedCampaignView brandConfig={brandConfig} />);

    expect(screen.getByText("Failed to load campaigns")).toBeTruthy();
    expect(screen.getByText("Failed to reach Stellar Horizon node")).toBeTruthy();
  });

  it("renders genuine empty state when no active campaigns exist for merchant", () => {
    mockUseCampaigns.mockReturnValue({ campaigns: [], isLoading: false, error: null });

    render(<BrandedCampaignView brandConfig={brandConfig} />);

    expect(screen.getByText("Acme Gear")).toBeTruthy();
    expect(screen.getByText("https://acme-gear.stormsale.io")).toBeTruthy();
    expect(screen.getByText("No active campaigns available")).toBeTruthy();
    expect(
      screen.getByText("This merchant does not currently have any active campaigns on Stellar escrow."),
    ).toBeTruthy();
  });

  it("renders active campaigns with brand colors, stats, and handles close", () => {
    const handleClose = vi.fn();
    mockUseCampaigns.mockReturnValue({
      campaigns: [
        {
          id: "101",
          name: "Alpine Tent Launch",
          status: "Active",
          commissionRate: 15,
          clearingPeriodSecs: 1209600,
          escrowInitial: 8000,
          escrowBalance: 6500,
          category: "Outdoors",
        },
      ],
      isLoading: false,
      error: null,
    });

    render(
      <BrandedCampaignView
        brandConfig={brandConfig}
        onClose={handleClose}
        isStandalone={true}
      />,
    );

    expect(screen.getByText("Alpine Tent Launch")).toBeTruthy();
    expect(screen.getByText("Category: Outdoors")).toBeTruthy();
    expect(screen.getAllByText("15%").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("6,500 XLM").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("14 Days").length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText(/Avg Affiliate Payout/i)).toBeNull();

    // Close button
    const closeBtn = screen.getByText("Close Preview");
    fireEvent.click(closeBtn);
    expect(handleClose).toHaveBeenCalledTimes(1);

    // Image fallback test
    const logoImg = screen.getByAltText("Acme Gear");
    fireEvent.error(logoImg);
    expect((logoImg as HTMLImageElement).src).toContain("unsplash.com");
  });
});
