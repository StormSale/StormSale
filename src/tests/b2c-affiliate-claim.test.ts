// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { Keypair } from "@stellar/stellar-sdk";
import { ClaimPayouts } from "../components/affiliate/ClaimPayouts";
import { NotificationProvider } from "../context/NotificationContext";
import {
  getMinClaimThreshold,
  isBelowMinClaimThreshold,
  fetchAffiliateMaturedClaims,
  type ClaimableCampaignItem,
} from "../lib/batchClaim";
import { claimPayoutContractCall } from "../lib/stellar";

const AFFILIATE = "GAFFILIATE_B2C_CLAIM_TEST_WALLET_123456";

const mockClaimPayoutOnChain = vi.fn();
const mockBatchClaimPayoutsOnChain = vi.fn();

const mockWeb3 = {
  userAddress: AFFILIATE,
  isConnected: true,
  claimPayoutOnChain: (...a: unknown[]) => mockClaimPayoutOnChain(...a),
  batchClaimPayoutsOnChain: (...a: unknown[]) => mockBatchClaimPayoutsOnChain(...a),
};

vi.mock("../hooks/useWeb3", () => ({
  useWeb3: () => mockWeb3,
  useSafeWeb3: () => mockWeb3,
}));

const renderClaims = () =>
  React.createElement(NotificationProvider, null, React.createElement(ClaimPayouts));

describe("Claim threshold helpers", () => {
  it("uses 1 XLM and 0.5 USDC minimums", () => {
    expect(getMinClaimThreshold("XLM")).toBe(1);
    expect(getMinClaimThreshold("USDC")).toBe(0.5);
    expect(getMinClaimThreshold()).toBe(1);
    expect(getMinClaimThreshold("UNKNOWN")).toBe(1);
  });

  it("flags balances below the minimum and accepts the boundary", () => {
    expect(isBelowMinClaimThreshold(0.99, "XLM")).toBe(true);
    expect(isBelowMinClaimThreshold(1, "XLM")).toBe(false);
    expect(isBelowMinClaimThreshold(0.49, "USDC")).toBe(true);
    expect(isBelowMinClaimThreshold(0.5, "USDC")).toBe(false);
    expect(isBelowMinClaimThreshold(NaN, "XLM")).toBe(true);
  });
});

describe("Soroban affiliate distributor claim_payout invocation", () => {
  afterEach(() => vi.restoreAllMocks());

  it("returns a signed-tx style result in mock wallet mode with the settlement asset", async () => {
    const res = await claimPayoutContractCall(Keypair.random().publicKey(), 101, "mock", "USDC");
    expect(res.success).toBe(true);
    expect(res.txHash).toMatch(/^0x[0-9a-f]{64}$/);
    expect(res.asset).toBe("USDC");
  });
});

describe("ClaimPayouts instant claim & micro-payout UI", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    mockClaimPayoutOnChain.mockResolvedValue({ txHash: "0xsingle123456789" });
  });

  const pending = () => screen.getByTestId("pending-balance").textContent ?? "";

  it("disables the claim button for balances below the minimum threshold", async () => {
    const real = await fetchAffiliateMaturedClaims(AFFILIATE);
    const micro: ClaimableCampaignItem[] = real.map((c, i) => ({
      ...c,
      claimableXlm: i === 0 ? 0.4 : c.claimableXlm,
    }));
    const batch = await import("../lib/batchClaim");
    vi.spyOn(batch, "fetchAffiliateMaturedClaims").mockResolvedValue(micro);

    render(renderClaims());
    await waitFor(() => expect(screen.getByTestId("btn-claim-single-101")).toBeTruthy());

    expect((screen.getByTestId("btn-claim-single-101") as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByTestId("btn-claim-single-204") as HTMLButtonElement).disabled).toBe(false);

    fireEvent.click(screen.getByTestId("btn-claim-single-101"));
    expect(mockClaimPayoutOnChain).not.toHaveBeenCalled();
    vi.restoreAllMocks();
  });

  it("disables batch claim when total is below the minimum", async () => {
    const real = await fetchAffiliateMaturedClaims(AFFILIATE);
    const micro = real.map((c) => ({ ...c, claimableXlm: 0.2 }));
    const batch = await import("../lib/batchClaim");
    vi.spyOn(batch, "fetchAffiliateMaturedClaims").mockResolvedValue(micro);

    render(renderClaims());
    await waitFor(() => expect(screen.getByTestId("btn-claim-single-101")).toBeTruthy());
    // 3 x 0.2 = 0.6 XLM < 1 XLM
    await waitFor(() =>
      expect((screen.getByTestId("btn-batch-claim") as HTMLButtonElement).disabled).toBe(true),
    );
    vi.restoreAllMocks();
  });

  it("claims, shows confetti toast, and deducts the amount from pending balance immediately", async () => {
    render(renderClaims());
    await waitFor(() => expect(screen.getByTestId("btn-claim-single-101")).toBeTruthy());
    await waitFor(() => expect(pending()).toContain("155.75 XLM"));

    fireEvent.click(screen.getByTestId("btn-claim-single-101"));

    await waitFor(() => expect(mockClaimPayoutOnChain).toHaveBeenCalledWith(101, undefined));
    await waitFor(() => expect(pending()).toContain("110.25 XLM")); // 155.75 - 45.50
    expect(await screen.findByText("Commission Paid Out!")).toBeTruthy();
    expect(screen.getByTestId("toast-confetti-animation")).toBeTruthy();
    expect(screen.getByTestId("toast-view-receipt-btn")).toBeTruthy();
  });

  it("does not deduct pending balance when the claim transaction fails", async () => {
    mockClaimPayoutOnChain.mockRejectedValueOnce(new Error("Signature rejected"));
    render(renderClaims());
    await waitFor(() => expect(pending()).toContain("155.75 XLM"));

    fireEvent.click(screen.getByTestId("btn-claim-single-101"));

    expect(await screen.findByText("Claim Failed")).toBeTruthy();
    expect(pending()).toContain("155.75 XLM");
    expect(screen.queryByTestId("toast-confetti-animation")).toBeNull();
  });

  it("shows the success dialog and zeroes pending balance after a batch claim", async () => {
    mockBatchClaimPayoutsOnChain.mockImplementation(async (items: ClaimableCampaignItem[]) => ({
      success: true,
      txHash: "a".repeat(64),
      totalClaimedXlm: items.reduce((s, i) => s + i.claimableXlm, 0),
      itemizedClaims: items.map((i) => ({
        campaignId: i.campaignId,
        campaignName: i.campaignName,
        claimedXlm: i.claimableXlm,
      })),
      paymentOperationCount: items.length,
    }));
    render(renderClaims());
    await waitFor(() => expect(pending()).toContain("155.75 XLM"));
    await waitFor(() =>
      expect((screen.getByTestId("btn-batch-claim") as HTMLButtonElement).disabled).toBe(false),
    );

    fireEvent.click(screen.getByTestId("btn-batch-claim"));

    expect(await screen.findByText(/Total Commission Received/i)).toBeTruthy();
    expect(screen.getByText(/\+155\.75 XLM/)).toBeTruthy();
    expect(pending()).toContain("0.00 XLM");
    expect(screen.getByTestId("toast-confetti-animation")).toBeTruthy();
  });
});
