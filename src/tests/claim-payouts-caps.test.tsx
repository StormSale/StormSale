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

  it("shows receipt modal with itemized claims after batch payout", async () => {
    mockBatchClaimPayoutsOnChain.mockResolvedValueOnce({
      txHash: "0xreceipt_itemized_abc",
      totalClaimedXlm: 90.0,
      itemizedClaims: [
        { campaignId: 101, campaignName: "Alpha Campaign", claimedXlm: 45.5 },
        { campaignId: 102, campaignName: "Beta Campaign", claimedXlm: 44.5 },
      ],
      splitAllocations: [],
      paymentOperationCount: 2,
    });

    renderComponent();

    await waitFor(() => screen.getByTestId("btn-batch-claim"));
    fireEvent.click(screen.getByTestId("btn-batch-claim"));

    await waitFor(() => {
      // Receipt modal should appear with the total and campaign breakdown
      expect(screen.getByText(/Batch Payout Complete/i)).toBeTruthy();
      expect(screen.getByText(/90\.00 XLM/i)).toBeTruthy();
    });

    // Both campaigns should be listed
    expect(screen.getByText(/Alpha Campaign/i)).toBeTruthy();
    expect(screen.getByText(/Beta Campaign/i)).toBeTruthy();
  });

  it("shows split allocations section in receipt when splitAllocations present", async () => {
    mockBatchClaimPayoutsOnChain.mockResolvedValueOnce({
      txHash: "0xreceipt_split_xyz",
      totalClaimedXlm: 100.0,
      itemizedClaims: [
        { campaignId: 101, campaignName: "Alpha Campaign", claimedXlm: 100.0 },
      ],
      splitAllocations: [
        {
          address: "GDEST1SPLIT1WALLET1ADDRESS1234567890",
          label: "Revenue Share",
          percentage: 20,
          amountStroops: "20000000",
          amountXlm: 20.0,
        },
      ],
      paymentOperationCount: 2,
    });

    renderComponent();

    await waitFor(() => screen.getByTestId("btn-batch-claim"));
    fireEvent.click(screen.getByTestId("btn-batch-claim"));

    await waitFor(() => {
      expect(screen.getByText(/Batch Payout Complete/i)).toBeTruthy();
    });

    // Split allocations section should render
    expect(screen.getByText(/Auto-Split Payment Operations/i)).toBeTruthy();
    expect(screen.getByText(/Revenue Share/i)).toBeTruthy();
  });

  it("shows autoSwap section in receipt when autoSwap is present", async () => {
    mockBatchClaimPayoutsOnChain.mockResolvedValueOnce({
      txHash: "0xreceipt_swap_xyz",
      totalClaimedXlm: 50.0,
      itemizedClaims: [
        { campaignId: 101, campaignName: "Alpha Campaign", claimedXlm: 50.0 },
      ],
      splitAllocations: [],
      paymentOperationCount: 1,
      autoSwap: {
        routerName: "StellarDEX",
        hopCount: 1,
        amountIn: "50.00",
        tokenIn: "XLM",
        expectedOut: "49.50",
        tokenOut: "USDC",
        minimumOut: "48.00",
        maxSlippageBps: 100,
        footprint: ["XLM", "USDC"],
      },
    });

    renderComponent();

    await waitFor(() => screen.getByTestId("btn-batch-claim"));
    fireEvent.click(screen.getByTestId("btn-batch-claim"));

    await waitFor(() => {
      expect(screen.getByText(/Batch Payout Complete/i)).toBeTruthy();
    });

    // Auto-swap section should render
    expect(screen.getByText(/Atomic Cross-DEX Swap/i)).toBeTruthy();
    expect(screen.getAllByText(/StellarDEX/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/49\.50/i).length).toBeGreaterThan(0);
  });

  it("closes receipt modal when Done button is clicked", async () => {
    mockBatchClaimPayoutsOnChain.mockResolvedValueOnce({
      txHash: "0xclose_test",
      totalClaimedXlm: 10.0,
      itemizedClaims: [{ campaignId: 101, campaignName: "Alpha", claimedXlm: 10.0 }],
      splitAllocations: [],
      paymentOperationCount: 1,
    });

    renderComponent();

    await waitFor(() => screen.getByTestId("btn-batch-claim"));
    fireEvent.click(screen.getByTestId("btn-batch-claim"));

    await waitFor(() => screen.getByText(/Batch Payout Complete/i));

    // Click Done to close the receipt
    const doneBtn = screen.getByRole("button", { name: /done/i });
    fireEvent.click(doneBtn);

    await waitFor(() => {
      expect(screen.queryByText(/Batch Payout Complete/i)).toBeNull();
    });
  });

  it("shows 'Daily Cap Reached' badge when cap is fully exhausted", async () => {
    // Record full 1000 XLM claim volume
    recordAffiliateClaim(AFFILIATE_ADDRESS, 101, 1000);

    renderComponent();

    await waitFor(() => {
      expect(screen.getByText(/Daily Cap Reached/i)).toBeTruthy();
    });
  });

  it("shows SEP-0024 withdraw button in idle state", async () => {
    renderComponent();

    await waitFor(() => {
      expect(screen.getByTestId("btn-sep24-withdraw")).toBeTruthy();
    });
  });

  it("opens Sep24WithdrawModal when SEP-0024 button is clicked", async () => {
    renderComponent();

    await waitFor(() => screen.getByTestId("btn-sep24-withdraw"));
    fireEvent.click(screen.getByTestId("btn-sep24-withdraw"));

    await waitFor(() => {
      expect(screen.getByTestId("sep24-withdraw-modal")).toBeTruthy();
    });
  });

  it("records claim volume and refreshes quota after successful single claim", async () => {
    renderComponent();

    await waitFor(() => screen.getByTestId("btn-claim-single-101"));
    fireEvent.click(screen.getByTestId("btn-claim-single-101"));

    await waitFor(() => {
      expect(mockClaimPayoutOnChain).toHaveBeenCalledWith(101, undefined, 45.5);
    });

    // Volume should be recorded after claim
    const vol = getRolling24HourClaimVolume(AFFILIATE_ADDRESS);
    expect(vol).toBeGreaterThan(0);
  });

  it("records claim volume after batch claim and refreshes quota", async () => {
    mockBatchClaimPayoutsOnChain.mockResolvedValueOnce({
      txHash: "0xbatch_quota",
      totalClaimedXlm: 155.75,
      itemizedClaims: [
        { campaignId: 101, campaignName: "Alpha", claimedXlm: 45.5 },
        { campaignId: 102, campaignName: "Beta", claimedXlm: 110.25 },
      ],
      splitAllocations: [],
      paymentOperationCount: 2,
    });

    renderComponent();

    await waitFor(() => screen.getByTestId("btn-batch-claim"));
    fireEvent.click(screen.getByTestId("btn-batch-claim"));

    await waitFor(() => {
      expect(mockBatchClaimPayoutsOnChain).toHaveBeenCalled();
    });

    // Volume should be updated after batch
    const vol = getRolling24HourClaimVolume(AFFILIATE_ADDRESS);
    expect(vol).toBeGreaterThan(0);
  });
});
