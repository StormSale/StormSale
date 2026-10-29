import { describe, it, expect, beforeEach, afterEach, beforeAll, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { createElement } from "react";
import type { ReactNode } from "react";

// ----------------------------------------------------------------------------
// Mocks for the Stellar wallet library and related dependencies.
// ----------------------------------------------------------------------------

const mockConnectFreighter = vi.fn();
const mockConnectAlbedo = vi.fn();
const mockConnectXbull = vi.fn();
const mockCheckFreighterInstalled = vi.fn();
const mockGetCurrentNetwork = vi.fn();
const mockFetchXlmBalance = vi.fn();
const mockFetchAssetBalances = vi.fn();
const mockFundTestnetAccount = vi.fn();
const mockGetTokenAllowanceQuery = vi.fn();
const mockApproveTokenContractCall = vi.fn();
const mockApproveTokenAllowanceCall = vi.fn();
const mockCreateCampaignContractCall = vi.fn();
const mockLogSaleContractCall = vi.fn();
const mockClaimPayoutContractCall = vi.fn();
const mockRefundCampaignEscrowContractCall = vi.fn();

vi.mock("../lib/stellar", () => ({
  connectFreighterWallet: mockConnectFreighter,
  connectAlbedoWallet: mockConnectAlbedo,
  connectXbullWallet: mockConnectXbull,
  checkFreighterInstalled: mockCheckFreighterInstalled,
  getCurrentNetwork: mockGetCurrentNetwork,
  fetchXlmBalance: mockFetchXlmBalance,
  fetchAssetBalances: mockFetchAssetBalances,
  fundTestnetAccount: mockFundTestnetAccount,
  getTokenAllowanceQuery: mockGetTokenAllowanceQuery,
  approveTokenContractCall: mockApproveTokenContractCall,
  approveTokenAllowance: mockApproveTokenAllowanceCall,
  createCampaignContractCall: mockCreateCampaignContractCall,
  logSaleContractCall: mockLogSaleContractCall,
  claimPayoutContractCall: mockClaimPayoutContractCall,
  refundCampaignEscrowContractCall: mockRefundCampaignEscrowContractCall,
}));

const mockRegisterUser = vi.fn();
vi.mock("../utils/api", () => ({
  registerUser: mockRegisterUser,
}));

const mockPurgeOnLogout = vi.fn();
vi.mock("../lib/storage", () => ({
  purgeOnLogout: mockPurgeOnLogout,
}));

// Mock the ledger bridge module so the dynamic import in connectWallet is controllable.
const mockConnectLedgerDevice = vi.fn();
vi.mock("../lib/ledgerBridge", () => ({
  connectLedgerDevice: mockConnectLedgerDevice,
  DEFAULT_STELLAR_BIP_PATH: "44'/148'/0'",
}));

// Mock the passkey signer module.
const mockAuthenticateWithPasskey = vi.fn();
const mockLoadEncryptedPasskeyVault = vi.fn();
const mockRegisterPasskey = vi.fn();
vi.mock("../lib/passkeySigner", () => ({
  authenticateWithPasskey: mockAuthenticateWithPasskey,
  loadEncryptedPasskeyVault: mockLoadEncryptedPasskeyVault,
  registerPasskey: mockRegisterPasskey,
}));

// ----------------------------------------------------------------------------
// Test helpers
// ----------------------------------------------------------------------------

const FREIGHTER_ADDRESS = "GFREIGHTER1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZZ";
const ALBEDO_ADDRESS = "GALBEDO1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZZZ";
const XBULL_ADDRESS = "GXBULL1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZZ";
const MOCK_ADDRESS = "GASTORMSALE7TESTNET7AFFILIATE7MERCHANT7ESCROW7XLM77777";

function wrapper({ children }: { children: ReactNode }) {
  return createElement(Web3Provider, null, children);
}

let Web3Provider: any;
let useWeb3: any;

beforeAll(async () => {
  // Import after mocks are registered.
  const contextModule = await import("../context/Web3Context");
  Web3Provider = contextModule.Web3Provider;
  const hookModule = await import("../hooks/useWeb3");
  useWeb3 = hookModule.useWeb3;
});

beforeEach(() => {
  vi.resetAllMocks();
  mockCheckFreighterInstalled.mockResolvedValue(true);
  mockConnectFreighter.mockResolvedValue(FREIGHTER_ADDRESS);
  mockConnectAlbedo.mockResolvedValue(ALBEDO_ADDRESS);
  mockConnectXbull.mockResolvedValue(XBULL_ADDRESS);
  mockGetCurrentNetwork.mockResolvedValue("TESTNET");
  mockFetchXlmBalance.mockResolvedValue("500.00");
  mockFetchAssetBalances.mockResolvedValue({ XLM: "500.00", USDC: "10.00", EURC: "0.00" });
  mockGetTokenAllowanceQuery.mockResolvedValue(0);
  mockRegisterUser.mockResolvedValue({ role: "affiliate" });
  mockPurgeOnLogout.mockResolvedValue(undefined);
  mockConnectLedgerDevice.mockResolvedValue({ address: "GLEDGER1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZZ" });
  mockLoadEncryptedPasskeyVault.mockResolvedValue([]);
  mockRegisterPasskey.mockResolvedValue({ stellarAddress: "GPSSKEY1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZZ" });
  mockAuthenticateWithPasskey.mockResolvedValue({ record: { stellarAddress: "GPSSKEY1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZZ" } });
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ----------------------------------------------------------------------------
// Tests: Connection / Disconnection
// ----------------------------------------------------------------------------

describe("useWeb3 - connection lifecycle", () => {
  it("starts disconnected with default state", () => {
    const { result } = renderHook(() => useWeb3(), { wrapper });
    expect(result.current.isConnected).toBe(false);
    expect(result.current.userAddress).toBe(null);
    expect(result.current.connectorType).toBe(null);
  });

  it("connects via Freighter and populates address + balance", async () => {
    const { result } = renderHook(() => useWeb3(), { wrapper });

    await act(async () => {
      await result.current.connectWallet("freighter");
    });

    expect(mockCheckFreighterInstalled).toHaveBeenCalled();
    expect(mockConnectFreighter).toHaveBeenCalled();
    expect(mockGetCurrentNetwork).toHaveBeenCalled();
    expect(result.current.isConnected).toBe(true);
    expect(result.current.userAddress).toBe(FREIGHTER_ADDRESS);
    expect(result.current.connectorType).toBe("freighter");
    expect(result.current.network).toBe("TESTNET");
    expect(mockFetchXlmBalance).toHaveBeenCalledWith(FREIGHTER_ADDRESS);
    expect(mockRegisterUser).toHaveBeenCalledWith(FREIGHTER_ADDRESS);
  });

  it("rejects Freighter connection when extension is not installed", async () => {
    mockCheckFreighterInstalled.mockResolvedValue(false);
    const { result } = renderHook(() => useWeb3(), { wrapper });

    await act(async () => {
      await expect(result.current.connectWallet("freighter")).rejects.toThrow(/Freighter extension is not installed/);
    });

    expect(mockConnectFreighter).not.toHaveBeenCalled();
    expect(result.current.isConnected).toBe(false);
  });

  it("connects via Albedo", async () => {
    const { result } = renderHook(() => useWeb3(), { wrapper });

    await act(async () => {
      await result.current.connectWallet("albedo");
    });

    expect(mockConnectAlbedo).toHaveBeenCalled();
    expect(result.current.userAddress).toBe(ALBEDO_ADDRESS);
    expect(result.current.connectorType).toBe("albedo");
  });

  it("connects via xBull", async () => {
    const { result } = renderHook(() => useWeb3(), { wrapper });

    await act(async () => {
      await result.current.connectWallet("xbull");
    });

    expect(mockConnectXbull).toHaveBeenCalled();
    expect(result.current.userAddress).toBe(XBULL_ADDRESS);
    expect(result.current.connectorType).toBe("xbull");
  });

  it("connects via the mock demo account without fetching on-chain balance", async () => {
    const { result } = renderHook(() => useWeb3(), { wrapper });

    await act(async () => {
      await result.current.connectWallet("mock");
    });

    expect(result.current.isConnected).toBe(true);
    expect(result.current.userAddress).toBe(MOCK_ADDRESS);
    expect(result.current.network).toBe("TESTNET");
    expect(result.current.xlmBalance).toBe("10000.00");
    expect(mockFetchXlmBalance).not.toHaveBeenCalled();
  });

  it("disconnects and resets all wallet state", async () => {
    const { result } = renderHook(() => useWeb3(), { wrapper });

    await act(async () => {
      await result.current.connectWallet("freighter");
    });
    expect(result.current.isConnected).toBe(true);

    act(() => {
      result.current.disconnectWallet();
    });

    expect(result.current.isConnected).toBe(false);
    expect(result.current.userAddress).toBe(null);
    expect(result.current.userRole).toBe(null);
    expect(result.current.connectorType).toBe(null);
    expect(result.current.xlmBalance).toBe("0.00");
    expect(result.current.tokenAllowance).toBe(0);
    expect(mockPurgeOnLogout).toHaveBeenCalled();
  });
});

// ----------------------------------------------------------------------------
// Tests: Chain-switch logic coverage
// ----------------------------------------------------------------------------

describe("useWeb3 - chain switch logic", () => {
  it("reflects the network reported by Freighter on connect", async () => {
    mockGetCurrentNetwork.mockResolvedValue("PUBLIC");
    const { result } = renderHook(() => useWeb3(), { wrapper });

    await act(async () => {
      await result.current.connectWallet("freighter");
    });

    expect(result.current.network).toBe("PUBLIC");
  });

  it("returns true from switchToStellarNetwork when already on Stellar network", async () => {
    const { result } = renderHook(() => useWeb3(), { wrapper });

    await act(async () => {
      await result.current.connectWallet("albedo");
    });

    let switchResult: boolean | undefined;
    await act(async () => {
      switchResult = await result.current.switchToStellarNetwork();
    });

    expect(switchResult).toBe(true);
    expect(result.current.isStellarNetwork).toBe(true);
  });

  it("switches to Stellar network after a non-Stellar connection", async () => {
    const { result } = renderHook(() => useWeb3(), { wrapper });

    await act(async () => {
      await result.current.connectWallet("mock");
    });

    expect(result.current.isStellarNetwork).toBe(true);

    let switchResult: boolean | undefined;
    await act(async () => {
      switchResult = await result.current.switchToStellarNetwork();
    });

    expect(switchResult).toBe(true);
  });
});
