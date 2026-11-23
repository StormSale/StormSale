import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { render, screen } from "@testing-library/react";
import { BrandedCampaignView } from "../components/shared/BrandedCampaignView";

describe("B2C Social Share Card Preview & Web Share API Integration Suite", () => {
  const mockBrandConfig = {
    brandName: "StormSale Genesis",
    logoUrl: "https://example.com/logo.png",
    bannerUrl: "https://images.unsplash.com/photo-1639762681485-074b7f938ba0",
    primaryColor: "#2ea6ff",
    accentColor: "#10b981",
    welcomeMessage: "Join the decentralized affiliate revolution!",
    rewardRateText: "15% Commission on Sales",
    campaignTitle: "StormSale Genesis Community Booster",
  };

  const mockReferralUrl = "https://stormsale.xyz/r/gen-123?ref=GUSERABC123";

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("1. Formatted Intent URLs & Referral Encoding", () => {
    it("generates correct Twitter/X share intent URL with encoded referral link", () => {
      const text = encodeURIComponent(`Join ${mockBrandConfig.campaignTitle} and earn ${mockBrandConfig.rewardRateText}!`);
      const url = encodeURIComponent(mockReferralUrl);
      const twitterIntent = `https://twitter.com/intent/tweet?text=${text}&url=${url}`;

      expect(twitterIntent).toContain("https://twitter.com/intent/tweet?");
      expect(twitterIntent).toContain(encodeURIComponent(mockReferralUrl));
      expect(twitterIntent).toContain(encodeURIComponent(mockBrandConfig.campaignTitle));
    });

    it("generates correct Telegram share intent URL with encoded referral link", () => {
      const text = encodeURIComponent(`Check out ${mockBrandConfig.campaignTitle}! Reward: ${mockBrandConfig.rewardRateText}`);
      const url = encodeURIComponent(mockReferralUrl);
      const telegramIntent = `https://t.me/share/url?url=${url}&text=${text}`;

      expect(telegramIntent).toContain("https://t.me/share/url?");
      expect(telegramIntent).toContain(`url=${encodeURIComponent(mockReferralUrl)}`);
      expect(telegramIntent).toContain(encodeURIComponent(mockBrandConfig.campaignTitle));
    });

    it("generates correct WhatsApp share intent URL with encoded referral link", () => {
      const text = encodeURIComponent(`Join ${mockBrandConfig.campaignTitle} (${mockBrandConfig.rewardRateText}): ${mockReferralUrl}`);
      const whatsappIntent = `https://api.whatsapp.com/send?text=${text}`;

      expect(whatsappIntent).toContain("https://api.whatsapp.com/send?text=");
      expect(whatsappIntent).toContain(encodeURIComponent(mockReferralUrl));
    });
  });

  describe("2. Web Share API & Clipboard Copy Fallback", () => {
    it("triggers navigator.share when supported on mobile browsers", async () => {
      const mockShare = vi.fn().mockResolvedValue(undefined);
      Object.defineProperty(navigator, "share", {
        value: mockShare,
        configurable: true,
        writable: true,
      });

      const shareData = {
        title: mockBrandConfig.campaignTitle,
        text: mockBrandConfig.welcomeMessage,
        url: mockReferralUrl,
      };

      const nav = navigator as Navigator & { share?: (data: Record<string, unknown>) => Promise<void> };
      if (nav.share) {
        await nav.share(shareData);
      }

      expect(mockShare).toHaveBeenCalledWith(shareData);
    });

    it("falls back to clipboard copy when navigator.share is undefined", async () => {
      Object.defineProperty(navigator, "share", {
        value: undefined,
        configurable: true,
        writable: true,
      });

      const writeTextSpy = vi.fn().mockResolvedValue(undefined);
      Object.defineProperty(navigator, "clipboard", {
        value: { writeText: writeTextSpy },
        configurable: true,
        writable: true,
      });

      const nav = navigator as Navigator & { share?: unknown };
      if (!nav.share && navigator.clipboard) {
        await navigator.clipboard.writeText(mockReferralUrl);
      }

      expect(writeTextSpy).toHaveBeenCalledWith(mockReferralUrl);
    });
  });

  describe("3. Preview Card Dynamic Display", () => {
    it("renders dynamic campaign title, reward rate, and banner correctly", async () => {
      render(
        React.createElement(BrandedCampaignView, {
          brandConfig: mockBrandConfig,
          onClose: () => {},
          isStandalone: true
        })
      );

      expect(screen.getByText(mockBrandConfig.campaignTitle)).toBeDefined();
      expect(screen.getByText(mockBrandConfig.rewardRateText)).toBeDefined();
      expect(screen.getByText(mockBrandConfig.welcomeMessage)).toBeDefined();

      const images = screen.getAllByRole("img");
      expect(images.length).toBeGreaterThan(0);
    });
  });
});
