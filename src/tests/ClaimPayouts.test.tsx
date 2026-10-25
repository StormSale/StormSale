// @vitest-environment jsdom
import { Buffer } from "buffer";
globalThis.Buffer = Buffer;

import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../config/stellar", () => {
  const asset = (code: string, name: string) => ({
    code,
    name,
    decimals: 7,
    contractAddress: `C${code}${"A".repeat(50)}`,
  });
  return {
    STELLAR_CONFIG: { network: "TESTNET", contractId: "CCONTRACT", nativeAsset: "XLM", nativeDecimals: 7 },
    SUPPORTED_ESCROW_ASSETS: {
      XLM: asset("XLM", "Stellar Lumens"),
      USDC: asset("USDC", "USD Coin (Circle SAC)"),
      EURC: asset("EURC", "Euro Coin (Circle SAC)"),
    },
    NETWORK_ESCROW_ASSETS: {
      TESTNET: {},
      PUBLIC: {},
    },
  };
});

import { ClaimPayouts } from "../components/affiliate/ClaimPayouts";

const mockBatchClaimPayoutsOnChain = vi.fn();
const mockClaimPayoutOnChain = vi.fn();
const mockShowNotification = vi.fn();

vi.mock("../hooks/useWeb3", () => ({
  useWeb3: () => ({
    userAddress: "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
    batchClaimPayoutsOnChain: mockBatchClaimPayoutsOnChain,
    claimPayoutOnChain: mockClaimPayoutOnChain,
  }),
}));

vi.mock("../context/NotificationContext", () => ({
  useNotification: () => ({
    showNotification: mockShowNotification,
  }),
}));

const mockClaimsData = [
  {
    campaignId: 101,
    campaignName: "Apex Alpha Performance Tech",
    advertiserAddress: "GA7QW5KXGPTR4N2K9J2M3N4P5Q6R7S8T9U0V1W2X3Y4Z5A6B7C8D",
    maturedSalesCount: 4,
    claimableXlm: 45.5,
    clearingPeriodDays: 7,
    lastSaleDate: "2026-10-01",
    status: "matured",
    assetCode: "XLM",
  },
  {
    campaignId: 204,
    campaignName: "Nova Quantum Cloud Services",
    advertiserAddress: "GB4RN8XJLP8M1K3V6P7Q8R9S0T1U2V3W4X5Y6Z7A8B9C0D1E2F3G",
    maturedSalesCount: 7,
    claimableXlm: 78.0,
    clearingPeriodDays: 14,
    lastSaleDate: "2026-09-28",
    status: "clearing",
    assetCode: "XLM",
  },
];

vi.mock("../lib/batchClaim", () => ({
  fetchAffiliateMaturedClaims: vi.fn(async () => mockClaimsData),
  calculateTotalClaimableXlm: (camps: any[]) =>
    camps.reduce((sum, c) => sum + (c.claimableXlm || 0), 0),
}));

vi.mock("../components/affiliate/AffiliateSettings", () => ({
  loadAffiliatePreferences: vi.fn(() => ({})),
  shouldDeliverAffiliateNotification: vi.fn(() => true),
}));

vi.mock("../lib/commissionSplit", () => ({
  resolveActiveSplitPlan: vi.fn(() => null),
  formatStroopsAsXlm: (val: any) => String(val),
}));

vi.mock("../lib/sorobanDex", () => ({
  quoteSwap: vi.fn(() => ({
    from: "XLM",
    to: "USDC",
    expectedOut: 450000000n,
    minimumOut: 445000000n,
    priceImpactBps: 10,
    effectiveRate: 0.99,
    routerName: "Soroban AMM",
    route: { hops: ["XLM", "USDC"] },
  })),
  toBaseUnits: (v: any) => BigInt(Math.round(v * 10000000)),
  formatBaseUnits: () => "45.00",
}));

describe("ClaimPayouts Component", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockBatchClaimPayoutsOnChain.mockReset();
    mockClaimPayoutOnChain.mockReset();
    mockShowNotification.mockReset();
  });

  it("renders matured claims and handles batch claim execution", async () => {
    mockBatchClaimPayoutsOnChain.mockResolvedValueOnce({
      totalClaimedXlm: 45.5,
      itemizedClaims: [
        {
          campaignId: 101,
          campaignName: "Apex Alpha Performance Tech",
          claimedXlm: 45.5,
        },
      ],
      txHash: "mock-batch-tx-hash-12345",
      splitTransfers: [],
      autoSwap: {
        tokenIn: "XLM",
        amountIn: "45.5",
        tokenOut: "USDC",
        expectedOut: "45.00",
        minAmountOut: "44.50",
        routerName: "Soroban AMM",
        footprint: ["XLM", "USDC"],
      },
    });

    render(<ClaimPayouts />);

    await waitFor(() => {
      expect(screen.getByText("Apex Alpha Performance Tech")).toBeTruthy();
      expect(screen.getByText("Nova Quantum Cloud Services")).toBeTruthy();
    });

    // Select/deselect toggle
    const deselectAllBtn = screen.getByText("Deselect All");
    fireEvent.click(deselectAllBtn); // deselect all
    const selectAllBtn = screen.getByText(/Select All/i);
    fireEvent.click(selectAllBtn); // reselect all

    // Enable auto-swap toggle
    const swapToggle = screen.getByTestId("auto-swap-toggle");
    fireEvent.click(swapToggle);

    // Click Batch Claim
    const claimButton = screen.getByRole("button", { name: /Claim All/i });
    await act(async () => {
      fireEvent.click(claimButton);
    });

    expect(mockBatchClaimPayoutsOnChain).toHaveBeenCalled();
    expect(mockShowNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "success",
        title: "Batch Commission Claim Settled!",
      }),
    );

    // Verify receipt modal renders and dismisses
    expect(screen.getByText("Batch Payout Complete!")).toBeTruthy();
    const closeReceiptBtn = screen.getByRole("button", { name: /Done/i });
    fireEvent.click(closeReceiptBtn);
  });

  it("handles individual campaign claim fallback", async () => {
    mockClaimPayoutOnChain.mockResolvedValueOnce({
      txHash: "mock-single-claim-tx-9999",
    });

    render(<ClaimPayouts />);

    await waitFor(() => {
      expect(screen.getByText("Apex Alpha Performance Tech")).toBeTruthy();
    });

    const singleClaimBtn = screen.getAllByRole("button", { name: /Claim Single/i })[0];
    await act(async () => {
      fireEvent.click(singleClaimBtn);
    });

    expect(mockClaimPayoutOnChain).toHaveBeenCalledWith(101, "XLM");
    expect(mockShowNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "success",
        title: "Commission Paid Out!",
      }),
    );
  });

  it("handles batch claim failure with notification", async () => {
    mockBatchClaimPayoutsOnChain.mockRejectedValueOnce(new Error("RPC timeout"));

    render(<ClaimPayouts />);

    await waitFor(() => {
      expect(screen.getByText("Apex Alpha Performance Tech")).toBeTruthy();
    });

    const claimButton = screen.getByRole("button", { name: /Claim All/i });
    await act(async () => {
      fireEvent.click(claimButton);
    });

    expect(mockShowNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "error",
        title: "Batch Claim Failed",
        message: "RPC timeout",
      }),
    );
  });
});
