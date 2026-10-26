// @vitest-environment jsdom
import { Buffer } from "buffer";
globalThis.Buffer = Buffer;

import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { Web3Provider, useWeb3, DEFAULT_WEB3_CONTEXT } from "../context/Web3Context";
import { rpcFallbackManager } from "../lib/rpcFallback";

vi.mock("../config/stellar", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../config/stellar")>();
  return {
    ...actual,
    STELLAR_CONFIG: {
      ...actual.STELLAR_CONFIG,
      network: "TESTNET",
      contractId: "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC",
    },
    SUPPORTED_ESCROW_ASSETS: {
      XLM: { code: "XLM", name: "Stellar Lumens", decimals: 7, contractAddress: "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC" },
      USDC: { code: "USDC", name: "USD Coin", decimals: 7, contractAddress: "CUSDC" },
      EURC: { code: "EURC", name: "Euro Coin", decimals: 7, contractAddress: "CEURC" },
    },
    SAC_TOKENS: {
      XLM: { symbol: "XLM", name: "Stellar Lumens", decimals: 7, contractId: "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC" },
      USDC: { symbol: "USDC", name: "USD Coin", decimals: 7, contractId: "CUSDC" },
      EURC: { symbol: "EURC", name: "Euro Coin", decimals: 7, contractId: "CEURC" },
    },
    TTL_CONFIG: actual.TTL_CONFIG || {
      DEFAULT_EXTEND_LEDGERS: 100000,
      WARNING_THRESHOLD_LEDGERS: 50000,
      CRITICAL_THRESHOLD_LEDGERS: 10000,
      SECONDS_PER_LEDGER: 5,
    },
  };
});

// Mock stellar library calls
vi.mock("../lib/stellar", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/stellar")>();
  return {
    ...actual,
    checkFreighterInstalled: vi.fn().mockResolvedValue(true),
    connectFreighterWallet: vi.fn().mockResolvedValue("GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5"),
    connectAlbedoWallet: vi.fn().mockResolvedValue("GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5"),
    connectXbullWallet: vi.fn().mockResolvedValue("GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5"),
    fetchXlmBalance: vi.fn().mockResolvedValue("1500.5"),
    fetchAssetBalances: vi.fn().mockResolvedValue({ XLM: "1500.5", USDC: "250.0", EURC: "0.0" }),
    getTokenAllowanceQuery: vi.fn().mockResolvedValue(5000),
    approveTokenContractCall: vi.fn().mockResolvedValue({ success: true, allowance: 5000, txHash: "tx_mock_hash" }),
    approveTokenAllowance: vi.fn().mockResolvedValue({ success: true, txHash: "tx_allowance_call" }),
    approveSACDelegation: vi.fn().mockResolvedValue({
      success: true,
      txHash: "tx_allowance_call",
      simulationFeedback: {
        success: true,
        estimatedFee: "0.0001",
        simulationSuccess: true,
        footprintStatus: "clean",
        resourceLimitsOk: true,
        authScopeValid: true,
        recommendedLiveUntilLedger: 1500000,
      },
    }),
    getSACAllowance: vi.fn().mockResolvedValue(BigInt(50000000000)),
    createCampaignContractCall: vi.fn().mockResolvedValue({ success: true, campaignId: 101, txHash: "tx_create_campaign" }),
    logSaleContractCall: vi.fn().mockResolvedValue({ success: true, txHash: "tx_log_sale" }),
    claimPayoutContractCall: vi.fn().mockResolvedValue({ success: true, txHash: "tx_claim_payout", claimedAmount: 75 }),
    refundCampaignEscrowContractCall: vi.fn().mockResolvedValue({ success: true, txHash: "tx_refund_mock" }),
    fundTestnetAccount: vi.fn().mockResolvedValue(true),
    getCurrentNetwork: vi.fn().mockResolvedValue("TESTNET"),
    signSEP0010Challenge: vi.fn().mockResolvedValue("AAAA_SIGNED_XDR"),
    getCampaignStorageTTL: vi.fn().mockResolvedValue({
      liveUntilLedger: 1145230,
      currentLedger: 1045230,
      remainingLedgers: 100000,
      threshold: 50000,
      criticalThreshold: 10000,
      status: "healthy",
      estimatedSecondsRemaining: 500000,
    }),
    extendCampaignStorageTTL: vi.fn().mockResolvedValue({
      success: true,
      txHash: "tx_extend_ttl",
      ttlInfo: {
        liveUntilLedger: 1245230,
        currentLedger: 1045230,
        remainingLedgers: 200000,
        threshold: 50000,
        criticalThreshold: 10000,
        status: "healthy",
        estimatedSecondsRemaining: 1000000,
      },
    }),
    simulateSACApprove: vi.fn().mockResolvedValue({
      success: true,
      estimatedFee: "0.0001",
      simulationSuccess: true,
      footprintStatus: "clean",
      resourceLimitsOk: true,
      authScopeValid: true,
      recommendedLiveUntilLedger: 1500000,
    }),
    topUpCampaignEscrowContractCall: vi.fn().mockResolvedValue({ success: true, txHash: "tx_topup" }),
    batchClaimAffiliatePayoutsCall: vi.fn().mockResolvedValue({
      success: true,
      txHash: "tx_batch_claim",
      totalClaimed: 150,
      successfulCampaignIds: [1, 2],
      failedCampaignIds: [],
    }),
  };
});

