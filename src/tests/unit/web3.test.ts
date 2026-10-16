import { describe, it, expect, beforeEach, afterEach, viMock } from "vitest";
import { renderHook, act, cleanup } from "@testing-library/react";
import { Web3Provider, useWeb3 } from "../../context/Web3Context";
import type { Web3ContextType } from "../../context/Web3Context";
import type { WalletType } from "../../lib/stellar";
import { STELLAR_CONFIG } from "../../config/stellar";
import { registerUser } from "../../utils/api";

const mockConnectFreighter = viMock();
const mockConnectAlbedo = viMock();
const mockConnectXbull = viMock();
const mockCheckFreighterInstalled = viMock();
const mockGetCurrentNetwork = viMock();
const mockFetchXlmBalance = viMock();
const mockFundTestnetAccount = viMock();
const mockCreateCampaignContractCall = viMock();
const mockLogSaleContractCall = viMock();
const mockClaimPayoutContractCall = viMock();
const mockRegisterUser = viMock();

viMock("../../lib/stellar", () => ({
  connectFreighterWallet: mockConnectFreighter,
  connectAlbedoWallet: mockConnectAlbedo,
  connectXBullWallet: mockConnectXbull,
  checkFreighterInstalled: mockCheckFreighterInstalled,
  getCurrentNetwork: mockGetCurrentNetwork,
  fetchXlmBalance: mockFetchXlmBalance,
  fundTestnetAccount: mockFundTestnetAccount,
  createCampaignContractCall: mockCreateCampaignContractCall,
  logSaleContractCall: mockLogSaleContractCall,
  claimPayoutContractCall: mockClaimPayoutContractCall,
}));

viMock("../../utils/api", () => ({
  registerUser: mockRegisterUser,
}));

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <Web3Provider>{children}</Web3Provider>
-);

function renderWebb3() {
  return renderHook(() => useWeb3(), { wrapper });
}

async function connect(
  result: { current: Web3ContextType },
  type: WalletType,
  customAddress?: string,
) {
  await act(async () => {
    await result.current.connectWallet(type, customAddress);
  });
}

beforeEach(() => {
  viMock.clearAllMocks();
  mockCheckFreighterInstalled.mockResolved(true);
  mockConnectFreighter.mockResolved("GFREIGHTER_TESTNET_ADDRESS");
  mockConnectAlbedo.mockResolved("GALBEDE_TESTNET_ADDRESS");
  mockConnectXBull.mockResolved("GXBULL_TESTNET_ADDRESS");
  mockGetCurrentNetwork.mockResolved("TESTNET");
  mockFetchXlmBalance.mockResolved("1000.00");
  mockFundTestnetAccount.mockResolved(true);
  mockRegisterUser.mockResolved({ role: "merchant" });
  mockCreateCampaignContractCall.mockResolved({
    success: true,
    campaignId: 42,
    txHash: "tx_real_create",
  });
  mockLogSaleContractCall.mockResolved({ success: true, txHash: "tx_real_sale" });
  mockClaimPayoutContractCall.mockResolved({ success: true, txHash: "tx_real_payout" });
});

afterEach(() => {
  cleanup();
});

