import {
  isConnected as isFreighterConnected,
  isAllowed as isFreighterAllowed,
  setAllowed as setFreighterAllowed,
  requestAccess as requestFreighterAccess,
  getAddress as getFreighterAddress,
  getNetwork as getFreighterNetwork,
  signTransaction as signFreighterTransaction,
} from "@stellar/freighter-api";
import {
  rpc,
  Contract,
  TransactionBuilder,
  nativeToScVal,
  scValToNative,
  Address,
  Account,
  BASE_FEE,
  xdr,
} from "@stellar/stellar-sdk;";
import { STELLAR_CONFIG } from "../config/stellar";

export type WalletType =
  "freighter" | "albedo" | "xbull" | "ledger" | "passkey" | "mock" | "readonly";

export interface StellarAccountInfo {
  address: string;
  balanceXlm: string;
  network: string;
}

export interface SorobanInvokeResult {
  success: boolean;
  txHash: string;
  resultValue?: any;
}

/**
 * Polling configuration for confirming blockchain transactions.
 * Exponential backoff with jitter and a hard timeout.
 */
export interface PollingConfig {
  /** Initial delay before the first poll, in ms. */
  initialDelayMs?: number;
  /** Multiplier applied to the delay after each attempt. */
  backoffFactor?: number;
  /** Maximum delay between polls, in ms. */
  maxDelayMs?: number;
  /** Total time budget before timeout, in ms. */
  timeoutMs?: number;
  /** Fractional random jitter (0.2 = up to 20%) to avoid thronging. */
  jitterFactor?: number;
}

export const DEFAULT_POLLING_CONFIG: Required<PollingConfig> = {
  initialDelayMs: 1000,
  backoffFactor: 1.6,
  maxDelayMs: 10000,
  timeoutMs: 60000,
  jitterFactor: 0.2,
};

export class TransactionPollingTimeoutError extends Error {
  readonly tyHash: string;
  readonly attempts: number;
  readonly elapsedMs: number;

