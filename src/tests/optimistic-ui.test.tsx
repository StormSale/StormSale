// @vitest-environment jsdom
import { Buffer } from "buffer";
globalThis.Buffer = Buffer;

import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, screen, cleanup } from "@testing-library/react";
import { Web3Provider, useWeb3 } from "../context/Web3Context";
import { TransactionAnnouncementProvider } from "../context/TransactionAnnouncementContext";
import * as stellarMod from "../lib/stellar";

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
    XLM: {
      code: "XLM",
      name: "Stellar Lumens",
      decimals: 7,
      contractAddress: "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC",
    },
    USDC: { code: "USDC", name: "USD Coin", decimals: 7, contractAddress: "CUSDC" },
    EURC: { code: "EURC", name: "Euro Coin", decimals: 7, contractAddress: "CEURC" },
  },
  NETWORK_ESCROW_ASSETS: {
    TESTNET: {},
    PUBLIC: {},
  },
}));

vi.mock("../lib/stellar", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/stellar")>();
  return {
    ...actual,
    checkFreighterInstalled: vi.fn().mockResolvedValue(true),
    connectFreighterWallet: vi
      .fn()
      .mockResolvedValue("GBZXN7PIRZGNMHGA728RGRYA7XPO5CFSGSJAA5T6Q5WWC62MWFPZ4ES2"),
    fetchXlmBalance: vi.fn().mockResolvedValue("1000.00"),
    fetchAssetBalances: vi.fn().mockResolvedValue({ XLM: "1000.00", USDC: "500.00", EURC: "0.00" }),
    getTokenAllowanceQuery: vi.fn().mockResolvedValue(2000),
    createCampaignContractCall: vi
      .fn()
      .mockResolvedValue({ success: true, campaignId: 101, txHash: "tx_create_101" }),
    logSaleContractCall: vi.fn().mockResolvedValue({ success: true, txHash: "tx_sale_101" }),
    claimPayoutContractCall: vi.fn().mockResolvedValue({ success: true, txHash: "tx_claim_101" }),
    refundCampaignEscrowContractCall: vi
      .fn()
      .mockResolvedValue({ success: true, txHash: "tx_refund_101" }),
    fundTestnetAccount: vi.fn().mockResolvedValue(true),
    getCurrentNetwork: vi.fn().mockResolvedValue("TESTNET"),
  };
});

vi.mock("../lib/multisig", () => ({
  inspectMultiSigAccount: vi.fn().mockResolvedValue({
    isMultiSig: false,
    signers: [],
    threshold: { low: 1, med: 1, high: 1 },
  }),
}));

vi.mock("../utils/api", () => ({
  registerUser: vi.fn().mockResolvedValue({ success: true }),
}));

