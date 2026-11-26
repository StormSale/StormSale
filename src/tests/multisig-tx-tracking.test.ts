import { describe, it, expect, vi } from "vitest";
import {
  Account,
  Asset,
  BASE_FEE,
  Keypair,
  Networks,
  Operation,
  TransactionBuilder,
} from "@stellar/stellar-sdk";
import {
  analyzeTransactionSignatures,
  createSep30CoordinationSession,
  mergeTransactionSignatures,
  parseMultiSigTransaction,
  updateSep30SessionSignature,
  type MultiSigAccountInfo,
} from "../lib/multisig";

const PASSPHRASE = Networks.TESTNET;

function setupTwoOfThree() {
  const master = Keypair.random();
  const coSignerA = Keypair.random();
  const coSignerB = Keypair.random();
  const accountInfo: MultiSigAccountInfo = {
    address: master.publicKey(),
    isMultiSig: true,
    thresholds: { low_threshold: 1, med_threshold: 2, high_threshold: 2 },
    signers: [
      { key: master.publicKey(), weight: 1, type: "ed25519_public_key" },
      { key: coSignerA.publicKey(), weight: 1, type: "ed25519_public_key" },
      { key: coSignerB.publicKey(), weight: 1, type: "ed25519_public_key" },
    ],
    totalWeight: 3,
    requiredWeight: 2,
    masterKeyWeight: 1,
  };

  const tx = new TransactionBuilder(new Account(master.publicKey(), "100"), {
    fee: BASE_FEE,
    networkPassphrase: PASSPHRASE,
  })
    .addOperation(
      Operation.payment({
        destination: Keypair.random().publicKey(),
        asset: Asset.native(),
        amount: "25000",
      }),
    )
    .setTimeout(300)
    .build();

  return { master, coSignerA, coSignerB, accountInfo, tx };
}

describe("Multi-Signature Transaction Approval and Status Tracking (#425)", () => {
  it("displays required vs collected signatures (e.g. 2 of 3 signed)", () => {
    const { master, coSignerA, accountInfo, tx } = setupTwoOfThree();

    tx.sign(master);
    const oneSigned = analyzeTransactionSignatures(tx.toXDR(), accountInfo, PASSPHRASE);
    expect(oneSigned.currentWeight).toBe(1);
    expect(oneSigned.requiredWeight).toBe(2);
    expect(oneSigned.totalSignersCount).toBe(3);
    expect(oneSigned.isThresholdMet).toBe(false);
    expect(oneSigned.progressPercent).toBe(50);
    expect(oneSigned.pendingSigners).toHaveLength(2);

    tx.sign(coSignerA);
    const twoSigned = analyzeTransactionSignatures(tx.toXDR(), accountInfo, PASSPHRASE);
    expect(twoSigned.signedSigners.map((s) => s.key)).toEqual([
      master.publicKey(),
      coSignerA.publicKey(),
    ]);
    expect(`${twoSigned.signedSigners.length} of ${twoSigned.totalSignersCount} signed`).toBe(
      "2 of 3 signed",
    );
    expect(twoSigned.isThresholdMet).toBe(true);
    expect(twoSigned.progressPercent).toBe(100);
  });

  it("serializes a partial envelope for export and merges co-signer signatures without duplicates", () => {
    const { master, coSignerA, accountInfo, tx } = setupTwoOfThree();

    tx.sign(master);
    const partialXdr = tx.toXDR();

    // Co-signer imports the exported partial envelope and signs it independently.
    const imported = TransactionBuilder.fromXDR(partialXdr, PASSPHRASE);
    const parsed = parseMultiSigTransaction(partialXdr, accountInfo, PASSPHRASE);
    expect(parsed.sourceAccount).toBe(master.publicKey());
    expect(parsed.operationTypes).toEqual(["payment"]);
    expect(parsed.progress.currentWeight).toBe(1);

    imported.sign(coSignerA);
    const coSignedXdr = imported.toXDR();

    const merged = mergeTransactionSignatures(partialXdr, coSignedXdr, PASSPHRASE);
    const mergedTx = TransactionBuilder.fromXDR(merged, PASSPHRASE);
    expect(mergedTx.signatures).toHaveLength(2);
    expect(mergedTx.hash().toString("hex")).toBe(tx.hash().toString("hex"));
    expect(analyzeTransactionSignatures(merged, accountInfo, PASSPHRASE).isThresholdMet).toBe(true);
  });

  it("dispatches a webhook notification when a co-signer signs the transaction", async () => {
    const { master, coSignerA, accountInfo, tx } = setupTwoOfThree();
    tx.sign(master);

    const session = createSep30CoordinationSession(accountInfo, tx.toXDR(), "escrow_deposit");
    expect(session.status).toBe("collecting");
    expect(session.currentWeight).toBe(1);

    const dispatchWebhook = vi.fn().mockResolvedValue({ success: true });
    const onCoSign = async (signer: Keypair) => {
      const copy = TransactionBuilder.fromXDR(session.currentXdr, PASSPHRASE);
      copy.sign(signer);
      const before = session.currentWeight;
      const updated = updateSep30SessionSignature(
        session.sessionId,
        signer.publicKey(),
        copy.toXDR(),
        accountInfo,
      );
      if (updated.currentWeight > before) {
        await dispatchWebhook({
          event: "cosigner_signed",
          sessionId: updated.sessionId,
          signer: signer.publicKey(),
          currentWeight: updated.currentWeight,
          requiredWeight: updated.requiredWeight,
          status: updated.status,
        });
      }
      return updated;
    };

    const updated = await onCoSign(coSignerA);
    expect(updated.status).toBe("ready");
    expect(updated.coSigners.find((s) => s.address === coSignerA.publicKey())?.hasSigned).toBe(
      true,
    );
    expect(dispatchWebhook).toHaveBeenCalledTimes(1);
    expect(dispatchWebhook).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "cosigner_signed",
        signer: coSignerA.publicKey(),
        currentWeight: 2,
        requiredWeight: 2,
        status: "ready",
      }),
    );
  });

  it("flags unauthorized co-signer signatures immediately (no weight added)", () => {
    const { master, accountInfo, tx } = setupTwoOfThree();
    const intruder = Keypair.random();

    tx.sign(master);
    tx.sign(intruder);
    const progress = analyzeTransactionSignatures(tx.toXDR(), accountInfo, PASSPHRASE);

    expect(progress.signaturesCount).toBe(2);
    expect(progress.currentWeight).toBe(1);
    expect(progress.isThresholdMet).toBe(false);

    const unauthorizedCount = progress.signaturesCount - progress.signedSigners.length;
    const validationError =
      unauthorizedCount > 0 ? `${unauthorizedCount} signature(s) from unauthorized signers` : null;
    expect(validationError).toBe("1 signature(s) from unauthorized signers");
    expect(progress.signedSigners.some((s) => s.key === intruder.publicKey())).toBe(false);

    expect(() => analyzeTransactionSignatures("not-a-valid-xdr", accountInfo, PASSPHRASE)).toThrow(
      /Failed to decode transaction XDR/,
    );
  });
});
