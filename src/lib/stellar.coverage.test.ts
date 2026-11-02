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

describe("balances and amount helpers", () => {
  it("converts decimal amounts to integer units", () => {
    expect(stellar.parseUnitsToBigInt("1.5")).toBe(15_000_000n);
    expect(stellar.parseUnitsToBigInt(1.23456789)).toBe(12_345_678n);
    expect(stellar.parseUnitsToBigInt("-2.5", 2)).toBe(-250n);
    expect(stellar.parseUnitsToBigInt(".5", 1)).toBe(5n);
    expect(() => stellar.parseUnitsToBigInt("abc")).toThrow(/Invalid token amount/);
    expect(() => stellar.parseUnitsToBigInt("")).toThrow(/Invalid token amount/);
    expect(() => stellar.parseUnitsToBigInt(".")).toThrow(/Invalid token amount/);
  });
});
