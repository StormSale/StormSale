// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Account, Keypair, nativeToScVal, StrKey } from "@stellar/stellar-sdk";
import { ISSUERS, STELLAR_CONFIG } from "../config/stellar";

const sdk = vi.hoisted(() => ({
  assemble: vi.fn((tx: any) => ({ build: () => tx })),
  isSimulationError: vi.fn(() => false),
  isSimulationSuccess: vi.fn(() => true),
  serverRef: { current: null as any },
}));

vi.mock("@stellar/stellar-sdk", async (importOriginal) => {
  const actual = await importOriginal<any>();
  return {
    ...actual,
    rpc: {
      ...actual.rpc,
      Server: function MockRpcServer() {
        return sdk.serverRef.current;
      },
      assembleTransaction: sdk.assemble,
      Api: {
        ...actual.rpc.Api,
        isSimulationError: sdk.isSimulationError,
        isSimulationSuccess: sdk.isSimulationSuccess,
      },
    },
  };
});

const mocks = vi.hoisted(() => ({
  freighter: {
    isConnected: vi.fn(),
    isAllowed: vi.fn(),
    setAllowed: vi.fn(),
    requestAccess: vi.fn(),
    getAddress: vi.fn(),
    getNetwork: vi.fn(),
    signTransaction: vi.fn(),
  },
  ledger: { signLedgerTransaction: vi.fn() },
  signer: { authenticateWithPasskey: vi.fn() },
}));

vi.mock("@stellar/freighter-api", () => mocks.freighter);
vi.mock("./ledgerBridge", () => mocks.ledger);
vi.mock("./passkeySigner", () => mocks.signer);

import * as stellar from "./stellar";

const PUBKEY = Keypair.random().publicKey();
const AFFILIATE = Keypair.random().publicKey();
const SPENDER = Keypair.random().publicKey();
const CONTRACT = StrKey.encodeContract(Buffer.alloc(32, 1));
const ORIGINAL_CONTRACT_ID = STELLAR_CONFIG.contractId;

type FakeServer = {
  getAccount: ReturnType<typeof vi.fn>;
  simulateTransaction: ReturnType<typeof vi.fn>;
  sendTransaction: ReturnType<typeof vi.fn>;
  getTransaction: ReturnType<typeof vi.fn>;
  getLatestLedger: ReturnType<typeof vi.fn>;
};

function createServer(overrides: Partial<FakeServer> = {}): FakeServer {
  return {
    getAccount: vi.fn(async () => new Account(PUBKEY, "0")),
    simulateTransaction: vi.fn(async () => ({})),
    sendTransaction: vi.fn(async () => ({ status: "PENDING", hash: "tx-hash" })),
    getTransaction: vi.fn(async () => ({
      status: "SUCCESS",
      returnValue: nativeToScVal(7, { type: "i32" }),
    })),
    getLatestLedger: vi.fn(async () => ({ sequence: 1000 })),
    ...overrides,
  };
}

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

let server: FakeServer;

async function withFakeTimers<T>(run: () => Promise<T>): Promise<T> {
  vi.useFakeTimers();
  try {
    const promise = run();
    // Timer-driven rejections must not surface as unhandled before we await them.
    promise.catch(() => {});
    await vi.runAllTimersAsync();
    return await promise;
  } finally {
    vi.useRealTimers();
  }
}

beforeEach(() => {
  vi.clearAllMocks();
  server = createServer();
  sdk.serverRef.current = server;
  mocks.freighter.signTransaction.mockImplementation(async (xdr: string) => xdr);
  mocks.ledger.signLedgerTransaction.mockResolvedValue("ledger-signed");
  mocks.signer.authenticateWithPasskey.mockResolvedValue(undefined);
  sdk.assemble.mockImplementation((tx: any) => ({ build: () => tx }));
  sdk.isSimulationError.mockReturnValue(false);
  sdk.isSimulationSuccess.mockReturnValue(true);
  (STELLAR_CONFIG as any).contractId = CONTRACT;
  (window as any).xbull = undefined;
  (window as any).xBullSDK = undefined;
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  (STELLAR_CONFIG as any).contractId = ORIGINAL_CONTRACT_ID;
  delete (window as any).xbull;
  delete (window as any).xBullSDK;
});

