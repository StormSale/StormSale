import { describe, it, expect, beforeEach } from "vitest";
import { renderToString } from "react-dom/server";
import {
  Keypair,
  TransactionBuilder,
  Account,
  BASE_FEE,
  Networks,
  Operation,
  Asset,
} from "@stellar/stellar-sdk";
import {
  inspectMultiSigAccount,
  setMockMultiSigAccount,
  getPublicKeyHint,
  analyzeTransactionSignatures,
  parseMultiSigTransaction,
  mergeTransactionSignatures,
  coSignTransaction,
  submitMultiSigTransaction,
  createSep30CoordinationSession,
  getSep30CoordinationSession,
  updateSep30SessionSignature,
  type MultiSigAccountInfo,
} from "../lib/multisig";
import { MultiSigApprovalModal } from "../components/shared/MultiSigApprovalModal";
import { Web3Provider, type Web3ContextType } from "../context/Web3Context";

describe("Stellar Multi-Signature & SEP-0030 Campaign Escrow Approvals (#122)", () => {
  const masterKey = Keypair.random();
  const coSignerKey = Keypair.random();
  const thirdSignerKey = Keypair.random();

  const multiSigAccountConfig: MultiSigAccountInfo = {
    address: masterKey.publicKey(),
    isMultiSig: true,
    thresholds: {
      low_threshold: 1,
      med_threshold: 2,
      high_threshold: 3,
    },
    signers: [
      { key: masterKey.publicKey(), weight: 1, type: "ed25519_public_key" },
      { key: coSignerKey.publicKey(), weight: 1, type: "ed25519_public_key" },
      { key: thirdSignerKey.publicKey(), weight: 1, type: "ed25519_public_key" },
    ],
    totalWeight: 3,
    requiredWeight: 2,
    masterKeyWeight: 1,
  };

  const buildSampleTx = (seq: string = "100") => {
    const sourceAccount = new Account(masterKey.publicKey(), seq);
    return new TransactionBuilder(sourceAccount, {
      fee: BASE_FEE,
      networkPassphrase: Networks.TESTNET,
    })
      .addOperation(
        Operation.payment({
          destination: coSignerKey.publicKey(),
          asset: Asset.native(),
          amount: "10",
        }),
      )
      .setTimeout(180)
      .build();
  };

  beforeEach(() => {
    setMockMultiSigAccount(masterKey.publicKey(), multiSigAccountConfig);
  });

  describe("1. Horizon Account Inspection & Threshold Detection", () => {
    it("should identify multi-sig accounts and parse signers and thresholds", async () => {
      const info = await inspectMultiSigAccount(masterKey.publicKey());
      expect(info.isMultiSig).toBe(true);
      expect(info.requiredWeight).toBe(2);
      expect(info.totalWeight).toBe(3);
      expect(info.signers.length).toBe(3);
    });

    it("should return single-sig defaults for standard accounts", async () => {
      const singleKey = Keypair.random().publicKey();
      const info = await inspectMultiSigAccount(singleKey);
      expect(info.isMultiSig).toBe(false);
      expect(info.requiredWeight).toBe(1);
      expect(info.signers.length).toBe(1);
    });

    it("should gracefully handle empty or invalid address", async () => {
      const info = await inspectMultiSigAccount("");
      expect(info.isMultiSig).toBe(false);
      expect(info.signers.length).toBe(0);
    });
  });

  describe("2. Ed25519 Public Key Hint Extraction", () => {
    it("should compute a valid 4-byte hex hint for a Stellar public key", () => {
      const hint = getPublicKeyHint(masterKey.publicKey());
      expect(hint).toHaveLength(8); // 4 bytes = 8 hex characters
      expect(/^[0-9a-fA-F]{8}$/.test(hint)).toBe(true);
    });

    it("should return an empty string for malformed public keys", () => {
      expect(getPublicKeyHint("not-a-valid-key")).toBe("");
    });
  });

  describe("3. Transaction Signature Analysis & Progress Tracking", () => {
    const buildTestTransaction = () => {
      const sourceAccount = new Account(masterKey.publicKey(), "100");
      return new TransactionBuilder(sourceAccount, {
        fee: BASE_FEE,
        networkPassphrase: Networks.TESTNET,
      })
        .addOperation(
          Operation.payment({
            destination: coSignerKey.publicKey(),
            asset: Asset.native(),
            amount: "10",
          }),
        )
        .setTimeout(180)
        .build();
    };

    it("should report 0% progress when no signatures are attached", () => {
      const tx = buildTestTransaction();
      const progress = analyzeTransactionSignatures(
        tx.toXDR(),
        multiSigAccountConfig,
        Networks.TESTNET,
      );

      expect(progress.currentWeight).toBe(0);
      expect(progress.requiredWeight).toBe(2);
      expect(progress.isThresholdMet).toBe(false);
      expect(progress.progressPercent).toBe(0);
      expect(progress.signedSigners).toHaveLength(0);
      expect(progress.pendingSigners).toHaveLength(3);
    });

    it("should report 50% progress when only master key signs (1/2 weight)", () => {
      const tx = buildTestTransaction();
      tx.sign(masterKey);

      const progress = analyzeTransactionSignatures(
        tx.toXDR(),
        multiSigAccountConfig,
        Networks.TESTNET,
      );

      expect(progress.currentWeight).toBe(1);
      expect(progress.requiredWeight).toBe(2);
      expect(progress.isThresholdMet).toBe(false);
      expect(progress.progressPercent).toBe(50);
      expect(progress.signedSigners).toHaveLength(1);
      expect(progress.signedSigners[0].key).toBe(masterKey.publicKey());
      expect(progress.pendingSigners).toHaveLength(2);
    });

    it("should report 100% progress and threshold met when co-signer signs (2/2 weight)", () => {
      const tx = buildTestTransaction();
      tx.sign(masterKey);
      tx.sign(coSignerKey);

      const progress = analyzeTransactionSignatures(
        tx.toXDR(),
        multiSigAccountConfig,
        Networks.TESTNET,
      );

      expect(progress.currentWeight).toBe(2);
      expect(progress.requiredWeight).toBe(2);
      expect(progress.isThresholdMet).toBe(true);
      expect(progress.progressPercent).toBe(100);
      expect(progress.signedSigners).toHaveLength(2);
      expect(progress.pendingSigners).toHaveLength(1);
    });

    it("should parse transaction metadata (operations, source, fee)", () => {
      const tx = buildTestTransaction();
      const parsed = parseMultiSigTransaction(tx.toXDR(), multiSigAccountConfig, Networks.TESTNET);

      expect(parsed.sourceAccount).toBe(masterKey.publicKey());
      expect(parsed.operationsCount).toBe(1);
      expect(parsed.operationTypes).toContain("payment");
      expect(parsed.sequenceNumber).toBe("101");
    });
  });

  describe("4. Signature Merging across Co-Signers", () => {
    it("should merge signatures from two envelopes without duplicating", () => {
      const sourceAccount = new Account(masterKey.publicKey(), "200");
      const baseBuilder = () =>
        new TransactionBuilder(sourceAccount, {
          fee: BASE_FEE,
          networkPassphrase: Networks.TESTNET,
        })
          .addOperation(
            Operation.payment({
              destination: coSignerKey.publicKey(),
              asset: Asset.native(),
              amount: "5",
            }),
          )
          .setTimeout(180)
          .build();

      const envelope1 = baseBuilder();
      envelope1.sign(masterKey);

      const envelope2 = baseBuilder();
      envelope2.sign(coSignerKey);

      const mergedXdr = mergeTransactionSignatures(
        envelope1.toXDR(),
        envelope2.toXDR(),
        Networks.TESTNET,
      );

      const progress = analyzeTransactionSignatures(
        mergedXdr,
        multiSigAccountConfig,
        Networks.TESTNET,
      );

      expect(progress.currentWeight).toBe(2);
      expect(progress.isThresholdMet).toBe(true);
      expect(progress.signaturesCount).toBe(2);

      // Idempotency: Merging again should not duplicate signatures
      const reMergedXdr = mergeTransactionSignatures(
        mergedXdr,
        envelope1.toXDR(),
        Networks.TESTNET,
      );
      const reMergedProgress = analyzeTransactionSignatures(
        reMergedXdr,
        multiSigAccountConfig,
        Networks.TESTNET,
      );
      expect(reMergedProgress.signaturesCount).toBe(2);
    });
  });

  describe("5. Co-Signing Workflow & Simulated Submission", () => {
    it("should add a simulated co-signer signature and report updated threshold", async () => {
      const sourceAccount = new Account(masterKey.publicKey(), "300");
      const tx = new TransactionBuilder(sourceAccount, {
        fee: BASE_FEE,
        networkPassphrase: Networks.TESTNET,
      })
        .addOperation(
          Operation.payment({
            destination: coSignerKey.publicKey(),
            asset: Asset.native(),
            amount: "1",
          }),
        )
        .setTimeout(180)
        .build();

      tx.sign(masterKey);

      const res = await coSignTransaction(
        tx.toXDR(),
        "mock",
        multiSigAccountConfig,
        Networks.TESTNET,
      );

      expect(res.signedXdr).toBeDefined();
      expect(res.currentWeight).toBe(2);
      expect(res.isComplete).toBe(true);
    });

    it("should submit a transaction envelope in test environment", async () => {
      const result = await submitMultiSigTransaction("mock_signed_xdr");
      expect(result.success).toBe(true);
      expect(result.txHash).toBeDefined();
      expect(result.ledger).toBeGreaterThan(0);
    });
  });

  describe("6. SEP-0030 Multi-Party Coordination Protocol", () => {
    const buildTx = () => {
      const sourceAccount = new Account(masterKey.publicKey(), "400");
      const tx = new TransactionBuilder(sourceAccount, {
        fee: BASE_FEE,
        networkPassphrase: Networks.TESTNET,
      })
        .addOperation(
          Operation.payment({
            destination: coSignerKey.publicKey(),
            asset: Asset.native(),
            amount: "25",
          }),
        )
        .setTimeout(180)
        .build();
      tx.sign(masterKey);
      return tx.toXDR();
    };

    it("should create a SEP-0030 coordination session with unique ID", () => {
      const initialXdr = buildTx();
      const session = createSep30CoordinationSession(
        multiSigAccountConfig,
        initialXdr,
        "escrow_deposit",
        "Test Campaign Escrow Multi-Sig Deposit",
      );

      expect(session.sessionId.startsWith("sep30_")).toBe(true);
      expect(session.status).toBe("collecting");
      expect(session.currentWeight).toBe(1);
      expect(session.requiredWeight).toBe(2);
      expect(session.isThresholdMet).toBe(false);
      expect(session.coSigners.length).toBe(3);

      const masterSigner = session.coSigners.find((s) => s.address === masterKey.publicKey());
      expect(masterSigner?.hasSigned).toBe(true);
    });

    it("should retrieve a SEP-0030 session by ID", () => {
      const initialXdr = buildTx();
      const created = createSep30CoordinationSession(multiSigAccountConfig, initialXdr);
      const retrieved = getSep30CoordinationSession(created.sessionId);

      expect(retrieved).toBeDefined();
      expect(retrieved?.sessionId).toBe(created.sessionId);
    });

    it("should update SEP-0030 session with co-signer signature and transition status to ready", () => {
      const initialXdr = buildTx();
      const session = createSep30CoordinationSession(multiSigAccountConfig, initialXdr);

      // Create a second envelope signed by coSignerKey
      const sourceAccount = new Account(masterKey.publicKey(), "400");
      const coSignerTx = new TransactionBuilder(sourceAccount, {
        fee: BASE_FEE,
        networkPassphrase: Networks.TESTNET,
      })
        .addOperation(
          Operation.payment({
            destination: coSignerKey.publicKey(),
            asset: Asset.native(),
            amount: "25",
          }),
        )
        .setTimeout(180)
        .build();
      coSignerTx.sign(coSignerKey);

      const updated = updateSep30SessionSignature(
        session.sessionId,
        coSignerKey.publicKey(),
        coSignerTx.toXDR(),
        multiSigAccountConfig,
      );

      expect(updated.status).toBe("ready");
      expect(updated.isThresholdMet).toBe(true);
      expect(updated.currentWeight).toBe(2);

      const coSignerEntry = updated.coSigners.find((s) => s.address === coSignerKey.publicKey());
      expect(coSignerEntry?.hasSigned).toBe(true);
    });
  });

  describe("7. MultiSigApprovalModal UI Component", () => {
    it("should render null when isMultiSigModalOpen is false", () => {
      const html = renderToString(
        <Web3Provider>
          <MultiSigApprovalModal />
        </Web3Provider>,
      );
      expect(html).not.toContain("Multi-Signature Campaign Escrow Approval");
    });

    it("should render modal with progress bar, signers list and tabs when open", async () => {
      const Web3Hook = await import("../hooks/useWeb3");
      const { vi } = await import("vitest");
      vi.spyOn(Web3Hook, "useWeb3").mockReturnValue({
        userAddress: masterKey.publicKey(),
        connectorType: "mock",
        multiSigInfo: multiSigAccountConfig,
        isMultiSigAccount: true,
        isMultiSigModalOpen: true,
        closeMultiSigModal: vi.fn(),
        activeMultiSigXdr: buildSampleTx().toXDR(),
        activeMultiSigDescription: "Test Escrow",
        refreshMultiSigInfo: vi.fn().mockResolvedValue(multiSigAccountConfig),
      } as unknown as Web3ContextType);

      const html = renderToString(<MultiSigApprovalModal />);
      expect(html).toContain("Multi-Signature Campaign Escrow Approval");
      expect(html).toContain("Signing Progress:");
      expect(html).toContain("Registered Account Signers");
      expect(html).toContain("Export &amp; SEP-0030 Share");
      expect(html).toContain("Import &amp; Co-Sign XDR");
      expect(html).toContain("Sign with Connected Wallet");
    });
  });
});
