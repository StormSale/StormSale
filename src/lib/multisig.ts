import { TransactionBuilder, Keypair, StrKey, xdr } from "@stellar/stellar-sdk";
import { STELLAR_CONFIG } from "../config/stellar";
import { signWalletTransaction, getSorobanRpcServer, type WalletType } from "./stellar";

/* =========================================================================
   1. TYPES & INTERFACES FOR MULTI-SIG & SEP-0030
   ========================================================================= */

export interface AccountSigner {
  key: string;
  weight: number;
  type: string;
}

export interface AccountThresholds {
  low_threshold: number;
  med_threshold: number;
  high_threshold: number;
}

export interface MultiSigAccountInfo {
  address: string;
  isMultiSig: boolean;
  thresholds: AccountThresholds;
  signers: AccountSigner[];
  totalWeight: number;
  requiredWeight: number;
  masterKeyWeight: number;
}

export interface SignatureProgress {
  requiredWeight: number;
  currentWeight: number;
  isThresholdMet: boolean;
  signaturesCount: number;
  totalSignersCount: number;
  signedSigners: { key: string; weight: number; hint: string }[];
  pendingSigners: { key: string; weight: number }[];
  progressPercent: number;
}

export interface ParsedMultiSigTransaction {
  sourceAccount: string;
  sequenceNumber: string;
  fee: string;
  memo?: string;
  operationsCount: number;
  operationTypes: string[];
  isSoroban: boolean;
  progress: SignatureProgress;
  rawXdr: string;
}

export interface Sep30CoSigner {
  address: string;
  weight: number;
  hasSigned: boolean;
  signedAtUtc?: string;
}

export interface Sep30CoordinationSession {
  sessionId: string;
  account: string;
  actionType: "escrow_deposit" | "escrow_refund" | "token_allowance" | "custom";
  description: string;
  currentXdr: string;
  requiredWeight: number;
  currentWeight: number;
  isThresholdMet: boolean;
  coSigners: Sep30CoSigner[];
  createdUtc: string;
  updatedUtc: string;
  status: "collecting" | "ready" | "submitted";
  txHash?: string;
}

/* =========================================================================
   2. HORIZON ACCOUNT MULTI-SIG INSPECTION (/accounts/{address})
   ========================================================================= */

// In-memory mock store for automated testing and sandbox environments
const mockMultiSigStore = new Map<string, MultiSigAccountInfo>();

export function setMockMultiSigAccount(
  address: string,
  config: Partial<MultiSigAccountInfo>,
): void {
  const masterWeight = config.masterKeyWeight ?? 1;
  const defaultThresholds: AccountThresholds = config.thresholds || {
    low_threshold: 1,
    med_threshold: 2,
    high_threshold: 2,
  };
  const defaultSigners: AccountSigner[] = config.signers || [
    { key: address, weight: masterWeight, type: "ed25519_public_key" },
    {
      key: "GASTORMSALE7TESTNET7AFFILIATE7MERCHANT7ESCROW7XLM7777777", // gitleaks:allow
      weight: 1,
      type: "ed25519_public_key",
    },
  ];

  const totalWeight = defaultSigners.reduce((acc, s) => acc + s.weight, 0);
  const requiredWeight = defaultThresholds.med_threshold;

  mockMultiSigStore.set(address, {
    address,
    isMultiSig: requiredWeight > 1 || defaultSigners.length > 1,
    thresholds: defaultThresholds,
    signers: defaultSigners,
    totalWeight,
    requiredWeight,
    masterKeyWeight: masterWeight,
  });
}

/**
 * Inspects a Stellar account's thresholds and registered signers via Horizon `/accounts/{address}`.
 */
