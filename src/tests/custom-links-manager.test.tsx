// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CustomShortLink } from "../types/affiliateLink";
import { CustomLinksManager } from "../components/affiliate/CustomLinksManager";

const mocks = vi.hoisted(() => ({
  showNotification: vi.fn(),
  getAllCustomLinks: vi.fn(),
  fetchAllCustomLinks: vi.fn(),
  deleteCustomShortLink: vi.fn(),
  getShortLinkUrl: vi.fn((slug: string) => `https://stormsale.xyz/c/${slug}`),
  userAddress: "Gaffiliate-wallet",
}));

vi.mock("../hooks/useWeb3", () => ({
  useWeb3: () => ({ userAddress: mocks.userAddress }),
}));
vi.mock("../context/NotificationContext", () => ({
  useNotification: () => ({ showNotification: mocks.showNotification }),
}));
vi.mock("../lib/customLinks", () => ({
  getAllCustomLinks: mocks.getAllCustomLinks,
  fetchAllCustomLinks: mocks.fetchAllCustomLinks,
  deleteCustomShortLink: mocks.deleteCustomShortLink,
  getShortLinkUrl: mocks.getShortLinkUrl,
}));
vi.mock("../components/affiliate/LinkGeneratorModal", () => ({
  LinkGeneratorModal: ({
    isOpen,
    onClose,
    onLinkCreated,
  }: {
    isOpen: boolean;
    onClose: () => void;
    onLinkCreated: (link: CustomShortLink) => void;
  }) =>
    isOpen ? (
      <div>
        <button onClick={() => onLinkCreated(createdLink)}>Add generated link</button>
        <button onClick={onClose}>Close generator</button>
      </div>
    ) : null,
}));

const createdLink: CustomShortLink = {
  id: "link-new",
  slug: "new-deals",
  affiliateWallet: "Gaffiliate-wallet",
  walletFingerprint: "fingerprint-new",
  campaignId: "7",
  campaignName: "New Campaign",
  destinationUrl: "https://new.example/deal",
  trackingParams: {},
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  clickCount: 0,
};

const sampleLinks: CustomShortLink[] = [
  {
    ...createdLink,
    id: "link-one",
    slug: "tech-deals",
    campaignName: "Technology Campaign",
    destinationUrl: "https://electronics.example/deals",
    affiliateWallet: "Gwallet-one",
    walletFingerprint: "fingerprint-one",
    clickCount: 1250,
  },
  {
    ...createdLink,
    id: "link-two",
    slug: "wellness",
    campaignName: "Wellness Campaign",
    destinationUrl: "https://health.example/shop",
    affiliateWallet: "Gwallet-two",
    walletFingerprint: "fingerprint-two",
    clickCount: 0,
  },
];

