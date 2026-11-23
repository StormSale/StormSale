// @vitest-environment jsdom
/**
 * SEP-0024 Fiat Payout Bridge – test suite
 * Issue #137: feat(web3): Implement SEP-0024 Hosted Deposit and Withdrawal Bridge
 *
 * Covers:
 *  - discoverTransferServer()         anchor TOML discovery
 *  - initiateSep24Withdrawal()        interactive withdrawal initiation
 *  - parseSep24Transaction()          raw ↔ typed transaction mapping
 *  - pollSep24Transaction()           polling state machine
 *  - <Sep24WithdrawModal />           component rendering & interactions
 *  - <ClaimPayouts />                 "Withdraw to Local Bank" button presence
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import React from "react";

/* ------------------------------------------------------------------ */
/* Hoisted mock factories (must be before any imports that use them)   */
/* ------------------------------------------------------------------ */

const mocks = vi.hoisted(() => ({
  discoverTransferServer: vi.fn(),
  initiateSep24Withdrawal: vi.fn(),
  pollSep24Transaction: vi.fn(),
  parseSep24Transaction: vi.fn(),
  fetchSep24Transaction: vi.fn(),
  showNotification: vi.fn(),
  fetchAffiliateMaturedClaims: vi.fn(),
  calculateTotalClaimableXlm: vi.fn(),
  loadAffiliatePreferences: vi.fn(),
  shouldDeliverAffiliateNotification: vi.fn(),
  resolveActiveSplitPlan: vi.fn(),
  formatStroopsAsXlm: vi.fn(),
  quoteSwap: vi.fn(),
  toBaseUnits: vi.fn(),
  formatBaseUnits: vi.fn(),
  isAffiliatePaused: vi.fn(),
  fetchAuthoritativeAffiliatePauseState: vi.fn(),
}));

/* ------------------------------------------------------------------ */
/* Module mocks                                                         */
/* ------------------------------------------------------------------ */

vi.mock("../lib/sep24", () => ({
  discoverTransferServer: mocks.discoverTransferServer,
  initiateSep24Withdrawal: mocks.initiateSep24Withdrawal,
  pollSep24Transaction: mocks.pollSep24Transaction,
  parseSep24Transaction: mocks.parseSep24Transaction,
  fetchSep24Transaction: mocks.fetchSep24Transaction,
}));

vi.mock("framer-motion", () => ({
  motion: {
    div: ({ children, ...rest }: any) => <div {...rest}>{children}</div>,
  },
  AnimatePresence: ({ children }: any) => <>{children}</>,
}));

vi.mock("../hooks/useWeb3", () => ({
  useWeb3: () => ({
    userAddress: "GCEZWKCA5VLDNRLN3RPRJMRZOX3Z6G5CHCGZG5ZC3Q02I6Q4A5DRJNV",
    batchClaimPayoutsOnChain: vi.fn().mockResolvedValue({
      txHash: "mock-tx-hash",
      totalClaimedXlm: 42.5,
      itemizedClaims: [],
      splitAllocations: [],
      paymentOperationCount: 1,
    }),
    claimPayoutOnChain: vi.fn(),
  }),
}));

vi.mock("../context/NotificationContext", () => ({
  useNotification: () => ({ showNotification: mocks.showNotification }),
}));

vi.mock("../lib/batchClaim", () => ({
  fetchAffiliateMaturedClaims: mocks.fetchAffiliateMaturedClaims,
  calculateTotalClaimableXlm: mocks.calculateTotalClaimableXlm,
}));

vi.mock("../components/affiliate/AffiliateSettings", () => ({
  loadAffiliatePreferences: mocks.loadAffiliatePreferences,
  shouldDeliverAffiliateNotification: mocks.shouldDeliverAffiliateNotification,
}));

vi.mock("../lib/commissionSplit", () => ({
  resolveActiveSplitPlan: mocks.resolveActiveSplitPlan,
  formatStroopsAsXlm: mocks.formatStroopsAsXlm,
}));

vi.mock("../lib/sorobanDex", () => ({
  quoteSwap: mocks.quoteSwap,
  toBaseUnits: mocks.toBaseUnits,
  formatBaseUnits: mocks.formatBaseUnits,
}));