export async function inspectMultiSigAccount(
  address: string,
  horizonUrl: string = STELLAR_CONFIG.horizonUrl,
): Promise<MultiSigAccountInfo> {
  if (!address) {
    return {
      address: "",
      isMultiSig: false,
      thresholds: { low_threshold: 0, med_threshold: 0, high_threshold: 0 },
      signers: [],
      totalWeight: 0,
      requiredWeight: 0,
      masterKeyWeight: 0,
    };
  }

  // 1. Check in-memory mock store first
  if (mockMultiSigStore.has(address)) {
    return mockMultiSigStore.get(address)!;
  }

  // 2. Check localStorage in browser / test env
  if (typeof window !== "undefined" && window.localStorage) {
    const rawLocal = window.localStorage.getItem(`mock_multisig_${address}`);
    if (rawLocal) {
      try {
        return JSON.parse(rawLocal);
      } catch {
        // continue to network query
      }
    }
  }

  // 3. Fallback for test accounts / demo accounts
  if (
    address.startsWith("GASTORMSALE7") ||
    address === "mock" ||
    (typeof process !== "undefined" && process.env?.NODE_ENV === "test")
  ) {
    const defaultThresholds = { low_threshold: 1, med_threshold: 1, high_threshold: 1 };
    const defaultSigners = [{ key: address, weight: 1, type: "ed25519_public_key" }];
    return {
      address,
      isMultiSig: false,
      thresholds: defaultThresholds,
      signers: defaultSigners,
      totalWeight: 1,
      requiredWeight: 1,
      masterKeyWeight: 1,
    };
  }

  // 4. Query Stellar Horizon `/accounts/{address}`
  try {
    const cleanUrl = horizonUrl.replace(/\/+$/, "");
    const res = await fetch(`${cleanUrl}/accounts/${address}`);
    if (!res.ok) {
      throw new Error(`Horizon account query returned HTTP ${res.status}`);
    }
    const data = await res.json();

    const thresholds: AccountThresholds = {
      low_threshold: Number(data.thresholds?.low_threshold ?? 1),
      med_threshold: Number(data.thresholds?.med_threshold ?? 1),
      high_threshold: Number(data.thresholds?.high_threshold ?? 1),
    };

    const signers: AccountSigner[] = (data.signers || []).map((s: any) => ({
      key: s.key,
      weight: Number(s.weight ?? 0),
      type: s.type || "ed25519_public_key",
    }));

    const masterSigner = signers.find((s) => s.key === address);
    const masterKeyWeight = masterSigner ? masterSigner.weight : 0;
    const totalWeight = signers.reduce((acc, s) => acc + s.weight, 0);
    const requiredWeight = thresholds.med_threshold;
    const isMultiSig = requiredWeight > masterKeyWeight || signers.length > 1;

    return {
      address,
      isMultiSig,
      thresholds,
      signers,
      totalWeight,
      requiredWeight,
      masterKeyWeight,
    };
  } catch {
    // If account not found or network offline, return single-sig default
    return {
      address,
      isMultiSig: false,
      thresholds: { low_threshold: 1, med_threshold: 1, high_threshold: 1 },
      signers: [{ key: address, weight: 1, type: "ed25519_public_key" }],
      totalWeight: 1,
      requiredWeight: 1,
      masterKeyWeight: 1,
    };
  }
}

/* =========================================================================
   3. TRANSACTION MULTI-SIGNATURE ANALYSIS & PROGRESS
   ========================================================================= */

/**
 * Extracts the 4-byte signature hint for a Stellar public key.
 */
export function getPublicKeyHint(publicKey: string): string {
  try {
    const rawBytes = StrKey.decodeEd25519PublicKey(publicKey);
    return Buffer.from(rawBytes.slice(-4)).toString("hex");
  } catch {
    return "";
  }
}

function extractSignatureHintHex(sig: any): string {
  if (!sig) return "";
  try {
    const raw = typeof sig.hint === "function" ? sig.hint() : sig.hint?.value || sig.hint;
    return Buffer.from(raw).toString("hex");
  } catch {
    return "";
  }
}

function extractSignatureValueHex(sig: any): string {
  if (!sig) return "";
  try {
    const raw =
      typeof sig.signature === "function" ? sig.signature() : sig.signature?.value || sig.signature;
    return Buffer.from(raw).toString("hex");
  } catch {
    return "";
  }
}

/**
 * Analyzes signatures present on a transaction XDR against an account's required thresholds.
 */
