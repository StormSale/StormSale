import { afterEach, describe, expect, it, vi } from "vitest";
import {
  Account,
  Horizon,
  Keypair,
  TransactionBuilder,
} from "@stellar/stellar-sdk";
import {
  buildUnsignedDeposit,
  SignedXdrError,
  validateSignedXdr,
} from "./offlineSigning";

describe("offline signing", () => {
  afterEach(() => vi.restoreAllMocks());

  it("builds an unsigned deposit with a hex transaction hash", async () => {
    const source = Keypair.random();
    const destination = Keypair.random();
    vi.spyOn(Horizon.Server.prototype, "loadAccount").mockResolvedValue(
      new Account(source.publicKey(), "1") as unknown as Awaited<ReturnType<typeof Horizon.Server.prototype.loadAccount>>,
    );
    vi.spyOn(Horizon.Server.prototype, "fetchBaseFee").mockResolvedValue(100);

    const bundle = await buildUnsignedDeposit({
      sourceAccount: source.publicKey(),
      escrowAccount: destination.publicKey(),
      amount: "1",
    });
    const tx = TransactionBuilder.fromXDR(bundle.xdr, bundle.networkPassphrase);
    const expectedHash = Array.from(tx.hash(), (byte) => byte.toString(16).padStart(2, "0")).join("");

    expect(bundle.hash).toBe(expectedHash);
    expect(bundle.expiresAt).not.toBeNull();
  });

  it("accepts a signed copy of the exported transaction", async () => {
    const source = Keypair.random();
    const destination = Keypair.random();
    vi.spyOn(Horizon.Server.prototype, "loadAccount").mockResolvedValue(
      new Account(source.publicKey(), "1") as unknown as Awaited<ReturnType<typeof Horizon.Server.prototype.loadAccount>>,
    );
    vi.spyOn(Horizon.Server.prototype, "fetchBaseFee").mockResolvedValue(100);

    const bundle = await buildUnsignedDeposit({
      sourceAccount: source.publicKey(),
      escrowAccount: destination.publicKey(),
      amount: "1",
    });
    const signed = TransactionBuilder.fromXDR(bundle.xdr, bundle.networkPassphrase);
    signed.sign(source);

    expect(validateSignedXdr(signed.toXDR(), bundle).signatures).toHaveLength(1);
  });

  it("rejects invalid XDR", () => {
    const bundle = {
      version: 1 as const,
      xdr: "",
      hash: "",
      networkPassphrase: "Test SDF Network ; September 2015",
      sourceAccount: "",
      expiresAt: null,
    };

    expect(() => validateSignedXdr("not-xdr", bundle)).toThrow(SignedXdrError);
  });
});