vi.mock("../lib/multisig", () => ({
  inspectMultiSigAccount: vi.fn().mockResolvedValue({
    isMultiSig: true,
    signers: [{ key: "GB...", weight: 1 }],
    threshold: { low: 1, med: 2, high: 2 },
  }),
}));

vi.mock("../lib/escrowTopUp", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/escrowTopUp")>();
  return {
    ...actual,
    topUpCampaignEscrowContractCall: vi.fn().mockResolvedValue({
      success: true,
      txHash: "tx_topup_onchain",
      toppedUpAmount: 1000,
    }),
  };
});

vi.mock("../utils/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../utils/api")>();
  return {
    ...actual,
    registerUser: vi.fn().mockImplementation((_addr, role) => Promise.resolve({ success: true, role })),
    getStoredSessionToken: vi.fn().mockReturnValue(null),
    storeSessionToken: vi.fn(),
    clearSessionToken: vi.fn(),
    requestAuthChallenge: vi.fn().mockResolvedValue({ challengeXdr: "AAAA", nonce: "nonce123" }),
    verifyAuthChallenge: vi.fn().mockResolvedValue({
      token: "mock_token",
      role: "AFFILIATE",
      walletAddress: "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
      expiresAt: Date.now() + 86400000,
    }),
  };
});

