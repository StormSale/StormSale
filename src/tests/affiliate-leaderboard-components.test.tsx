// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  userAddress: null as string | null,
  connectorType: "freighter" as string,
  showNotification: vi.fn(),
  mint: vi.fn(),
}));

vi.mock("../context/Web3Context", () => ({
  useWeb3: () => ({ userAddress: mocks.userAddress, connectorType: mocks.connectorType }),
  Web3Provider: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock("../context/NotificationContext", () => ({
  useNotification: () => ({ showNotification: mocks.showNotification }),
}));
vi.mock("../lib/stellar", () => ({
  mintMilestoneBadgeContractCall: mocks.mint,
}));
vi.mock("../config/stellar", () => ({
  STELLAR_CONFIG: { explorerUrl: "https://locatest.stellar.org/transaction" },
}));

import { AffiliateLeaderboard } from "../components/affiliate/AffiliateLeaderboard";
import { MilestoneBadges } from "../components/affiliate/MilestoneBadges";
import { AffiliateProfileCard } from "../components/affiliate/AffiliateProfileCard";
import { setUserGrossSales, saveClaimedBadge } from "../lib/affiliateLeaderboard";

const USER = "GTESTUSERAFFILIATEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";

function record(tier: "1k" | "10k" | "100k") {
  return {
    tier,
    tokenId: `SBT-${tier}`,
    txHash: `0xtx${tier}`,
    claimedAt: "2025-01-01T00:00:00Z",
    nonTransferable: true as const,
    tokenUri: `ipfs://${tier}`,
    contractAddress: "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC",
    affiliateAddress: USER,
  };
}

describe("AffiliateLeaderboard component", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    mocks.userAddress = USER;
    mocks.connectorType = "freighter";
  });

  afterEach(() => {
    cleanup();
  });

  it("renders the podium, stats and rankings, and drives all controls", () => {
    const onSelectMilestones = vi.fn();
    render(<AffiliateLeaderboard onSelectMilestones={onSelectMilestones} />);

    // Header + stats + table are present after the initial render.
    expect(screen.getByText("Affiliate Leaderboards")).toBeTruthy();
    expect(screen.getByText("Top 50 Affiliate Rankings")).toBeTruthy();

    // Timeframe pills
    fireEvent.click(screen.getByRole("button", { name: "This Week" }));
    fireEvent.click(screen.getByRole("button", { name: "All-Time" }));
    fireEvent.click(screen.getByRole("button", { name: /This Month/ }));

    // Sort controls
    fireEvent.click(screen.getByRole("button", { name: "Sales #" }));
    fireEvent.click(screen.getByRole("button", { name: "Earnings" }));
    fireEvent.click(screen.getByRole("button", { name: "Volume" }));

    // Claim milestones shortcut
    fireEvent.click(screen.getByRole("button", { name: /Claim Milestones/ }));
    expect(onSelectMilestones).toHaveBeenCalled();

    // Open a profile card from the champion podium button
    fireEvent.click(screen.getByRole("button", { name: /View Champion Profile/ }));
    expect(screen.getByText("Gamified Milestone Trophies")).toBeTruthy();
  });

  it("masks and unmasks the connected user's address", () => {
    render(<AffiliateLeaderboard />);
    fireEvent.click(screen.getByRole("button", { name: /Mask My Address/ }));
    expect(screen.getByText("Stealth Active")).toBeTruthy();
    expect(screen.getByText("Address masked with pseudonym")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Unmask Address/ }));
    expect(screen.getByText("Public Stellar address displayed")).toBeTruthy();
  });

  it("prompts to connect a wallet when privacy is toggled while disconnected", () => {
    mocks.userAddress = null;
    render(<AffiliateLeaderboard />);
    fireEvent.click(screen.getByRole("button", { name: /Mask My Address/ }));
    expect(mocks.showNotification).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Connect Wallet" }),
    );
  });

  it("filters the board by search and shows the empty state", () => {
    render(<AffiliateLeaderboard />);
    const input = screen.getByPlaceholderText("Search address or pseudonym...");
    fireEvent.change(input, { target: { value: "zzzz-no-match" } });
    expect(screen.getByText(/No affiliates matched/)).toBeTruthy();
  });
});

