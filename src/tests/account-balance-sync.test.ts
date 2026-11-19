// @vitest-environment jsdom
import { Buffer } from "buffer";
globalThis.Buffer = Buffer;

import React from "react";
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { SUPPORTED_ESCROW_ASSETS } from "../config/stellar";
import { rpcFallbackManager } from "../lib/rpcFallback";
import { Web3Provider, useWeb3 } from "../context/Web3Context";
import { useAccountReserve } from "../hooks/useAccountReserve";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

const SOURCE = "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5";
const DESTINATION = "GB3Q6QDZYTHWT7E5PVS3W7FUT5GVAFC5KSZFFLPU25GO7VTC3NM2ZTVO";
const MERGED = "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF";

const ZERO_BALANCES = { XLM: "0.00", USDC: "0.00", EURC: "0.00" };

const mocks = vi.hoisted(() => ({
  fetchXlmBalance: vi.fn(),
  fetchAssetBalances: vi.fn(),
  fetchStellarAccountDetails: vi.fn(),
  checkFreighterInstalled: vi.fn(),
  connectFreighterWallet: vi.fn(),
  connectAlbedoWallet: vi.fn(),
  connectXbullWallet: vi.fn(),
  getCurrentNetwork: vi.fn(),
  getTokenAllowanceQuery: vi.fn(),
  approveTokenContractCall: vi.fn(),
  approveTokenAllowance: vi.fn(),
  createCampaignContractCall: vi.fn(),
  logSaleContractCall: vi.fn(),
  claimPayoutContractCall: vi.fn(),
  refundCampaignEscrowContractCall: vi.fn(),
  fundTestnetAccount: vi.fn(),
  inspectMultiSigAccount: vi.fn(),
  assertNotSanctioned: vi.fn(),
  registerUser: vi.fn(),
}));

vi.mock("../lib/stellar", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/stellar")>();
  return { ...actual, ...mocks };
});

vi.mock("../lib/multisig", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/multisig")>();
  return { ...actual, inspectMultiSigAccount: mocks.inspectMultiSigAccount };
});

vi.mock("../lib/sanctions", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/sanctions")>();
  return { ...actual, assertNotSanctioned: mocks.assertNotSanctioned };
});

vi.mock("../utils/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../utils/api")>();
  return { ...actual, registerUser: mocks.registerUser };
});

vi.mock("../lib/rpcFallback", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/rpcFallback")>();
  return {
    ...actual,
    rpcFallbackManager: {
      subscribe: vi.fn(() => vi.fn()),
      checkAllHealth: vi.fn().mockResolvedValue([]),
      getActiveEndpoint: vi.fn(() => ({
        id: "primary",
        url: "https://horizon-testnet.stellar.org",
      })),
      getAllEndpoints: vi.fn(() => []),
      getFailoverHistory: vi.fn(() => []),
      getTimeoutMs: vi.fn(() => 5000),
      setActiveEndpoint: vi.fn(),
      failoverToNext: vi.fn(),
      addEndpoint: vi.fn(),
      executeHorizonFetchWithFallback: vi.fn(),
    },
  };
});

function horizonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

function activeDetails(address: string, trustlineCount = 2) {
  return {
    address,
    status: "active" as const,
    exists: true,
    balanceXlm: 50,
    subentries: trustlineCount,
    numSponsoring: 0,
    numSponsored: 0,
    trustlineCount,
    sellingLiabilitiesXlm: 0,
    reserveXlm: 1 + trustlineCount * 0.5,
    spendableXlm: 49 - trustlineCount * 0.5,
  };
}

function unfundedDetails(address: string) {
  return {
    address,
    status: "unfunded" as const,
    exists: false,
    balanceXlm: 0,
    subentries: 0,
    numSponsoring: 0,
    numSponsored: 0,
    trustlineCount: 0,
    sellingLiabilitiesXlm: 0,
    reserveXlm: 1,
    spendableXlm: 0,
  };
}

let actualStellar: typeof import("../lib/stellar");

