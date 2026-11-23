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
import {
  disputeFormSchema,
  computeScaledDimensions,
  compressEvidenceImage,
  openDisputeContractCall,
  type ImageCodec,
} from "../lib/dispute";
import { validate } from "../lib/validation";
import { rpcFallbackManager } from "../lib/rpcFallback";
import { STELLAR_CONFIG } from "../config/stellar";

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

const validForm = {
  orderId: "42",
  reason: "not_delivered",
  description: "The product was never delivered after 14 days.",
};

describe("dispute form validation", () => {
  it("accepts a valid submission", () => {
    const r = validate(disputeFormSchema, validForm);
    expect(r.errors).toBeNull();
    expect(r.data?.orderId).toBe("42");
  });

  it.each(["", "   ", "abc", "-1", "0", "1.5", "1e3", "4294967296"])(
    "rejects invalid order ID %j",
    (orderId) => {
      const r = validate(disputeFormSchema, { ...validForm, orderId });
      expect(r.errors).toHaveProperty("orderId");
    },
  );

  it("requires a known reason category", () => {
    expect(validate(disputeFormSchema, { ...validForm, reason: "" }).errors).toHaveProperty(
      "reason",
    );
    expect(validate(disputeFormSchema, { ...validForm, reason: "bogus" }).errors).toHaveProperty(
      "reason",
    );
    const { reason: _omit, ...noReason } = validForm;
    expect(validate(disputeFormSchema, noReason).errors).toHaveProperty("reason");
  });

  it("requires a sufficiently detailed description within the max length", () => {
    expect(validate(disputeFormSchema, { ...validForm, description: "" }).errors).toHaveProperty(
      "description",
    );
    expect(
      validate(disputeFormSchema, { ...validForm, description: "too short" }).errors,
    ).toHaveProperty("description");
    expect(
      validate(disputeFormSchema, { ...validForm, description: " ".repeat(30) + "x" }).errors,
    ).toHaveProperty("description");
    expect(
      validate(disputeFormSchema, { ...validForm, description: "a".repeat(2001) }).errors,
    ).toHaveProperty("description");
  });

  it("reports every invalid field at once", () => {
    const r = validate(disputeFormSchema, { orderId: "", reason: "", description: "" });
    expect(Object.keys(r.errors ?? {}).sort()).toEqual(["description", "orderId", "reason"]);
  });
});

describe("evidence image compression", () => {
  const makeCodec = (width: number, height: number, outSize: number) => {
    const encode = vi.fn(async () => new Blob([new Uint8Array(outSize)], { type: "image/jpeg" }));
    const codec: ImageCodec = {
      decode: vi.fn(async () => ({ width, height, source: {} })),
      encode,
    };
    return { codec, encode };
  };
  const png = (size: number, name = "proof.png") =>
    new File([new Uint8Array(size)], name, { type: "image/png" });

  it("downscales the longest side to the max dimension, preserving aspect ratio", () => {
    expect(computeScaledDimensions(4000, 2000)).toEqual({ width: 1600, height: 800 });
    expect(computeScaledDimensions(1000, 3200)).toEqual({ width: 500, height: 1600 });
  });

  it("never upscales small images", () => {
    expect(computeScaledDimensions(800, 600)).toEqual({ width: 800, height: 600 });
  });

  it("rejects invalid dimensions", () => {
    expect(() => computeScaledDimensions(0, 10)).toThrow();
  });

  it("re-encodes large images as smaller JPEGs with the scaled size", async () => {
    const { codec, encode } = makeCodec(4000, 2000, 1000);
    const out = await compressEvidenceImage(png(50_000), codec);
    expect(encode).toHaveBeenCalledWith(expect.anything(), 1600, 800, "image/jpeg", 0.7);
    expect(out.size).toBe(1000);
    expect(out.size).toBeLessThan(50_000);
    expect(out.type).toBe("image/jpeg");
    expect(out.name).toBe("proof.jpg");
  });

  it("keeps the original when compression does not reduce size", async () => {
    const { codec } = makeCodec(100, 100, 5000);
    const original = png(2000);
    expect(await compressEvidenceImage(original, codec)).toBe(original);
  });

  it("rejects non-image files without decoding", async () => {
    const { codec } = makeCodec(10, 10, 1);
    const pdf = new File([new Uint8Array(10)], "a.pdf", { type: "application/pdf" });
    await expect(compressEvidenceImage(pdf, codec)).rejects.toThrow(/image/);
    expect(codec.decode).not.toHaveBeenCalled();
  });

  it("propagates decode failures for corrupt images", async () => {
    const codec: ImageCodec = {
      decode: vi.fn(async () => {
        throw new Error("corrupt");
      }),
      encode: vi.fn(),
    };
    await expect(compressEvidenceImage(png(10), codec)).rejects.toThrow("corrupt");
  });
});

