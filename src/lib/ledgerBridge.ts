import StrApp from "@ledgerhq/hw-app-str";
import TransportWebHID from "@ledgerhq/hw-transport-webhid";
import { Keypair, TransactionBuilder, StrKey } from "@stellar/stellar-sdk";
import { STELLAR_CONFIG } from "../config/stellar";

export interface LedgerDeviceInfo {
  address: string;
  bipPath: string;
  appVersion?: string;
}

export interface LedgerErrorDetails {
  code: string;
  friendlyMessage: string;
  originalError: unknown;
}

/**
 * Standard BIP-44 Derivation Path for Stellar:
 * m / purpose' / coin_type' / account'
 * Stellar coin_type = 148'
 */
export const DEFAULT_STELLAR_BIP_PATH = "44'/148'/0'";

/**
 * Normalizes a BIP-44 derivation path for the Ledger Stellar app.
 * Accepts "m/44'/148'/0'" or "44'/148'/0'" and converts to "44'/148'/0'".
 */
export function formatBipPath(inputPath?: string): string {
  if (!inputPath || !inputPath.trim()) return DEFAULT_STELLAR_BIP_PATH;
  let cleaned = inputPath.trim();
  if (cleaned.startsWith("m/")) {
    cleaned = cleaned.slice(2);
  }
  return cleaned;
}

/**
 * Derives BIP-44 path from account index: e.g. index 0 -> "44'/148'/0'"
 */
export function getBipPathForAccount(accountIndex: number): string {
  const safeIndex = Math.max(0, Math.floor(accountIndex));
  return `44'/148'/${safeIndex}'`;
}

/**
 * Categorizes and formats errors from Ledger transport and app interaction:
 * - Device locked (0x6b0c)
 * - Transport disconnect / no device selected
 * - User / app rejection (0x6985)
 * - Stellar app not opened on device (0x6d00)
 */
export function parseLedgerError(err: unknown): LedgerErrorDetails {
  const errorRecord = err as Partial<{
    message: string;
    name: string;
    statusCode: number;
    statusText: string;
    errorCode: number;
  }>;
  const errMsg = String(errorRecord.message || errorRecord.name || err || "").toLowerCase();
  const statusCode = errorRecord.statusCode || errorRecord.statusText || errorRecord.errorCode;

  // 1. Device locked
  if (
    statusCode === 0x6b0c ||
    statusCode === 27404 ||
    errMsg.includes("locked") ||
    errMsg.includes("device locked") ||
    errMsg.includes("0x6b0c")
  ) {
    return {
      code: "DEVICE_LOCKED",
      friendlyMessage:
        "Your Ledger device is locked. Please unlock it with your PIN code and try again.",
      originalError: err,
    };
  }

  // 2. User declined / rejected on device
  if (
    statusCode === 0x6985 ||
    statusCode === 27013 ||
    errMsg.includes("condition of use not satisfied") ||
    errMsg.includes("denied") ||
    errMsg.includes("rejected") ||
    errMsg.includes("cancelled") ||
    errMsg.includes("0x6985")
  ) {
    return {
      code: "USER_REJECTED",
      friendlyMessage: "Transaction or connection request was declined on your Ledger device.",
      originalError: err,
    };
  }

  // 3. Stellar app not opened
  if (
    statusCode === 0x6d00 ||
    statusCode === 0x6e00 ||
    errMsg.includes("app not open") ||
    errMsg.includes("cla not supported") ||
    errMsg.includes("0x6d00")
  ) {
    return {
      code: "APP_NOT_OPEN",
      friendlyMessage: "Please open the official Stellar application on your Ledger device.",
      originalError: err,
    };
  }

  // 4. Transport disconnect / device not found
  if (
    errMsg.includes("no device selected") ||
    errMsg.includes("the device was disconnected") ||
    errMsg.includes("disconnected") ||
    errMsg.includes("cannot open device") ||
    errMsg.includes("failed to open") ||
    errMsg.includes("transporterror") ||
    errMsg.includes("navigator.hid is not defined") ||
    errMsg.includes("webhid not supported")
  ) {
    return {
      code: "TRANSPORT_DISCONNECT",
      friendlyMessage:
        "Ledger device was disconnected or WebHID transport permission was canceled. Ensure your USB/Bluetooth is connected.",
      originalError: err,
    };
  }

  // Generic fallback
  return {
    code: "UNKNOWN_LEDGER_ERROR",
    friendlyMessage: errorRecord.message || "Failed to communicate with Ledger hardware wallet.",
    originalError: err,
  };
}

/**
 * Checks if WebHID is supported in the current browser environment.
 */
export async function isWebHIDSupported(): Promise<boolean> {
  if (typeof window === "undefined" || typeof navigator === "undefined") return false;
  try {
    const navWithHid = navigator as Navigator & {
      hid?: { requestDevice: () => unknown };
    };
    return "hid" in navigator && typeof navWithHid.hid?.requestDevice === "function";
  } catch {
    return false;
  }
}

/**
 * Connects to a Ledger Nano S/X/Plus via WebHID and retrieves the Stellar public key.
 */
