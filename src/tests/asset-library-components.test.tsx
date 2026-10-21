// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { AssetGallery } from "../components/advertiser/AssetGallery";
import { AssetUploader } from "../components/advertiser/AssetUploader";
import { CampaignAssetLibrary } from "../components/advertiser/CampaignAssetLibrary";
import { AffiliateAssetLibrary } from "../components/affiliate/AffiliateAssetLibrary";
import { NotificationProvider } from "../context/NotificationContext";

// Mock Web3 hook
vi.mock("../hooks/useWeb3", () => ({
  useWeb3: () => ({
    userAddress: "GASTORM1234567890TESTNETADDRESS1234567890",
  }),
}));

describe("Campaign Asset Library Components Suite", () => {
  let store: Record<string, string> = {};

  beforeEach(() => {
    store = {};
    const mockStorage = {
      getItem: (key: string) => store[key] || null,
      setItem: (key: string, value: string) => {
        store[key] = value.toString();
      },
      removeItem: (key: string) => {
        delete store[key];
      },
      clear: () => {
        store = {};
      },
    };
    vi.stubGlobal("localStorage", mockStorage);
    vi.spyOn(window, "confirm").mockReturnValue(true);
    vi.stubGlobal("navigator", {
      clipboard: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    });
    vi.stubGlobal("URL", {
      createObjectURL: vi.fn().mockReturnValue("blob:mock-url"),
      revokeObjectURL: vi.fn(),
    });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  describe("CampaignAssetLibrary Component", () => {
    it("renders stats, switches tabs, and handles actions", async () => {
      render(
        <NotificationProvider>
          <CampaignAssetLibrary />
        </NotificationProvider>,
      );

      // Hero banner
      expect(screen.getByText("Campaign Asset Library")).toBeDefined();
      expect(screen.getByText("Total Assets")).toBeDefined();

      // Click upload button in gallery (onUploadClick)
      const uploadNewAssetBtn = screen.getByText("Upload New Asset");
      fireEvent.click(uploadNewAssetBtn);
      expect(screen.getByText("IPFS Media Upload & Creative Library")).toBeDefined();

      // Toggle back to gallery
      const galleryToggle = screen.getByText("View Media Gallery");
      fireEvent.click(galleryToggle);
      expect(
        screen.getByPlaceholderText(/Search assets by title, dimensions, campaign, or IPFS CID/),
      ).toBeDefined();

      // Click hero upload button
      const heroUploadBtn = screen.getByText("Upload Creative Asset");
      fireEvent.click(heroUploadBtn);

      // Upload file to trigger handleAssetUploaded
      const file = new File(["<svg viewBox='0 0 100 100'></svg>"], "new-creative.svg", {
        type: "image/svg+xml",
      });
      const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
      fireEvent.change(fileInput, { target: { files: [file] } });

      const pinButton = screen.getByText("Pin to IPFS");
      fireEvent.click(pinButton);

      await waitFor(
        () => {
          expect(screen.getByText(/New creative/i)).toBeDefined();
        },
        { timeout: 5000 },
      );

      // Trigger handleAssetDeleted
      const deleteButtons = screen.getAllByTitle("Delete Asset");
      fireEvent.click(deleteButtons[0]);

      // Trigger handleAssetsChanged
      const downloadButtons = screen.getAllByText("Download");
      fireEvent.click(downloadButtons[0]);
    });
  });

  describe("AffiliateAssetLibrary Component", () => {
    it("renders affiliate hero and personalizes tracking ID", () => {
      render(
        <NotificationProvider>
          <AffiliateAssetLibrary />
        </NotificationProvider>,
      );

      expect(screen.getByText("Creative Marketing Assets")).toBeDefined();
      const input = screen.getByPlaceholderText("Your Affiliate ID") as HTMLInputElement;
      expect(input).toBeDefined();

      fireEvent.change(input, { target: { value: "CUSTOM_PARTNER_99" } });
      expect(input.value).toBe("CUSTOM_PARTNER_99");
    });
  });

  describe("AssetGallery Component", () => {
    it("renders gallery assets and supports filtering and sorting", () => {
      render(
        <NotificationProvider>
          <AssetGallery />
        </NotificationProvider>,
      );

      // Search input
      const search = screen.getByPlaceholderText(/Search assets by title, dimensions/);
      fireEvent.change(search, { target: { value: "Leaderboard" } });
      expect(screen.getByText(/Tech Gadgets Pro - Leaderboard Banner/)).toBeDefined();

      // Reset search
      fireEvent.change(search, { target: { value: "" } });

      // Click category pill button
      const bannersPill = screen.getByText("Banners");
      fireEvent.click(bannersPill);

      // Change format filter
      const formatSelect = screen.getByDisplayValue("All Formats");
      fireEvent.change(formatSelect, { target: { value: "png" } });

      // Change campaign filter
      const campaignSelect = screen.getByDisplayValue("All Campaigns");
      fireEvent.change(campaignSelect, { target: { value: "Tech Gadgets Pro" } });

      // Change sort order
      const sortSelect = screen.getByDisplayValue("Sort: Newest Pinned");
      fireEvent.change(sortSelect, { target: { value: "downloads" } });
      fireEvent.change(sortSelect, { target: { value: "name" } });
      fireEvent.change(sortSelect, { target: { value: "size" } });
    });

    it("opens embed modal and copies snippet", async () => {
      render(
        <NotificationProvider>
          <AssetGallery isAffiliateView={true} affiliateReferralCode="AFF_CODE_XYZ" />
        </NotificationProvider>,
      );

      // Click first Embed Code button
      const embedButtons = screen.getAllByText("Embed Code");
      fireEvent.click(embedButtons[0]);

      // Check modal opened
      expect(screen.getByText("Affiliate Embed Codes & Integration")).toBeDefined();

      // Switch tabs
      const markdownBtns = screen.getAllByText("Markdown");
      fireEvent.click(markdownBtns[markdownBtns.length - 1]);
      fireEvent.click(screen.getByText("React JSX"));
      fireEvent.click(screen.getByText("Direct IPFS URI"));
      fireEvent.click(screen.getByText("HTML Banner"));

      // Click copy button
      const copyButton = screen.getByText("Copy Code");
      fireEvent.click(copyButton);

      // Close modal
      const closeButton = screen.getByText("Close");
      fireEvent.click(closeButton);
    });

    it("opens preview modal and downloads asset", async () => {
      const onAssetsChanged = vi.fn();
      render(
        <NotificationProvider>
          <AssetGallery onAssetsChanged={onAssetsChanged} />
        </NotificationProvider>,
      );

      // Preview modal
      const previewButtons = screen.getAllByTitle("Inspect Asset");
      fireEvent.click(previewButtons[0]);
      expect(screen.getByText(/SHA-256:/)).toBeDefined();

      // Close preview modal
      const closeButtons = screen.getAllByText("Close");
      fireEvent.click(closeButtons[0]);

      // Download single asset
      const downloadButtons = screen.getAllByText("Download");
      fireEvent.click(downloadButtons[0]);

      // Full zip download
      const bundleButton = screen.getByText(/Download Full Media ZIP Bundle/);
      fireEvent.click(bundleButton);

      await waitFor(
        () => {
          expect(onAssetsChanged).toHaveBeenCalled();
        },
        { timeout: 5000 },
      );
    });

    it("handles asset deletion with confirmation", () => {
      const onDeleted = vi.fn();
      render(
        <NotificationProvider>
          <AssetGallery onAssetDeleted={onDeleted} />
        </NotificationProvider>,
      );

      const deleteButtons = screen.getAllByTitle("Delete Asset");
      fireEvent.click(deleteButtons[0]);
      expect(onDeleted).toHaveBeenCalled();
    });

    it("copies URI and handles download callbacks", async () => {
      render(
        <NotificationProvider>
          <AssetGallery />
        </NotificationProvider>,
      );

      const copyUriButtons = screen.getAllByTitle("Copy ipfs:// URI");
      fireEvent.click(copyUriButtons[0]);
    });
  });

  describe("AssetUploader Component", () => {
    it("renders and switches between file and swipe copy mode", () => {
      render(
        <NotificationProvider>
          <AssetUploader />
        </NotificationProvider>,
      );

      expect(screen.getByText("IPFS Media Upload & Creative Library")).toBeDefined();

      // Switch to swipe copy
      const swipeToggle = screen.getByText("Swipe Copy Studio");
      fireEvent.click(swipeToggle);
      expect(screen.getByText(/Headline \/ Subject Line/)).toBeDefined();

      // Switch back to file upload
      const fileToggle = screen.getByText("Media Files");
      fireEvent.click(fileToggle);
      expect(screen.getByText(/Drop your marketing banner/)).toBeDefined();
    });

    it("manages IPFS node settings modal", () => {
      render(
        <NotificationProvider>
          <AssetUploader />
        </NotificationProvider>,
      );

      const settingsButton = screen.getByText(/Node:/);
      fireEvent.click(settingsButton);

      expect(screen.getByText("IPFS Decentralized Storage Settings")).toBeDefined();

      const jwtInput = screen.getByPlaceholderText(
        "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
      ) as HTMLInputElement;
      fireEvent.change(jwtInput, { target: { value: "test.jwt.token" } });

      const saveButton = screen.getByText("Save Settings");
      fireEvent.click(saveButton);
    });

    it("handles file selection, drag events, and upload submission", async () => {
      const onUploaded = vi.fn();
      const { container } = render(
        <NotificationProvider>
          <AssetUploader onAssetUploaded={onUploaded} />
        </NotificationProvider>,
      );

      // Drag enter and leave
      const dropZone = container.querySelector(".cursor-pointer")!;
      fireEvent.dragEnter(dropZone);
      fireEvent.dragOver(dropZone);
      fireEvent.dragLeave(dropZone);

      // Select file via hidden input with SVG
      const file = new File(["<svg viewBox='0 0 100 100'></svg>"], "test.svg", {
        type: "image/svg+xml",
      });
      const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
      fireEvent.change(fileInput, { target: { files: [file] } });

      // Title input appears once file is selected
      const titleInput = screen.getByPlaceholderText(/Asset Title/);
      fireEvent.change(titleInput, { target: { value: "Test Upload Asset" } });

      // Click pin button
      const pinButton = screen.getByText("Pin to IPFS");
      fireEvent.click(pinButton);

      await waitFor(
        () => {
          expect(onUploaded).toHaveBeenCalled();
        },
        { timeout: 5000 },
      );
    });

    it("handles swipe copy submission", async () => {
      const onUploaded = vi.fn();
      render(
        <NotificationProvider>
          <AssetUploader onAssetUploaded={onUploaded} />
        </NotificationProvider>,
      );

      // Switch to swipe copy
      fireEvent.click(screen.getByText("Swipe Copy Studio"));

      const headline = screen.getByPlaceholderText("e.g. The #1 Stellar Affiliate Protocol of 2026");
      fireEvent.change(headline, { target: { value: "Smart Contract Escrow Advantage" } });

      const body = screen.getByPlaceholderText(/Check out the newest campaign/);
      fireEvent.change(body, { target: { value: "Full newsletter body content goes here." } });

      const cta = screen.getByPlaceholderText(
        "e.g. Click here to claim your 15% discount [AFFILIATE_LINK]",
      );
      fireEvent.change(cta, { target: { value: "Join StormSale today" } });

      const pinSwipeButton = screen.getByText("Pin Swipe Copy to IPFS");
      fireEvent.click(pinSwipeButton);

      await waitFor(
        () => {
          expect(onUploaded).toHaveBeenCalled();
        },
        { timeout: 5000 },
      );
    });
  });
});
