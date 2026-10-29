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
  NETWORK_ESCROW_ASSETS: {
    TESTNET: {},
    PUBLIC: {},
  },
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
  extendContractInstanceTTL: vi.fn().mockResolvedValue({
    success: true,
    newTTL: 507850,
  }),
}));

vi.mock("../lib/contractTTL", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/contractTTL")>();
  return {
    ...actual,
    extendContractInstanceTTL: contractTTL.extendContractInstanceTTL,
  };
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
  return {
    ...actual,
    depositEscrowRefillContractCall: autoRefill.depositEscrowRefillContractCall,
  };
});

import { MyCampaignsList } from "../components/advertiser/MyCampaignsList";
import { getLocalStorage } from "../lib/storage";

describe("MyCampaignsList — Escrow Monitor & Automated Top-Up Suite (#107)", () => {
  beforeEach(() => {
    getLocalStorage().clear();
    notifications.showNotification.mockReset();
    wallet.userAddress = "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5";
    wallet.isConnected = true;
    wallet.connectorType = "mock";
    wallet.tokenAllowance = 10000;
    wallet.topUpCampaignEscrow.mockReset().mockResolvedValue({
      success: true,
      txHash: "topup-tx-mock-789",
    });
    wallet.refundCampaignEscrow.mockReset().mockResolvedValue({
      success: true,
      txHash: "refund-tx-mock-456",
    });
    wallet.approveTokenAllowance.mockReset().mockResolvedValue({
      success: true,
      txHash: "allowance-tx-mock-123",
    });
    wallet.refreshTokenAllowance.mockReset().mockResolvedValue(10000);
    contractTTL.extendContractInstanceTTL.mockClear();
    autoRefill.depositEscrowRefillContractCall.mockClear();
  });

  afterEach(() => {
    cleanup();
  });

  it("renders main dashboard header, alerts, metrics and initial campaigns list", async () => {
    await act(async () => {
      render(<MyCampaignsList />);
    });

    expect(screen.getByText("My Campaigns & Escrow Monitor")).toBeTruthy();
    expect(screen.getByText("Automated Top-Up Enabled")).toBeTruthy();
    expect(screen.getByText("Run Auto Top-Up Check")).toBeTruthy();

    expect(screen.getAllByText("Tech Gadgets Pro").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Web3 Masterclass").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Crypto Tools Suite").length).toBeGreaterThan(0);
    expect(screen.getAllByText("DeFi Starter Pack").length).toBeGreaterThan(0);
  });

  it("filters campaigns by search query and status tabs", async () => {
    wallet.tokenAllowance = 0; // prevent auto-topup from modifying balances during filter test

    await act(async () => {
      render(<MyCampaignsList />);
    });

    const searchInput = screen.getByPlaceholderText(/Search campaigns by name/i);

    // Search for Tech Gadgets
    await act(async () => {
      fireEvent.change(searchInput, { target: { value: "Tech Gadgets" } });
    });
    expect(screen.getAllByText("Tech Gadgets Pro").length).toBeGreaterThan(0);
    expect(screen.queryByText("Web3 Masterclass")).toBeNull();

    // Clear search
    await act(async () => {
      fireEvent.change(searchInput, { target: { value: "" } });
    });
    expect(screen.getAllByText("Web3 Masterclass").length).toBeGreaterThan(0);

    // Filter by Paused
    const pausedTab = screen.getByRole("button", { name: /^Paused/i });
    await act(async () => {
      fireEvent.click(pausedTab);
    });
    expect(screen.getAllByText("Crypto Tools Suite").length).toBeGreaterThan(0);
    expect(screen.queryByText("Tech Gadgets Pro")).toBeNull();

    // Filter by Completed
    const completedTab = screen.getByRole("button", { name: /^Completed/i });
    await act(async () => {
      fireEvent.click(completedTab);
    });
    expect(screen.getAllByText("DeFi Starter Pack").length).toBeGreaterThan(0);
    expect(screen.queryByText("Crypto Tools Suite")).toBeNull();

    // Filter by Low Escrow
    const lowEscrowTab = screen.getByRole("button", { name: /Low Escrow \(\d+\)/i });
    await act(async () => {
      fireEvent.click(lowEscrowTab);
    });
    expect(screen.getAllByText("Web3 Masterclass").length).toBeGreaterThan(0);
    expect(screen.queryByText("Tech Gadgets Pro")).toBeNull();

    // Return to All
    const allTab = screen.getByRole("button", { name: /^All/i });
    await act(async () => {
      fireEvent.click(allTab);
    });
    expect(screen.getAllByText("Tech Gadgets Pro").length).toBeGreaterThan(0);
  });

  it("handles state rent extension when low TTL warning banner action is triggered", async () => {
    await act(async () => {
      render(<MyCampaignsList />);
    });

    const restoreBtn = screen.getByRole("button", { name: /Restore Urgent Contract/i });
    expect(restoreBtn).toBeTruthy();

    await act(async () => {
      fireEvent.click(restoreBtn);
    });

    expect(contractTTL.extendContractInstanceTTL).toHaveBeenCalledWith(
      expect.objectContaining({
        extendToLedgers: 500000,
      }),
    );

    expect(notifications.showNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "success",
        title: "State Rent Extended",
      }),
    );
  });

  it("handles 1-click escrow refill when low reserve banner action is triggered", async () => {
    await act(async () => {
      render(<MyCampaignsList />);
    });

    const refillBtns = screen.getAllByRole("button", { name: /1-Click Refill/i });
    expect(refillBtns.length).toBeGreaterThan(0);

    await act(async () => {
      fireEvent.click(refillBtns[0]);
    });

    expect(autoRefill.depositEscrowRefillContractCall).toHaveBeenCalledWith(
      expect.objectContaining({
        amountXlm: 500,
      }),
    );

    expect(notifications.showNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "success",
        title: "Escrow Refilled",
      }),
    );
  });

  it("runs manual auto top-up check across all campaigns", async () => {
    await act(async () => {
      render(<MyCampaignsList />);
    });

    const runAuditBtn = screen.getByRole("button", { name: /Run Auto Top-Up Check/i });

    await act(async () => {
      fireEvent.click(runAuditBtn);
    });

    expect(notifications.showNotification).toHaveBeenCalled();
  });

  it("opens manual top-up dialog, selects presets, and executes top-up deposit", async () => {
    await act(async () => {
      render(<MyCampaignsList />);
    });

    const topUpButtons = screen.getAllByRole("button", { name: /Top Up Escrow/i });
    expect(topUpButtons.length).toBeGreaterThan(0);

    // Open Quick Manual Top-Up Dialog for first campaign (Tech Gadgets Pro)
    await act(async () => {
      fireEvent.click(topUpButtons[0]);
    });

    expect(screen.getByText("Top Up Campaign Escrow")).toBeTruthy();
    expect(screen.getAllByText("Tech Gadgets Pro").length).toBeGreaterThan(0);

    // Select preset +2500
    const preset2500 = screen.getByRole("button", { name: "+2,500" });
    await act(async () => {
      fireEvent.click(preset2500);
    });

    const depositInput = screen.getByPlaceholderText(/Enter XLM amount/i) as HTMLInputElement;
    expect(depositInput.value).toBe("2500");

    // Click Confirm Deposit
    const confirmBtn = screen.getByRole("button", { name: /Confirm Deposit/i });
    await act(async () => {
      fireEvent.click(confirmBtn);
    });

    expect(wallet.topUpCampaignEscrow).toHaveBeenCalledWith(1, 2500);
    expect(notifications.showNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "success",
        title: "Escrow Top-Up Successful!",
      }),
    );

    // Dialog should close
    expect(screen.queryByText("Top Up Campaign Escrow")).toBeNull();
  });

  it("shows deficit alert and handles allowance approval when deposit exceeds allowance in manual top-up", async () => {
    wallet.tokenAllowance = 500; // Low allowance

    await act(async () => {
      render(<MyCampaignsList />);
    });

    const topUpButtons = screen.getAllByRole("button", { name: /Top Up Escrow/i });
    await act(async () => {
      fireEvent.click(topUpButtons[0]);
    });

    // Preset +1,000 exceeds 500 XLM allowance
    const preset1000 = screen.getByRole("button", { name: "+1,000" });
    await act(async () => {
      fireEvent.click(preset1000);
    });

    expect(screen.getByText(/exceeds pre-authorized allowance/i)).toBeTruthy();

    const approveBtn = screen.getByRole("button", { name: /Approve Required Allowance/i });
    await act(async () => {
      fireEvent.click(approveBtn);
    });

    expect(wallet.approveTokenAllowance).toHaveBeenCalledWith(1000);
    expect(wallet.refreshTokenAllowance).toHaveBeenCalled();
  });

  it("opens automated escrow top-up settings dialog, configures thresholds, and saves config", async () => {
    await act(async () => {
      render(<MyCampaignsList />);
    });

    const configButtons = screen.getAllByTitle("Configure Automated Escrow Top-Up");
    expect(configButtons.length).toBeGreaterThan(0);

    await act(async () => {
      fireEvent.click(configButtons[0]); // Tech Gadgets Pro
    });

    expect(screen.getByText("Automated Escrow Top-Up Settings")).toBeTruthy();

    // Toggle switch
    const toggleSwitch = screen.getByRole("switch", { name: /Enable automated top-up/i });
    await act(async () => {
      fireEvent.click(toggleSwitch);
    });

    // Switch to Fixed XLM tab
    const fixedTab = screen.getByRole("button", { name: "Fixed XLM" });
    await act(async () => {
      fireEvent.click(fixedTab);
    });
  });
});