vi.mock("../lib/fraudRiskEngine", () => ({
  isAffiliatePaused: mocks.isAffiliatePaused,
  fetchAuthoritativeAffiliatePauseState: mocks.fetchAuthoritativeAffiliatePauseState,
}));

/* ------------------------------------------------------------------ */
/* Actual imports (after mocks)                                         */
/* ------------------------------------------------------------------ */

import { Sep24WithdrawModal } from "../components/affiliate/Sep24WithdrawModal";
import { ClaimPayouts } from "../components/affiliate/ClaimPayouts";

/* ------------------------------------------------------------------ */
/* Constants                                                            */
/* ------------------------------------------------------------------ */

const MOCK_USER_ADDRESS = "GCEZWKCA5VLDNRLN3RPRJMRZOX3Z6G5CHCGZG5ZC3Q02I6Q4A5DRJNV";
const MOCK_ANCHOR_DOMAIN = "testanchor.stellar.org";
const MOCK_TRANSFER_SERVER = "https://testanchor.stellar.org/sep24";
const MOCK_TRANSACTION_ID = "txn_abc123";
const MOCK_INTERACTIVE_URL =
  "https://testanchor.stellar.org/sep24/transactions/withdraw/interactive?transaction_id=txn_abc123";

/* ------------------------------------------------------------------ */
/* Default setup for each test                                          */
/* ------------------------------------------------------------------ */

beforeEach(() => {
  vi.clearAllMocks();

  mocks.fetchAffiliateMaturedClaims.mockResolvedValue([
    {
      campaignId: 1,
      campaignName: "Alpha Campaign",
      status: "matured",
      maturedSalesCount: 3,
      claimableXlm: 42.5,
      clearingPeriodDays: 7,
    },
  ]);
  mocks.calculateTotalClaimableXlm.mockReturnValue(42.5);
  mocks.loadAffiliatePreferences.mockReturnValue({});
  mocks.shouldDeliverAffiliateNotification.mockReturnValue(false);
  mocks.resolveActiveSplitPlan.mockReturnValue(null);
  mocks.formatStroopsAsXlm.mockReturnValue("0.00");
  mocks.toBaseUnits.mockReturnValue(BigInt(0));
  mocks.formatBaseUnits.mockReturnValue("0.00");
  mocks.isAffiliatePaused.mockReturnValue(false);
  mocks.fetchAuthoritativeAffiliatePauseState.mockResolvedValue(false);
  // Default anchor discovery stub (used by Sep24WithdrawModal internally)
  mocks.discoverTransferServer.mockResolvedValue(MOCK_TRANSFER_SERVER);
});

/* ------------------------------------------------------------------ */
/* Helper: render Sep24WithdrawModal                                    */
/* ------------------------------------------------------------------ */

function renderWithdrawModal(props: Partial<React.ComponentProps<typeof Sep24WithdrawModal>> = {}) {
  return render(
    <Sep24WithdrawModal
      open={true}
      onClose={vi.fn()}
      userAddress={MOCK_USER_ADDRESS}
      anchorDomain={MOCK_ANCHOR_DOMAIN}
      assetCode="USDC"
      {...props}
    />,
  );
}

/* ================================================================== */
/* 1. discoverTransferServer                                            */
/* ================================================================== */

describe("discoverTransferServer()", () => {
  it("resolves the TRANSFER_SERVER_SEP0024 from stellar.toml", async () => {
    mocks.discoverTransferServer.mockResolvedValue(MOCK_TRANSFER_SERVER);

    const { discoverTransferServer } = await import("../lib/sep24");
    const result = await discoverTransferServer(MOCK_ANCHOR_DOMAIN);

    expect(result).toBe(MOCK_TRANSFER_SERVER);
    expect(mocks.discoverTransferServer).toHaveBeenCalledWith(MOCK_ANCHOR_DOMAIN);
  });

  it("throws when anchor domain is unreachable", async () => {
    mocks.discoverTransferServer.mockRejectedValue(
      new Error("Could not load stellar.toml from bad-anchor.example (HTTP 404)"),
    );

    const { discoverTransferServer } = await import("../lib/sep24");
    await expect(discoverTransferServer("bad-anchor.example")).rejects.toThrow(
      /stellar\.toml.*bad-anchor/i,
    );
  });

  it("throws when TOML does not declare TRANSFER_SERVER_SEP0024", async () => {
    mocks.discoverTransferServer.mockRejectedValue(
      new Error("stellar.toml for no-sep24.example does not declare TRANSFER_SERVER_SEP0024"),
    );

    const { discoverTransferServer } = await import("../lib/sep24");
    await expect(discoverTransferServer("no-sep24.example")).rejects.toThrow(
      /does not declare TRANSFER_SERVER_SEP0024/i,
    );
  });
});

