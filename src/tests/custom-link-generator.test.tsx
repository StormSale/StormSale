// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CustomShortLink } from "../types/affiliateLink";
import { LinkGeneratorModal } from "../components/affiliate/LinkGeneratorModal";

const mocks = vi.hoisted(() => ({
  useWeb3: vi.fn(),
  showNotification: vi.fn(),
  checkSlugAvailability: vi.fn(),
  createCustomShortLink: vi.fn(),
  getShortLinkUrl: vi.fn((slug: string) => `https://stormsale.xyz/c/${slug}`),
  computeWalletFingerprint: vi.fn(),
  isValidStellarAddress: vi.fn(),
}));

vi.mock("../context/Web3Context", () => ({ useWeb3: mocks.useWeb3 }));
vi.mock("../context/NotificationContext", () => ({
  useNotification: () => ({ showNotification: mocks.showNotification }),
}));
vi.mock("../lib/customLinks", () => ({
  checkSlugAvailability: mocks.checkSlugAvailability,
  createCustomShortLink: mocks.createCustomShortLink,
  getShortLinkUrl: mocks.getShortLinkUrl,
  computeWalletFingerprint: mocks.computeWalletFingerprint,
}));
vi.mock("../lib/stellar", () => ({ isValidStellarAddress: mocks.isValidStellarAddress }));

const wallet = `G${"A".repeat(55)}`;
const generatedLink: CustomShortLink = {
  id: "custom-link-1",
  slug: "spring-sale",
  affiliateWallet: wallet,
  walletFingerprint: "fingerprint-1",
  campaignId: "2",
  campaignName: "Web3 Masterclass",
  destinationUrl: "https://merchant.example/product",
  trackingParams: { utm_source: "stormsale", utm_medium: "affiliate" },
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  clickCount: 0,
};

describe("LinkGeneratorModal", () => {
  const writeText = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.useWeb3.mockReturnValue({ userAddress: wallet });
    mocks.checkSlugAvailability.mockImplementation((slug: string) => ({
      isAvailable: slug.toLowerCase() !== "taken-slug",
      normalizedSlug: slug.toLowerCase(),
      reason: slug.toLowerCase() === "taken-slug" ? "Slug is already registered." : undefined,
    }));
    mocks.computeWalletFingerprint.mockResolvedValue("fingerprint-1");
    mocks.isValidStellarAddress.mockReturnValue(true);
    mocks.createCustomShortLink.mockResolvedValue(generatedLink);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("validates, configures, creates, copies, and resets a custom short link", async () => {
    const onClose = vi.fn();
    const onLinkCreated = vi.fn();
    render(
      <LinkGeneratorModal
        isOpen
        onClose={onClose}
        onLinkCreated={onLinkCreated}
        defaultCampaignId="1"
      />,
    );

    expect(screen.getByText("Fingerprint: pending")).toBeTruthy();
    await waitFor(() => expect(screen.getByText("Fingerprint: fingerprint-1")).toBeTruthy());

    const slugInput = screen.getByLabelText("Custom Short-Link Slug");
    fireEvent.change(slugInput, { target: { value: "taken-slug" } });
    expect(screen.getByText("Collision Detected:")).toBeTruthy();
    expect(screen.getByText("Slug is already registered.")).toBeTruthy();

    fireEvent.change(slugInput, { target: { value: "spring-sale" } });
    expect(screen.getByText("Available!")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Target Campaign"), { target: { value: "2" } });
    fireEvent.change(screen.getByPlaceholderText("https://merchant.com/product"), {
      target: { value: "https://merchant.example/product" },
    });
    fireEvent.click(screen.getByText("Preserved Attribution & UTM Parameters"));
    fireEvent.change(screen.getByPlaceholderText("spring-sale"), {
      target: { value: "spring_campaign" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Generate Short Link" }));
    await screen.findByText("Custom Short Link Created!");
    expect(mocks.createCustomShortLink).toHaveBeenCalledWith(
      expect.objectContaining({
        slug: "spring-sale",
        affiliateWallet: wallet,
        campaignId: "2",
        campaignName: "Web3 Masterclass",
        destinationUrl: "https://merchant.example/product",
        customUtmCampaign: "spring_campaign",
      }),
    );
    expect(onLinkCreated).toHaveBeenCalledWith(generatedLink);

    fireEvent.click(screen.getByRole("button", { name: "Copy Link" }));
    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith("https://stormsale.xyz/c/spring-sale"),
    );
    expect(mocks.showNotification).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Link Copied!" }),
    );

    fireEvent.click(screen.getByRole("button", { name: "Create Another Link" }));
    expect((screen.getByLabelText("Custom Short-Link Slug") as HTMLInputElement).value).toBe("");
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalled();
  });

  it("reports creation and clipboard errors and handles missing wallets", async () => {
    mocks.createCustomShortLink.mockRejectedValueOnce(new Error("API unavailable"));
    const { unmount } = render(<LinkGeneratorModal isOpen onClose={vi.fn()} />);

    fireEvent.change(screen.getByLabelText("Custom Short-Link Slug"), {
      target: { value: "spring-sale" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Generate Short Link" }));
    await waitFor(() =>
      expect(mocks.showNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Link Creation Failed",
          message: "API unavailable",
        }),
      ),
    );

    mocks.createCustomShortLink.mockResolvedValueOnce(generatedLink);
    fireEvent.click(screen.getByRole("button", { name: "Generate Short Link" }));
    await screen.findByText("Custom Short Link Created!");
    writeText.mockRejectedValueOnce(new Error("Clipboard denied"));
    fireEvent.click(screen.getByRole("button", { name: "Copy Link" }));
    await waitFor(() =>
      expect(mocks.showNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Unable to Copy Link",
          message: "Clipboard denied",
        }),
      ),
    );

    unmount();
    mocks.useWeb3.mockReturnValue({ userAddress: null });
    mocks.computeWalletFingerprint.mockRejectedValueOnce(new Error("Fingerprint unavailable"));
    render(<LinkGeneratorModal isOpen onClose={vi.fn()} />);
    expect(
      screen.getByText("Connect a Stellar wallet to generate a tracked short link."),
    ).toBeTruthy();
    expect(
      (screen.getByRole("button", { name: "Generate Short Link" }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it("rejects an invalid connected wallet and leaves the modal closed", () => {
    mocks.isValidStellarAddress.mockReturnValue(false);
    const onClose = vi.fn();
    const { rerender } = render(<LinkGeneratorModal isOpen={false} onClose={onClose} />);
    expect(screen.queryByText("Custom Short-Link Generator")).toBeNull();
    rerender(<LinkGeneratorModal isOpen onClose={onClose} />);

    fireEvent.change(screen.getByLabelText("Custom Short-Link Slug"), {
      target: { value: "spring-sale" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Generate Short Link" }));
    expect(mocks.showNotification).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Invalid Wallet Address" }),
    );
    expect(mocks.createCustomShortLink).not.toHaveBeenCalled();
  });
});