describe("[State] Optimistic UI & Revert Logic Suite (#68)", () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <Web3Provider>{children}</Web3Provider>
  );

  it("applies instant UI state update (<50ms) before on-chain confirmation", async () => {
    const { result } = renderHook(() => useWeb3(), { wrapper });

    // Connect wallet
    await act(async () => {
      await result.current.connectWallet("freighter");
    });

    expect(result.current.isConnected).toBe(true);
    expect(result.current.xlmBalance).toBe("1000.00");
    expect(result.current.tokenAllowance).toBe(2000);

    // Track latency of optimistic balance deduction
    const startTime = performance.now();

    let actionPromise: Promise<any>;
    act(() => {
      // Trigger createCampaignOnChain which uses executeWithOptimismAndQueue
      actionPromise = result.current.createCampaignOnChain("Holiday Campaign", 200, 10, 1, "XLM");
    });

    const optimisticLatency = performance.now() - startTime;

    // Issue #68 Criterion: <50ms UI update on interaction
    expect(optimisticLatency).toBeLessThan(50);

    // Optimistic balance should be updated immediately without waiting for mining
    expect(result.current.xlmBalance).toBe("800.00");
    expect(result.current.tokenAllowance).toBe(1800);
    expect(result.current.optimisticActions.length).toBeGreaterThan(0);
    expect(result.current.optimisticActions[0].type).toBe("create_campaign");

    // Wait for on-chain resolution
    await act(async () => {
      await actionPromise;
    });

    // Check confirmed status
    expect(result.current.optimisticActions[0].status).toBe("confirmed");
  });

  it("reliably reverts local state to pre-action snapshot on transaction failure", async () => {
    const { result } = renderHook(() => useWeb3(), { wrapper });

    await act(async () => {
      await result.current.connectWallet("freighter");
    });

    expect(result.current.xlmBalance).toBe("1000.00");
    expect(result.current.tokenAllowance).toBe(2000);

    // Mock contract call failure
    vi.mocked(stellarMod.createCampaignContractCall).mockRejectedValueOnce(
      new Error("Soroban HostError: Error(Contract, #100) Escrow transfer failed"),
    );

    let errorThrown: any = null;
    await act(async () => {
      try {
        await result.current.createCampaignOnChain("Failing Campaign", 300, 10, 1, "XLM");
      } catch (err) {
        errorThrown = err;
      }
    });

    // Verify error was surfaced
    expect(errorThrown).toBeDefined();

    // Issue #68 Criterion: Reliable state revert on txn failure
    // xlmBalance and tokenAllowance MUST be restored to previous snapshot values
    expect(result.current.xlmBalance).toBe("1000.00");
    expect(result.current.tokenAllowance).toBe(2000);

    // Action status must be marked reverted
    const failedAction = result.current.optimisticActions.find((a) => a.type === "create_campaign");
    expect(failedAction).toBeDefined();
    expect(failedAction?.status).toBe("reverted");
  });

  it("reverts multi-token asset balances correctly on top-up or claim failure", async () => {
    const { result } = renderHook(() => useWeb3(), { wrapper });

    await act(async () => {
      await result.current.connectWallet("freighter");
    });

    expect(result.current.assetBalances.USDC).toBe("500.00");

    // Mock claim payout failure
    vi.mocked(stellarMod.claimPayoutContractCall).mockRejectedValueOnce(
      new Error("RPC Timeout 504 Gateway"),
    );

    await act(async () => {
      try {
        await result.current.claimPayoutOnChain(101, "USDC");
      } catch {
        // Expected failure
      }
    });

    // State reverted
    expect(result.current.assetBalances.USDC).toBe("500.00");
    const revertedAction = result.current.optimisticActions[0];
    expect(revertedAction.status).toBe("reverted");
  });

  const announcementWrapper = ({ children }: { children: React.ReactNode }) => (
    <TransactionAnnouncementProvider>
      <Web3Provider>{children}</Web3Provider>
    </TransactionAnnouncementProvider>
  );

  it("announces claim payouts with the payout quantity and explicit asset", async () => {
    vi.mocked(stellarMod.claimPayoutContractCall).mockResolvedValueOnce({
      success: true,
      txHash: "tx_claim_explicit",
    });

    const { result } = renderHook(() => useWeb3(), { wrapper: announcementWrapper });

    await act(async () => {
      await result.current.connectWallet("freighter");
    });

    await act(async () => {
      await result.current.claimPayoutOnChain(101, "USDC", 25);
    });

    const announcement = screen.getByTestId("transaction-announcement-polite-message").textContent;
    expect(announcement).toContain("Amount: 25 USDC");
    expect(announcement).toContain("Transaction hash: tx_claim_explicit");
    expect(announcement).not.toContain("Transaction hash pending.");
  });

  it("announces claim payouts with the asset resolved from the receipt when none is supplied", async () => {
    vi.mocked(stellarMod.claimPayoutContractCall).mockResolvedValueOnce({
      success: true,
      txHash: "tx_claim_inferred",
      asset: "EURC",
      claimedAmount: 75,
    } as unknown as Awaited<ReturnType<typeof stellarMod.claimPayoutContractCall>>);

    const { result } = renderHook(() => useWeb3(), { wrapper: announcementWrapper });

    await act(async () => {
      await result.current.connectWallet("freighter");
    });

    await act(async () => {
      await result.current.claimPayoutOnChain(101);
    });

    const announcement = screen.getByTestId("transaction-announcement-polite-message").textContent;
    expect(announcement).toContain("Amount: 75 EURC");
    expect(announcement).toContain("Transaction hash: tx_claim_inferred");
  });
});
