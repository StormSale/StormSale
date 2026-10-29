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
    await expect(stellar.fetchXlmBalance(PUBKEY)).resolves.toBe("0.0000");
  });
});