describe("wallet detection and connection", () => {
  it("checks Freighter installation across success, error, and throw paths", async () => {
    mocks.freighter.isConnected.mockResolvedValueOnce({});
    await expect(stellar.checkFreighterInstalled()).resolves.toBe(true);

    mocks.freighter.isConnected.mockResolvedValueOnce({ error: "not installed" });
    await expect(stellar.checkFreighterInstalled()).resolves.toBe(false);

    mocks.freighter.isConnected.mockRejectedValueOnce(new Error("boom"));
    await expect(stellar.checkFreighterInstalled()).resolves.toBe(false);
  });

  it("connects Freighter and requests permissions when needed", async () => {
    mocks.freighter.isConnected.mockResolvedValue({});
    mocks.freighter.isAllowed.mockResolvedValue(false);
    mocks.freighter.requestAccess.mockResolvedValue({});
    mocks.freighter.getAddress.mockResolvedValue({ address: PUBKEY });

    await expect(stellar.connectFreighterWallet()).resolves.toBe(PUBKEY);
    expect(mocks.freighter.setAllowed).toHaveBeenCalled();
  });

  it("surfaces Freighter access and address failures", async () => {
    mocks.freighter.isConnected.mockResolvedValue({});
    mocks.freighter.isAllowed.mockResolvedValue(true);

    mocks.freighter.requestAccess.mockResolvedValueOnce({ error: "denied" });
    await expect(stellar.connectFreighterWallet()).rejects.toThrow(/denied/);

    mocks.freighter.requestAccess.mockResolvedValueOnce({});
    mocks.freighter.getAddress.mockResolvedValueOnce({ error: "no address" });
    await expect(stellar.connectFreighterWallet()).rejects.toThrow(/no address/);

    mocks.freighter.getAddress.mockResolvedValueOnce({});
    await expect(stellar.connectFreighterWallet()).rejects.toThrow(/Failed to retrieve/);
  });

  it("throws when Freighter is missing", async () => {
    mocks.freighter.isConnected.mockResolvedValue({ error: "missing" });
    await expect(stellar.connectFreighterWallet()).rejects.toThrow(/not detected/);
  });

  it("connects Albedo through the popup message flow", async () => {
    const popup = { closed: false } as Window;
    vi.spyOn(window, "open").mockReturnValue(popup);
    const promise = stellar.connectAlbedoWallet();

    window.dispatchEvent(new MessageEvent("message", { origin: "https://other.test", data: {} }));
    window.dispatchEvent(
      new MessageEvent("message", {
        origin: "https://albedo.link",
        data: { intent: "other" },
      }),
    );
    window.dispatchEvent(
      new MessageEvent("message", {
        origin: "https://albedo.link",
        data: { intent: "public_key", pubkey: PUBKEY },
      }),
    );

    await expect(promise).resolves.toBe(PUBKEY);
  });

  it("rejects Albedo when the popup is blocked or the user cancels", async () => {
    vi.spyOn(window, "open").mockReturnValue(null);
    await expect(stellar.connectAlbedoWallet()).rejects.toThrow(/popup blocker/);

    vi.spyOn(window, "open").mockReturnValue({ closed: false } as Window);
    const promise = stellar.connectAlbedoWallet();
    window.dispatchEvent(
      new MessageEvent("message", {
        origin: "https://albedo.link",
        data: { intent: "public_key", error: { message: "nope" } },
      }),
    );
    await expect(promise).rejects.toThrow(/nope/);
  });

  it("signs with Albedo and handles popup errors", async () => {
    vi.spyOn(window, "open").mockReturnValue(null);
    await expect(stellar.signAlbedoTransaction("xdr")).rejects.toThrow(/blocked/);

    vi.spyOn(window, "open").mockReturnValue({ closed: false } as Window);
    const promise = stellar.signAlbedoTransaction("xdr");
    window.dispatchEvent(
      new MessageEvent("message", {
        origin: "https://albedo.link",
        data: { intent: "tx", signed_envelope_xdr: "signed-xdr" },
      }),
    );
    await expect(promise).resolves.toBe("signed-xdr");

    const failed = stellar.signAlbedoTransaction("xdr");
    window.dispatchEvent(
      new MessageEvent("message", {
        origin: "https://albedo.link",
        data: { intent: "tx", error: { message: "declined" } },
      }),
    );
    await expect(failed).rejects.toThrow(/declined/);
  });

  it("connects xBull and normalizes failures", async () => {
    await expect(stellar.connectXbullWallet()).rejects.toThrow(/not installed/);

    (window as any).xbull = { getPublicKey: vi.fn().mockResolvedValue(PUBKEY) };
    await expect(stellar.connectXbullWallet()).resolves.toBe(PUBKEY);

    (window as any).xbull = { getPublicKey: vi.fn().mockRejectedValue({ message: "denied" }) };
    await expect(stellar.connectXbullWallet()).rejects.toThrow(/denied/);

    (window as any).xbull = { getPublicKey: vi.fn().mockRejectedValue({}) };
    await expect(stellar.connectXbullWallet()).rejects.toThrow(/xBull connection failed/);
  });

  it("dispatches signing to every supported wallet", async () => {
    mocks.freighter.signTransaction.mockResolvedValueOnce("freighter-signed");
    await expect(stellar.signWalletTransaction("xdr", "freighter")).resolves.toBe(
      "freighter-signed",
    );

    mocks.freighter.signTransaction.mockResolvedValueOnce({});
    await expect(stellar.signWalletTransaction("xdr", "freighter")).rejects.toThrow(
      /No signed transaction XDR/,
    );

    mocks.freighter.signTransaction.mockResolvedValueOnce({ error: "user rejected" });
    await expect(stellar.signWalletTransaction("xdr", "freighter")).rejects.toThrow(
      /user rejected/,
    );

    mocks.freighter.signTransaction.mockResolvedValueOnce({ signedTxXdr: "object-signed" });
    await expect(stellar.signWalletTransaction("xdr", "freighter")).resolves.toBe("object-signed");

    mocks.freighter.signTransaction.mockResolvedValueOnce({ signedXdr: "alt-signed" });
    await expect(stellar.signWalletTransaction("xdr", "freighter")).resolves.toBe("alt-signed");

    (window as any).xbull = { signXDR: vi.fn().mockResolvedValue("xbull-signed") };
    await expect(stellar.signWalletTransaction("xdr", "xbull")).resolves.toBe("xbull-signed");

    delete (window as any).xbull;
    await expect(stellar.signWalletTransaction("xdr", "xbull")).rejects.toThrow(/not available/);

    await expect(stellar.signWalletTransaction("xdr", "ledger")).resolves.toBe("ledger-signed");
    await expect(stellar.signWalletTransaction("xdr", "passkey")).resolves.toBe("xdr");
    await expect(stellar.signWalletTransaction("xdr", "readonly")).resolves.toBe("xdr");
    await expect(stellar.signWalletTransaction("xdr", "mock")).resolves.toBe("xdr");

    vi.spyOn(window, "open").mockReturnValue({ closed: false } as Window);
    const albedo = stellar.signWalletTransaction("xdr", "albedo");
    window.dispatchEvent(
      new MessageEvent("message", {
        origin: "https://albedo.link",
        data: { intent: "tx", signed_envelope_xdr: "albedo-signed" },
      }),
    );
    await expect(albedo).resolves.toBe("albedo-signed");
  });

  it("reports the Freighter network with fallbacks", async () => {
    mocks.freighter.getNetwork.mockResolvedValueOnce({ network: "PUBLIC" });
    await expect(stellar.getCurrentNetwork()).resolves.toBe("PUBLIC");

    mocks.freighter.getNetwork.mockResolvedValueOnce({ error: "no network" });
    await expect(stellar.getCurrentNetwork()).resolves.toBe(STELLAR_CONFIG.network);

    mocks.freighter.getNetwork.mockRejectedValueOnce(new Error("boom"));
    await expect(stellar.getCurrentNetwork()).resolves.toBe(STELLAR_CONFIG.network);
  });
});