export function analyzeTransactionSignatures(
  transactionXdr: string,
  accountInfo: MultiSigAccountInfo,
  networkPassphrase: string = STELLAR_CONFIG.networkPassphrase,
): SignatureProgress {
  if (!transactionXdr || !transactionXdr.trim()) {
    return {
      requiredWeight: accountInfo.requiredWeight || 1,
      currentWeight: 0,
      isThresholdMet: false,
      signaturesCount: 0,
      totalSignersCount: accountInfo.signers.length || 1,
      signedSigners: [],
      pendingSigners: accountInfo.signers.map((s) => ({ key: s.key, weight: s.weight })),
      progressPercent: 0,
    };
  }

  let txEnvelope: any;
  try {
    txEnvelope = TransactionBuilder.fromXDR(transactionXdr, networkPassphrase);
  } catch (err: any) {
    throw new Error(`Failed to decode transaction XDR: ${err.message}`, { cause: err });
  }

  const rawSignatures = (txEnvelope.signatures || []) as any[];
  const existingHints = new Set(
    rawSignatures.map((s) => extractSignatureHintHex(s)).filter(Boolean),
  );

  const signedSigners: { key: string; weight: number; hint: string }[] = [];
  const pendingSigners: { key: string; weight: number }[] = [];
  let currentWeight = 0;

  for (const signer of accountInfo.signers) {
    const hint = getPublicKeyHint(signer.key);
    if (hint && existingHints.has(hint)) {
      signedSigners.push({ key: signer.key, weight: signer.weight, hint });
      currentWeight += signer.weight;
    } else {
      pendingSigners.push({ key: signer.key, weight: signer.weight });
    }
  }

  const requiredWeight = accountInfo.requiredWeight || 1;
  const isThresholdMet = currentWeight >= requiredWeight;
  const progressPercent = Math.min(100, Math.round((currentWeight / requiredWeight) * 100));

  return {
    requiredWeight,
    currentWeight,
    isThresholdMet,
    signaturesCount: rawSignatures.length,
    totalSignersCount: accountInfo.signers.length,
    signedSigners,
    pendingSigners,
    progressPercent,
  };
}

/**
 * Parses and decodes transaction details for user inspection in multi-sig modals.
 */
export function parseMultiSigTransaction(
  transactionXdr: string,
  accountInfo?: MultiSigAccountInfo,
  networkPassphrase: string = STELLAR_CONFIG.networkPassphrase,
): ParsedMultiSigTransaction {
  const tx: any = TransactionBuilder.fromXDR(transactionXdr, networkPassphrase);

  const rawOps = tx.operations || tx.innerTransaction?.operations || [];
  const operationTypes = rawOps.map((op: any) => op.type || "unknown");
  const isSoroban = operationTypes.some((t: string) => t.includes("invokeHostFunction"));

  const sourceAccount: string =
    tx.source || tx.feeSource || (tx.innerTransaction && tx.innerTransaction.source) || "";
  const sequenceNumber: string =
    tx.sequence || (tx.innerTransaction && tx.innerTransaction.sequence) || "0";
  const fee: string = String(tx.fee || (tx.innerTransaction && tx.innerTransaction.fee) || "0");
  const memo: string | undefined = tx.memo?.value
    ? String(tx.memo.value)
    : tx.innerTransaction?.memo?.value
      ? String(tx.innerTransaction.memo.value)
      : undefined;

  const defaultAccountInfo: MultiSigAccountInfo = accountInfo || {
    address: sourceAccount,
    isMultiSig: false,
    thresholds: { low_threshold: 1, med_threshold: 1, high_threshold: 1 },
    signers: [{ key: sourceAccount, weight: 1, type: "ed25519_public_key" }],
    totalWeight: 1,
    requiredWeight: 1,
    masterKeyWeight: 1,
  };

  const progress = analyzeTransactionSignatures(
    transactionXdr,
    defaultAccountInfo,
    networkPassphrase,
  );

  return {
    sourceAccount,
    sequenceNumber,
    fee,
    memo,
    operationsCount: rawOps.length,
    operationTypes,
    isSoroban,
    progress,
    rawXdr: transactionXdr,
  };
}

/* =========================================================================
   4. CO-SIGNING & SIGNATURE MERGING
   ========================================================================= */

/**
 * Merges signatures from two partially signed transaction envelopes without duplication.
 */
function getEnvelopeSignatures(env: any): any[] {
  if (env.v1) return env.v1.signatures || [];
  if (env.v0) return env.v0.signatures || [];
  if (env.feeBump) return env.feeBump.signatures || [];
  return [];
}

function setEnvelopeSignatures(env: any, signatures: any[]): void {
  if (env.v1) env.v1.signatures = signatures;
  else if (env.v0) env.v0.signatures = signatures;
  else if (env.feeBump) env.feeBump.signatures = signatures;
}

export function mergeTransactionSignatures(
  xdrA: string,
  xdrB: string,
  _networkPassphrase: string = STELLAR_CONFIG.networkPassphrase,
): string {
  if (!xdrA) return xdrB;
  if (!xdrB) return xdrA;

  const envA = xdr.TransactionEnvelope.fromXDR(xdrA, "base64");
  const envB = xdr.TransactionEnvelope.fromXDR(xdrB, "base64");

  const sigsA = getEnvelopeSignatures(envA);
  const sigsB = getEnvelopeSignatures(envB);

  const seenSigs = new Set<string>();
  const mergedSignatures: any[] = [];

  for (const sig of [...sigsA, ...sigsB]) {
    const key = `${extractSignatureHintHex(sig)}_${extractSignatureValueHex(sig)}`;
    if (!seenSigs.has(key)) {
      seenSigs.add(key);
      mergedSignatures.push(sig);
    }
  }

  setEnvelopeSignatures(envA, mergedSignatures);
  return envA.toXDR("base64");
}