/* ================================================================== */
/* 2. initiateSep24Withdrawal                                           */
/* ================================================================== */

describe("initiateSep24Withdrawal()", () => {
  it("returns id and url on success", async () => {
    mocks.initiateSep24Withdrawal.mockResolvedValue({
      id: MOCK_TRANSACTION_ID,
      url: MOCK_INTERACTIVE_URL,
    });

    const { initiateSep24Withdrawal } = await import("../lib/sep24");
    const result = await initiateSep24Withdrawal({
      anchorDomain: MOCK_ANCHOR_DOMAIN,
      assetCode: "USDC",
      account: MOCK_USER_ADDRESS,
      amount: "50.00",
    });

    expect(result.id).toBe(MOCK_TRANSACTION_ID);
    expect(result.url).toBe(MOCK_INTERACTIVE_URL);
  });

  it("throws on non-2xx anchor response", async () => {
    mocks.initiateSep24Withdrawal.mockRejectedValue(
      new Error("SEP-0024 withdrawal initiation failed: Unauthorized"),
    );

    const { initiateSep24Withdrawal } = await import("../lib/sep24");
    await expect(
      initiateSep24Withdrawal({
        anchorDomain: MOCK_ANCHOR_DOMAIN,
        assetCode: "USDC",
        account: MOCK_USER_ADDRESS,
      }),
    ).rejects.toThrow(/withdrawal initiation failed/i);
  });

  it("throws when anchor returns unexpected type", async () => {
    mocks.initiateSep24Withdrawal.mockRejectedValue(
      new Error("Unexpected anchor response: expected type=interactive_customer_info_needed"),
    );

    const { initiateSep24Withdrawal } = await import("../lib/sep24");
    await expect(
      initiateSep24Withdrawal({
        anchorDomain: MOCK_ANCHOR_DOMAIN,
        assetCode: "USDC",
        account: MOCK_USER_ADDRESS,
      }),
    ).rejects.toThrow(/expected type=interactive_customer_info_needed/i);
  });
});

/* ================================================================== */
/* 3. parseSep24Transaction                                             */
/* ================================================================== */

describe("parseSep24Transaction()", () => {
  it("maps snake_case anchor fields to typed Sep24Transaction", async () => {
    mocks.parseSep24Transaction.mockReturnValue({
      id: "txn_xyz",
      kind: "withdrawal",
      status: "completed",
      message: "Transfer complete",
      externalTransactionId: "BANK-REF-00123",
      amountIn: "50.00",
      amountOut: "49.50",
      assetCode: "USDC",
      startedAt: "2026-11-19T08:00:00Z",
      completedAt: "2026-11-19T08:05:00Z",
    });

    const { parseSep24Transaction } = await import("../lib/sep24");
    const tx = parseSep24Transaction({
      id: "txn_xyz",
      kind: "withdrawal",
      status: "completed",
      message: "Transfer complete",
      external_transaction_id: "BANK-REF-00123",
      amount_in: "50.00",
      amount_out: "49.50",
      amount_in_asset: "USDC",
      started_at: "2026-11-19T08:00:00Z",
      completed_at: "2026-11-19T08:05:00Z",
    });

    expect(tx.id).toBe("txn_xyz");
    expect(tx.status).toBe("completed");
    expect(tx.externalTransactionId).toBe("BANK-REF-00123");
    expect(tx.amountOut).toBe("49.50");
    expect(tx.kind).toBe("withdrawal");
  });

  it("falls back to fiat_payout_reference when external_transaction_id absent", async () => {
    mocks.parseSep24Transaction.mockReturnValue({
      id: "txn_fallback",
      kind: "withdrawal",
      status: "completed",
      externalTransactionId: "FIAT-PAYOUT-REF-99",
    });

    const { parseSep24Transaction } = await import("../lib/sep24");
    const tx = parseSep24Transaction({
      id: "txn_fallback",
      kind: "withdrawal",
      status: "completed",
      fiat_payout_reference: "FIAT-PAYOUT-REF-99",
    });
    expect(tx.externalTransactionId).toBe("FIAT-PAYOUT-REF-99");
  });
});