describe("balances and amount helpers", () => {
  it("fetches the native balance with failover responses", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    fetchMock.mockResolvedValueOnce(
      jsonResponse({ balances: [{ asset_type: "native", balance: "12.34567" }] }),
    );
    await expect(stellar.fetchXlmBalance(PUBKEY)).resolves.toBe("12.3457");

    fetchMock.mockResolvedValueOnce(jsonResponse({ balances: [] }));
    await expect(stellar.fetchXlmBalance(PUBKEY)).resolves.toBe("0.0000");

    fetchMock.mockResolvedValueOnce(jsonResponse({}, 404));
    await expect(stellar.fetchXlmBalance(PUBKEY)).resolves.toBe("0.0000000 (Unfunded)");

    fetchMock.mockResolvedValueOnce(jsonResponse({}, 500));
    await expect(stellar.fetchXlmBalance(PUBKEY)).resolves.toBe("0.00");

    fetchMock.mockRejectedValueOnce(new Error("down"));
    await expect(stellar.fetchXlmBalance(PUBKEY)).resolves.toBe("0.00");
  });

  it("converts decimal amounts to integer units", () => {
    expect(stellar.parseUnitsToBigInt("1.5")).toBe(15_000_000n);
    expect(stellar.parseUnitsToBigInt(1.23456789)).toBe(12_345_678n);
    expect(stellar.parseUnitsToBigInt("-2.5", 2)).toBe(-250n);
    expect(stellar.parseUnitsToBigInt(".5", 1)).toBe(5n);
    expect(() => stellar.parseUnitsToBigInt("abc")).toThrow(/Invalid token amount/);
    expect(() => stellar.parseUnitsToBigInt("")).toThrow(/Invalid token amount/);
    expect(() => stellar.parseUnitsToBigInt(".")).toThrow(/Invalid token amount/);
  });

  it("fetches all escrow asset balances", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        balances: [
          { asset_type: "native", balance: "10.123456" },
          {
            asset_type: "credit_alphanum4",
            asset_code: "USDC",
            asset_issuer: ISSUERS.TESTNET.USDC,
            balance: "25.5",
          },
          {
            asset_type: "credit_alphanum4",
            asset_code: "EURC",
            asset_issuer: ISSUERS.TESTNET.EURC,
            balance: "7",
          },
        ],
      }),
    );
    await expect(stellar.fetchAssetBalances(PUBKEY)).resolves.toEqual({
      XLM: "10.1235",
      USDC: "25.50",
      EURC: "7.00",
    });

    fetchMock.mockResolvedValueOnce(jsonResponse({}, 404));
    await expect(stellar.fetchAssetBalances(PUBKEY)).resolves.toEqual({
      XLM: "0.00",
      USDC: "0.00",
      EURC: "0.00",
    });

    fetchMock.mockRejectedValueOnce(new Error("offline"));
    await expect(stellar.fetchAssetBalances(PUBKEY)).resolves.toEqual({
      XLM: "0.00",
      USDC: "0.00",
      EURC: "0.00",
    });
  });

  it("requests friendbot funding", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    fetchMock.mockResolvedValueOnce({ ok: true });
    await expect(stellar.fundTestnetAccount(PUBKEY)).resolves.toBe(true);

    fetchMock.mockRejectedValueOnce(new Error("down"));
    await expect(stellar.fundTestnetAccount(PUBKEY)).resolves.toBe(false);
  });
});