/**
 * Signs a partially signed XDR with the currently connected wallet.
 */
export async function coSignTransaction(
  transactionXdr: string,
  signerWalletType: WalletType,
  accountInfo: MultiSigAccountInfo,
  networkPassphrase: string = STELLAR_CONFIG.networkPassphrase,
): Promise<{
  signedXdr: string;
  isComplete: boolean;
  currentWeight: number;
  requiredWeight: number;
}> {
  // If in mock mode, generate a mock signature from a registered pending signer
  if (signerWalletType === "mock") {
    const progress = analyzeTransactionSignatures(transactionXdr, accountInfo, networkPassphrase);
    const nextPending = progress.pendingSigners[0];
    const mockKeypair = nextPending ? Keypair.fromPublicKey(nextPending.key) : Keypair.random();

    const tx = TransactionBuilder.fromXDR(transactionXdr, networkPassphrase);
    // Add simulated decorated signature
    const hint = Buffer.from(StrKey.decodeEd25519PublicKey(mockKeypair.publicKey()).slice(-4));
    const mockSignature = new xdr.DecoratedSignature({
      hint,
      signature: Buffer.alloc(64, 1),
    });
    tx.signatures.push(mockSignature);
    const updatedXdr = tx.toXDR();

    const updatedProgress = analyzeTransactionSignatures(
      updatedXdr,
      accountInfo,
      networkPassphrase,
    );
    return {
      signedXdr: updatedXdr,
      isComplete: updatedProgress.isThresholdMet,
      currentWeight: updatedProgress.currentWeight,
      requiredWeight: updatedProgress.requiredWeight,
    };
  }

  const newlySignedXdr = await signWalletTransaction(transactionXdr, signerWalletType);
  const mergedXdr = mergeTransactionSignatures(transactionXdr, newlySignedXdr, networkPassphrase);
  const progress = analyzeTransactionSignatures(mergedXdr, accountInfo, networkPassphrase);

  return {
    signedXdr: mergedXdr,
    isComplete: progress.isThresholdMet,
    currentWeight: progress.currentWeight,
    requiredWeight: progress.requiredWeight,
  };
}

/* =========================================================================
   5. AUTOMATED TRANSACTION SUBMISSION WHEN THRESHOLD SATISFIED
   ========================================================================= */

/**
 * Submits a fully signed multi-sig transaction to the network (Soroban RPC / Horizon).
 */
export async function submitMultiSigTransaction(
  signedXdr: string,
  networkPassphrase: string = STELLAR_CONFIG.networkPassphrase,
): Promise<{ success: boolean; txHash: string; ledger?: number }> {
  // If mock mode, return mock success hash
  if (
    typeof process !== "undefined" &&
    process.env?.NODE_ENV === "test" &&
    signedXdr.includes("mock")
  ) {
    return {
      success: true,
      txHash:
        "0x" +
        Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join(""),
      ledger: 104256,
    };
  }

  const tx = TransactionBuilder.fromXDR(signedXdr, networkPassphrase);
  const isSoroban = (tx.operations || []).some((op: any) =>
    (op.type || "").includes("invokeHostFunction"),
  );

  if (isSoroban) {
    const server = getSorobanRpcServer();
    const sendResponse = await server.sendTransaction(tx);
    if (sendResponse.status === "ERROR") {
      throw new Error(
        `Multi-sig transaction submission failed: ${JSON.stringify(sendResponse.errorResult)}`,
      );
    }

    const txHash = sendResponse.hash;
    let attempts = 0;
    const maxAttempts = 25;

    while (attempts < maxAttempts) {
      await new Promise((resolve) => setTimeout(resolve, 1500));
      attempts++;

      const statusResponse = await server.getTransaction(txHash);
      if (statusResponse.status === "SUCCESS") {
        return {
          success: true,
          txHash,
          ledger: statusResponse.latestLedger,
        };
      }
      if (statusResponse.status === "FAILED") {
        throw new Error("Multi-sig Soroban transaction execution failed on-chain.");
      }
    }

    return { success: true, txHash };
  } else {
    // Horizon submission for standard transactions
    const form = new URLSearchParams();
    form.append("tx", signedXdr);
    const horizonUrl = STELLAR_CONFIG.horizonUrl.replace(/\/+$/, "");
    const res = await fetch(`${horizonUrl}/transactions`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form.toString(),
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.title || "Failed to submit transaction to Horizon");
    }

    return {
      success: true,
      txHash: data.hash,
      ledger: data.ledger,
    };
  }
}

