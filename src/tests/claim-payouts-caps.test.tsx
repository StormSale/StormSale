// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ClaimPayouts } from "../components/affiliate/ClaimPayouts";
import { NotificationProvider } from "../context/NotificationContext";
import { recordAffiliateClaim, getRolling24HourClaimVolume } from "../lib/payoutCap";

const AFFILIATE_ADDRESS = "GAFFILIATE_CAP_TEST_WALLET_1234567890";

const mockClaimPayoutOnChain = vi.fn().mockResolvedValue({ txHash: "0xsingle123" });
const mockBatchClaimPayoutsOnChain = vi.fn().mockResolvedValue({
  txHash: "0xbatch123",
  totalClaimedXlm: 155.75,
  itemizedClaims: [],
});

const mockWeb3 = {
  userAddress: AFFILIATE_ADDRESS,
  isConnected: true,
  claimPayoutOnChain: mockClaimPayoutOnChain,
  batchClaimPayoutsOnChain: mockBatchClaimPayoutsOnChain,
};

vi.mock("../hooks/useWeb3", () => ({
  useWeb3: () => mockWeb3,
  useSafeWeb3: () => mockWeb3,
}));

describe("ClaimPayouts Daily Payout Cap & Quota Banner (#156)", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  const renderComponent = () =>
    render(
      <NotificationProvider>
        <ClaimPayouts />
      </NotificationProvider>,
    );

  it("renders the 24-Hour Rolling Commission Payout Quota Banner", async () => {
    renderComponent();

    expect(screen.getByTestId("daily-payout-cap-banner")).toBeTruthy();
    expect(screen.getByText(/Rolling 24-Hour Claim Quota/i)).toBeTruthy();
    expect(screen.getByText(/Quota Available/i)).toBeTruthy();
    expect(screen.getByText(/1000\.00 XLM/i)).toBeTruthy();
  });

  it("executes single payout claim and records volume towards 24h rolling cap", async () => {
    renderComponent();

    await waitFor(() => {
      expect(screen.getByTestId("btn-claim-single-101")).toBeTruthy();
    });

    const claimBtn = screen.getByTestId("btn-claim-single-101");
    fireEvent.click(claimBtn);

    await waitFor(() => {
      expect(mockClaimPayoutOnChain).toHaveBeenCalledWith(101, undefined, 45.5);
    });

    // Verify claim was recorded to affiliate rolling volume
    const vol = getRolling24HourClaimVolume(AFFILIATE_ADDRESS);
    expect(vol).toBe(45.5);
  });

  it("enforces daily payout cap and blocks claim when cap is exceeded", async () => {
    // Record 980 XLM claim volume so only 20 XLM remains in 24h window
    recordAffiliateClaim(AFFILIATE_ADDRESS, 101, 980);

    renderComponent();

    await waitFor(() => {
      expect(screen.getByTestId("btn-claim-single-101")).toBeTruthy();
    });

    // Campaign 101 has 45.5 XLM which exceeds remaining 20 XLM
    const claimBtn = screen.getByTestId("btn-claim-single-101");
    fireEvent.click(claimBtn);

    await waitFor(() => {
      expect(screen.getAllByText(/Daily Claim Cap Exceeded/i).length).toBeGreaterThan(0);
    });

    // On-chain claim should NOT be called
    expect(mockClaimPayoutOnChain).not.toHaveBeenCalled();
  });

  it("executes batch payout claim when within daily cap quota", async () => {
    renderComponent();

    await waitFor(() => {
      expect(screen.getByTestId("btn-batch-claim")).toBeTruthy();
    });

    const batchBtn = screen.getByTestId("btn-batch-claim");
    fireEvent.click(batchBtn);

    await waitFor(() => {
      expect(mockBatchClaimPayoutsOnChain).toHaveBeenCalled();
    });

    const vol = getRolling24HourClaimVolume(AFFILIATE_ADDRESS);
    expect(vol).toBeGreaterThan(0);
  });
});
