// @vitest-environment jsdom
import type { ReactNode } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AffiliateProfileCard } from "../components/affiliate/AffiliateProfileCard";
import {
  saveClaimedBadge,
  setAffiliatePrivacy,
  setUserGrossSales,
} from "../lib/affiliateLeaderboard";
import type { ClaimedMilestoneRecord } from "../types/affiliateLeaderboard";

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
vi.mock("../components/ui/dialog", () => ({
  Dialog: ({
    children,
    onOpenChange,
  }: {
    children?: ReactNode;
    onOpenChange?: (open: boolean) => void;
  }) => (
    <div>
      <button onClick={() => onOpenChange?.(false)}>Dismiss dialog</button>
      {children}
    </div>
  ),
  DialogContent: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
}));

const USER = "GUSER7VQK66EZM6PFFKYY2F6J6E4YQZ5YQ47T7V6PX6T3K42P37X2LTB";
const OTHER = "GOTHER7VQK66EZM6PFFKYY2F6J6E4YQZ5YQ47T7V6PX6T3K42P37X2LTC";

function makeRecord(tier: "1k" | "10k" | "100k", affiliateAddress: string): ClaimedMilestoneRecord {
  return {
    tier,
    tokenId: "SBT-EXISTING",
    txHash: "0xabc123",
    claimedAt: "2025-06-01T00:00:00Z",
    nonTransferable: true,
    tokenUri: "ipfs://bafybeistormbadges-test",
    contractAddress: "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC",
    affiliateAddress,
  };
}

describe("AffiliateProfileCard", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    mocks.useWeb3.mockReturnValue({ userAddress: null, connectorType: null });
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: vi.fn() },
      configurable: true,
    });
  });

  afterEach(() => cleanup());

  it("renders identity metrics and locked trophies for an unlinked affiliate", () => {
    // Pin volume below the $1K threshold so every tier stays locked.
    setUserGrossSales(USER, { monthly: 500 });
    render(<AffiliateProfileCard affiliateAddress={USER} />);

    expect(screen.getByText("Gamified Milestone Trophies")).toBeTruthy();
    expect(screen.getByText("Monthly Volume")).toBeTruthy();
    expect(screen.getByText("All-Time Volume")).toBeTruthy();
    expect(screen.getByText("Conversions")).toBeTruthy();
    expect(screen.getByText("Earnings")).toBeTruthy();
    expect(screen.getByText("Verified On-Chain")).toBeTruthy();
    // All three tiers are locked below the $1K threshold.
    expect(screen.getAllByText("Locked")).toHaveLength(3);
  });

  it("masks the identity when the affiliate has privacy enabled", () => {
    setAffiliatePrivacy(USER, true);
    render(<AffiliateProfileCard affiliateAddress={USER} />);

    expect(screen.getByText("Privacy Masked")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Copy" }));
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(expect.stringContaining("("));
  });

  it("copies the identifier and shares a public profile link", () => {
    render(<AffiliateProfileCard affiliateAddress={USER} />);

    fireEvent.click(screen.getByRole("button", { name: "Copy" }));
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(USER);
    expect(screen.getByRole("button", { name: "Copied" })).toBeTruthy();
    expect(mocks.showNotification).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Address Copied" }),
    );

    fireEvent.click(screen.getByRole("button", { name: "Share" }));
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      expect.stringContaining(`?profile=${USER}`),
    );
    expect(mocks.showNotification).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Profile Link Ready" }),
    );
  });

  it("mints an unlocked badge for the connected user", async () => {
    mocks.useWeb3.mockReturnValue({ userAddress: USER, connectorType: "freighter" });
    setUserGrossSales(USER, { monthly: 1500 });
    mocks.mint.mockResolvedValue({ tokenId: "SBT-MINT-1", txHash: "0xdeadbeef00" });
    const onBadgeClaimed = vi.fn();

    render(<AffiliateProfileCard affiliateAddress={USER} onBadgeClaimed={onBadgeClaimed} />);
    expect(screen.getByText("You")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Claim Milestone Badge" }));
    expect(await screen.findByText("Soulbound Minted")).toBeTruthy();

    expect(mocks.mint).toHaveBeenCalledWith(USER, "1k", "freighter");
    expect(onBadgeClaimed).toHaveBeenCalledOnce();
    expect(mocks.showNotification).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Achievement Unlocked! 🏆" }),
    );
  });

  it("reports a failed on-chain claim", async () => {
    mocks.useWeb3.mockReturnValue({ userAddress: USER, connectorType: null });
    setUserGrossSales(USER, { monthly: 1500 });
    mocks.mint.mockRejectedValue(new Error("rpc offline"));

    render(<AffiliateProfileCard affiliateAddress={USER} />);
    fireEvent.click(screen.getByRole("button", { name: "Claim Milestone Badge" }));

    await waitFor(() =>
      expect(mocks.showNotification).toHaveBeenCalledWith(
        expect.objectContaining({ title: "Claim Failed", message: "rpc offline" }),
      ),
    );
  });

  it("surfaces claimed badge metadata for other viewers", () => {
    mocks.useWeb3.mockReturnValue({ userAddress: USER, connectorType: "freighter" });
    const address = "GCLAIMED7VQK66EZM6PFFKYY2F6J6E4YQZ5YQ47T7V6PX6T3K42P37";
    setUserGrossSales(address, { monthly: 1500 });
    saveClaimedBadge(makeRecord("1k", address));

    render(<AffiliateProfileCard affiliateAddress={address} />);

    expect(screen.getByText("SBT-EXISTING")).toBeTruthy();
    expect(screen.getByText("Non-Transferable SBT")).toBeTruthy();
    // Another user's profile exposes the milestone but not a claim action.
    expect(screen.getByText("Soulbound Minted")).toBeTruthy();
  });

  it("marks an unclaimed milestone for non-owners", () => {
    mocks.useWeb3.mockReturnValue({ userAddress: USER, connectorType: "freighter" });
    setUserGrossSales(OTHER, { monthly: 1500 });

    render(<AffiliateProfileCard affiliateAddress={OTHER} />);

    expect(screen.getByText("Milestone Reached (Unclaimed)")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Claim Milestone Badge" })).toBeNull();
  });

  it("renders inline without a dialog when standalone", () => {
    render(<AffiliateProfileCard affiliateAddress={USER} isStandalone />);

    expect(screen.queryByText("Dismiss dialog")).toBeNull();
    expect(screen.getByText("Gamified Milestone Trophies")).toBeTruthy();
  });

  it("closes the dialog wrapper", () => {
    const onClose = vi.fn();
    render(<AffiliateProfileCard affiliateAddress={USER} onClose={onClose} />);

    fireEvent.click(screen.getByText("Dismiss dialog"));
    expect(onClose).toHaveBeenCalledOnce();
  });
});