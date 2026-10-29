import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { createElement } from "react";
import type { ReactNode } from "react";

vi.mock("../../src/lib/stellar", () => ({
  connectFreeighterWallet: vi.fn(),
  connectAlbedoWallet: vi.fn(),
  connectXbullWallet: vi.fn(),
  checkFreeighterInstalled: vi.fn(),
  getCurrentNetwork: vi.fn(),
  fetchXlmBalance: vi.fn(),
  fetchAssetBalances: vi.fn(),
  approveTokenAllowance: vi.fn(),
  fundTestnetAccount: vi.fn(),
  createCampaignContractCall: vi.fn(),
  logSaleContractCall: vi.fn(),
  claimPayoutContractCall: vi.fn(),
  getTokenAllowanceQuery: vi.fn(),
  approveTokenContractCall: vi.fn(),
  refundCampaignEscrowContractCall: vi.fn(),
}));

vi.mock("../../src/utils/api", () => ({
  registerUser: vi.fn(),
}));

vi.mock("../../src/lib/storage", () => ({
  purgeOnLogout: vi.fn(),
}));

import * as stellarLib from "../../src/lib/stellar";
import * as apiLib from "../../src/utils/api";
import * as storageLib from "../../src/lib/storage";
import { Web3Provider } from "../../src/context/Web3Context";
import { useWeb3 } from "../../src/hooks/useWeb3";
import { STELLAR_CONFIG } from "../../src/config/stellar";

const mockedStellar = stellarLib as unknown as {
  connectFreeighterWallet: ReturnType<typeof vi.fn>;
  connectAlbedoWallet: ReturnType<typeof vi.fn>;
  connectXbullWallet: ReturnType<typeof vi.fn>;
  checkFreeighterInstalled: ReturnType<typeof vi.fn>;
  getCurrentNetwork: ReturnType<typeof vi.fn>;
  fetchXlmBalance: ReturnType<typeof vi.fn>;
  fetchAssetBalances: ReturnType<typeof vi.fn>;
  getTokenAllowanceQuery: ReturnType<typeof vi.fn>;
};

const mockedApi = apiLib as unknown as { registerUser: ReturnType<typeof vi.fn> };
const mockedStorage = storageLib as unknown as { purgeOnLogout: ReturnType<typeof vi.fn> };

const FREEIGHTER_ADDRESS = "GACFREEIGHTER1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZZ";
const ALBEDO_ADDRESS = "GADEBOWALLET1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const XBULL_ADDRESS = "GAXBULLWALLET1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const MOCK_ADDRESS = "GASTORMSALE7TESTNET7AAFFILIATE7MERCHANT7ESCROW7XLM77777";

function wrapper({ children }: { children: ReactNode }) {
  return createElement(Web3Provider, null, children);
}

function renderUseWeb3() {
  return renderHook(() => useWeb3(), { wrapper });
}