describe("Web3Context Suite — Automated Escrow Top-Up & Wallet Integration (#107)", () => {
  let localStorageMock: Record<string, string> = {};

  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(rpcFallbackManager, "checkAllHealth").mockResolvedValue([]);
    vi.spyOn(rpcFallbackManager, "checkEndpointHealth").mockResolvedValue({} as any);
    localStorageMock = {};
    const mockStorage = {
      getItem: (key: string) => localStorageMock[key] ?? null,
      setItem: (key: string, val: string) => {
        localStorageMock[key] = val;
      },
      removeItem: (key: string) => {
        delete localStorageMock[key];
      },
      clear: () => {
        localStorageMock = {};
      },
      length: 0,
      key: () => null,
    };
    Object.defineProperty(window, "localStorage", {
      value: mockStorage,
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <Web3Provider>{children}</Web3Provider>
  );

  it("provides initial default Web3 state", () => {
    const { result } = renderHook(() => useWeb3(), { wrapper });

    expect(result.current.userAddress).toBeNull();
    expect(result.current.isConnected).toBe(false);
    expect(result.current.connectorType).toBeNull();
    expect(result.current.xlmBalance).toBe("0.00");
    expect(result.current.tokenAllowance).toBe(0);
  });

  it("throws when topUpCampaignEscrow is called while disconnected", async () => {
    const { result } = renderHook(() => useWeb3(), { wrapper });

    await expect(result.current.topUpCampaignEscrow(1, 1000)).rejects.toThrow(
      "Wallet not connected",
    );
  });

  it("executes mock topUpCampaignEscrow successfully when connectorType is mock", async () => {
    const { result } = renderHook(() => useWeb3(), { wrapper });

    await act(async () => {
      await result.current.connectWallet("mock", "GASTORMSALE7TESTNET7AFFILIATE7MERCHANT7ESCROW7XLM77777");
    });

    expect(result.current.isConnected).toBe(true);
    expect(result.current.connectorType).toBe("mock");

    await act(async () => {
      await result.current.approveTokenAllowance(5000);
    });

    expect(result.current.tokenAllowance).toBe(5000);

    let topUpRes: any;
    await act(async () => {
      topUpRes = await result.current.topUpCampaignEscrow(1, 1000);
    });

    expect(topUpRes.success).toBe(true);
    expect(topUpRes.toppedUpAmount).toBe(1000);
    expect(topUpRes.txHash).toBeDefined();
    expect(result.current.tokenAllowance).toBe(4000);
  });

  it("rejects topUpCampaignEscrow for unsupported connectors (ledger, passkey, readonly)", async () => {
    const { result } = renderHook(() => useWeb3(), { wrapper });

    await act(async () => {
      await result.current.connectWallet("readonly", "GASTORMSALE7TESTNET7AFFILIATE7MERCHANT7ESCROW7XLM77777");
    });

    expect(result.current.connectorType).toBe("readonly");

    await expect(result.current.topUpCampaignEscrow(1, 1000)).rejects.toThrow(
      "Escrow top-up is not supported for readonly wallets.",
    );
  });

  it("executes on-chain topUpCampaignEscrow with Freighter wallet and schedules refreshes", async () => {
    const { result } = renderHook(() => useWeb3(), { wrapper });

    await act(async () => {
      await result.current.connectWallet("freighter");
    });

    expect(result.current.isConnected).toBe(true);
    expect(result.current.connectorType).toBe("freighter");

    let topUpRes: any;
    await act(async () => {
      topUpRes = await result.current.topUpCampaignEscrow(2, 1500, "XLM");
    });

    expect(topUpRes.success).toBe(true);
    expect(topUpRes.txHash).toBe("tx_topup_onchain");

    act(() => {
      vi.advanceTimersByTime(1500);
    });
  });

  it("handles wallet disconnection cleanly", async () => {
    const { result } = renderHook(() => useWeb3(), { wrapper });

    await act(async () => {
      await result.current.connectWallet("mock", "GASTORMSALE7TESTNET7AFFILIATE7MERCHANT7ESCROW7XLM77777");
    });
    expect(result.current.isConnected).toBe(true);

    act(() => {
      result.current.disconnectWallet();
    });

    expect(result.current.isConnected).toBe(false);
    expect(result.current.userAddress).toBeNull();
    expect(result.current.connectorType).toBeNull();
  });

  it("handles modal toggles, roles, and balances", async () => {
    const { result } = renderHook(() => useWeb3(), { wrapper });

    act(() => {
      result.current.openWalletModal();
    });
    expect(result.current.isWalletModalOpen).toBe(true);

    act(() => {
      result.current.closeWalletModal();
    });
    expect(result.current.isWalletModalOpen).toBe(false);

    await act(async () => {
      await result.current.connectWallet("mock", "GASTORMSALE7TESTNET7AFFILIATE7MERCHANT7ESCROW7XLM77777");
    });

    await act(async () => {
      await result.current.updateUserRole("advertiser");
    });
    expect(result.current.userRole).toBe("advertiser");
  });

  it("connects via Albedo and xBull wallets", async () => {
    const { result } = renderHook(() => useWeb3(), { wrapper });

    await act(async () => {
      await result.current.connectWallet("albedo");
    });
    expect(result.current.isConnected).toBe(true);
    expect(result.current.connectorType).toBe("albedo");

    await act(async () => {
      await result.current.connectWallet("xbull");
    });
    expect(result.current.isConnected).toBe(true);
    expect(result.current.connectorType).toBe("xbull");
  });

  it("manages multisig modal and inspects multisig info", async () => {
    const { result } = renderHook(() => useWeb3(), { wrapper });

    act(() => {
      result.current.openMultiSigModal("AAAA_MOCK_XDR", "Authorize refund");
    });
    expect(result.current.isMultiSigModalOpen).toBe(true);
    expect(result.current.activeMultiSigXdr).toBe("AAAA_MOCK_XDR");
    expect(result.current.activeMultiSigDescription).toBe("Authorize refund");

    act(() => {
      result.current.closeMultiSigModal();
    });
    expect(result.current.isMultiSigModalOpen).toBe(false);

    let info: any;
    await act(async () => {
      info = await result.current.refreshMultiSigInfo("GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5");
    });
    expect(info?.isMultiSig).toBe(true);
  });

  it("manages RPC fallback modal, endpoint switching, failovers, and custom endpoints", async () => {
    const { result } = renderHook(() => useWeb3(), { wrapper });

    act(() => {
      result.current.openRpcModal();
    });
    expect(result.current.isRpcModalOpen).toBe(true);

    act(() => {
      result.current.closeRpcModal();
    });
    expect(result.current.isRpcModalOpen).toBe(false);

    act(() => {
      const endpoints = result.current.rpcEndpoints;
      if (endpoints.length > 0) {
        result.current.switchRpcEndpoint(endpoints[0].id);
      }
    });

    act(() => {
      result.current.simulateRpcFailover("Unit test failover trigger");
    });
    expect(result.current.rpcFailoverHistory.length).toBeGreaterThan(0);

    await act(async () => {
      await result.current.checkRpcHealth();
    });

    act(() => {
      result.current.addCustomRpcEndpoint("Test Backup Node", "https://custom.rpc.testnet", false);
    });
  });

  it("handles token allowances and balances refresh", async () => {
    const { result } = renderHook(() => useWeb3(), { wrapper });

    await act(async () => {
      await result.current.connectWallet("freighter");
    });

    let allowance: number = 0;
    await act(async () => {
      allowance = await result.current.refreshTokenAllowance();
    });
    expect(allowance).toBe(5000);

    let approveRes: any;
    await act(async () => {
      approveRes = await result.current.approveTokenAllowance(7500);
    });
    expect(approveRes.success).toBe(true);

    await act(async () => {
      await result.current.refreshBalances();
    });
    expect(result.current.xlmBalance).toBe("1500.5");

    await act(async () => {
      await result.current.approveAllowance("C_TOKEN_ADDR", "C_SPENDER_ADDR", 250);
    });
  });

  it("handles friendbot testnet account funding", async () => {
    const { result } = renderHook(() => useWeb3(), { wrapper });

    await act(async () => {
      await result.current.connectWallet("freighter");
    });

    let funded = false;
    await act(async () => {
      funded = await result.current.requestFriendbotFunding();
    });
    expect(funded).toBe(true);

    act(() => {
      vi.advanceTimersByTime(2500);
    });
  });

  it("creates campaign on chain in both freighter and mock modes", async () => {
    const { result } = renderHook(() => useWeb3(), { wrapper });

    // Freighter mode
    await act(async () => {
      await result.current.connectWallet("freighter");
    });

    let res: any;
    await act(async () => {
      res = await result.current.createCampaignOnChain("Test Campaign 1", 1000, 10, 86400, "XLM");
    });
    expect(res.success).toBe(true);

    // With USDC asset
    await act(async () => {
      res = await result.current.createCampaignOnChain("USDC Campaign", 500, 12, 86400, "USDC");
    });
    expect(res.success).toBe(true);

    // Mock mode
    await act(async () => {
      await result.current.connectWallet("mock", "GASTORMSALE7TESTNET7AFFILIATE7MERCHANT7ESCROW7XLM77777");
    });

    let mockRes: any;
    await act(async () => {
      mockRes = await result.current.createCampaignOnChain("Mock Campaign", 200, 15, 86400, "XLM");
    });
    expect(mockRes.success).toBe(true);
    expect(mockRes.campaignId).toBeDefined();
  });

  it("logs sales and claims affiliate payouts in both freighter and mock modes", async () => {
    const { result } = renderHook(() => useWeb3(), { wrapper });

    // Freighter mode
    await act(async () => {
      await result.current.connectWallet("freighter");
    });

    let saleRes: any;
    await act(async () => {
      saleRes = await result.current.logSaleOnChain(1, "GAFFILIATE_WALLET_ADDRESS", 100);
    });
    expect(saleRes.success).toBe(true);

    let claimRes: any;
    await act(async () => {
      claimRes = await result.current.claimPayoutOnChain(1);
    });
    expect(claimRes.success).toBe(true);

    let refundRes: any;
    await act(async () => {
      refundRes = await result.current.refundCampaignEscrow(1);
    });
    expect(refundRes.success).toBe(true);

    // Mock mode
    await act(async () => {
      await result.current.connectWallet("mock", "GASTORMSALE7TESTNET7AFFILIATE7MERCHANT7ESCROW7XLM77777");
    });

    let mockSaleRes: any;
    await act(async () => {
      mockSaleRes = await result.current.logSaleOnChain(2, "GAFFILIATE_WALLET_ADDRESS", 150);
    });
    expect(mockSaleRes.success).toBe(true);

    let mockClaimRes: any;
    await act(async () => {
      mockClaimRes = await result.current.claimPayoutOnChain(2);
    });
    expect(mockClaimRes.success).toBe(true);

    let mockRefundRes: any;
    await act(async () => {
      mockRefundRes = await result.current.refundCampaignEscrow(2);
    });
    expect(mockRefundRes.success).toBe(true);
  });

  it("exercises SAC allowance, storage TTL, multisig, and RPC management methods", async () => {
    const { result } = renderHook(() => useWeb3(), { wrapper });

    await act(async () => {
      await result.current.connectWallet("freighter");
    });

    // Storage TTL
    const ttl = await result.current.getStorageTTL();
    expect(ttl).toBeDefined();

    const extendRes = await result.current.extendStorageTTL();
    expect(extendRes.success).toBe(true);

    // SAC allowance and top-up
    const allowanceCheck = await result.current.checkTopUpAllowance(500, "XLM");
    expect(allowanceCheck).toBeDefined();

    const simRes = await result.current.simulateApprove(500, "XLM");
    expect(simRes.success).toBe(true);

    const approveRes = await result.current.approveTokenAllowance(500, "XLM");
    expect(approveRes.success).toBe(true);

    const topUpRes = await result.current.topUpCampaignEscrow(1, 500, "XLM");
    expect(topUpRes.success).toBe(true);

    // MultiSig modal state
    act(() => {
      result.current.openMultiSigModal("AAAA_MOCK_XDR", "Test MultiSig Action");
    });
    expect(result.current.isMultiSigModalOpen).toBe(true);
    expect(result.current.activeMultiSigXdr).toBe("AAAA_MOCK_XDR");
    expect(result.current.activeMultiSigDescription).toBe("Test MultiSig Action");

    act(() => {
      result.current.closeMultiSigModal();
    });
    expect(result.current.isMultiSigModalOpen).toBe(false);

    // RPC management
    act(() => {
      result.current.openRpcModal();
    });
    expect(result.current.isRpcModalOpen).toBe(true);

    act(() => {
      result.current.closeRpcModal();
    });
    expect(result.current.isRpcModalOpen).toBe(false);

    act(() => {
      result.current.switchRpcEndpoint("https://soroban-testnet.stellar.org");
    });

    await act(async () => {
      await result.current.simulateRpcFailover();
    });

    await act(async () => {
      await result.current.checkRpcHealth();
    });

    act(() => {
      result.current.addCustomRpcEndpoint("https://custom-rpc.example.com", "Custom RPC");
    });

    act(() => {
      result.current.switchToStellarNetwork();
    });
  });

  it("invokes DEFAULT_WEB3_CONTEXT fallback handlers", async () => {
    DEFAULT_WEB3_CONTEXT.setLedgerBipPath("44'/148'/0'");
    DEFAULT_WEB3_CONTEXT.openWalletModal();
    DEFAULT_WEB3_CONTEXT.closeWalletModal();
    await DEFAULT_WEB3_CONTEXT.connectWallet("mock");
    DEFAULT_WEB3_CONTEXT.disconnectWallet();
    await DEFAULT_WEB3_CONTEXT.updateUserRole("ADVERTISER");
    await DEFAULT_WEB3_CONTEXT.requestFriendbotFunding();
    await DEFAULT_WEB3_CONTEXT.refreshBalances();
    await DEFAULT_WEB3_CONTEXT.approveAllowance("token", "spender", 100);
    await DEFAULT_WEB3_CONTEXT.authenticateSession();
    await DEFAULT_WEB3_CONTEXT.createCampaignOnChain("c", 100, 10, 86400);
    await DEFAULT_WEB3_CONTEXT.logSaleOnChain(1, "GB...", 100);
    await DEFAULT_WEB3_CONTEXT.claimPayoutOnChain(1);
    await DEFAULT_WEB3_CONTEXT.refundCampaignEscrow(1);
    await DEFAULT_WEB3_CONTEXT.topUpCampaignEscrow(1, 100);
    await DEFAULT_WEB3_CONTEXT.getAllowance();
    await DEFAULT_WEB3_CONTEXT.simulateApprove(100);
    await DEFAULT_WEB3_CONTEXT.checkTopUpAllowance(100);
    await DEFAULT_WEB3_CONTEXT.getStorageTTL();
    await DEFAULT_WEB3_CONTEXT.extendStorageTTL();
    await DEFAULT_WEB3_CONTEXT.batchClaimPayoutsOnChain([]);
    await DEFAULT_WEB3_CONTEXT.registerPasskeyAccount("test");
    await DEFAULT_WEB3_CONTEXT.refreshTokenAllowance();
    await DEFAULT_WEB3_CONTEXT.approveTokenAllowance(100);
    DEFAULT_WEB3_CONTEXT.openMultiSigModal("XDR", "desc");
    DEFAULT_WEB3_CONTEXT.closeMultiSigModal();
    await DEFAULT_WEB3_CONTEXT.refreshMultiSigInfo();
    DEFAULT_WEB3_CONTEXT.openRpcModal();
    DEFAULT_WEB3_CONTEXT.closeRpcModal();
    DEFAULT_WEB3_CONTEXT.switchRpcEndpoint("url");
    DEFAULT_WEB3_CONTEXT.simulateRpcFailover();
    await DEFAULT_WEB3_CONTEXT.checkRpcHealth();
    DEFAULT_WEB3_CONTEXT.addCustomRpcEndpoint("url", "name");
    expect(DEFAULT_WEB3_CONTEXT.getCampaignContract("1")).toBeNull();
    await DEFAULT_WEB3_CONTEXT.switchToStellarNetwork();
  });
});