beforeAll(async () => {
  actualStellar = await vi.importActual<typeof import("../lib/stellar")>("../lib/stellar");
});

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  mocks.checkFreighterInstalled.mockResolvedValue(true);
  mocks.connectFreighterWallet.mockResolvedValue(SOURCE);
  mocks.connectAlbedoWallet.mockResolvedValue(SOURCE);
  mocks.connectXbullWallet.mockResolvedValue(SOURCE);
  mocks.getCurrentNetwork.mockResolvedValue("TESTNET");
  mocks.getTokenAllowanceQuery.mockResolvedValue(0);
  mocks.inspectMultiSigAccount.mockResolvedValue(null);
  mocks.assertNotSanctioned.mockResolvedValue(undefined);
  mocks.registerUser.mockResolvedValue(null);
  mocks.fetchXlmBalance.mockResolvedValue("100.0000");
  mocks.fetchAssetBalances.mockResolvedValue({
    XLM: "100.0000",
    USDC: "250.00",
    EURC: "180.50",
  });
  mocks.fetchStellarAccountDetails.mockResolvedValue(activeDetails(SOURCE));
  vi.mocked(rpcFallbackManager.subscribe).mockReturnValue(vi.fn());
  vi.mocked(rpcFallbackManager.checkAllHealth).mockResolvedValue([]);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("account merge and closed sequence detection (Horizon)", () => {
  it("reports a merged account as unfunded with zeroed trustline balances", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(horizonResponse({ status: 404 }, 404)));
    vi.mocked(rpcFallbackManager.executeHorizonFetchWithFallback).mockResolvedValue(
      horizonResponse({}, 404),
    );

    await expect(actualStellar.fetchXlmBalance(MERGED)).resolves.toBe("0.0000000 (Unfunded)");
    await expect(actualStellar.fetchAssetBalances(MERGED)).resolves.toEqual(ZERO_BALANCES);
    await expect(actualStellar.fetchStellarAccountDetails(MERGED)).resolves.toMatchObject({
      status: "unfunded",
      exists: false,
      balanceXlm: 0,
      trustlineCount: 0,
    });
  });

  it("reloads USDC and EURC trustline balances from successive Horizon snapshots", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        horizonResponse({
          balances: [
            { asset_type: "native", balance: "1234.5678" },
            {
              asset_code: "USDC",
              asset_issuer: SUPPORTED_ESCROW_ASSETS.USDC.issuer,
              balance: "250.00",
            },
            {
              asset_code: "EURC",
              asset_issuer: SUPPORTED_ESCROW_ASSETS.EURC.issuer,
              balance: "180.50",
            },
          ],
        }),
      )
      .mockResolvedValueOnce(
        horizonResponse({
          balances: [
            { asset_type: "native", balance: "900.1234" },
            {
              asset_code: "USDC",
              asset_issuer: SUPPORTED_ESCROW_ASSETS.USDC.issuer,
              balance: "12.34",
            },
            {
              asset_code: "EURC",
              asset_issuer: SUPPORTED_ESCROW_ASSETS.EURC.issuer,
              balance: "0.00",
            },
            {
              asset_code: "STORM",
              asset_issuer: SUPPORTED_ESCROW_ASSETS.USDC.issuer,
              balance: "77.00",
            },
          ],
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    await expect(actualStellar.fetchAssetBalances(SOURCE)).resolves.toEqual({
      XLM: "1234.5678",
      USDC: "250.00",
      EURC: "180.50",
    });
    await expect(actualStellar.fetchAssetBalances(SOURCE)).resolves.toEqual({
      XLM: "900.1234",
      USDC: "12.34",
      EURC: "0.00",
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("ignores trustlines with a spoofed asset issuer", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        horizonResponse({
          balances: [
            { asset_type: "native", balance: "10.0000" },
            { asset_code: "USDC", asset_issuer: "GSPOOFED", balance: "9999.00" },
            {
              asset_code: "USDC",
              asset_issuer: SUPPORTED_ESCROW_ASSETS.USDC.issuer,
              balance: "25.50",
            },
            {
              asset_code: "EURC",
              asset_issuer: SUPPORTED_ESCROW_ASSETS.EURC.issuer,
              balance: "7.00",
            },
          ],
        }),
      ),
    );

    await expect(actualStellar.fetchAssetBalances(SOURCE)).resolves.toEqual({
      XLM: "10.0000",
      USDC: "25.50",
      EURC: "7.00",
    });
  });
});