describe("useWeb3 / Web3Context", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedStellar.checkFreeighterInstalled.mockResolvedValue(true);
    mockedStellar.connectFreeighterWallet.mockResolvedValue(FREEIGHTER_ADDRESS);
    mockedStellar.connectAlbedoWallet.mockResolvedValue(ALBEDO_ADDRESS);
    mockedStellar.connectXbullWallet.mockResolvedValue(XBULL_ADDRESS);
    mockedStellar.getCurrentNetwork.mockResolvedValue("TESTNET");
    mockedStellar.fetchXlmBalance.mockResolvedValue("500.00");
    mockedStellar.fetchAssetBalances.mockResolvedValue({ XLM: "500.00", USDC: "10.00", EURC: "0.00" });
    mockedStellar.getTokenAllowanceQuery.mockResolvedValue(0);
    mockedApi.registerUser.mockResolvedValue({ role: "affiliate" });
    mockedStorage.purgeOnLogout.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("starts disconnected with default state", () => {
    const { result } = renderUseWeb3();
    expect(result.current.isConnected).toBe(false);
    expect(result.current.userAddress).toBe(null);
    expect(result.current.connectorType).toBe(null);
    expect(result.current.network).toBe(STELLAR_CONFIG.network);
  });

  it("connects via Freeighter and reads the network from the wallet", async () => {
    const { result } = renderUseWeb3();

    await act(async () => {
      await result.current.connectWallet("freeighter");
    });

    expect(mockedStellar.checkFreeighterInstalled).toHaveBeenCalled();
    expect(mockedStellar.connectFreeighterWallet).toHaveBeenCalled();
    expect(mockedStellar.getCurrentNetwork).toHaveBeenCalled();
    expect(result.current.isConnected).toBe(true);
    expect(result.current.userAddress).toBe(FREEIGHTER_ADDRESS);
    expect(result.current.connectorType).toBe("freeighter");
    expect(result.current.network).toBe("TESTNET");
    expect(mockedApi.registerUser).toHaveBeenCalled();
  });

  it("throws when Freeighter is not installed", async () => {
    mockedStellar.checkFreeighterInstalled.mockResolvedValue(false);
    const { result } = renderUseWeb3();

    await expect(
      act(async () => {
        await result.current.connectWallet("freeighter");
      }),
    ).rejects.toThrow(/not installed/i);

    expect(mockedStellar.connectFreeighterWallet).not.toHaveBeenCalled();
    expect(result.current.isConnected).toBe(false);
  });

  it("connects via Albedo and uses configured network", async () => {
    const { result } = renderUseWeb3();

    await act(async () => {
      await result.current.connectWallet("albedo");
    });

    expect(mockedStellar.connectAlbedoWallet).toHaveBeenCalled();
    expect(result.current.userAddress).toBe(ALBEDO_ADDRESS);
    expect(result.current.network).toBe(STELLAR_CONFIG.network);
    expect(result.current.connectorType).toBe("albedo");
  });

  it("connects via xBull", async () => {
    const { result } = renderUseWeb3();

    await act(async () => {
      await result.current.connectWallet("xbull");
    });

    expect(mockedStellar.connectXbullWallet).toHaveBeenCalled();
    expect(result.current.userAddress).toBe(XBULL_ADDRESS);
    expect(result.current.connectorType).toBe("xbull");
  });

  it("connects via mock wallet without hitting the network", async () => {
    const { result } = renderUseWeb3();

    await act(async () => {
      await result.current.connectWallet("mock");
    });

    expect(result.current.userAddress).toBe(MOCK_ADDRESS);
    expect(result.current.network).toBe("TESTNET");
    expect(result.current.xlmBalance).toBe("10000.00");
    expect(mockedStellar.fetchXlmBalance).not.toHaveBeenCalled();
  });

  it("disconnects and resets all wallet state", async () => {
    const { result } = renderUseWeb3();

    await act(async () => {
      await result.current.connectWallet("freeighter");
    });
    expect(result.current.isConnected).toBe(true);

    act(() => {
      result.current.disconnectWallet();
    });

    expect(result.current.isConnected).toBe(false);
    expect(result.current.userAddress).toBe(null);
    expect(result.current.connectorType).toBe(null);
    expect(result.current.xlmBalance).toBe("0.00");
    expect(result.current.tokenAllowance).toBe(0);
    expect(mockedStorage.purgeOnLogout).toHaveBeenCalled();
  });

  it("switches to the Stellar network and refreshes balances", async () => {
    const { result } = renderUseWeb3();

    await act(async () => {
      await result.current.connectWallet("freeighter");
    });

    mockedStellar.getCurrentNetwork.mockResolvedValue("PUBLIC");
    mockedStellar.fetchXlmBalance.mockResolvedValue("750.00");

    let ok = false;
    await act(async () => {
      ok = await result.current.switchToStellarNetwork();
    });

    expect(ok).toBe(true);
    expect(result.current.network).toBe("PUBLIC");
    expect(mockedStellar.getCurrentNetwork).toHaveBeenCalled();
    expect(mockedStellar.fetchXlmBalance).toHaveBeenCalled();
  });

  it("connects via readonly address and rejects empty address", async () => {
    const { result } = renderUseWeb3();

    await expect(
      act(async () => {
        await result.current.connectWallet("readonly");
      }),
    ).rejects.toThrow(/valid Stellar address/i);

    await act(async () => {
      await result.current.connectWallet("readonly", FREEIGHTER_ADDRESS);
    });

    expect(result.current.userAddress).toBe(FREEIGHTER_ADDRESS);
    expect(result.current.connectorType).toBe("readonly");
  });

  it("refreshes token allowance on connect", async () => {
    mockedStellar.getTokenAllowanceQuery.mockResolvedValue(123);
    const { result } = renderUseWeb3();

    await act(async () => {
      await result.current.connectWallet("freeighter");
    });

    await waitFor(() => expect(result.current.tokenAllowance).toBe(123));
    expect(mockedStellar.getTokenAllowanceQuery).toHaveBeenCalled();
  });
});