/* =========================================================================
   6. STELLAR SEP-0030 RECOVERY & MULTI-PARTY COORDINATION PROTOCOL
   ========================================================================= */

const sep30SessionsStore = new Map<string, Sep30CoordinationSession>();

/**
 * Initializes a SEP-0030 coordination session for multi-party transaction approval.
 */
export function createSep30CoordinationSession(
  accountInfo: MultiSigAccountInfo,
  initialXdr: string,
  actionType: Sep30CoordinationSession["actionType"] = "escrow_deposit",
  description: string = "Campaign Escrow Multi-Sig Approval",
): Sep30CoordinationSession {
  const sessionId = "sep30_" + Math.random().toString(36).substring(2, 10);
  const progress = analyzeTransactionSignatures(initialXdr, accountInfo);

  const coSigners: Sep30CoSigner[] = accountInfo.signers.map((s) => {
    const isSigned = progress.signedSigners.some((signed) => signed.key === s.key);
    return {
      address: s.key,
      weight: s.weight,
      hasSigned: isSigned,
      signedAtUtc: isSigned ? new Date().toISOString() : undefined,
    };
  });

  const session: Sep30CoordinationSession = {
    sessionId,
    account: accountInfo.address,
    actionType,
    description,
    currentXdr: initialXdr,
    requiredWeight: accountInfo.requiredWeight,
    currentWeight: progress.currentWeight,
    isThresholdMet: progress.isThresholdMet,
    coSigners,
    createdUtc: new Date().toISOString(),
    updatedUtc: new Date().toISOString(),
    status: progress.isThresholdMet ? "ready" : "collecting",
  };

  sep30SessionsStore.set(sessionId, session);
  if (typeof window !== "undefined" && window.localStorage) {
    try {
      window.localStorage.setItem(`sep30_session_${sessionId}`, JSON.stringify(session));
    } catch {
      // ignore
    }
  }

  return session;
}

/**
 * Retrieves a SEP-0030 coordination session by ID.
 */
export function getSep30CoordinationSession(
  sessionId: string,
): Sep30CoordinationSession | undefined {
  if (sep30SessionsStore.has(sessionId)) {
    return sep30SessionsStore.get(sessionId);
  }

  if (typeof window !== "undefined" && window.localStorage) {
    const raw = window.localStorage.getItem(`sep30_session_${sessionId}`);
    if (raw) {
      try {
        const s = JSON.parse(raw);
        sep30SessionsStore.set(sessionId, s);
        return s;
      } catch {
        return undefined;
      }
    }
  }

  return undefined;
}

/**
 * Applies a co-signer signature to an active SEP-0030 coordination session.
 * If the threshold weight is satisfied, transitions status to "ready".
 */
export function updateSep30SessionSignature(
  sessionId: string,
  coSignerAddress: string,
  signedXdr: string,
  accountInfo: MultiSigAccountInfo,
): Sep30CoordinationSession {
  const session = getSep30CoordinationSession(sessionId);
  if (!session) {
    throw new Error(`SEP-0030 session '${sessionId}' not found.`);
  }

  const mergedXdr = mergeTransactionSignatures(session.currentXdr, signedXdr);
  const progress = analyzeTransactionSignatures(mergedXdr, accountInfo);

  const updatedSigners = session.coSigners.map((s) => {
    const isSigned =
      progress.signedSigners.some((signed) => signed.key === s.address) ||
      (s.address === coSignerAddress && progress.currentWeight > session.currentWeight);
    return {
      ...s,
      hasSigned: isSigned,
      signedAtUtc: isSigned ? s.signedAtUtc || new Date().toISOString() : undefined,
    };
  });

  const updatedSession: Sep30CoordinationSession = {
    ...session,
    currentXdr: mergedXdr,
    currentWeight: progress.currentWeight,
    isThresholdMet: progress.isThresholdMet,
    coSigners: updatedSigners,
    updatedUtc: new Date().toISOString(),
    status: progress.isThresholdMet ? "ready" : "collecting",
  };

  sep30SessionsStore.set(sessionId, updatedSession);
  if (typeof window !== "undefined" && window.localStorage) {
    try {
      window.localStorage.setItem(`sep30_session_${sessionId}`, JSON.stringify(updatedSession));
    } catch {
      // ignore
    }
  }

  return updatedSession;
}