describe("MilestoneBadges component", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    mocks.userAddress = USER;
    mocks.connectorType = "freighter";
  });

  afterEach(() => {
    cleanup();
  });

  it("simulates sales volume and claims an unlocked badge", async () => {
    setUserGrossSales(USER, { monthly: 500 });
    mocks.mint.mockResolvedValue({ success: true, txHash: "0xminted", tokenId: "SBT-MINT-1K" });
    render(<MilestoneBadges />);

    // Open the volume simulator and bump into the $1K tier.
    fireEvent.click(screen.getByRole("button", { name: /Adjust Volume/ }));
    fireEvent.click(screen.getByRole("button", { name: /\$1,500/ }));
    expect(mocks.showNotification).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Sales Volume Updated" }),
    );

    // Claim the now-unlocked $1K badge (async on-chain mint).
    fireEvent.click(screen.getByRole("button", { name: /Claim Milestone Badge/ }));
    await waitFor(() => expect(mocks.mint).toHaveBeenCalled());
    await waitFor(() =>
      expect(mocks.showNotification).toHaveBeenCalledWith(
        expect.objectContaining({ title: "Soulbound NFT Minted! 🏆" }),
      ),
    );
  });

  it("surfaces a claim failure notification", async () => {
    setUserGrossSales(USER, { monthly: 5000 });
    mocks.mint.mockRejectedValueOnce(new Error("user rejected"));
    render(<MilestoneBadges />);
    fireEvent.click(screen.getByRole("button", { name: /Claim Milestone Badge/ }));
    await waitFor(() =>
      expect(mocks.showNotification).toHaveBeenCalledWith(
        expect.objectContaining({ title: "Claim Failed", message: "user rejected" }),
      ),
    );
  });

  it("ignores volume simulation when no wallet is connected", () => {
    mocks.userAddress = null;
    render(<MilestoneBadges />);
    fireEvent.click(screen.getByRole("button", { name: /Adjust Volume/ }));
    fireEvent.click(screen.getByRole("button", { name: /\$500/ }));
    expect(mocks.showNotification).not.toHaveBeenCalledWith(
      expect.objectContaining({ title: "Sales Volume Updated" }),
    );
  });

  it("previews the public profile card", () => {
    setUserGrossSales(USER, { monthly: 150000 });
    saveClaimedBadge(record("1k"));
    render(<MilestoneBadges />);
    fireEvent.click(screen.getByRole("button", { name: /View Public Profile Card/ }));
    expect(screen.getByText("Gamified Milestone Trophies")).toBeTruthy();
  });
});

describe("AffiliateProfileCard component", () => {
  const writeText = vi.fn();

  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    mocks.userAddress = USER;
    mocks.connectorType = "freighter";
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
  });

  afterEach(() => {
    cleanup();
  });

  it("copies, shares and claims from a standalone current-user card", async () => {
    setUserGrossSales(USER, { monthly: 2000 });
    mocks.mint.mockResolvedValue({ success: true, txHash: "0xstandalone", tokenId: "SBT-SA-1K" });
    const onBadgeClaimed = vi.fn();
    render(
      <AffiliateProfileCard
        affiliateAddress={USER}
        isStandalone
        onBadgeClaimed={onBadgeClaimed}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Copy/ }));
    expect(writeText).toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /Share/ }));
    fireEvent.click(screen.getByRole("button", { name: /Claim Milestone Badge/ }));
    await waitFor(() => expect(mocks.mint).toHaveBeenCalled());
    await waitFor(() => expect(onBadgeClaimed).toHaveBeenCalled());
  });

  it("shows a claimed soulbound badge with explorer verification", () => {
    setUserGrossSales(USER, { monthly: 50000 });
    saveClaimedBadge(record("10k"));
    render(<AffiliateProfileCard affiliateAddress={USER} isStandalone />);
    expect(screen.getByText(/Soulbound Minted/)).toBeTruthy();
    expect(screen.getAllByRole("link", { name: /Tx Hash/ }).length).toBeGreaterThan(0);
  });

  it("renders a locked milestone CTA for another user's public card", () => {
    setUserGrossSales(USER, { monthly: 250000 });
    saveClaimedBadge(record("1k"));
    saveClaimedBadge(record("10k"));
    saveClaimedBadge(record("100k"));
    const other = "GOTHERVIEWERAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
    render(<AffiliateProfileCard affiliateAddress={other} isOpen onClose={vi.fn()} />);
    // Not the current user, but milestones are reached on the viewer's own sales baseline.
    expect(screen.getByText("Gamified Milestone Trophies")).toBeTruthy();
  });

  it("surfaces a claim error on the profile card", async () => {
    setUserGrossSales(USER, { monthly: 5000 });
    mocks.mint.mockRejectedValueOnce(new Error("network down"));
    render(<AffiliateProfileCard affiliateAddress={USER} isStandalone />);
    fireEvent.click(screen.getByRole("button", { name: /Claim Milestone Badge/ }));
    await waitFor(() =>
      expect(mocks.showNotification).toHaveBeenCalledWith(
        expect.objectContaining({ title: "Claim Failed", message: "network down" }),
      ),
    );
  });
});
