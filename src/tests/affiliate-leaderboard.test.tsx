// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AffiliateLeaderboard } from "../components/affiliate/AffiliateLeaderboard";

const mocks = vi.hoisted(() => ({
  useWeb3: vi.fn(),
  showNotification: vi.fn(),
}));

vi.mock("../context/Web3Context", () => ({ useWeb3: mocks.useWeb3 }));
vi.mock("../context/NotificationContext", () => ({
  useNotification: () => ({ showNotification: mocks.showNotification }),
}));
vi.mock("../components/affiliate/AffiliateProfileCard", () => ({
  AffiliateProfileCard: ({
    affiliateAddress,
    onClose,
  }: {
    affiliateAddress: string;
    onClose?: () => void;
  }) => (
    <div>
      <span>Profile card for {affiliateAddress}</span>
      <button onClick={onClose}>Close profile</button>
    </div>
  ),
}));

const SEED_TOP = "GDXRN7VQK66EZM6PFFKYY2F6J6E4YQZ5YQ47T7V6PX6T3K42P37X2LTA";

describe("AffiliateLeaderboard", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    mocks.useWeb3.mockReturnValue({ userAddress: null, connectorType: null });
  });

  afterEach(() => cleanup());

  it("renders the summary stats, podium and full top-50 table", () => {
    render(<AffiliateLeaderboard />);

    expect(screen.getByText("Affiliate Leaderboards")).toBeTruthy();
    expect(screen.getByText("Top 50 Affiliate Rankings")).toBeTruthy();
    expect(screen.getByText("#1 Champion")).toBeTruthy();
    expect(screen.getByText("#2 Rank")).toBeTruthy();
    expect(screen.getByText("#3 Rank")).toBeTruthy();

    // Header row + 50 ranked affiliates.
    expect(screen.getAllByRole("row")).toHaveLength(51);

    // No milestone shortcut without the callback prop.
    expect(screen.queryByRole("button", { name: "Claim Milestones" })).toBeNull();
  });

  it("revalues displayed volume when switching timeframes", () => {
    render(<AffiliateLeaderboard />);
    expect(screen.getAllByText("$148,500").length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("button", { name: "This Week" }));
    expect(screen.getAllByText("$38,200").length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("button", { name: "All-Time" }));
    expect(screen.getAllByText("$780,000").length).toBeGreaterThan(0);
  });

  it("filters results through search and shows the empty state", () => {
    render(<AffiliateLeaderboard />);
    const search = screen.getByPlaceholderText("Search address or pseudonym...");

    fireEvent.change(search, { target: { value: "ApexStormer" } });
    expect(screen.getAllByRole("row")).toHaveLength(2);

    fireEvent.change(search, { target: { value: "zzz-no-match" } });
    expect(screen.getByText("No affiliates matched your search criteria.")).toBeTruthy();
  });

  it("switches the active sort mode", () => {
    render(<AffiliateLeaderboard />);

    fireEvent.click(screen.getByRole("button", { name: "Sales #" }));
    expect(screen.getAllByText("842").length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("button", { name: "Earnings" }));
    expect(screen.getAllByText(/44,550 XLM/).length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("button", { name: "Volume" }));
    expect(screen.getAllByText("$148,500").length).toBeGreaterThan(0);
  });

  it("prompts to connect a wallet before toggling privacy", () => {
    render(<AffiliateLeaderboard />);

    fireEvent.click(screen.getByRole("button", { name: "Mask My Address" }));
    expect(mocks.showNotification).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Connect Wallet" }),
    );
  });

  it("toggles the connected wallet's privacy and reflects it in the table", () => {
    mocks.useWeb3.mockReturnValue({ userAddress: SEED_TOP, connectorType: "freighter" });
    render(<AffiliateLeaderboard />);

    expect(screen.getByText("You")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Mask My Address" }));

    expect(localStorage.getItem(`stormsale_privacy_masked_${SEED_TOP}`)).toBe("true");
    expect(screen.getByText("Stealth Active")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Unmask Address" })).toBeTruthy();
    expect(mocks.showNotification).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Stealth Privacy Enabled" }),
    );

    fireEvent.click(screen.getByRole("button", { name: "Unmask Address" }));
    expect(localStorage.getItem(`stormsale_privacy_masked_${SEED_TOP}`)).toBe("false");
    expect(mocks.showNotification).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Public Address Visible" }),
    );
  });

  it("opens profile cards from the podium and table rows", () => {
    render(<AffiliateLeaderboard />);

    fireEvent.click(screen.getByRole("button", { name: "View Champion Profile" }));
    expect(screen.getByText(`Profile card for ${SEED_TOP}`)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Close profile" }));
    expect(screen.queryByText(`Profile card for ${SEED_TOP}`)).toBeNull();

    fireEvent.click(screen.getAllByRole("button", { name: /View Profile/ })[0]);
    expect(screen.getByText(/Profile card for G/)).toBeTruthy();
  });

  it("invokes the milestone shortcut when provided", () => {
    const onSelectMilestones = vi.fn();
    render(<AffiliateLeaderboard onSelectMilestones={onSelectMilestones} />);

    fireEvent.click(screen.getByRole("button", { name: "Claim Milestones" }));
    expect(onSelectMilestones).toHaveBeenCalledOnce();
  });
});