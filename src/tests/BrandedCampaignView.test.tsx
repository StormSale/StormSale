// @vitest-environment jsdom
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { BrandedCampaignView } from "../components/shared/BrandedCampaignView";
import { DEFAULT_BRAND_CONFIG } from "../lib/branding";

const mockUseCampaigns = vi.fn();
vi.mock("../hooks/useCampaigns", () => ({
  useCampaigns: (params: any) => mockUseCampaigns(params),
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

  it("renders genuine empty state when no active campaigns exist for merchant", () => {
    mockUseCampaigns.mockReturnValue({ campaigns: [] });

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