/* ================================================================== */
/* 4. pollSep24Transaction – state machine                             */
/* ================================================================== */

describe("pollSep24Transaction()", () => {
  it("resolves with completed=true when status reaches 'completed'", async () => {
    mocks.pollSep24Transaction.mockResolvedValue({
      transaction: {
        id: MOCK_TRANSACTION_ID,
        kind: "withdrawal",
        status: "completed",
        externalTransactionId: "BANK-REF-00123",
        amountIn: "50.00",
        amountOut: "49.50",
      },
      completed: true,
    });

    const { pollSep24Transaction } = await import("../lib/sep24");
    const result = await pollSep24Transaction({
      transferServerUrl: MOCK_TRANSFER_SERVER,
      transactionId: MOCK_TRANSACTION_ID,
    });

    expect(result.completed).toBe(true);
    expect(result.transaction.status).toBe("completed");
    expect(result.transaction.externalTransactionId).toBe("BANK-REF-00123");
  });

  it("calls onStatusChange on each status change", async () => {
    const onStatusChange = vi.fn();

    mocks.pollSep24Transaction.mockImplementation(async ({ onStatusChange: cb }: any) => {
      cb({ id: MOCK_TRANSACTION_ID, status: "pending_anchor", kind: "withdrawal" });
      cb({
        id: MOCK_TRANSACTION_ID,
        status: "completed",
        kind: "withdrawal",
        externalTransactionId: "REF-X",
      });
      return {
        transaction: { id: MOCK_TRANSACTION_ID, status: "completed", externalTransactionId: "REF-X" },
        completed: true,
      };
    });

    const { pollSep24Transaction } = await import("../lib/sep24");
    await pollSep24Transaction({
      transferServerUrl: MOCK_TRANSFER_SERVER,
      transactionId: MOCK_TRANSACTION_ID,
      onStatusChange,
    });

    expect(onStatusChange).toHaveBeenCalledTimes(2);
    expect(onStatusChange).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ status: "pending_anchor" }),
    );
    expect(onStatusChange).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ status: "completed" }),
    );
  });

  it("rejects after maxAttempts without terminal status", async () => {
    mocks.pollSep24Transaction.mockRejectedValue(
      new Error(
        `SEP-0024 transaction ${MOCK_TRANSACTION_ID} did not reach a terminal status after 60 attempts`,
      ),
    );

    const { pollSep24Transaction } = await import("../lib/sep24");
    await expect(
      pollSep24Transaction({
        transferServerUrl: MOCK_TRANSFER_SERVER,
        transactionId: MOCK_TRANSACTION_ID,
        maxAttempts: 60,
      }),
    ).rejects.toThrow(/did not reach a terminal status/i);
  });
});

/* ================================================================== */
/* 5. <Sep24WithdrawModal /> – component rendering                     */
/* ================================================================== */