describe("Web3Context balance synchronization after account merge", () => {
  const wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(Web3Provider, null, children);

  it("reloads USDC and EURC balances in place through refreshBalances", async () => {
    const { result } = renderHook(() => useWeb3(), { wrapper });

    await act(async () => {
      await result.current.connectWallet("readonly", SOURCE);
    });
    expect(result.current.assetBalances).toEqual({
      XLM: "100.0000",
      USDC: "250.00",
      EURC: "180.50",
    });

    mocks.fetchXlmBalance.mockResolvedValue("900.1234");
    mocks.fetchAssetBalances.mockResolvedValue({
      XLM: "900.1234",
      USDC: "12.34",
      EURC: "0.00",
    });

    await act(async () => {
      await result.current.refreshBalances();
    });

    expect(result.current.xlmBalance).toBe("900.1234");
    expect(result.current.assetBalances).toEqual({
      XLM: "900.1234",
      USDC: "12.34",
      EURC: "0.00",
    });
    expect(mocks.fetchAssetBalances).toHaveBeenCalledWith(SOURCE);
  });

  it("switches to the destination account and reloads its balances without a page reload", async () => {
    const { result } = renderHook(() => useWeb3(), { wrapper });

    await act(async () => {
      await result.current.connectWallet("readonly", SOURCE);
    });
    expect(result.current.userAddress).toBe(SOURCE);

    mocks.fetchXlmBalance.mockResolvedValue("42.0000");
    mocks.fetchAssetBalances.mockResolvedValue({
      XLM: "42.0000",
      USDC: "7.77",
      EURC: "3.33",
    });

    await act(async () => {
      await result.current.connectWallet("readonly", DESTINATION);
    });

    expect(result.current.userAddress).toBe(DESTINATION);
    expect(result.current.xlmBalance).toBe("42.0000");
    expect(result.current.assetBalances).toEqual({
      XLM: "42.0000",
      USDC: "7.77",
      EURC: "3.33",
    });
    expect(mocks.fetchAssetBalances.mock.calls.map(([address]) => address)).toEqual([
      SOURCE,
      DESTINATION,
    ]);
  });

  it("clears displayed balances when the merged account looks unfunded", async () => {
    mocks.fetchXlmBalance.mockResolvedValue("0.0000000 (Unfunded)");
    mocks.fetchAssetBalances.mockResolvedValue(ZERO_BALANCES);

    const { result } = renderHook(() => useWeb3(), { wrapper });
    await act(async () => {
      await result.current.connectWallet("readonly", MERGED);
    });

    expect(result.current.xlmBalance).toBe("0.0000000 (Unfunded)");
    expect(result.current.assetBalances).toEqual(ZERO_BALANCES);
  });
});

describe("useAccountReserve reaction to account merge", () => {
  it("falls back to zero trustlines and recovers after an on-demand refresh", async () => {
    mocks.fetchStellarAccountDetails.mockResolvedValue(unfundedDetails(MERGED));

    const { result } = renderHook(
      ({ address }: { address: string }) => useAccountReserve(address, "100.0000"),
      { initialProps: { address: MERGED } },
    );

    await waitFor(() => expect(result.current.isReady).toBe(true));
    expect(result.current).toMatchObject({
      exists: false,
      isFallback: true,
      isUnavailable: false,
      trustlineCount: 0,
    });

    mocks.fetchStellarAccountDetails.mockResolvedValue(activeDetails(MERGED, 3));
    await act(async () => {
      await result.current.refresh();
    });

    expect(result.current).toMatchObject({
      exists: true,
      isFallback: false,
      trustlineCount: 3,
    });
  });

  it("discards a stale source-account response after merging into the destination", async () => {
    let resolveSource: (value: unknown) => void = () => {};
    mocks.fetchStellarAccountDetails.mockImplementation((address: string) =>
      address === SOURCE
        ? new Promise((resolve) => {
            resolveSource = resolve;
          })
        : Promise.resolve(activeDetails(DESTINATION, 4)),
    );

    const { result, rerender } = renderHook(
      ({ address }: { address: string }) => useAccountReserve(address, "0"),
      { initialProps: { address: SOURCE } },
    );

    await waitFor(() => expect(mocks.fetchStellarAccountDetails).toHaveBeenCalledWith(SOURCE));
    rerender({ address: DESTINATION });
    await waitFor(() => expect(result.current.isReady).toBe(true));
    expect(result.current.trustlineCount).toBe(4);

    await act(async () => {
      resolveSource(activeDetails(SOURCE, 9));
      await Promise.resolve();
    });

    expect(result.current.trustlineCount).toBe(4);
    expect(mocks.fetchStellarAccountDetails).toHaveBeenLastCalledWith(DESTINATION);
  });
});
