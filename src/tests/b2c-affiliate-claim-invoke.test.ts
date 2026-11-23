// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  Account,
  Address,
  Keypair,
  StrKey,
  scValToNative,
  type Transaction,
} from "@stellar/stellar-sdk";
import { claimPayoutContractCall } from "../lib/stellar";
import { rpcFallbackManager } from "../lib/rpcFallback";
import { STELLAR_CONFIG } from "../config/stellar";

// Keep real SDK behaviour, but skip Soroban footprint assembly (needs a full simulation payload).
vi.mock("@stellar/stellar-sdk", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@stellar/stellar-sdk")>();
  return {
    ...actual,
    rpc: {
      ...actual.rpc,
      assembleTransaction: (tx: unknown) => ({ build: () => tx }),
    },
  };
});

describe("claimPayoutContractCall non-mock invocation (RPC + wallet boundary isolated)", () => {
  const affiliate = Keypair.random().publicKey();

  // Fake Soroban RPC server handed to each executeWithFallback callback.
  const makeServer = (overrides: Record<string, unknown> = {}) => ({
    getAccount: vi.fn(async (addr: string) => new Account(addr, "1")),
    simulateTransaction: vi.fn(async (_tx: Transaction) => ({ id: "1", latestLedger: 1 })),
    sendTransaction: vi.fn(async (tx: Transaction) => ({
      status: "PENDING",
      hash: "f".repeat(64),
      tx,
    })),
    getTransaction: vi.fn(async () => ({ status: "SUCCESS", returnValue: undefined })),
    ...overrides,
  });

  let signXDR: ReturnType<typeof vi.fn>;

  const originalContractId = STELLAR_CONFIG.contractId;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("localStorage", {
      getItem: () => null,
      setItem: () => undefined,
      removeItem: () => undefined,
      clear: () => undefined,
    });
    (STELLAR_CONFIG as any).contractId = StrKey.encodeContract(Buffer.alloc(32, 7));
    signXDR = vi.fn(async (xdrStr: string) => xdrStr);
    (globalThis as any).window = { xBullSDK: { signXDR } };
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    (STELLAR_CONFIG as any).contractId = originalContractId;
    delete (globalThis as any).window;
  });

  it("invokes claim_payout with the affiliate Address and u32 campaign id", async () => {
    const server = makeServer();
    vi.spyOn(rpcFallbackManager, "executeWithFallback").mockImplementation(async (fn: any) =>
      fn(server),
    );

    const pendingCall = claimPayoutContractCall(affiliate, 101, "xbull", "USDC");
    await vi.advanceTimersByTimeAsync(1500);
    const res = await pendingCall;

    expect(res).toMatchObject({ success: true, txHash: "f".repeat(64), asset: "USDC" });
    expect(server.getAccount).toHaveBeenCalledWith(affiliate);
    expect(signXDR).toHaveBeenCalledTimes(1);

    const simulatedTx = server.simulateTransaction.mock.calls[0][0] as Transaction;
    const invoke = (simulatedTx.operations[0] as any).func.invokeContract;
    expect(invoke.functionName.toString()).toBe("claim_payout");
    expect(invoke.args).toHaveLength(2);

    const [addrArg, campaignArg] = invoke.args;
    expect(addrArg.type).toBe("scvAddress");
    expect(Address.fromScVal(addrArg).toString()).toBe(affiliate);
    expect(campaignArg.type).toBe("scvU32");
    expect(scValToNative(campaignArg)).toBe(101);
  });

  it("propagates a rejected invocation as a rejection", async () => {
    const server = makeServer({
      simulateTransaction: vi.fn(async () => {
        throw new Error("RPC unavailable");
      }),
    });
    vi.spyOn(rpcFallbackManager, "executeWithFallback").mockImplementation(async (fn: any) =>
      fn(server),
    );

    await expect(claimPayoutContractCall(affiliate, 101, "xbull", "USDC")).rejects.toThrow(
      /Soroban invocation preparation failed.*RPC unavailable/,
    );
    expect(signXDR).not.toHaveBeenCalled();
    expect(server.sendTransaction).not.toHaveBeenCalled();
  });

  it("propagates a wallet signing rejection", async () => {
    const server = makeServer();
    vi.spyOn(rpcFallbackManager, "executeWithFallback").mockImplementation(async (fn: any) =>
      fn(server),
    );
    signXDR.mockRejectedValueOnce(new Error("Signature rejected"));

    await expect(claimPayoutContractCall(affiliate, 101, "xbull", "USDC")).rejects.toThrow(
      "Signature rejected",
    );
    expect(server.sendTransaction).not.toHaveBeenCalled();
  });
});