  constructor(tyHash: string, attempts: number, elapsedMs: number) {
    super(
      `Transaction ${tyHash} was submitted but not confirmed after ${attempts} polls (${Math.round(elapsedMs / 1000)}s). You can retry confirmation.`,
    );
    this.name = "TransactionPollingTimeoutError";
    this.tyHash = tyHash;
    this.attempts = attempts;
    this.elapsedMs = elapsedMs;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Computes the next polling delay using exponential backoff with jitter,
 * capped at maxDelayMs.
 */
export function computeBackoffDelay(
  attempt: number,
  config: Required<PollingConfig> = DEFAULT_POLLING_CONFIG,
): number {
  const base = config.initialDelayMs * Math.pow(config.backoffFactor, attempt);
  const capped = Math.min(base, config.maxDelayMs);
  const jitter = 1 + (Math.random() * 2 - 1) * config.jitterFactor;
  return Math.max(0, Math.round(capped * jitter));
}

/**
 * Polls Soroban RPC until the transaction is confirmed or the timeout is reached.
 * Uses exponential backoff between attempts and throws TransactionPollingTimeoutError on
 * timeout so callers can surface a retry prompt.
 */
export async function pollTransactionStatus(
  txHash: string,
  config: PollingConfig = {},
  onAttempt?: (attempt: number, delayMs: number) => void,
  server: rpc.Server = getSorobanRpcServer(),
): Promise<rpc.Api.GetTransactionResponse> {
  const cfg = { ...DEFAULT_POLLING_CONFIG, ...config };
  const started = Date.now();
  let attempt = 0;
  let lastError: unknown;

  while (Date.now() - started < cfg.timeoutMs) {
    const delay = computeBackoffDelay(attempt, cfg);
    onAttempt?.(attempt, delay);
    await sleep(delay);

    try {
      const result = await server.getTransaction(txHash);
      const status = result.status;
      if (status === rpc.Api.GetTransactionStatus.SUCCESS) {
        return result;
      }
      if (status === rpc.Api.GetTransactionStatus.FAILED) {
        throw new Error(
          `Transaction ${txHash} failed on-chain: ${result.resultXdr?.toString() || "unknown error"}`,
        );
      }
      // NOT_FOUND / pending -> keep polling
    } catch (err) {
      // RPC may return not-found for a brief window after submission.
      // Only surface failures that are not transient not-found errors.
      const msg = err instanceof Error ? err.message : String(err);
      if (/not found|NOT_FOUND|404/i.test(msg)) {
        lastError = err;
      } else {
        throw err;
      }
    }

    attempt += 1;
  }

  const elapsed = Date.now() - started;
  const timeoutErr = new TransactionPollingTimeoutError(txHash, attempt, elapsed);
  if (lastError) {
    (timeoutErr as any).cause = lastError;
  }
  throw timeoutErr;
}

/**
 * Checks if the Freighter wallet extension is installed and available in the browser.
 */
export async function checkFreighterInstalled(): Promise<boolean> {
  try {
    const result = await isFreighterConnected();
    return Boolean(result && !result.error);
  } catch {
    return false;
  }
}

/**
 * Requests access from Freighter wallet and returns the active public key.
 */
export async function connectFreighterWallet(): Promise<string> {
  const isInstalled = await checkFreighterInstalled();
  if (!isInstalled) {
    throw new Error(
      "Freighter wallet extension is not detected. If on mobile, please use Albedo (Web Wallet) or Demo Account.",
    );
  }

  // Request access if not yet allowed
  const allowed = await isFreighterAllowed();
  if (!allowed || (allowed as any).error) {
    await setFreighterAllowed();
  }

  const access = await requestFreighterAccess();
  if (access.error) {
    throw new Error(access.error);
  }

  const addressResult = await getFreighterAddress();
  if (addressResult.error || !addressResult.address) {
    throw new Error(addressResult.error || "Failed to retrieve address from Freighter");
  }

  return addressResult.address;
}

/**
 * Connects to Albedo - Universal Web & Mobile Stellar Wallet.
 * Works on all iOS, Android, and Desktop browsers without extensions.
 */
export async function connectAlbedoWallet(): Promise<string> {
  return new Promise((resolve, reject) => {
    const width = 500;
    const height = 700;
    const left = window.screenLeft + (window.outerWidth - width) / 2;
    const top = window.screenTop + (window.outerHeight - height) / 2;

    const popup = window.open(
      "https://albedo.link/confirm?intent=public_key",
      "albedo_auth",
      `width=${width},height=${height},top=${top},left=${left},status=no,resizable=yes`,
    );

    if (!popup) {
      return reject(
        new Error(
          "Albedo window was blocked by your browser popup blocker. Please allow popups for this site.",
        ),
      );
    }

    const handler = (event: MessageEvent) => {
      if (event.origin !== "https://albedo.link") return;
      const data = event.data;
      if (data && data.intent === "public_key") {
        window.removeEventListener("message", handler);
        if (data.pubkey) {
          resolve(data.pubkey);
        } else if (data.error) {
          reject(new Error(data.error.message || "Albedo login was canceled."));
        }
      }
    };

    window.addEventListener("message", handler);

    const checkClosed = setInterval(() => {
      if (popup.closed) {
        clearInterval(checkClosed);
        window.removeEventListener("message", handler);
      }
    }, 1000);
  });
}

/**
 * Signs a transaction with Albedo web popup.
 */
export async function signAlbedoTransaction(
  xdrBase64: string,
  network: string = "testnet",
): Promise<string> {
  return new Promise((resolve, reject) => {
    const width = 500;
    const height = 700;
    const left = window.screenLeft + (window.outerWidth - width) / 2;
    const top = window.screenTop + (window.outerHeight - height) / 2;

    const popup = window.open(
      `https://albedo.link/confirm?intent=tx&xdr=${encodeURIComponent(xdrBase64)}&network=${encodeURIComponent(network)}`,
      "albedo_tx",
      `width=${width},height=${height},top=${top},left=${left},status=no,resizable=yes`,
    );

    if (!popup) {
      return reject(new Error("Albedo signature popup was blocked."));
    }

    const handler = (event: MessageEvent) => {
      if (event.origin !== "https://albedo.link") return;
      const data = event.data;
      if (data && data.intent === "tx") {
        window.removeEventListener("message", handler);
        if (data.signed_envelope_xdr) {
          resolve(data.signed_envelope_xdr);
        } else if (data.error) {
          reject(new Error(data.error.message || "Transaction signature declined in Albedo."));
        }
      }
    };

    window.addEventListener("message", handler);

    const checkClosed = setInterval(() => {
      if (popup.closed) {
        clearInterval(checkClosed);
        window.removeEventListener("message", handler);
      }
    }, 1000);
  });
}

/**
 * Connects to xBull wallet (extension / web).
 */
export async function connectXbullWallet(): Promise<string> {
  const xbull = (window as any).xBullSDK || (window as any).xbull;
  if (!xbull) {
    throw new Error(
      "xBull wallet extension is not installed. Please install xBull from https://xbull.app",
    );
  }

  try {
    await xbull.connect();
    const { address } = await xbull.getAddress();
    return address;
  } catch (err) {
    throw new Error(
      err instanceof Error ? err.message : "Failed to connect to xBull wallet",
    );
  }
}

/**
 * Signs a transaction with xBull.
 */
export async function signXBullTransaction(
  xdrBase64: string,
  network: string = "testnet",
): Promise<string> {
  const xbull = (window as any).xBullSDK || (window as any).xbull;
  if (!xbull) {
    throw new Error("xBull wallet is not installed.");
  }

  try {
    const result = await xbull.signTransaction(xdrBase64, { networkPassphrase: network });
    return result;
  } catch (err) {
    throw new Error(
      err instanceof Error ? err.message : "xBull transaction signing failed",
    );
  }
}

/**
 * Signs a transaction with Freighter wallet.
 */
export async function signFreighterTx(
  xdrBase64: string,
  network: string = "testnet",
): Promise<string> {
  const result = await signFreighterTransaction(xdrBase64, { network });
  if (result.error) {
    throw new Error(result.error);
  }
  return result.signedTx || result.signedTransaction || "";
}

/**
 * Returns the Soroban RPC server for the configured network.
 */
export function getSorobanRpcServer(): rpc.Server {
  return new rpc.Server(STELLAR_CONFIG.sorobanRpcUrl, { allowHttp: true });
}

/**
 * Fetches the XLM balance for a Stellar account.
 */
export async function getXlmBalance(address: string): Promise<string> {
  const server = new rpc.Server(STELLAR_CONFIG.sorobanRpcUrl, { allowHttp: true });
  const account = await server.getAccount(address);
  const native = account.balances.find((b) => b.asset_type === "native");
  return native ? native.balance : "0";
}
