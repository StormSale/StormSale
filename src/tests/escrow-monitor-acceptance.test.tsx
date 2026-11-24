// @vitest-environment jsdom
import { Buffer } from "buffer";
globalThis.Buffer = Buffer;

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../config/stellar", () => ({
  STELLAR_CONFIG: {
    network: "TESTNET",
    networkPassphrase: "Test SDF Network ; September 2015",
    rpcUrl: "https://soroban-testnet.stellar.org",
    horizonUrl: "https://horizon-testnet.stellar.org",
    explorerUrl: "https://stellar.expert/explorer/testnet",
    contractId: "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
    nativeAsset: "XLM",
    nativeDecimals: 7,
  },
  SUPPORTED_ESCROW_ASSETS: {
    XLM: { code: "XLM", name: "Stellar Lumens", decimals: 7, contractAddress: "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC" },
    USDC: { code: "USDC", name: "USD Coin", decimals: 7, contractAddress: "CUSDC" },
    EURC: { code: "EURC", name: "Euro Coin", decimals: 7, contractAddress: "CEURC" },
  },
  NETWORK_ESCROW_ASSETS: { TESTNET: {}, PUBLIC: {} },
}));

const wallet = vi.hoisted(() => ({
  userAddress: "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5" as string | null,
  isConnected: true,
  connectorType: "mock",
  tokenAllowance: 10000,
  topUpCampaignEscrow: vi.fn(),
  refundCampaignEscrow: vi.fn(),
  approveTokenAllowance: vi.fn(),
  refreshTokenAllowance: vi.fn(),
}));

const notifications = vi.hoisted(() => ({
  showNotification: vi.fn(),
}));

vi.mock("../hooks/useWeb3", () => ({
  useWeb3: () => ({
    userAddress: wallet.userAddress,
    isConnected: wallet.isConnected,
    connectorType: wallet.connectorType,
    tokenAllowance: wallet.tokenAllowance,
    topUpCampaignEscrow: wallet.topUpCampaignEscrow,
    refundCampaignEscrow: wallet.refundCampaignEscrow,
    approveTokenAllowance: wallet.approveTokenAllowance,
    refreshTokenAllowance: wallet.refreshTokenAllowance,
  }),
}));

vi.mock("../context/NotificationContext", () => ({
  useNotification: () => ({
    showNotification: notifications.showNotification,
  }),
}));

vi.mock("../lib/stellar", () => ({
  formatStellarAddress: (addr: string) => `${addr.slice(0, 4)}...${addr.slice(-4)}`,
}));

const contractTTL = vi.hoisted(() => ({
  extendContractInstanceTTL: vi.fn().mockResolvedValue({ success: true, newTTL: 507850 }),
}));

vi.mock("../lib/contractTTL", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/contractTTL")>();
  return { ...actual, extendContractInstanceTTL: contractTTL.extendContractInstanceTTL };
});

const autoRefill = vi.hoisted(() => ({
  depositEscrowRefillContractCall: vi.fn().mockResolvedValue({
    success: true,
    newBalanceXlm: 1250,
    txHash: "mock-refill-tx-12345",
  }),
}));

vi.mock("../lib/escrowAutoRefill", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/escrowAutoRefill")>();
  return { ...actual, depositEscrowRefillContractCall: autoRefill.depositEscrowRefillContractCall };
});

import { MyCampaignsList } from "../components/advertiser/MyCampaignsList";
import { getLocalStorage } from "../lib/storage";