describe("open_dispute Soroban invocation (escrow lock)", () => {
  const consumer = Keypair.random().publicKey();
  const originalContractId = STELLAR_CONFIG.contractId;
  const hash = "ab".repeat(32);

  const makeServer = () => ({
    getAccount: vi.fn(async (addr: string) => new Account(addr, "1")),
    simulateTransaction: vi.fn(async (_tx: Transaction) => ({ id: "1", latestLedger: 1 })),
    sendTransaction: vi.fn(async () => ({ status: "PENDING", hash: "e".repeat(64) })),
    getTransaction: vi.fn(async () => ({ status: "SUCCESS", returnValue: undefined })),
  });

  let signXDR: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("localStorage", {
      getItem: () => null,
      setItem: () => undefined,
      removeItem: () => undefined,
      clear: () => undefined,
    });
    (STELLAR_CONFIG as any).contractId = StrKey.encodeContract(Buffer.alloc(32, 9));
    signXDR = vi.fn(async (x: string) => x);
    (globalThis as any).window = { xBullSDK: { signXDR } };
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    (STELLAR_CONFIG as any).contractId = originalContractId;
    delete (globalThis as any).window;
  });

  it("invokes open_dispute with address, u32 order id, reason symbol and evidence hash", async () => {
    const server = makeServer();
    vi.spyOn(rpcFallbackManager, "executeWithFallback").mockImplementation(async (fn: any) =>
      fn(server),
    );

    const pending = openDisputeContractCall(consumer, 42, "not_delivered", hash, "xbull");
    await vi.advanceTimersByTimeAsync(1500);
    const res = await pending;

    expect(res).toEqual({ success: true, txHash: "e".repeat(64) });
    expect(signXDR).toHaveBeenCalledTimes(1);

    const tx = server.simulateTransaction.mock.calls[0][0] as Transaction;
    const invoke = (tx.operations[0] as any).func.invokeContract;
    expect(invoke.functionName.toString()).toBe("open_dispute");
    expect(invoke.args).toHaveLength(4);
    const [addr, order, reason, ev] = invoke.args;
    expect(Address.fromScVal(addr).toString()).toBe(consumer);
    expect(order.type).toBe("scvU32");
    expect(scValToNative(order)).toBe(42);
    expect(scValToNative(reason)).toBe("not_delivered");
    expect(scValToNative(ev)).toBe(hash);
  });

  it("does not sign or submit when simulation (escrow lock precondition) fails", async () => {
    const server = {
      ...makeServer(),
      simulateTransaction: vi.fn(async () => ({ error: "escrow already released" })),
    };
    vi.spyOn(rpcFallbackManager, "executeWithFallback").mockImplementation(async (fn: any) =>
      fn(server),
    );
    await expect(openDisputeContractCall(consumer, 42, "damaged", hash, "xbull")).rejects.toThrow(
      /Soroban/,
    );
    expect(signXDR).not.toHaveBeenCalled();
    expect(server.sendTransaction).not.toHaveBeenCalled();
  });

  it("surfaces an on-chain revert", async () => {
    const server = {
      ...makeServer(),
      getTransaction: vi.fn(async () => ({ status: "FAILED" })),
    };
    vi.spyOn(rpcFallbackManager, "executeWithFallback").mockImplementation(async (fn: any) =>
      fn(server),
    );
    const pending = openDisputeContractCall(consumer, 42, "other", hash, "xbull");
    const assertion = expect(pending).rejects.toThrow(/reverted/);
    await vi.advanceTimersByTimeAsync(1500);
    await assertion;
  });

  it("rejects a bad address or order id before touching the network", async () => {
    const spy = vi.spyOn(rpcFallbackManager, "executeWithFallback");
    await expect(openDisputeContractCall("nope", 1, "other", hash, "xbull")).rejects.toThrow(
      /address/,
    );
    await expect(openDisputeContractCall(consumer, 0, "other", hash, "xbull")).rejects.toThrow(
      /order/,
    );
    await expect(
      openDisputeContractCall(consumer, 2 ** 32, "other", hash, "xbull"),
    ).rejects.toThrow(/order/);
    expect(spy).not.toHaveBeenCalled();
  });
});