describe("minimum reserve calculations", () => {
  it("computes the account reserve from subentries and sponsorship", () => {
    expect(stellar.calculateAccountReserve(0)).toBe(1);
    expect(stellar.calculateAccountReserve(3)).toBe(2.5);
    expect(stellar.calculateAccountReserve(3, { baseReserveXlm: 1 })).toBe(5);
    expect(stellar.calculateAccountReserve(2, { numSponsoring: 2, numSponsored: 1 })).toBe(2.5);
    expect(stellar.calculateAccountReserve(-2, { numSponsoring: -1, numSponsored: 9 })).toBe(-3.5);
    expect(stellar.calculateAccountReserve(NaN)).toBe(1);
  });

  it("computes reserve breakdowns and clamps spendable balance", () => {
    expect(stellar.calculateReserveBreakdown("10", 2)).toEqual({
      balanceXlm: 10,
      subentries: 2,
      baseReserveXlm: 0.5,
      reserveXlm: 2,
      spendableXlm: 8,
      numSponsoring: 0,
      numSponsored: 0,
      sellingLiabilitiesXlm: 0,
    });

    // Native XLM locked in open sell offers is not spendable.
    expect(
      stellar.calculateReserveBreakdown(10, 0, { sellingLiabilitiesXlm: 3 }).spendableXlm,
    ).toBe(6);
    expect(
      stellar.calculateReserveBreakdown(10, 0, { sellingLiabilitiesXlm: -1 }).sellingLiabilitiesXlm,
    ).toBe(0);
    expect(stellar.calculateReserveBreakdown("not-a-number", 0).balanceXlm).toBe(0);
    expect(stellar.calculateReserveBreakdown(1, 0).spendableXlm).toBe(0);
    expect(stellar.calculateSpendableBalance(10, 2)).toBe(8);
  });

  it("loads account details from Horizon and degrades gracefully", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        subentry_count: 2,
        num_sponsoring: 1,
        num_sponsored: 0,
        balances: [
          { asset_type: "native", balance: "20", selling_liabilities: "3" },
          { asset_type: "credit_alphanum4" },
        ],
      }),
    );
    await expect(stellar.fetchStellarAccountDetails(PUBKEY)).resolves.toMatchObject({
      status: "active",
      exists: true,
      balanceXlm: 20,
      subentries: 2,
      numSponsoring: 1,
      trustlineCount: 1,
      sellingLiabilitiesXlm: 3,
      reserveXlm: 2.5,
      spendableXlm: 14.5,
    });

    fetchMock.mockResolvedValueOnce(jsonResponse({}, 404));
    await expect(stellar.fetchStellarAccountDetails(PUBKEY)).resolves.toMatchObject({
      status: "unfunded",
      exists: false,
      balanceXlm: 0,
      spendableXlm: 0,
    });

    fetchMock.mockResolvedValueOnce(jsonResponse({}, 503));
    await expect(stellar.fetchStellarAccountDetails(PUBKEY)).resolves.toMatchObject({
      status: "unavailable",
      exists: false,
    });

    fetchMock.mockRejectedValueOnce(new Error("offline"));
    await expect(stellar.fetchStellarAccountDetails(PUBKEY)).resolves.toMatchObject({
      status: "unavailable",
      exists: false,
      spendableXlm: 0,
    });
  });
});