describe("CustomLinksManager", () => {
  const writeText = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getAllCustomLinks.mockReturnValue(sampleLinks);
    mocks.fetchAllCustomLinks.mockResolvedValue(sampleLinks);
    mocks.deleteCustomShortLink.mockResolvedValue(true);
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [],
    });
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
  });

  afterEach(() => cleanup());

  it("renders metrics, searches each link field, copies links, and handles delete outcomes", async () => {
    const { container } = render(<CustomLinksManager />);
    expect(screen.getByText("Total Custom Links")).toBeTruthy();
    const totalLinkMetric = screen.getByText("Total Custom Links").parentElement;
    expect(totalLinkMetric?.querySelectorAll("p")[1].textContent).toBe("2");
    expect(screen.getByText("1,250")).toBeTruthy();
    expect(screen.getAllByText("/c/tech-deals").length).toBeGreaterThan(0);

    const search = screen.getByPlaceholderText("Search custom slugs, campaigns, wallets...");
    for (const query of ["tech", "Technology", "electronics", "Gwallet-one"]) {
      fireEvent.change(search, { target: { value: query } });
      expect(screen.getAllByText("/c/tech-deals").length).toBeGreaterThan(0);
      expect(screen.queryAllByText("/c/wellness")).toHaveLength(0);
    }
    fireEvent.change(search, { target: { value: "" } });

    fireEvent.click(screen.getAllByTitle("Copy full short link")[0]);
    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith("https://stormsale.xyz/c/tech-deals"),
    );
    expect(mocks.showNotification).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Short Link Copied!" }),
    );

    mocks.deleteCustomShortLink.mockResolvedValueOnce(false);
    fireEvent.click(screen.getAllByTitle("Delete link")[0]);
    await waitFor(() =>
      expect(mocks.deleteCustomShortLink).toHaveBeenCalledWith("link-one", mocks.userAddress),
    );
    expect(screen.getAllByText("/c/tech-deals").length).toBeGreaterThan(0);

    mocks.deleteCustomShortLink.mockResolvedValueOnce(true);
    fireEvent.click(screen.getAllByTitle("Delete link")[0]);
    await waitFor(() => expect(screen.queryAllByText("/c/tech-deals")).toHaveLength(0));
    expect(mocks.showNotification).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Short Link Removed" }),
    );

    mocks.deleteCustomShortLink.mockRejectedValueOnce(new Error("Delete failed"));
    fireEvent.click(screen.getByTitle("Delete link"));
    await waitFor(() =>
      expect(mocks.showNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Failed to Remove Short Link",
          message: "Delete failed",
        }),
      ),
    );

    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: vi.fn().mockRejectedValue(new Error("Clipboard denied")) },
    });
    fireEvent.click(screen.getByTitle("Copy full short link"));
    await waitFor(() =>
      expect(mocks.showNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Unable to Copy Short Link",
          message: "Clipboard denied",
        }),
      ),
    );
    expect(container.querySelector('a[title="Test Redirect"]')?.getAttribute("href")).toBe(
      "/c/wellness",
    );
  });

  it("shows the empty state, opens the generator, and adds a created link", () => {
    mocks.getAllCustomLinks.mockReturnValue([]);
    mocks.fetchAllCustomLinks.mockResolvedValue([]);
    render(<CustomLinksManager />);
    expect(screen.getByText("No custom short links found")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Generate Short Link" }));
    fireEvent.click(screen.getByRole("button", { name: "Add generated link" }));
    expect(screen.getAllByText("/c/new-deals")).toHaveLength(2);
    expect(screen.queryByText("No custom short links found")).toBeNull();
  });

  it("shows the search-specific empty state without the create action", () => {
    render(<CustomLinksManager />);
    fireEvent.change(screen.getByPlaceholderText("Search custom slugs, campaigns, wallets..."), {
      target: { value: "not-found" },
    });
    expect(screen.getByText("Try adjusting your search criteria.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Generate Short Link" })).toBeNull();
  });

  it("calculates and displays real-time CVR percentages and trend indicators for active links", async () => {
    render(<CustomLinksManager />);

    // Table headers for CVR analytics
    expect(screen.getByText("Sales")).toBeTruthy();
    expect(screen.getByText("CVR %")).toBeTruthy();
    expect(screen.getByText("Trend")).toBeTruthy();

    // Bento stat card for CVR
    expect(screen.getByText("Real-time CVR")).toBeTruthy();

    // Verify CVR calculation for active links
    await waitFor(() => {
      // link-one has 1250 clicks and matching demo conversions
      expect(screen.getByTestId("cvr-percentage-tech-deals")).toBeTruthy();
      expect(screen.getByTestId("cvr-trend-tech-deals")).toBeTruthy();
      expect(screen.getByTestId("sales-count-tech-deals")).toBeTruthy();

      // link-two has 0 clicks -> 0.00% CVR
      const wellnessCvr = screen.getByTestId("cvr-percentage-wellness");
      expect(wellnessCvr.textContent).toContain("0.00%");
    });
  });

  it("handles manual sync conversions trigger and shows feedback notification", async () => {
    render(<CustomLinksManager />);

    const syncBtn = screen.getByTestId("sync-conversions-btn");
    await waitFor(() => expect(syncBtn.getAttribute("disabled")).toBeNull());

    fireEvent.click(syncBtn);

    await waitFor(() => {
      expect(mocks.showNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "success",
          title: "Conversion Data Synced",
        }),
      );
    });
  });
});
