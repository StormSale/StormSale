// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MilestoneBadges } from "../components/affiliate/MilestoneBadges";
import { setUserGrossSales } from "../lib/affiliateLeaderboard";

const mocks = vi.hoisted(() => ({
  useWeb3: vi.fn(),
  showNotification: vi.fn(),
  mint: vi.fn(),
}));

vi.mock("../context/Web3Context", () => ({ useWeb3: mocks.useWeb3 }));
vi.mock("../context/NotificationContext", () => ({
  useNotification: () => ({ showNotification: mocks.showNotification }),
}));
vi.mock("../lib/stellar", () => ({ mintMilestoneBadgeContractCall: mocks.mint }));
vi.mock("../components/affiliate/AffiliateProfileCard", () => ({
  AffiliateProfileCard: ({
    affiliateAddress,
    onClose,
  }: {
    affiliateAddress: string;
    onClose?: () => void;
  }) => (
    <div>
      <span>Preview card for {affiliateAddress}</span>
      <button onClick={onClose}>Close preview</button>
    </div>
  ),
}));

const USER = "GUSER7VQK66EZM6PFFKYY2F6J6E4YQZ5YQ47T7V6PX6T3K42P37X2LTB";

describe("MilestoneBadges", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    mocks.useWeb3.mockReturnValue({ userAddress: null, connectorType: null });
  });

  afterEach(() => cleanup());

  it("renders the trophy catalogue with every tier locked for a visitor", () => {
    render(<MilestoneBadges />);

    expect(screen.getByText("Milestone Badges & Soulbound Trophies")).toBeTruthy();
    expect(screen.getByText("$1K Pioneer")).toBeTruthy();
    expect(screen.getByText("$10K Vanguard")).toBeTruthy();
    expect(screen.getByText("$100K Titan")).toBeTruthy();
    expect(screen.getAllByText("Locked")).toHaveLength(3);
  });

  it("simulates sales volume and unlocks the $1K milestone", async () => {
    mocks.useWeb3.mockReturnValue({ userAddress: USER, connectorType: "freighter" });
    render(<MilestoneBadges />);

    fireEvent.click(screen.getByRole("button", { name: /Adjust Volume/ }));
    fireEvent.click(screen.getByRole("button", { name: "$1,500 (Unlocks $1K)" }));

    expect(await screen.findByText("Ready to Claim")).toBeTruthy();
    expect(screen.getByText(/Gross Sales/)).toBeTruthy();
    expect(mocks.showNotification).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Sales Volume Updated" }),
    );
  });

  it("mints an unlocked milestone badge on-chain", async () => {
    mocks.useWeb3.mockReturnValue({ userAddress: USER, connectorType: "freighter" });
    setUserGrossSales(USER, { monthly: 1500 });
    mocks.mint.mockResolvedValue({ tokenId: "SBT-TROPHY", txHash: "0xabc9000" });

    render(<MilestoneBadges />);
    fireEvent.click(screen.getByRole("button", { name: "Claim Milestone Badge" }));

    expect(await screen.findByText("Claimed")).toBeTruthy();
    expect(screen.getByText("SBT-TROPHY")).toBeTruthy();
    expect(screen.getByText("Verify on Explorer")).toBeTruthy();
    expect(mocks.showNotification).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Soulbound NFT Minted! 🏆" }),
    );
  });

  it("reports a failed claim", async () => {
    mocks.useWeb3.mockReturnValue({ userAddress: USER, connectorType: null });
    setUserGrossSales(USER, { monthly: 1500 });
    mocks.mint.mockRejectedValue(new Error("rpc offline"));

    render(<MilestoneBadges />);
    fireEvent.click(screen.getByRole("button", { name: "Claim Milestone Badge" }));

    await waitFor(() =>
      expect(mocks.showNotification).toHaveBeenCalledWith(
        expect.objectContaining({ title: "Claim Failed", message: "rpc offline" }),
      ),
    );
  });

  it("celebrates a fully-completed milestone ladder", () => {
    mocks.useWeb3.mockReturnValue({ userAddress: USER, connectorType: "freighter" });
    setUserGrossSales(USER, { monthly: 125000 });

    render(<MilestoneBadges />);

    expect(screen.getByText("All Milestones Achieved! 🎉")).toBeTruthy();
    expect(screen.getAllByText("Ready to Claim")).toHaveLength(3);
  });

  it("opens and closes the public profile preview", () => {
    mocks.useWeb3.mockReturnValue({ userAddress: USER, connectorType: "freighter" });
    render(<MilestoneBadges />);

    fireEvent.click(screen.getByRole("button", { name: /View Public Profile Card/ }));
    expect(screen.getByText(`Preview card for ${USER}`)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Close preview" }));
    expect(screen.queryByText(`Preview card for ${USER}`)).toBeNull();
  });
});