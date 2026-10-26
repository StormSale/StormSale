// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { BrandCustomizer } from "../components/advertiser/BrandCustomizer";
import { DEFAULT_BRAND_CONFIG } from "../lib/branding";

const mockShowNotification = vi.fn();
let mockUserAddress: string | null = "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5";

vi.mock("../hooks/useWeb3", () => ({
  useWeb3: () => ({
    userAddress: mockUserAddress,
  }),
}));

vi.mock("../context/NotificationContext", () => ({
  useNotification: () => ({
    showNotification: mockShowNotification,
  }),
}));

vi.mock("../components/shared/BrandedCampaignView", () => ({
  BrandedCampaignView: ({
    brandConfig,
    onClose,
  }: {
    brandConfig: any;
    onClose?: () => void;
    isStandalone?: boolean;
  }) => (
    <div data-testid="branded-preview">
      <span>Preview Brand: {brandConfig.brandName}</span>
      <span>Preview Subdomain: {brandConfig.subdomain}</span>
      <span>Preview Color: {brandConfig.primaryColor}</span>
      {onClose && <button onClick={onClose}>Close Standalone Modal</button>}
    </div>
  ),
}));

// Mock uploadBrandConfigToIpfs so we control resolution & rejection
const mockUploadIpfs = vi.fn();
vi.mock("../lib/branding", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/branding")>();
  return {
    ...actual,
    uploadBrandConfigToIpfs: (...args: any[]) => mockUploadIpfs(...args),
  };
});

