// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { LandingVariantConfig } from "../components/advertiser/LandingVariantConfig";
import { VariantComparisonAnalytics } from "../components/advertiser/VariantComparisonAnalytics";
import { buildDestinationRedirectUrl } from "../lib/customLinks";
import { CreateCampaignForm } from "../components/advertiser/CreateCampaignForm";
import type { LandingPageVariant } from "../utils/abTesting";
import type { CustomShortLink } from "../types/affiliateLink";

vi.mock("../hooks/useWeb3", () => ({
  useWeb3: () => ({
    userAddress: null,
    isConnected: false,
    xlmBalance: "0",
    assetBalances: {},
  }),
}));

vi.mock("../context/NotificationContext", () => ({
  useNotification: () => ({ showNotification: vi.fn() }),
}));

describe("A/B Testing UI Components (#155)", () => {
  describe("LandingVariantConfig", () => {
    const initialVariants: LandingPageVariant[] = [
      { id: "var_a", name: "Variant A", url: "https://example.com/a", weight: 50 },
      { id: "var_b", name: "Variant B", url: "https://example.com/b", weight: 50 },
    ];

    it("renders disabled state with toggle button", () => {
      const onToggle = vi.fn();
      const onChange = vi.fn();
      render(
        <LandingVariantConfig
          enabled={false}
          onToggleEnabled={onToggle}
          variants={initialVariants}
          onChange={onChange}
        />,
      );

      expect(screen.getByText("A/B Testing Attribution Optimizer")).toBeDefined();
      const toggleBtn = screen.getByText("Disabled");
      expect(toggleBtn).toBeDefined();

      fireEvent.click(toggleBtn);
      expect(onToggle).toHaveBeenCalledWith(true);
    });

    it("renders enabled state and handles adding a variant", () => {
      const onToggle = vi.fn();
      const onChange = vi.fn();
      render(
        <LandingVariantConfig
          enabled={true}
          onToggleEnabled={onToggle}
          variants={initialVariants}
          onChange={onChange}
        />,
      );

      expect(screen.getByText("100% / 100%")).toBeDefined();
      const addBtn = screen.getByRole("button", { name: /Add URL Variant/i });
      fireEvent.click(addBtn);

      expect(onChange).toHaveBeenCalledTimes(1);
      const addedVariants = onChange.mock.calls[0][0];
      expect(addedVariants.length).toBe(3);
    });

    it("handles modifying variant name, url, and weight", () => {
      const onChange = vi.fn();
      render(
        <LandingVariantConfig
          enabled={true}
          onToggleEnabled={vi.fn()}
          variants={initialVariants}
          onChange={onChange}
        />,
      );

      const nameInputs = screen.getAllByPlaceholderText("Variant name");
      fireEvent.change(nameInputs[0], { target: { value: "New Variant Name" } });
      expect(onChange).toHaveBeenCalledWith([
        { ...initialVariants[0], name: "New Variant Name" },
        initialVariants[1],
      ]);

      const urlInputs = screen.getAllByPlaceholderText("https://merchant.com/landing-variant");
      fireEvent.change(urlInputs[0], { target: { value: "https://example.com/new-a" } });
      expect(onChange).toHaveBeenCalledWith([
        { ...initialVariants[0], url: "https://example.com/new-a" },
        initialVariants[1],
      ]);

      const rangeSliders = screen.getAllByRole("slider");
      fireEvent.change(rangeSliders[0], { target: { value: "70" } });
      expect(onChange).toHaveBeenCalledWith([
        { ...initialVariants[0], weight: 70 },
        initialVariants[1],
      ]);
    });

    it("handles removing a variant and auto-normalizing", () => {
      const onChange = vi.fn();
      render(
        <LandingVariantConfig
          enabled={true}
          onToggleEnabled={vi.fn()}
          variants={initialVariants}
          onChange={onChange}
        />,
      );

      const removeBtns = screen.getAllByTitle("Remove variant");
      fireEvent.click(removeBtns[0]);
      expect(onChange).toHaveBeenCalledTimes(1);
      const remaining = onChange.mock.calls[0][0];
      expect(remaining.length).toBe(1);
      expect(remaining[0].weight).toBe(100);
    });

    it("shows Auto-Normalize button when weights do not sum to 100%", () => {
      const onChange = vi.fn();
      const non100Variants: LandingPageVariant[] = [
        { id: "var_a", name: "Variant A", url: "https://example.com/a", weight: 30 },
        { id: "var_b", name: "Variant B", url: "https://example.com/b", weight: 30 },
      ];
      render(
        <LandingVariantConfig
          enabled={true}
          onToggleEnabled={vi.fn()}
          variants={non100Variants}
          onChange={onChange}
        />,
      );

      const normalizeBtn = screen.getByRole("button", { name: /Auto-normalize to 100%/i });
      fireEvent.click(normalizeBtn);
      expect(onChange).toHaveBeenCalledWith([
        { ...non100Variants[0], weight: 50 },
        { ...non100Variants[1], weight: 50 },
      ]);
    });
  });

  describe("VariantComparisonAnalytics", () => {
    it("renders default analytics with Winner badge", () => {
      render(<VariantComparisonAnalytics />);
      expect(screen.getByText("Landing Page A/B Testing Attribution Optimizer")).toBeDefined();
      expect(screen.getByText("Variant A (Hero Direct)")).toBeDefined();
      expect(screen.getByText("Variant B (Discount Banner)")).toBeDefined();
      expect(screen.getAllByText("Winner").length).toBeGreaterThan(0);
    });

    it("renders custom variants and stats correctly", () => {
      const customVariants: LandingPageVariant[] = [
        { id: "v1", name: "Alpha", url: "https://alpha.com", weight: 60 },
        { id: "v2", name: "Beta", url: "https://beta.com", weight: 40 },
      ];
      const customStats = [
        { variantId: "v1", visitors: 500, bounces: 100, conversions: 50, totalRevenue: 2500 },
        { variantId: "v2", visitors: 500, bounces: 50, conversions: 100, totalRevenue: 5000 },
      ];
      render(<VariantComparisonAnalytics variants={customVariants} stats={customStats} />);
      expect(screen.getByText("Alpha")).toBeDefined();
      expect(screen.getByText("Beta")).toBeDefined();
    });
  });

  describe("buildDestinationRedirectUrl with Landing Variants", () => {
    const baseLink: CustomShortLink = {
      id: "link_123",
      slug: "summer-sale",
      affiliateWallet: "GASTORMSALE7TESTNET7AFFILIATE7MERCHANT7ESCROW7XLM77777",
      walletFingerprint: "fp_123",
      campaignId: "1",
      campaignName: "Summer Sale",
      destinationUrl: "https://merchant.com/default",
      trackingParams: {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      clickCount: 0,
      landingVariants: [
        { id: "v1", name: "V1", url: "https://merchant.com/v1", weight: 100 },
      ],
    };

    it("routes to deterministic variant URL when variants are configured", () => {
      const url = buildDestinationRedirectUrl(baseLink);
      expect(url).toContain("https://merchant.com/v1");
    });

    it("falls back to destinationUrl when no variants are configured", () => {
      const linkWithoutVariants: CustomShortLink = {
        ...baseLink,
        landingVariants: [],
      };
      const url = buildDestinationRedirectUrl(linkWithoutVariants);
      expect(url).toContain("https://merchant.com/default");
    });
  });

  describe("CreateCampaignForm A/B Testing integration", () => {
    it("renders CreateCampaignForm with LandingVariantConfig", () => {
      render(<CreateCampaignForm />);
      expect(screen.getAllByText("A/B Testing Attribution Optimizer").length).toBeGreaterThan(0);
    });
  });
});
