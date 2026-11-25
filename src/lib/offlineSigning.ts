import {
  Asset,
  FeeBumpTransaction,
  Horizon,
  Keypair,
  Operation,
  Transaction,
  TransactionBuilder,
} from "@stellar/stellar-sdk";

export interface UnsignedBundle {
  version: 1;
  xdr: string;               // base64 unsigned transaction envelope
  hash: string;              // hex tx hash, used to verify the signed copy later
  networkPassphrase: string;
  sourceAccount: string;
  expiresAt: number | null;  // unix seconds, from tx timebounds
}

const HORIZON_URL = import.meta.env.VITE_HORIZON_URL ?? "https://horizon-testnet.stellar.org";
const NETWORK_PASSPHRASE =
  import.meta.env.VITE_NETWORK_PASSPHRASE ?? "Test SDF Network ; September 2015";

// Air-gapped signing takes time, so use a generous window (24h).
const OFFLINE_TIMEOUT_SECONDS = 24 * 60 * 60;

const server = new Horizon.Server(HORIZON_URL);

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** 1. ONLINE machine: build the unsigned campaign escrow deposit. */
export async function buildUnsignedDeposit(params: {
  sourceAccount: string;
  escrowAccount: string;
  amount: string;
  asset?: Asset;
}): Promise<UnsignedBundle> {
  const account = await server.loadAccount(params.sourceAccount);

  // TODO: if your escrow deposit is a Soroban contract call, replace this
  // operation with Operation.invokeContractFunction(...) and run the tx
  // through rpc.Server.prepareTransaction() before exporting.
  const tx = new TransactionBuilder(account, {
    fee: (await server.fetchBaseFee()).toString(),
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(
      Operation.payment({
        destination: params.escrowAccount,
        asset: params.asset ?? Asset.native(),
        amount: params.amount,
      })
    )
    .setTimeout(OFFLINE_TIMEOUT_SECONDS)
    .build();

  const maxTime = Number(tx.timeBounds?.maxTime ?? 0);

  return {
    version: 1,
    xdr: tx.toXDR(),
    hash: bytesToHex(tx.hash()),
    networkPassphrase: NETWORK_PASSPHRASE,
    sourceAccount: params.sourceAccount,
    expiresAt: maxTime || null,
  };
}

/** 2. Export: download the bundle as a file to move via USB / QR / etc. */
export function downloadUnsignedBundle(bundle: UnsignedBundle): void {
  const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `unsigned-escrow-deposit-${bundle.hash.slice(0, 8)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export class SignedXdrError extends Error {}

/** 3. ONLINE machine: validate the signed XDR before submitting. */
export function validateSignedXdr(signedXdr: string, original: UnsignedBundle): Transaction {
  let parsed: Transaction | FeeBumpTransaction;
  try {
    parsed = TransactionBuilder.fromXDR(signedXdr.trim(), original.networkPassphrase);
  } catch {
    throw new SignedXdrError("This is not a valid XDR transaction envelope.");
  }

  if (parsed instanceof FeeBumpTransaction) {
    throw new SignedXdrError("Fee-bump transactions are not accepted here.");
  }
  const tx = parsed;

  // Must be the exact same transaction we exported (signatures don't change the hash).
  if (bytesToHex(tx.hash()) !== original.hash) {
    throw new SignedXdrError("Signed transaction does not match the exported unsigned transaction.");
  }

  if (tx.signatures.length === 0) {
    throw new SignedXdrError("Transaction has no signatures.");
  }

  // At least one signature must be valid for the source account.
  const sourceKey = Keypair.fromPublicKey(original.sourceAccount);
  const hasValidSource = tx.signatures.some((s) => {
    try {
      return sourceKey.verify(tx.hash(), s.signature);
    } catch {
      return false;
    }
  });
  if (!hasValidSource) {
    throw new SignedXdrError("No valid signature from the source account was found.");
  }

  if (original.expiresAt && Date.now() / 1000 > original.expiresAt) {
    throw new SignedXdrError("Transaction has expired. Please rebuild and sign again.");
  }

  return tx;
}

/** 4. ONLINE machine: submit. */
export async function submitSignedDeposit(signedXdr: string, original: UnsignedBundle) {
  const tx = validateSignedXdr(signedXdr, original);
  return server.submitTransaction(tx);
}