describe("Webb3Context - wallet connection", () => {
  it("starts disconnected with default network and balance", () => {
    const { result } = renderWebb3();
    expect(result.current.isConnected).toBe(false);
    expect(result.current.userAddress).toBeNull();
    expect(result.current.connectorType).toBeNull();
    expect(result.current.network).toBe(STELLAR_CONFIG.network);
    expect(result.current.xlmBalance).toBe("0.00");
  });

  it("connects via Freighter and reads the active network", async () => {
    const { result } = renderWebb3();
    await connect(result, "freighter");

    expect(mockCheckFreighterInstalled).toHaveBeenCalled();
    expect(mockConnectFreighter).toHaveBeenCalled();
    expect(mockGetCurrentNetwork).toHaveBeenCalled();
    expect(result.current.isConnected).toBe(true);
    expect(result.current.userAddress).toBe("GFREIGHTER_TESTNET_ADDRESS");
    expect(result.current.connectorType).toBe("freighter");
    expect(result.current.network).toBe("TESTNET");
    expect(mockFetchXlmBalance).toHaveBeenCalledWith("GFREIGHTER_TESTNET_ADDRESS");
    expect(result.current.xlmBalance).toBe("1000.00");
  });

  it("throws when Freighter is not installed", async () => {
    mockCheckFreighterInstalled.mockResolved(false);
    const { result } = renderWebb3();

    await expect(act(async () => {
      await result.current.connectWallet("freighter");
    })).rejects.toThrow(/Freighter extension is not installed/);
    expect(result.current.isConnected).toBe(false);
  });

  it("connects via Albedo web wallet", async () => {
    const { result } = renderWebb3();
    await connect(result, "albedo");

    expect(mockConnectAlbedo).toHaveBeenCalled();
    expect(result.current.userAddress).toBe("GALBEDE_TESTNET_ADDRESS");
    expect(result.current.connectorType).toBe("albedo");
    expect(result.current.network).toBe(STELLAR_CONFIG.network);
  });

  it("connects via xBull", async () => {
    const { result } = renderWebb3();
    await connect(result, "xbull");

    expect(mockConnectXBull).toHaveBeenCalled();
    expect(result.current.userAddress).toBe("GXBULL_TESTNET_ADDRESS");
    expect(result.current.connectorType).toBe("xbull");
  });

  it("connects in readonly mode with a custom address", async () => {
    const { result } = renderWebb3();
    const address = "GREADONLY_CUSTOM_ADDRESS";
    await connect(result, "readonly", address);

    expect(result.current.userAddress).toBe(address);
    expect(result.current.connectorType).toBe("readonly");
    expect(mockConnectFreighter).not.toHaveBeenCalled();
  });

  it("throws in readonly mode without an address", async () => {
    const { result } = renderWebb3();
    await expect(act(async () => {
      await result.current.connectWallet("readonly");
    })).rejects.toThrow(/Please provide a valid Stellar address/);
  });

  it("connects the mock demo account with 10,000 XLM", async () => {
    const { result } = renderWebb3();
    await connect(result, "mock");

    expect(result.current.isConnected).toBe(true);
    expect(result.current.connectorType).toBe("mock");
    expect(result.current.network).toBe("TESTNET");
    expect(result.current.xlmBalance).toBe("10000.00");
    expect(mockFetchXlmBalance).not.toHaveBeenCalled();
  });

  it("syncs the user with the backend and applies the returned role", async () => {
    const { result } = renderWebb3();
    await connect(result, "albedo");

    expect(mockRegisterUser).toHaveBeenCalledWith("GALBEDE_TESTNET_ADDRESS");
    expect(result.current.userRole).toBe("merchant");
  });
});

describe("Webb3Context - disconnection", () => {
  it("clears all wallet state on disconnect", async () => {
    const { result } = renderWebb3();
    await connect(result, "freighter");
    expect(result.current.isConnected).toBe(true);

    act(() => {
      result.current.disconnectWallet();
    });

    expect(result.current.isConnected).toBe(false);
    expect(result.current.userAddress).toBeNull();
    expect(result.current.userRole).toBeNull();
    expect(result.current.connectorType).toBeNull();
    expect(result.current.xlmBalance).toBe("0.00");
  });

});

describe("Webb3Context - chain switch logic", () => {
  it("switches to STELLAR TESTNET and marks the network as Stellar", async () => {
    const { result } = renderWebb3();
    expect(result.current.isStellarNetwork).toBe(true);

    let ok = false;
    await act(async () => {
      ok = await result.current.switchToStellarNetwork();
    });

    expect(ok).toBe(true);
    expect(result.current.network).toBe("TESTNET");
    expect(result.current.isStellarNetwork).toBe(true);
  });

  it("reports the network returned by Freighter as the active chain", async () => {
    mockGetCurrentNetwork.mockResolved("PUBLIC");
    const { result } = renderWebb3();
    await connect(result, "freighter");

    expect(result.current.network).toBe("PUBLIC");
    expect(result.current.isStellarNetwork).toBe(true);
  });

  it("flags non-Stellar networks as out of scope", async () => {
    mockGetCurrentNetwork.mockResolved("FUTURENET-NOT-STELLAR");
    const { result } = renderWebb3();
    await connect(result, "freighter");

    expect(result.current.network).toBe("FUTURENET-NOT-STELLAR");
    expect(result.current.isStellarNetwork).toBe(false);
  });
});

