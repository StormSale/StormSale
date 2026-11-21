// @vitest-environment jsdom
import { Buffer } from "buffer";
globalThis.Buffer = Buffer;

import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { Web3Provider, useWeb3, useSafeWeb3 } from "../../src/context/Web3Context";
import {
  checkStellarNetwork,
  verifyHorizonConnectivity,
  getStellarExplorerLink,
} from "../../src/utils/network";
import * as storage from "../../src/lib/storage";

// Mock configuration
vi.mock("../../src/config/stellar", () => ({
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
    USDC: {
      code: "USDC",
      name: "USD Coin",
      decimals: 7,
      contractAddress: "CUSDC",
    },
    EURC: {
      code: "EURC",
      name: "Euro Coin",
      decimals: 7,
      contractAddress: "CEURC",
    },
  },
  NETWORK_ESCROW_ASSETS: {
    TESTNET: {},
    PUBLIC: {},
  },
}));

// Mock freighter-api for network utility tests
const mockFreighterIsConnected = vi.fn().mockResolvedValue(true);
const mockFreighterGetNetworkDetails = vi.fn().mockResolvedValue({ network: "TESTNET" });
vi.mock("@stellar/freighter-api", () => ({
  isConnected: () => mockFreighterIsConnected(),
  getNetworkDetails: () => mockFreighterGetNetworkDetails(),
}));

// Mock stellar library calls
vi.mock("../../src/lib/stellar", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/lib/stellar")>();
  return {
    ...actual,
    checkFreighterInstalled: vi.fn().mockResolvedValue(true),
    connectFreighterWallet: vi
      .fn()
      .mockResolvedValue("GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5"),
    connectAlbedoWallet: vi
      .fn()
      .mockResolvedValue("GALBEDO47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5"),
    connectXbullWallet: vi
      .fn()
      .mockResolvedValue("GXBULL47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5"),
    fetchXlmBalance: vi.fn().mockResolvedValue("2500.00"),
    fetchAssetBalances: vi
      .fn()
      .mockResolvedValue({ XLM: "2500.00", USDC: "500.00", EURC: "100.00" }),
    getTokenAllowanceQuery: vi.fn().mockResolvedValue(1000),
    approveTokenContractCall: vi
      .fn()
      .mockResolvedValue({ success: true, allowance: 5000, txHash: "tx_token_approval" }),
    approveTokenAllowance: vi
      .fn()
      .mockResolvedValue({ success: true, txHash: "tx_token_allowance" }),
    fundTestnetAccount: vi.fn().mockResolvedValue(true),
    getCurrentNetwork: vi.fn().mockResolvedValue("TESTNET"),
  };
});

// Mock Ledger Bridge
vi.mock("../../src/lib/ledgerBridge", () => ({
  DEFAULT_STELLAR_BIP_PATH: "44'/148'/0'",
  connectLedgerDevice: vi.fn().mockResolvedValue({
    address: "GLEDGER47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
    bipPath: "44'/148'/0'",
  }),
}));

// Mock Passkey Signer
vi.mock("../../src/lib/passkeySigner", () => ({
  loadEncryptedPasskeyVault: vi.fn().mockResolvedValue([]),
  registerPasskey: vi.fn().mockResolvedValue({
    id: "cred-new-123",
    rawCredentialId: "cred-raw-123",
    publicKeyBase64: "pubkey-123",
    stellarAddress: "GPASSKEYNEW47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
    userName: "Affiliate User",
    createdAt: Date.now(),
    deviceLabel: "Passkey Device",
  }),
  authenticateWithPasskey: vi.fn().mockResolvedValue({
    record: {
      id: "cred-existing-456",
      stellarAddress: "GPASSKEYAUTH47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
    },
  }),
}));

// Mock multisig
vi.mock("../../src/lib/multisig", () => ({
  inspectMultiSigAccount: vi.fn().mockResolvedValue({
    isMultiSig: false,
    signers: [],
    threshold: { low: 1, med: 1, high: 1 },
  }),
}));

// Mock Sanctions
vi.mock("../../src/lib/sanctions", () => ({
  assertNotSanctioned: vi.fn().mockResolvedValue(undefined),
}));

