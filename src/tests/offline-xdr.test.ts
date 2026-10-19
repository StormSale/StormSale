import { describe, expect, it } from "vitest";
import { Account, BASE_FEE, Keypair, Operation, TransactionBuilder } from "@stellar/stellar-sdk";
import { STELLAR_CONFIG } from "../config/stellar";
import {
  assembleTransactionXdrFromQrFrames,
  splitTransactionXdrIntoQrFrames,
} from "../lib/offlineXdr";
import { validateSignedSorobanTransactionXdr } from "../lib/stellar";

function buildUnsignedTransaction(source: string, value: string): string {
  const account = new Account(source, "1");
  return new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: STELLAR_CONFIG.networkPassphrase,
  })
    .addOperation(Operation.manageData({ name: "offline-test", value }))
    .setTimeout(60)
    .build()
    .toXDR();
}

describe("Air-gapped transaction handoff", () => {
  it("splits and reassembles transaction XDR in sequence-numbered QR frames", () => {
    const xdr = "A".repeat(1800);
    const frames = splitTransactionXdrIntoQrFrames(xdr);
    expect(frames.length).toBe(3);
    expect(assembleTransactionXdrFromQrFrames(frames.map((frame) => frame.payload))).toBe(xdr);
  });

  it("rejects missing or duplicate QR frames", () => {
    const frames = splitTransactionXdrIntoQrFrames("A".repeat(1000));
    expect(() => assembleTransactionXdrFromQrFrames([frames[0].payload])).toThrow(
      "incomplete or belong",
    );
    expect(() =>
      assembleTransactionXdrFromQrFrames([frames[0].payload, frames[0].payload]),
    ).toThrow("duplicate or missing");
  });

  it("validates the expected advertiser signature and exact prepared transaction", () => {
    const signer = Keypair.random();
    const unsignedXdr = buildUnsignedTransaction(signer.publicKey(), "approved");
    const signedTransaction = TransactionBuilder.fromXDR(
      unsignedXdr,
      STELLAR_CONFIG.networkPassphrase,
    );
    signedTransaction.sign(signer);

    expect(
      validateSignedSorobanTransactionXdr(
        signedTransaction.toXDR(),
        unsignedXdr,
        signer.publicKey(),
      ).signatures,
    ).toHaveLength(1);
  });

  it("rejects unsigned transactions, invalid signatures, and altered envelopes", () => {
    const signer = Keypair.random();
    const unsignedXdr = buildUnsignedTransaction(signer.publicKey(), "approved");
    expect(() =>
      validateSignedSorobanTransactionXdr(unsignedXdr, unsignedXdr, signer.publicKey()),
    ).toThrow("no signatures");

    const invalidSignature = TransactionBuilder.fromXDR(
      unsignedXdr,
      STELLAR_CONFIG.networkPassphrase,
    );
    invalidSignature.sign(Keypair.random());
    expect(() =>
      validateSignedSorobanTransactionXdr(
        invalidSignature.toXDR(),
        unsignedXdr,
        signer.publicKey(),
      ),
    ).toThrow("No valid signature");

    const alteredTransaction = TransactionBuilder.fromXDR(
      buildUnsignedTransaction(signer.publicKey(), "tampered"),
      STELLAR_CONFIG.networkPassphrase,
    );
    alteredTransaction.sign(signer);
    expect(() =>
      validateSignedSorobanTransactionXdr(
        alteredTransaction.toXDR(),
        unsignedXdr,
        signer.publicKey(),
      ),
    ).toThrow("does not match");
  });
});