export async function connectLedgerDevice(
  bipPath: string = DEFAULT_STELLAR_BIP_PATH,
): Promise<LedgerDeviceInfo> {
  const normalizedPath = formatBipPath(bipPath);

  // If in non-browser or mock test environment, return deterministic mock hardware info
  const hidSupported = await isWebHIDSupported();
  if (!hidSupported) {
    const mockWindow =
      typeof window !== "undefined"
        ? (window as Window & { __MOCK_LEDGER__?: boolean })
        : undefined;
    // If WebHID is unavailable, check if we're in automated testing or mock mode
    if (typeof window === "undefined" || mockWindow?.__MOCK_LEDGER__ === true) {
      const mockKeypair = Keypair.random();
      return {
        address: mockKeypair.publicKey(),
        bipPath: normalizedPath,
        appVersion: "2.5.0",
      };
    }
    throw new Error(
      "WebHID is not supported on this browser. Please use Chrome, Brave, or Edge on Desktop.",
    );
  }

  let transport: Awaited<ReturnType<typeof TransportWebHID.create>> | null = null;
  try {
    transport = await TransportWebHID.create();
    const app = new StrApp(transport);

    // Fetch Stellar app configuration and public key
    const versionConfig = await app.getAppConfiguration().catch(() => null);
    const pubKeyResult = await app.getPublicKey(normalizedPath, false);

    if (!pubKeyResult || !pubKeyResult.rawPublicKey) {
      throw new Error("Ledger returned an empty public key response.");
    }

    const stellarAddress = StrKey.encodeEd25519PublicKey(pubKeyResult.rawPublicKey);

    return {
      address: stellarAddress,
      bipPath: normalizedPath,
      appVersion: versionConfig?.version || "Ready",
    };
  } catch (err: unknown) {
    const parsed = parseLedgerError(err);
    throw new Error(parsed.friendlyMessage, { cause: err });
  } finally {
    if (transport) {
      try {
        await transport.close();
      } catch {
        // Ignore transport close cleanup errors
      }
    }
  }
}

/**
 * Prepares and extracts transaction details (Soroban contract ID & transaction hash)
 * for user verification on the physical Ledger device screen.
 */
export function extractLedgerVerificationDetails(
  preparedXdr: string,
  networkPassphrase: string = STELLAR_CONFIG.networkPassphrase,
): {
  txHash: string;
  contractId: string | null;
  operationType: string;
} {
  try {
    const tx = TransactionBuilder.fromXDR(preparedXdr, networkPassphrase);
    const hashBytes = tx.hash();
    const txHash = Array.from(hashBytes)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    let contractId: string | null = null;
    let operationType = "Transaction";

    if (tx.operations && tx.operations.length > 0) {
      const firstOp = tx.operations[0] as
        | {
            type?: string;
            func?: unknown;
            contractId?: string | null;
          }
        | undefined;
      operationType = firstOp?.type || "Soroban Operation";
      if (firstOp?.func) {
        contractId = firstOp.contractId || STELLAR_CONFIG.contractId;
      }
    }

    return {
      txHash,
      contractId: contractId || STELLAR_CONFIG.contractId,
      operationType,
    };
  } catch {
    return {
      txHash: "Unknown",
      contractId: STELLAR_CONFIG.contractId,
      operationType: "Soroban Invocation",
    };
  }
}

/**
 * Signs a prepared Stellar / Soroban transaction using a Ledger Hardware Wallet.
 */
export async function signLedgerTransaction(
  preparedXdr: string,
  bipPath: string = DEFAULT_STELLAR_BIP_PATH,
  networkPassphrase: string = STELLAR_CONFIG.networkPassphrase,
): Promise<string> {
  const normalizedPath = formatBipPath(bipPath);
  const hidSupported = await isWebHIDSupported();
  const mockWindow =
    typeof window !== "undefined" ? (window as Window & { __MOCK_LEDGER__?: boolean }) : undefined;

  // Test / sandbox fallback
  if (!hidSupported || mockWindow?.__MOCK_LEDGER__ === true) {
    const tx = TransactionBuilder.fromXDR(preparedXdr, networkPassphrase);
    const mockSigner = Keypair.random();
    tx.sign(mockSigner);
    return tx.toXDR();
  }

  let transport: Awaited<ReturnType<typeof TransportWebHID.create>> | null = null;
  try {
    transport = await TransportWebHID.create();
    const app = new StrApp(transport);

    const tx = TransactionBuilder.fromXDR(preparedXdr, networkPassphrase);
    const signatureBuffer = await app.signTransaction(normalizedPath, tx.signatureBase());

    const pubKeyResult = await app.getPublicKey(normalizedPath, false);
    const publicKey = StrKey.encodeEd25519PublicKey(pubKeyResult.rawPublicKey);

    // Attach signature to Stellar transaction envelope
    tx.addSignature(publicKey, signatureBuffer.signature);
    return tx.toXDR();
  } catch (err: unknown) {
    const parsed = parseLedgerError(err);
    throw new Error(parsed.friendlyMessage, { cause: err });
  } finally {
    if (transport) {
      try {
        await transport.close();
      } catch {
        // Ignore close errors
      }
    }
  }
}