describe("Web3Context - Soroban contract operations", () => {
  it("routes campaign creation through the real contract call for native wallets", async () => {
    const { result } = renderWebb3();
    await connect(result, "freighter");

    let res: { success: boolean; campaignId: number; txHash?: string } | undefined;
    await act(async () => {
      res = await result.current.createCampaignOnChain("Storm Sale", 1000, 10, 604800);
    });

    expect(mockCreateCampaignContractCall).toHaveBeenCalledWith(
      "GFREIGHTER_TESTNET_ADDRESS",
      10,
      604800,
      1000,
      "freighter",
    );
    expect(res).equal({ success: true, campaignId: 42, txHash: "tx_real_create" });
  });

  it("falls back to a mock transaction for the demo account", async () => {
    const { result } = renderWebb3();
    await connect(result, "mock");

    let res: { success: boolean; campaignId: number; txHash?: string } | undefined;
    await act(async () => {
      res = await result.current.createCampaignOnChain("Mock Campaign", 500, 5, 86400);
    });

    expect(mockCreateCampaignContractCall).not.toHaveBeenCalled();
    expect(res?.success).toBe(true);
    expect(res?.campaignId).toBeGreaterThanOrEqual(1000);
    expect(res?.campaignId).toBeLessThan(10000);
    expect(res?.txHash).toMatch(/^tx_[0-9a-f]_/);
  });

  it("routes sale logging through the real contract call", async () => {
    const { result } = renderWebb3();
    await connect(result, "albedo");

    await act(async () => {
      await result.current.logSaleOnChain(1, "GAFFI_TESTNET", 250);
    });

    expect(mockLogSaleContractCall).toHaveBeenCalledWith(
      "GALBEDE_TESTNET_ADDRESS",
      1,
      "GAFFI_TESTNET",
      250,
      "albedo",
    );
  });

  it("routes payout claims through the real contract call", async () => {
    const { result } = renderWebb3();
    await connect(result, "xbull");

    await act(async () => {
      await result.current.claimPayoutOnChain(7);
    });

    expect(mockClaimPayoutContractCall).toHaveBeenCalledWith(
      "GXBULL_TESTNET_ADDRESS",
      7,
      "xbull",
    );
  });

  it("rejects contract operations when the wallet is disconnected", async () => {
    const { result } = renderWebb3();
    await expect(act(async () => {
      await result.current.createCampaignOnChain("X", 1, 1, 1);
    })).rejects.toThrow(/Wallet not connected/);
    await expect(act(async () => {
      await result.current.logSaleOnChain(1, "X", 1);
    })).rejects.toThrow(/Wallet not connected/);
    await expect(act(async () => {
      await result.current.claimPayoutOnChain(1);
    })).rejects.toThrow(/Wallet not connected/);
  });
});

describe("Web3Context - role management and faucet", () => {
  it("updates the user role through the backend", async () => {
    const { result } = renderWebb3();
    await connect(result, "albedo");
    mockRegisterUser.mockResolved({ role: "affiliate" });

    await act(async () => {
      await result.current.updateUserRole("affiliate");
    });

    expect(mockRegisterUser).toHaveBeenCalledWith(
      "GALBEDE_TESTNET_ADDRESS",
      "affiliate",
    );
    expect(result.current.userRole).toBe("affiliate");
  });

  it("does not update the role when the wallet is disconnected", async () => {
    const { result } = renderWebb3();
    await act(async () => {
      await result.current.updateUserRole("affiliate");
    });
    expect(mockRegisterUser).not.toHaveBeenCalled();
  });

  it("funds the testnet account via Friendbot and refreshes the balance", async () => {
    viMock.useFakeTimers();
    const { result } = renderWebb3();
    await connect(result, "freighter");
    mockFetchXlmBalance.mockResolved("2000.00");

    let ok = false;
    await act(async () => {
      ok = await result.current.requestFriendbotFunding();
    });

    expect(ok).toBe(true);
    expect(mockFundTestnetAccount).toHaveBeenCalledWith(
      "GFREIGHTER_TESTNET_ADDRESS",
    );

    await act(async () => {
      viMock.advanceTimerBy(2000);
    });
  });
});