describe("Real-time Escrow and Refund Monitor Acceptance (#37)", () => {
  beforeEach(() => {
    getLocalStorage().clear();
    notifications.showNotification.mockReset();
    wallet.userAddress = "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5";
    wallet.isConnected = true;
    wallet.connectorType = "mock";
    wallet.tokenAllowance = 10000;
    wallet.topUpCampaignEscrow.mockReset().mockResolvedValue({ success: true, txHash: "topup-tx" });
    wallet.refundCampaignEscrow.mockReset().mockResolvedValue({ success: true, txHash: "refund-tx" });
    wallet.approveTokenAllowance.mockReset().mockResolvedValue({ success: true });
    wallet.refreshTokenAllowance.mockReset().mockResolvedValue(10000);
    contractTTL.extendContractInstanceTTL.mockClear();
    autoRefill.depositEscrowRefillContractCall.mockClear();
  });

  afterEach(() => {
    cleanup();
  });

  it("shows a visual alert indicator for campaigns with escrow below 10%", async () => {
    await act(async () => {
      render(<MyCampaignsList />);
    });

    // The Low Escrow filter tab should be available showing count of low-balance campaigns
    const lowEscrowTab = screen.getByRole("button", { name: /Low Escrow \(\d+\)/i });
    expect(lowEscrowTab).toBeTruthy();

    // Click the Low Escrow tab to filter
    await act(async () => {
      fireEvent.click(lowEscrowTab);
    });

    // Campaigns with low escrow should be visible (Web3 Masterclass has low balance in test data)
    expect(screen.queryAllByText(/Web3 Masterclass/i).length).toBeGreaterThan(0);
  });

  it("provides a Refund action button for ended (completed) campaigns", async () => {
    await act(async () => {
      render(<MyCampaignsList />);
    });

    // Navigate to the Completed tab
    const completedTab = screen.getByRole("button", { name: /^Completed/i });
    await act(async () => {
      fireEvent.click(completedTab);
    });

    // A refund button should be present for completed campaigns with remaining escrow
    const refundBtns = screen.getAllByRole("button", { name: /Refund Unused Escrow/i });
    expect(refundBtns.length).toBeGreaterThan(0);
  });

  it("executes the refund when the Refund button is clicked", async () => {
    await act(async () => {
      render(<MyCampaignsList />);
    });

    const completedTab = screen.getByRole("button", { name: /^Completed/i });
    await act(async () => {
      fireEvent.click(completedTab);
    });

    const refundBtn = screen.getByRole("button", { name: /Refund Unused Escrow \(1,200 XLM\)/i });
    await act(async () => {
      fireEvent.click(refundBtn);
    });

    expect(wallet.refundCampaignEscrow).toHaveBeenCalled();
    expect(notifications.showNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "success",
        title: "Escrow Refund Confirmed!",
      }),
    );
  });

  it("shows multi-sig requirement for large refunds exceeding $10,000", async () => {
    await act(async () => {
      render(<MyCampaignsList />);
    });

    const completedTab = screen.getByRole("button", { name: /^Completed/i });
    await act(async () => {
      fireEvent.click(completedTab);
    });

    const largeRefundBtn = screen.getByRole("button", {
      name: /Refund Unused Escrow \(> \$10k Multi-Sig\)/i,
    });
    expect(largeRefundBtn).toBeTruthy();

    await act(async () => {
      fireEvent.click(largeRefundBtn);
    });

    expect(notifications.showNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "info",
        title: "Multi-Sig Authorization Required",
      }),
    );
  });

  it("reports an error notification when refund fails", async () => {
    wallet.refundCampaignEscrow.mockRejectedValueOnce(new Error("Soroban contract trapped"));

    await act(async () => {
      render(<MyCampaignsList />);
    });

    const completedTab = screen.getByRole("button", { name: /^Completed/i });
    await act(async () => {
      fireEvent.click(completedTab);
    });

    const refundBtn = screen.getByRole("button", { name: /Refund Unused Escrow \(1,200 XLM\)/i });
    await act(async () => {
      fireEvent.click(refundBtn);
    });

    expect(notifications.showNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "error",
        title: "Refund Failed",
      }),
    );
  });

  it("displays the escrow monitor dashboard header", async () => {
    await act(async () => {
      render(<MyCampaignsList />);
    });

    expect(screen.getByText("My Campaigns & Escrow Monitor")).toBeTruthy();
  });
});