describe("Soroban invocation engine", () => {
  it("returns a simulated hash for the mock wallet", async () => {
    const result = await stellar.invokeSorobanMethod(PUBKEY, "noop", [], "mock");
    expect(result.success).toBe(true);
    expect(result.txHash).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it("prepares, signs, submits, and confirms a transaction", async () => {
    const result = await withFakeTimers(() =>
      stellar.invokeSorobanMethod(PUBKEY, "noop", [], "freighter"),
    );
    expect(result).toMatchObject({ success: true, txHash: "tx-hash", resultValue: 7 });
    expect(server.sendTransaction).toHaveBeenCalled();
  });

  it("wraps simulation errors during preparation", async () => {
    sdk.isSimulationError.mockReturnValue(true);
    await expect(stellar.invokeSorobanMethod(PUBKEY, "noop", [], "freighter")).rejects.toThrow(
      /Soroban simulation failed/,
    );
  });

  it("rejects ERROR submissions and FAILED ledger results", async () => {
    server.sendTransaction.mockResolvedValueOnce({ status: "ERROR", errorResult: {} });
    await expect(stellar.invokeSorobanMethod(PUBKEY, "noop", [], "freighter")).rejects.toThrow(
      /Failed to submit transaction/,
    );

    server.getTransaction.mockResolvedValueOnce({ status: "FAILED" });
    await expect(
      withFakeTimers(() => stellar.invokeSorobanMethod(PUBKEY, "noop", [], "freighter")),
    ).rejects.toThrow(/reverted/);

    server.getTransaction.mockResolvedValueOnce({ status: "SUCCESS" });
    await expect(
      withFakeTimers(() => stellar.invokeSorobanMethod(PUBKEY, "noop", [], "freighter")),
    ).resolves.toMatchObject({ resultValue: null });
  });

  it("times out when the ledger never confirms", async () => {
    server.getTransaction.mockResolvedValue({ status: "PENDING" });

    await expect(
      withFakeTimers(() => stellar.invokeSorobanMethod(PUBKEY, "noop", [], "freighter")),
    ).rejects.toThrow(/timed out/);
  });
});

describe("contract call wrappers", () => {
  it("creates campaigns through the mock wallet and the live path", async () => {
    const mocked = await stellar.createCampaignContractCall(PUBKEY, 10, 3600, 100, "mock");
    expect(mocked).toMatchObject({ success: true, asset: "XLM" });

    const demo = await stellar.createCampaignContractCall(
      "GASTORMSALE7DEMO",
      10,
      3600,
      100,
      "freighter",
      "USDC",
    );
    expect(demo.asset).toBe("USDC");

    const invoke = vi
      .spyOn(stellar.stellarOperations, "invokeSorobanMethod")
      .mockResolvedValueOnce({ success: true, txHash: "hash", resultValue: 42 })
      .mockResolvedValueOnce({ success: true, txHash: "hash" });

    await expect(
      stellar.createCampaignContractCall(PUBKEY, 10, 3600, 100, "freighter"),
    ).resolves.toMatchObject({ campaignId: 42 });

    await expect(
      stellar.createCampaignContractCall(PUBKEY, 10, 3600, 100, "freighter"),
    ).resolves.toMatchObject({ success: true });
    invoke.mockRestore();
  });

  it("logs sales through the mock and live paths", async () => {
    await expect(
      stellar.logSaleContractCall(PUBKEY, 1, AFFILIATE, 5, "mock"),
    ).resolves.toMatchObject({ success: true });

    await expect(
      stellar.logSaleContractCall("GASTORMSALE7DEMO", 1, AFFILIATE, 5),
    ).resolves.toMatchObject({ success: true });

    await expect(
      withFakeTimers(() => stellar.logSaleContractCall(PUBKEY, 1, AFFILIATE, 5)),
    ).resolves.toMatchObject({ txHash: "tx-hash" });
  });

  it("claims payouts with explicit and discovered assets", async () => {
    await expect(
      stellar.claimPayoutContractCall(AFFILIATE, 1, "mock", "USDC"),
    ).resolves.toMatchObject({ asset: "USDC" });

    await expect(stellar.claimPayoutContractCall("GASTORMSALE7DEMO", 1)).resolves.toMatchObject({
      success: true,
    });

    server.simulateTransaction.mockRejectedValueOnce(new Error("query failed"));
    await expect(
      withFakeTimers(() => stellar.claimPayoutContractCall(AFFILIATE, 1, "freighter")),
    ).resolves.toMatchObject({ success: true, txHash: "tx-hash" });

    await expect(
      withFakeTimers(() => stellar.claimPayoutContractCall(AFFILIATE, 1, "freighter", "EURC")),
    ).resolves.toMatchObject({ asset: "EURC" });
  });

  it("refunds escrow through the mock and live paths", async () => {
    await expect(
      stellar.refundCampaignEscrowContractCall(PUBKEY, 1, "mock"),
    ).resolves.toMatchObject({ success: true });

    await expect(
      stellar.refundCampaignEscrowContractCall("GASTORMSALE7DEMO", 1),
    ).resolves.toMatchObject({ success: true });

    await expect(
      withFakeTimers(() => stellar.refundCampaignEscrowContractCall(PUBKEY, 1, "freighter")),
    ).resolves.toMatchObject({ txHash: "tx-hash" });
  });

  it("reads campaign metadata from contract storage", async () => {
    server.simulateTransaction.mockResolvedValueOnce({
      result: { retval: nativeToScVal(5, { type: "i32" }) },
    });
    await expect(stellar.getCampaignContractQuery(1)).resolves.toBe(5);

    sdk.isSimulationSuccess.mockReturnValueOnce(false);
    await expect(stellar.getCampaignContractQuery(1)).resolves.toBeNull();
  });

  it("queries token allowances in mock and live modes", async () => {
    await expect(stellar.getTokenAllowanceQuery("")).resolves.toBe(0);
    await expect(stellar.getTokenAllowanceQuery("GASTORMSALE7DEMO")).resolves.toBe(0);

    window.localStorage.setItem(`mock_allowance_${PUBKEY}_${SPENDER}`, "12.5");
    const previousEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    try {
      // Every failover attempt must fail for the catch-all fallback to run.
      server.simulateTransaction.mockRejectedValue(new Error("rpc down"));
      await expect(stellar.getTokenAllowanceQuery(PUBKEY, SPENDER)).resolves.toBe(12.5);

      server.simulateTransaction.mockImplementation(async () => ({}));
      server.simulateTransaction.mockResolvedValueOnce({
        result: { retval: nativeToScVal(5_000_000n, { type: "i128" }) },
      });
      await expect(stellar.getTokenAllowanceQuery(PUBKEY, SPENDER)).resolves.toBe(0.5);

      server.simulateTransaction.mockResolvedValueOnce({
        result: { retval: nativeToScVal("25000000", { type: "i128" }) },
      });
      await expect(stellar.getTokenAllowanceQuery(PUBKEY, SPENDER)).resolves.toBe(2.5);

      sdk.isSimulationSuccess.mockReturnValueOnce(false);
      await expect(stellar.getTokenAllowanceQuery(PUBKEY, SPENDER)).resolves.toBe(0);

      window.localStorage.removeItem(`mock_allowance_${PUBKEY}_${SPENDER}`);
      sdk.isSimulationSuccess.mockReturnValue(false);
      await expect(stellar.getTokenAllowanceQuery(PUBKEY, SPENDER)).resolves.toBe(0);
    } finally {
      process.env.NODE_ENV = previousEnv;
      window.localStorage.clear();
    }
  });

  it("approves allowances for the mock wallet and live wallet", async () => {
    const previousEnv = process.env.NODE_ENV;
    await expect(
      stellar.approveTokenAllowance(PUBKEY, CONTRACT, CONTRACT, 10, "mock"),
    ).resolves.toMatchObject({ success: true });

    process.env.NODE_ENV = "production";
    try {
      const invoke = vi
        .spyOn(stellar.stellarOperations, "invokeSorobanMethod")
        .mockResolvedValue({ success: true, txHash: "hash" });

      await expect(
        stellar.approveTokenAllowance(PUBKEY, CONTRACT, CONTRACT, 10, "freighter"),
      ).resolves.toMatchObject({ txHash: "hash" });

      invoke.mockRestore();
    } finally {
      process.env.NODE_ENV = previousEnv;
    }
  });

  it("approves SAC token contracts with validation", async () => {
    await expect(stellar.approveTokenContractCall("", 1)).rejects.toThrow(/not connected/);
    await expect(stellar.approveTokenContractCall(PUBKEY, 0)).rejects.toThrow(/greater than zero/);

    const mocked = await stellar.approveTokenContractCall(PUBKEY, 10, SPENDER, "mock");
    expect(mocked).toMatchObject({ success: true, allowance: 10 });
    expect(window.localStorage.getItem(`mock_allowance_${PUBKEY}_${SPENDER}`)).toBe("10");

    const previousEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    try {
      const invoke = vi
        .spyOn(stellar.stellarOperations, "invokeSorobanMethod")
        .mockResolvedValue({ success: true, txHash: "hash" });

      await expect(
        stellar.approveTokenContractCall(PUBKEY, 5, SPENDER, "freighter"),
      ).resolves.toMatchObject({ txHash: "hash", allowance: 5 });

      invoke.mockRestore();
    } finally {
      process.env.NODE_ENV = previousEnv;
    }
  });

  it("returns the active RPC server", () => {
    expect(stellar.getSorobanRpcServer()).toBe(server);
  });
});

describe("address helpers", () => {
  it("formats and validates Stellar addresses", () => {
    expect(stellar.formatStellarAddress("")).toBe("");
    expect(stellar.formatStellarAddress("GABC")).toBe("GABC");
    expect(stellar.formatStellarAddress(PUBKEY)).toBe(
      `${PUBKEY.slice(0, 4)}...${PUBKEY.slice(-4)}`,
    );

    expect(stellar.isValidStellarAddress(PUBKEY)).toBe(true);
    expect(stellar.isValidStellarAddress(CONTRACT)).toBe(true);
    expect(stellar.isValidStellarAddress("")).toBe(false);
    expect(stellar.isValidStellarAddress("G123")).toBe(false);
    expect(stellar.isValidStellarAddress("X".repeat(56))).toBe(false);
  });
});