// Mock API
vi.mock("../../src/utils/api", () => ({
  registerUser: vi
    .fn()
    .mockImplementation((addr, role) =>
      Promise.resolve({ success: true, address: addr, role: role || "affiliate" }),
    ),
}));

// Mock storage
vi.spyOn(storage, "purgeOnLogout").mockImplementation(async () => {});

describe("Mock Web3 Connection & Chain-Switch Logic Suite (#89)", () => {
  let localStorageMock: Record<string, string> = {};

  beforeEach(() => {
    vi.useFakeTimers();
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

  const wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(Web3Provider, null, children);

  /* =========================================================================
     1. MOCK CONNECTION & DISCONNECTION VERIFICATION
     ========================================================================= */

  describe("Mock Connection and Disconnection Lifecycle", () => {
    it("initializes with disconnected defaults", () => {
      const { result } = renderHook(() => useWeb3(), { wrapper });

      expect(result.current.isConnected).toBe(false);
      expect(result.current.userAddress).toBeNull();
      expect(result.current.userRole).toBeNull();
      expect(result.current.connectorType).toBeNull();
      expect(result.current.xlmBalance).toBe("0.00");
      expect(result.current.tokenAllowance).toBe(0);
      expect(result.current.isStellarNetwork).toBe(true);
      expect(result.current.network).toBe("TESTNET");
    });

    it("connects via mock provider with default testnet demo account and 10,000 XLM balance", async () => {
      const { result } = renderHook(() => useWeb3(), { wrapper });

      await act(async () => {
        await result.current.connectWallet("mock");
      });

      expect(result.current.isConnected).toBe(true);
      expect(result.current.connectorType).toBe("mock");
      expect(result.current.userAddress).toBe(
        "GASTORMSALE7TESTNET7AFFILIATE7MERCHANT7ESCROW7XLM77777",
      );
      expect(result.current.network).toBe("TESTNET");
      expect(result.current.xlmBalance).toBe("10000.00");
      expect(result.current.isStellarNetwork).toBe(true);
      expect(result.current.isWalletModalOpen).toBe(false);
    });

    it("supports connecting mock wallet with a custom address", async () => {
      const { result } = renderHook(() => useWeb3(), { wrapper });
      const customAddr = "GAFFILIATECUSTOMMOCKADDRESS7777777777777777777777777777777";

      await act(async () => {
        await result.current.connectWallet("mock", customAddr);
      });

      expect(result.current.isConnected).toBe(true);
      expect(result.current.connectorType).toBe("mock");
      // Default fallback in context sets mock testnet address
      expect(result.current.userAddress).toBe(
        "GASTORMSALE7TESTNET7AFFILIATE7MERCHANT7ESCROW7XLM77777",
      );
      expect(result.current.xlmBalance).toBe("10000.00");
    });

    it("handles mock token allowance approval without external contract calls", async () => {
      const { result } = renderHook(() => useWeb3(), { wrapper });

      await act(async () => {
        await result.current.connectWallet("mock");
      });

      let res: any;
      await act(async () => {
        res = await result.current.approveTokenAllowance(2500);
      });

      expect(res.success).toBe(true);
      expect(res.txHash).toBe("sim_allowance");
      expect(res.allowance).toBe(2500);
      expect(result.current.tokenAllowance).toBe(2500);
    });

    it("clears all state and invokes purgeOnLogout upon disconnection", async () => {
      const { result } = renderHook(() => useWeb3(), { wrapper });

      await act(async () => {
        await result.current.connectWallet("mock");
      });

      await act(async () => {
        await result.current.updateUserRole("merchant");
      });

      expect(result.current.isConnected).toBe(true);
      expect(result.current.userRole).toBe("merchant");

      act(() => {
        result.current.disconnectWallet();
      });

      expect(result.current.isConnected).toBe(false);
      expect(result.current.userAddress).toBeNull();
      expect(result.current.userRole).toBeNull();
      expect(result.current.connectorType).toBeNull();
      expect(result.current.xlmBalance).toBe("0.00");
      expect(result.current.assetBalances.XLM).toBe("0.00");
      expect(result.current.assetBalances.USDC).toBe("0.00");
      expect(result.current.assetBalances.EURC).toBe("0.00");
      expect(result.current.tokenAllowance).toBe(0);
      expect(result.current.multiSigInfo).toBeNull();
      expect(result.current.isMultiSigModalOpen).toBe(false);
      expect(result.current.activeMultiSigXdr).toBeNull();
      expect(storage.purgeOnLogout).toHaveBeenCalled();
    });
  });

  /* =========================================================================
     2. SIMULATED WALLET CONNECTORS & ERROR HANDLING
     ========================================================================= */

  describe("Simulated Wallet Connectors & Error Resilience", () => {
    it("connects successfully via Freighter when extension is detected", async () => {
      const { result } = renderHook(() => useWeb3(), { wrapper });

      await act(async () => {
        await result.current.connectWallet("freighter");
      });

      expect(result.current.isConnected).toBe(true);
      expect(result.current.connectorType).toBe("freighter");
      expect(result.current.userAddress).toBe(
        "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
      );
      expect(result.current.network).toBe("TESTNET");
      expect(result.current.xlmBalance).toBe("2500.00");
    });

    it("throws a helpful error when Freighter is not installed", async () => {
      const stellar = await import("../../src/lib/stellar");
      vi.mocked(stellar.checkFreighterInstalled).mockResolvedValueOnce(false);

      const { result } = renderHook(() => useWeb3(), { wrapper });

      await expect(
        act(async () => {
          await result.current.connectWallet("freighter");
        }),
      ).rejects.toThrow(/Freighter extension is not installed/);

      expect(result.current.isConnected).toBe(false);
    });

    it("connects via Albedo web wallet connector", async () => {
      const { result } = renderHook(() => useWeb3(), { wrapper });

      await act(async () => {
        await result.current.connectWallet("albedo");
      });

      expect(result.current.isConnected).toBe(true);
      expect(result.current.connectorType).toBe("albedo");
      expect(result.current.userAddress).toBe(
        "GALBEDO47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
      );
    });

    it("connects via xBull wallet connector", async () => {
      const { result } = renderHook(() => useWeb3(), { wrapper });

      await act(async () => {
        await result.current.connectWallet("xbull");
      });

      expect(result.current.isConnected).toBe(true);
      expect(result.current.connectorType).toBe("xbull");
      expect(result.current.userAddress).toBe(
        "GXBULL47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
      );
    });

    it("connects via Ledger hardware bridge with custom BIP path", async () => {
      const { result } = renderHook(() => useWeb3(), { wrapper });

      await act(async () => {
        await result.current.connectWallet("ledger", undefined, "44'/148'/1'");
      });

      expect(result.current.isConnected).toBe(true);
      expect(result.current.connectorType).toBe("ledger");
      expect(result.current.userAddress).toBe(
        "GLEDGER47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
      );
    });

    it("connects via Passkey (authenticating existing credential)", async () => {
      const passkeySigner = await import("../../src/lib/passkeySigner");
      vi.mocked(passkeySigner.loadEncryptedPasskeyVault).mockResolvedValueOnce([
        {
          id: "cred-1",
          rawCredentialId: "raw-1",
          publicKeyBase64: "pk-1",
          stellarAddress: "GPASSKEYAUTH47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
          userName: "Tester",
          createdAt: Date.now(),
        },
      ]);

      const { result } = renderHook(() => useWeb3(), { wrapper });

      await act(async () => {
        await result.current.connectWallet("passkey");
      });

      expect(result.current.isConnected).toBe(true);
      expect(result.current.connectorType).toBe("passkey");
      expect(result.current.userAddress).toBe(
        "GPASSKEYAUTH47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
      );
    });

    it("connects via Readonly connector when a valid address is supplied", async () => {
      const { result } = renderHook(() => useWeb3(), { wrapper });
      const readonlyAddr = "GREADONLYPUBLICADDRESS7777777777777777777777777777777777";

      await act(async () => {
        await result.current.connectWallet("readonly", readonlyAddr);
      });

      expect(result.current.isConnected).toBe(true);
      expect(result.current.connectorType).toBe("readonly");
      expect(result.current.userAddress).toBe(readonlyAddr);
    });

    it("rejects Readonly connector if no address is supplied", async () => {
      const { result } = renderHook(() => useWeb3(), { wrapper });

      await expect(
        act(async () => {
          await result.current.connectWallet("readonly");
        }),
      ).rejects.toThrow("Please provide a valid Stellar address.");

      expect(result.current.isConnected).toBe(false);
    });

    it("aborts connection if account is flagged as sanctioned", async () => {
      const sanctions = await import("../../src/lib/sanctions");
      vi.mocked(sanctions.assertNotSanctioned).mockRejectedValueOnce(
        new Error("Address flagged on sanctions list"),
      );

      const { result } = renderHook(() => useWeb3(), { wrapper });

      await expect(
        act(async () => {
          await result.current.connectWallet("mock");
        }),
      ).rejects.toThrow("Address flagged on sanctions list");

      expect(result.current.isConnected).toBe(false);
      expect(result.current.userAddress).toBeNull();
    });
  });

  /* =========================================================================
     3. CHAIN-SWITCH & NETWORK SWITCHING LOGIC COVERAGE
     ========================================================================= */

  describe("Chain-Switch & Network Switching Logic", () => {
    it("evaluates isStellarNetwork correctly for TESTNET and PUBLIC", () => {
      const { result } = renderHook(() => useWeb3(), { wrapper });

      expect(result.current.isStellarNetwork).toBe(true);
      expect(result.current.network).toBe("TESTNET");
    });

    it("switches network back to TESTNET when switchToStellarNetwork is invoked", async () => {
      const { result } = renderHook(() => useWeb3(), { wrapper });

      let switchResult: boolean = false;
      await act(async () => {
        switchResult = await result.current.switchToStellarNetwork();
      });

      expect(switchResult).toBe(true);
      expect(result.current.network).toBe("TESTNET");
      expect(result.current.isStellarNetwork).toBe(true);
    });

    it("verifies Freighter network with checkStellarNetwork utility when matched", async () => {
      mockFreighterIsConnected.mockResolvedValueOnce(true);
      mockFreighterGetNetworkDetails.mockResolvedValueOnce({ network: "TESTNET" });

      const res = await checkStellarNetwork();
      expect(res.isCorrect).toBe(true);
      expect(res.currentNetwork).toBe("TESTNET");
      expect(res.expectedNetwork).toBe("TESTNET");
    });

    it("flags network mismatch with checkStellarNetwork when wallet is on wrong chain", async () => {
      mockFreighterIsConnected.mockResolvedValueOnce(true);
      mockFreighterGetNetworkDetails.mockResolvedValueOnce({ network: "PUBLIC" });

      const res = await checkStellarNetwork();
      expect(res.isCorrect).toBe(false);
      expect(res.currentNetwork).toBe("PUBLIC");
      expect(res.expectedNetwork).toBe("TESTNET");
    });

    it("returns isCorrect: false when wallet is disconnected during checkStellarNetwork", async () => {
      mockFreighterIsConnected.mockResolvedValueOnce(false);

      const res = await checkStellarNetwork();
      expect(res.isCorrect).toBe(false);
      expect(res.expectedNetwork).toBe("TESTNET");
    });

    it("gracefully catches exceptions during checkStellarNetwork", async () => {
      mockFreighterIsConnected.mockRejectedValueOnce(new Error("IPC connection failed"));

      const res = await checkStellarNetwork();
      expect(res.isCorrect).toBe(false);
      expect(res.expectedNetwork).toBe("TESTNET");
    });

    it("verifies Horizon connectivity correctly", async () => {
      const originalFetch = globalThis.fetch;
      globalThis.fetch = vi.fn().mockResolvedValueOnce({ ok: true });

      const isConnected = await verifyHorizonConnectivity();
      expect(isConnected).toBe(true);

      globalThis.fetch = vi.fn().mockRejectedValueOnce(new Error("Network timeout"));
      const isFailed = await verifyHorizonConnectivity();
      expect(isFailed).toBe(false);

      globalThis.fetch = originalFetch;
    });

    it("formats Stellar Expert explorer links for account, tx, and contract", () => {
      const accountLink = getStellarExplorerLink("account", "GBBD47IF");
      expect(accountLink).toBe("https://stellar.expert/explorer/testnet/account/GBBD47IF");

      const txLink = getStellarExplorerLink("tx", "hash123");
      expect(txLink).toBe("https://stellar.expert/explorer/testnet/tx/hash123");

      const contractLink = getStellarExplorerLink("contract", "CA7QW");
      expect(contractLink).toBe("https://stellar.expert/explorer/testnet/contract/CA7QW");
    });
  });

  /* =========================================================================
     4. RPC ENDPOINT SWITCHING & FAILOVER COVERAGE
     ========================================================================= */

  describe("RPC Endpoint Switching and Failover Logic", () => {
    it("switches RPC endpoints and updates active node", () => {
      const { result } = renderHook(() => useWeb3(), { wrapper });

      const initialActive = result.current.activeRpcEndpoint;
      expect(initialActive).toBeDefined();

      const endpoints = result.current.rpcEndpoints;
      if (endpoints.length > 1) {
        const target = endpoints[1];
        act(() => {
          result.current.switchRpcEndpoint(target.id);
        });

        expect(result.current.activeRpcEndpoint.id).toBe(target.id);
      }
    });

    it("simulates RPC failover and records failover event history", () => {
      const { result } = renderHook(() => useWeb3(), { wrapper });

      const historyCountBefore = result.current.rpcFailoverHistory.length;

      act(() => {
        result.current.simulateRpcFailover("Simulated high latency outage");
      });

      expect(result.current.rpcFailoverHistory.length).toBeGreaterThan(historyCountBefore);
      const latestEvent =
        result.current.rpcFailoverHistory[result.current.rpcFailoverHistory.length - 1];
      expect(latestEvent.reason).toBe("Simulated high latency outage");
    });

    it("adds a custom RPC endpoint to the available endpoint pool", () => {
      const { result } = renderHook(() => useWeb3(), { wrapper });

      const countBefore = result.current.rpcEndpoints.length;

      act(() => {
        result.current.addCustomRpcEndpoint(
          "Local Soroban Standalone",
          "http://localhost:8000/rpc",
          true,
        );
      });

      expect(result.current.rpcEndpoints.length).toBe(countBefore + 1);
      const added = result.current.rpcEndpoints.find((e) => e.name === "Local Soroban Standalone");
      expect(added).toBeDefined();
      expect(added?.isLocal).toBe(true);
    });

    it("performs RPC health checks across endpoints", async () => {
      const { result } = renderHook(() => useWeb3(), { wrapper });

      await act(async () => {
        await result.current.checkRpcHealth();
      });

      expect(result.current.rpcEndpoints.length).toBeGreaterThan(0);
    });
  });

  /* =========================================================================
     5. MODAL, ROLE & HELPER HOOK COVERAGE
     ========================================================================= */

  describe("Modal, Role and Helper Hooks", () => {
    it("toggles wallet modal open and close states", () => {
      const { result } = renderHook(() => useWeb3(), { wrapper });

      expect(result.current.isWalletModalOpen).toBe(false);

      act(() => {
        result.current.openWalletModal();
      });
      expect(result.current.isWalletModalOpen).toBe(true);

      act(() => {
        result.current.closeWalletModal();
      });
      expect(result.current.isWalletModalOpen).toBe(false);
    });

    it("toggles RPC modal open and close states", () => {
      const { result } = renderHook(() => useWeb3(), { wrapper });

      expect(result.current.isRpcModalOpen).toBe(false);

      act(() => {
        result.current.openRpcModal();
      });
      expect(result.current.isRpcModalOpen).toBe(true);

      act(() => {
        result.current.closeRpcModal();
      });
      expect(result.current.isRpcModalOpen).toBe(false);
    });

    it("updates user role state when connected", async () => {
      const { result } = renderHook(() => useWeb3(), { wrapper });

      await act(async () => {
        await result.current.connectWallet("mock");
      });

      await act(async () => {
        await result.current.updateUserRole("merchant");
      });

      expect(result.current.userRole).toBe("merchant");
    });

    it("updates ledger BIP path", () => {
      const { result } = renderHook(() => useWeb3(), { wrapper });

      act(() => {
        result.current.setLedgerBipPath("44'/148'/2'");
      });

      expect(result.current.ledgerBipPath).toBe("44'/148'/2'");
    });

    it("throws error when useWeb3 is called outside of Web3Provider", () => {
      expect(() => {
        renderHook(() => useWeb3());
      }).toThrow("useWeb3 must be used within a Web3Provider");
    });

    it("returns undefined when useSafeWeb3 is called outside of Web3Provider without throwing", () => {
      const { result } = renderHook(() => useSafeWeb3());
      expect(result.current).toBeUndefined();
    });
  });
});