describe("BrandCustomizer Component", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mockUserAddress = "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5";
    mockUploadIpfs.mockResolvedValue({
      ipfsUri: "ipfs://bafybeihmockcid123456789",
      cid: "bafybeihmockcid123456789",
      timestamp: 1710000000000,
    });
  });

  it("renders customizer controls, inputs, WCAG contrast badge, and live preview", () => {
    render(<BrandCustomizer />);

    expect(screen.getByText("Storefront & Brand Customizer")).toBeTruthy();
    expect(screen.getByText("Dynamic Subdomain & Identity")).toBeTruthy();
    expect(screen.getByText("Color Theme & WCAG Accessibility")).toBeTruthy();
    expect(screen.getByText("Logo & Banner Graphics")).toBeTruthy();
    expect(screen.getByText("Marketplace Hero Copy")).toBeTruthy();
    expect(screen.getByText("Real-Time Live Preview")).toBeTruthy();

    // Verify preview renders initial brand info
    expect(screen.getByText(`Preview Brand: ${DEFAULT_BRAND_CONFIG.brandName}`)).toBeTruthy();
  });

  it("handles subdomain input formatting and validation feedback", () => {
    render(<BrandCustomizer />);

    const subdomainInput = screen.getByPlaceholderText("mybrand");

    // Invalid subdomain: too short (2 chars)
    fireEvent.change(subdomainInput, { target: { value: "ab" } });
    expect(
      screen.getByText("Subdomain must be 3-30 characters with alphanumeric letters or hyphens."),
    ).toBeTruthy();

    // Format special characters and uppercase
    fireEvent.change(subdomainInput, { target: { value: "Apex_Cool#Store!" } });
    expect((subdomainInput as HTMLInputElement).value).toBe("apexcoolstore");
  });

  it("updates brand name, tagline, and hero copy fields", () => {
    render(<BrandCustomizer />);

    const brandNameInput = screen.getByDisplayValue(DEFAULT_BRAND_CONFIG.brandName);
    fireEvent.change(brandNameInput, { target: { value: "Supernova Gear" } });
    expect((brandNameInput as HTMLInputElement).value).toBe("Supernova Gear");

    const taglineInput = screen.getByDisplayValue(DEFAULT_BRAND_CONFIG.tagline);
    fireEvent.change(taglineInput, { target: { value: "Decentralized Escrow Apparel" } });
    expect((taglineInput as HTMLInputElement).value).toBe("Decentralized Escrow Apparel");

    const heroHeadlineInput = screen.getByDisplayValue(DEFAULT_BRAND_CONFIG.heroHeadline);
    fireEvent.change(heroHeadlineInput, { target: { value: "Earn 30% Commissions Now" } });
    expect((heroHeadlineInput as HTMLInputElement).value).toBe("Earn 30% Commissions Now");

    const heroSubtitleInput = screen.getByDisplayValue(DEFAULT_BRAND_CONFIG.heroSubtitle);
    fireEvent.change(heroSubtitleInput, { target: { value: "Instant on-chain settlement." } });
    expect((heroSubtitleInput as HTMLInputElement).value).toBe("Instant on-chain settlement.");

    const ctaTextInput = screen.getByDisplayValue(DEFAULT_BRAND_CONFIG.ctaText);
    fireEvent.change(ctaTextInput, { target: { value: "Join Affiliate Network" } });
    expect((ctaTextInput as HTMLInputElement).value).toBe("Join Affiliate Network");
  });

  it("selects curated color presets and custom hex color pickers", () => {
    render(<BrandCustomizer />);

    // Click 'Emerald Escrow' preset
    const emeraldPreset = screen.getByRole("button", { name: /Emerald Escrow/i });
    fireEvent.click(emeraldPreset);

    // Verify primary color input updated
    const hexInputs = screen.getAllByDisplayValue("#059669");
    expect(hexInputs.length).toBeGreaterThanOrEqual(1);

    // Click 'Cyberpunk Violet' preset
    const violetPreset = screen.getByRole("button", { name: /Cyberpunk Violet/i });
    fireEvent.click(violetPreset);
    expect(screen.getAllByDisplayValue("#7C3AED").length).toBeGreaterThanOrEqual(1);

    // Custom color hex text input
    const primaryTextInput = screen.getAllByDisplayValue("#7C3AED")[0];
    fireEvent.change(primaryTextInput, { target: { value: "#10B981" } });

    // Custom accent / secondary color text input
    const secondaryTextInput = screen.getAllByDisplayValue("#EC4899")[0];
    fireEvent.change(secondaryTextInput, { target: { value: "#3B82F6" } });
  });

  it("toggles between desktop and mobile preview modes", () => {
    const { container } = render(<BrandCustomizer />);

    const mobileBtn = screen.getByRole("button", { name: /Mobile/i });
    fireEvent.click(mobileBtn);

    // Container should now include mobile max-width constraint
    expect(container.querySelector(".max-w-\\[375px\\]")).toBeTruthy();

    const desktopBtn = screen.getByRole("button", { name: /Desktop/i });
    fireEvent.click(desktopBtn);
    expect(container.querySelector(".w-full")).toBeTruthy();
  });

  it("opens and closes full public storefront modal", () => {
    render(<BrandCustomizer />);

    const fullPreviewBtn = screen.getByRole("button", { name: /View Full Public Storefront/i });
    fireEvent.click(fullPreviewBtn);

    // Standalone modal rendered
    expect(screen.getByText("Close Standalone Modal")).toBeTruthy();

    // Close modal
    fireEvent.click(screen.getByText("Close Standalone Modal"));
    expect(screen.queryByText("Close Standalone Modal")).toBeNull();
  });

  it("handles logo and banner image uploads with FileReader", async () => {
    render(<BrandCustomizer />);

    // Mock FileReader
    const mockResult = "data:image/png;base64,mockFileData123";
    class MockFileReader {
      onloadend: (() => void) | null = null;
      result: string = mockResult;
      readAsDataURL() {
        if (this.onloadend) this.onloadend();
      }
    }
    vi.stubGlobal("FileReader", MockFileReader);

    const fileInputs = document.querySelectorAll('input[type="file"]');
    expect(fileInputs.length).toBe(2);

    const logoInput = fileInputs[0] as HTMLInputElement;
    const bannerInput = fileInputs[1] as HTMLInputElement;

    const testFile = new File(["dummy"], "logo.png", { type: "image/png" });

    await act(async () => {
      fireEvent.change(logoInput, { target: { files: [testFile] } });
      fireEvent.change(bannerInput, { target: { files: [testFile] } });
    });

    // Check images received mock base64 data
    const images = document.querySelectorAll("img");
    expect(Array.from(images).some((img) => img.src === mockResult)).toBe(true);

    vi.unstubAllGlobals();
  });

  it("blocks IPFS publish if subdomain is invalid", async () => {
    render(<BrandCustomizer />);

    const subdomainInput = screen.getByPlaceholderText("mybrand");
    // Change to invalid 2-char subdomain
    fireEvent.change(subdomainInput, { target: { value: "ab" } });

    const publishBtn = screen.getByRole("button", { name: /Publish to IPFS/i });
    // Button is disabled when subdomain is invalid
    expect((publishBtn as HTMLButtonElement).disabled).toBe(true);
  });

  it("publishes brand configuration to IPFS successfully", async () => {
    render(<BrandCustomizer />);

    const publishBtn = screen.getByRole("button", { name: /Publish to IPFS/i });
    await act(async () => {
      fireEvent.click(publishBtn);
    });

    expect(mockUploadIpfs).toHaveBeenCalled();
    expect(mockShowNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "success",
        title: "Published to IPFS!",
      }),
    );
  });

  it("handles IPFS upload failure with error notification", async () => {
    mockUploadIpfs.mockRejectedValueOnce(new Error("IPFS Gateway Timeout"));

    render(<BrandCustomizer />);

    const publishBtn = screen.getByRole("button", { name: /Publish to IPFS/i });
    await act(async () => {
      fireEvent.click(publishBtn);
    });

    expect(mockShowNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "error",
        title: "IPFS Publishing Failed",
        message: "IPFS Gateway Timeout",
      }),
    );
  });

  it("reloads brand config on wallet change and scopes merchant config without session bleeding", async () => {
    // 1. First wallet session
    mockUserAddress = "GA11111111111111111111111111111111111111111111111111111111";
    // Pre-save custom config for wallet 1
    const wallet1Config = {
      ...DEFAULT_BRAND_CONFIG,
      brandName: "Wallet 1 Brand",
      advertiserAddress: mockUserAddress,
      subdomain: "wallet-one",
    };
    localStorage.setItem(
      `stormsale_advertiser_brand_${mockUserAddress.toLowerCase()}`,
      JSON.stringify(wallet1Config),
    );

    const { rerender } = render(<BrandCustomizer />);

    await waitFor(() => {
      expect(screen.getByDisplayValue("Wallet 1 Brand")).toBeTruthy();
    });

    // 2. Connect a new wallet session
    mockUserAddress = "GB22222222222222222222222222222222222222222222222222222222";
    const wallet2Config = {
      ...DEFAULT_BRAND_CONFIG,
      brandName: "Wallet 2 Brand",
      advertiserAddress: mockUserAddress,
      subdomain: "wallet-two",
    };
    localStorage.setItem(
      `stormsale_advertiser_brand_${mockUserAddress.toLowerCase()}`,
      JSON.stringify(wallet2Config),
    );

    // Rerender as new wallet
    await act(async () => {
      rerender(<BrandCustomizer />);
    });

    // Verify state reset and reloaded with Wallet 2 Brand
    await waitFor(() => {
      expect(screen.getByDisplayValue("Wallet 2 Brand")).toBeTruthy();
    });
    expect(screen.queryByDisplayValue("Wallet 1 Brand")).toBeNull();
  });
});