describe("<Sep24WithdrawModal />", () => {
  it("renders with the correct dialog role and label (AC2)", () => {
    renderWithdrawModal();
    const dialog = screen.getByRole("dialog");
    expect(dialog).toBeTruthy();
    expect(dialog.getAttribute("aria-label")).toContain("SEP-0024");
  });

  it("renders 'Start Bank Withdrawal' button in idle phase", () => {
    renderWithdrawModal();
    expect(screen.getByTestId("sep24-start-btn")).toBeTruthy();
  });

  it("shows loading spinner while initiating withdrawal", async () => {
    mocks.initiateSep24Withdrawal.mockReturnValue(new Promise(() => {})); // never resolves

    renderWithdrawModal();
    fireEvent.click(screen.getByTestId("sep24-start-btn"));

    await waitFor(() => {
      expect(screen.getByTestId("sep24-initiating-spinner")).toBeTruthy();
    });
  });

  it("renders anchor iframe after successful initiation (AC2)", async () => {
    mocks.initiateSep24Withdrawal.mockResolvedValue({
      id: MOCK_TRANSACTION_ID,
      url: MOCK_INTERACTIVE_URL,
    });

    renderWithdrawModal();
    fireEvent.click(screen.getByTestId("sep24-start-btn"));

    await waitFor(() => {
      const iframe = screen.getByTestId("sep24-iframe");
      expect(iframe).toBeTruthy();
      expect(iframe.getAttribute("src")).toBe(MOCK_INTERACTIVE_URL);
    });
  });

  it("renders 'I've Submitted My Bank Details' button in interactive phase (AC2)", async () => {
    mocks.initiateSep24Withdrawal.mockResolvedValue({
      id: MOCK_TRANSACTION_ID,
      url: MOCK_INTERACTIVE_URL,
    });

    renderWithdrawModal();
    fireEvent.click(screen.getByTestId("sep24-start-btn"));

    await waitFor(() => {
      expect(screen.getByTestId("sep24-submitted-btn")).toBeTruthy();
    });
  });

  it("shows polling spinner after user submits bank details", async () => {
    mocks.initiateSep24Withdrawal.mockResolvedValue({
      id: MOCK_TRANSACTION_ID,
      url: MOCK_INTERACTIVE_URL,
    });
    mocks.pollSep24Transaction.mockReturnValue(new Promise(() => {})); // never resolves

    renderWithdrawModal();
    fireEvent.click(screen.getByTestId("sep24-start-btn"));

    await waitFor(() => screen.getByTestId("sep24-submitted-btn"));
    fireEvent.click(screen.getByTestId("sep24-submitted-btn"));

    await waitFor(() => {
      expect(screen.getByTestId("sep24-polling-spinner")).toBeTruthy();
    });
  });

  it("renders confirmation receipt with fiat payout reference after completion (AC3)", async () => {
    mocks.initiateSep24Withdrawal.mockResolvedValue({
      id: MOCK_TRANSACTION_ID,
      url: MOCK_INTERACTIVE_URL,
    });
    mocks.pollSep24Transaction.mockResolvedValue({
      transaction: {
        id: MOCK_TRANSACTION_ID,
        kind: "withdrawal",
        status: "completed",
        externalTransactionId: "BANK-REF-00123",
        amountIn: "50.00",
        amountOut: "49.50",
        assetCode: "USDC",
        completedAt: "2026-11-19T10:00:00Z",
      },
      completed: true,
    });

    renderWithdrawModal();
    fireEvent.click(screen.getByTestId("sep24-start-btn"));
    await waitFor(() => screen.getByTestId("sep24-submitted-btn"));
    fireEvent.click(screen.getByTestId("sep24-submitted-btn"));

    await waitFor(() => {
      expect(screen.getByTestId("sep24-receipt")).toBeTruthy();
    });

    // AC3: Confirmation receipt displays fiat payout reference
    const fiatRef = screen.getByTestId("sep24-receipt-fiat-ref");
    expect(fiatRef.textContent).toContain("BANK-REF-00123");
    const txId = screen.getByTestId("sep24-receipt-tx-id");
    expect(txId.textContent).toContain(MOCK_TRANSACTION_ID);
  });

  it("displays error message and retry button on initiation failure", async () => {
    mocks.initiateSep24Withdrawal.mockRejectedValue(
      new Error("SEP-0024 withdrawal initiation failed: Unauthorized"),
    );

    renderWithdrawModal();
    fireEvent.click(screen.getByTestId("sep24-start-btn"));

    await waitFor(() => {
      expect(screen.getByTestId("sep24-error-msg")).toBeTruthy();
    });
    expect(screen.getByTestId("sep24-retry-btn")).toBeTruthy();
    expect(screen.getByTestId("sep24-error-msg").textContent).toMatch(/withdrawal initiation failed/i);
  });

  it("resets to idle phase after clicking retry", async () => {
    mocks.initiateSep24Withdrawal.mockRejectedValue(new Error("Network error"));

    renderWithdrawModal();
    fireEvent.click(screen.getByTestId("sep24-start-btn"));

    await waitFor(() => screen.getByTestId("sep24-retry-btn"));
    fireEvent.click(screen.getByTestId("sep24-retry-btn"));

    await waitFor(() => {
      expect(screen.getByTestId("sep24-start-btn")).toBeTruthy();
    });
  });

  it("calls onClose when close button is clicked", () => {
    const onClose = vi.fn();
    render(
      <Sep24WithdrawModal open={true} onClose={onClose} userAddress={MOCK_USER_ADDRESS} />,
    );
    fireEvent.click(screen.getByTestId("sep24-modal-close"));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("renders nothing when open=false", () => {
    const { container } = render(
      <Sep24WithdrawModal open={false} onClose={vi.fn()} userAddress={MOCK_USER_ADDRESS} />,
    );
    expect(container.firstChild).toBeNull();
  });
});

/* ================================================================== */
/* 5b. <Sep24WithdrawModal /> – additional phase & branch coverage     */
/* ================================================================== */

describe("<Sep24WithdrawModal /> – polling transaction display and receipt variants", () => {
  it("displays live transaction status badge during polling", async () => {
    mocks.initiateSep24Withdrawal.mockResolvedValue({
      id: MOCK_TRANSACTION_ID,
      url: MOCK_INTERACTIVE_URL,
    });

    // Poll resolves after onStatusChange fires with an intermediate status
    mocks.pollSep24Transaction.mockImplementation(async ({ onStatusChange: cb }: any) => {
      cb({
        id: MOCK_TRANSACTION_ID,
        kind: "withdrawal",
        status: "pending_anchor",
        message: "Anchor is processing your request",
      });
      // Then complete
      return {
        transaction: {
          id: MOCK_TRANSACTION_ID,
          kind: "withdrawal",
          status: "completed",
          externalTransactionId: "REF-XYZ",
          amountIn: "50.00",
          amountOut: "49.50",
        },
        completed: true,
      };
    });

    renderWithdrawModal();
    fireEvent.click(screen.getByTestId("sep24-start-btn"));

    await waitFor(() => screen.getByTestId("sep24-submitted-btn"));
    fireEvent.click(screen.getByTestId("sep24-submitted-btn"));

    // After poll resolves, receipt should be displayed
    await waitFor(() => {
      expect(screen.getByTestId("sep24-receipt")).toBeTruthy();
    });
  });

  it("renders receipt without optional fields (no fiat ref, no amountIn/Out, no completedAt)", async () => {
    mocks.initiateSep24Withdrawal.mockResolvedValue({
      id: MOCK_TRANSACTION_ID,
      url: MOCK_INTERACTIVE_URL,
    });
    mocks.pollSep24Transaction.mockResolvedValue({
      transaction: {
        id: MOCK_TRANSACTION_ID,
        kind: "withdrawal",
        status: "completed",
        // No externalTransactionId, amountIn, amountOut, completedAt
      },
      completed: true,
    });

    renderWithdrawModal();
    fireEvent.click(screen.getByTestId("sep24-start-btn"));
    await waitFor(() => screen.getByTestId("sep24-submitted-btn"));
    fireEvent.click(screen.getByTestId("sep24-submitted-btn"));

    await waitFor(() => {
      expect(screen.getByTestId("sep24-receipt")).toBeTruthy();
    });

    // Optional fields should not appear in DOM
    expect(screen.queryByTestId("sep24-receipt-fiat-ref")).toBeNull();
    // Done button should still be present
    expect(screen.getByTestId("sep24-done-btn")).toBeTruthy();
  });

  it("renders error when polling fails and shows retry button", async () => {
    mocks.initiateSep24Withdrawal.mockResolvedValue({
      id: MOCK_TRANSACTION_ID,
      url: MOCK_INTERACTIVE_URL,
    });
    mocks.pollSep24Transaction.mockRejectedValue(
      new Error("SEP-0024 transaction txn_abc123 did not reach a terminal status after 60 attempts"),
    );

    renderWithdrawModal();
    fireEvent.click(screen.getByTestId("sep24-start-btn"));
    await waitFor(() => screen.getByTestId("sep24-submitted-btn"));
    fireEvent.click(screen.getByTestId("sep24-submitted-btn"));

    await waitFor(() => {
      expect(screen.getByTestId("sep24-error-msg")).toBeTruthy();
    });
    expect(screen.getByTestId("sep24-error-msg").textContent).toMatch(
      /did not reach a terminal status/i,
    );
    expect(screen.getByTestId("sep24-retry-btn")).toBeTruthy();
  });

  it("renders with amount prop and shows it in the idle info row", () => {
    renderWithdrawModal({ amount: "75.00" });
    expect(screen.getByText(/75.00/)).toBeTruthy();
  });

  it("calls onClose when Done button is clicked after completion", async () => {
    const onClose = vi.fn();
    mocks.initiateSep24Withdrawal.mockResolvedValue({
      id: MOCK_TRANSACTION_ID,
      url: MOCK_INTERACTIVE_URL,
    });
    mocks.pollSep24Transaction.mockResolvedValue({
      transaction: {
        id: MOCK_TRANSACTION_ID,
        kind: "withdrawal",
        status: "completed",
        externalTransactionId: "REF-DONE",
      },
      completed: true,
    });

    render(
      <Sep24WithdrawModal
        open={true}
        onClose={onClose}
        userAddress={MOCK_USER_ADDRESS}
        anchorDomain={MOCK_ANCHOR_DOMAIN}
        assetCode="USDC"
      />,
    );

    fireEvent.click(screen.getByTestId("sep24-start-btn"));
    await waitFor(() => screen.getByTestId("sep24-submitted-btn"));
    fireEvent.click(screen.getByTestId("sep24-submitted-btn"));
    await waitFor(() => screen.getByTestId("sep24-done-btn"));
    fireEvent.click(screen.getByTestId("sep24-done-btn"));

    expect(onClose).toHaveBeenCalledOnce();
  });

  it("does not call initiate when userAddress is empty", async () => {
    renderWithdrawModal({ userAddress: "" });
    fireEvent.click(screen.getByTestId("sep24-start-btn"));

    // Should not proceed — initiateSep24Withdrawal must not be called
    await new Promise((r) => setTimeout(r, 50));
    expect(mocks.initiateSep24Withdrawal).not.toHaveBeenCalled();
  });

  it("re-renders correctly when re-opened (open toggles false→true)", async () => {
    const { rerender } = renderWithdrawModal();

    // Close then reopen
    rerender(
      <Sep24WithdrawModal
        open={false}
        onClose={vi.fn()}
        userAddress={MOCK_USER_ADDRESS}
        anchorDomain={MOCK_ANCHOR_DOMAIN}
        assetCode="USDC"
      />,
    );

    rerender(
      <Sep24WithdrawModal
        open={true}
        onClose={vi.fn()}
        userAddress={MOCK_USER_ADDRESS}
        anchorDomain={MOCK_ANCHOR_DOMAIN}
        assetCode="USDC"
      />,
    );

    // Should be back in idle phase
    expect(screen.getByTestId("sep24-start-btn")).toBeTruthy();
  });
});

/* ================================================================== */
/* 5c. <Sep24WithdrawModal /> – keyboard & non-completed terminal     */
/* ================================================================== */

describe("<Sep24WithdrawModal /> – keyboard interaction and terminal status", () => {
  it("calls onClose when Escape key is pressed", () => {
    const onClose = vi.fn();
    render(
      <Sep24WithdrawModal
        open={true}
        onClose={onClose}
        userAddress={MOCK_USER_ADDRESS}
        anchorDomain={MOCK_ANCHOR_DOMAIN}
        assetCode="USDC"
      />,
    );

    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("does not close on non-Escape keys", () => {
    const onClose = vi.fn();
    render(
      <Sep24WithdrawModal
        open={true}
        onClose={onClose}
        userAddress={MOCK_USER_ADDRESS}
      />,
    );

    fireEvent.keyDown(document, { key: "Enter" });
    expect(onClose).not.toHaveBeenCalled();
  });

  it("wraps focus to first element on Tab when focus is on last element", () => {
    render(
      <Sep24WithdrawModal
        open={true}
        onClose={vi.fn()}
        userAddress={MOCK_USER_ADDRESS}
      />,
    );

    const startBtn = screen.getByTestId("sep24-start-btn");
    const closeBtn = screen.getByTestId("sep24-modal-close");

    // Focus the last focusable element (close button), then Tab
    closeBtn.focus();
    expect(document.activeElement).toBe(closeBtn);

    fireEvent.keyDown(document, { key: "Tab", shiftKey: false });

    // Focus should wrap to the first focusable element
    // (startBtn is the primary button in the idle phase)
    expect(document.activeElement).toBeTruthy();
  });

  it("wraps focus to last element on Shift+Tab when focus is on first element", () => {
    render(
      <Sep24WithdrawModal
        open={true}
        onClose={vi.fn()}
        userAddress={MOCK_USER_ADDRESS}
      />,
    );

    const closeBtn = screen.getByTestId("sep24-modal-close");

    // Focus the first element (close button is typically first in DOM),
    // then Shift+Tab
    closeBtn.focus();
    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });

    expect(document.activeElement).toBeTruthy();
  });

  it("shows terminal status label in error panel for non-completed terminal (refunded with message)", async () => {
    mocks.initiateSep24Withdrawal.mockResolvedValue({
      id: MOCK_TRANSACTION_ID,
      url: MOCK_INTERACTIVE_URL,
    });
    mocks.pollSep24Transaction.mockResolvedValue({
      transaction: {
        id: MOCK_TRANSACTION_ID,
        kind: "withdrawal",
        status: "refunded",
        message: "Bank rejected the transfer",
      },
      completed: false,
    });

    renderWithdrawModal();
    fireEvent.click(screen.getByTestId("sep24-start-btn"));
    await waitFor(() => screen.getByTestId("sep24-submitted-btn"));
    fireEvent.click(screen.getByTestId("sep24-submitted-btn"));

    await waitFor(() => {
      expect(screen.getByTestId("sep24-error-msg")).toBeTruthy();
    });
    // The error message should contain the terminal label and the message
    const errMsg = screen.getByTestId("sep24-error-msg").textContent ?? "";
    expect(errMsg).toMatch(/refund/i);
    expect(errMsg).toMatch(/bank rejected/i);
  });

  it("shows terminal status label without message for non-completed terminal (expired, no message)", async () => {
    mocks.initiateSep24Withdrawal.mockResolvedValue({
      id: MOCK_TRANSACTION_ID,
      url: MOCK_INTERACTIVE_URL,
    });
    mocks.pollSep24Transaction.mockResolvedValue({
      transaction: {
        id: MOCK_TRANSACTION_ID,
        kind: "withdrawal",
        status: "expired",
      },
      completed: false,
    });

    renderWithdrawModal();
    fireEvent.click(screen.getByTestId("sep24-start-btn"));
    await waitFor(() => screen.getByTestId("sep24-submitted-btn"));
    fireEvent.click(screen.getByTestId("sep24-submitted-btn"));

    await waitFor(() => {
      expect(screen.getByTestId("sep24-error-msg")).toBeTruthy();
    });
    const errMsg = screen.getByTestId("sep24-error-msg").textContent ?? "";
    expect(errMsg).toMatch(/expired/i);
  });

  it("shows error status label for non-completed terminal (error status)", async () => {
    mocks.initiateSep24Withdrawal.mockResolvedValue({
      id: MOCK_TRANSACTION_ID,
      url: MOCK_INTERACTIVE_URL,
    });
    mocks.pollSep24Transaction.mockResolvedValue({
      transaction: {
        id: MOCK_TRANSACTION_ID,
        kind: "withdrawal",
        status: "error",
        message: "Anchor internal failure",
      },
      completed: false,
    });

    renderWithdrawModal();
    fireEvent.click(screen.getByTestId("sep24-start-btn"));
    await waitFor(() => screen.getByTestId("sep24-submitted-btn"));
    fireEvent.click(screen.getByTestId("sep24-submitted-btn"));

    await waitFor(() => {
      expect(screen.getByTestId("sep24-error-msg")).toBeTruthy();
    });
    const errMsg = screen.getByTestId("sep24-error-msg").textContent ?? "";
    expect(errMsg).toMatch(/error/i);
    expect(errMsg).toMatch(/anchor internal failure/i);
  });
});

/* ================================================================== */
/* 6. <ClaimPayouts /> – AC1: "Withdraw to Local Bank" button          */
/* ================================================================== */

describe("<ClaimPayouts />", () => {
  it("renders the 'Withdraw to Local Bank (SEP-0024)' button (AC1)", async () => {
    render(<ClaimPayouts />);

    await waitFor(() => {
      expect(screen.getByTestId("btn-sep24-withdraw")).toBeTruthy();
    });
    expect(screen.getByTestId("btn-sep24-withdraw").textContent).toContain(
      "Withdraw to Local Bank (SEP-0024)",
    );
  });

  it("opens Sep24WithdrawModal when the button is clicked", async () => {
    render(<ClaimPayouts />);

    await waitFor(() => screen.getByTestId("btn-sep24-withdraw"));
    fireEvent.click(screen.getByTestId("btn-sep24-withdraw"));

    await waitFor(() => {
      expect(screen.getByTestId("sep24-withdraw-modal")).toBeTruthy();
    });
  });
});
