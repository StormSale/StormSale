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
  StrKey,
  xdr,
} from "@stellar/stellar-sdk";
import { STELLAR_CONFIG, SUPPORTED_ESCROW_ASSETS } from "../config/stellar";
import type { SupportedEscrowAssetCode } from "../config/stellar";
import { CONTRACT_ADDRESSES } from "../config/contracts";
import { rpcFallbackManager } from "./rpcFallback";
import { addErrorBreadcrumb } from "./errorTracking";

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
 * Safely extracts an error message from an unknown error or returns the fallback message.
 *
 * @param err - Unknown error caught in a try/catch block
 * @param fallback - Default message to return if err does not have a message
 * @returns Error message string
 */
function getErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof Error && err.message) {
    return err.message;
  }
  if (
    typeof err === "object" &&
    err !== null &&
    "message" in err &&
    typeof (err as { message: unknown }).message === "string" &&
    (err as { message: string }).message.length > 0
  ) {
    return (err as { message: string }).message;
  }
  if (typeof err === "string" && err.length > 0) {
    return err;
  }
  return fallback;
}

/**
 * Connects to xBull wallet (extension / web).
 */
export async function connectXbullWallet(): Promise<string> {
  const xbull = (window as any).xBullSDK || (window as any).xbull;
  if (!xbull) {
    throw new Error(
      "xBull wallet extension is not installed. Please install xBull from https://xbull.app or use Albedo on mobile.",
    );
  }
  try {
    const address = await xbull.getPublicKey();
    return address;
  } catch (err: unknown) {
    throw new Error(getErrorMessage(err, "xBull connection failed."), { cause: err });
  }
}

/**
 * Multi-wallet transaction signing dispatcher.
 */
export async function signWalletTransaction(
  preparedXdr: string,
  walletType: WalletType,
): Promise<string> {
  if (walletType === "freighter") {
    const signResult = await signFreighterTransaction(preparedXdr, {
      networkPassphrase: STELLAR_CONFIG.networkPassphrase,
    });
    if (
      !signResult ||
      (typeof signResult === "object" && "error" in signResult && signResult.error)
    ) {
      throw new Error((signResult as any)?.error || "User declined transaction in Freighter.");
    }
    const signedXdr =
      typeof signResult === "string"
        ? signResult
        : (signResult as any).signedTxXdr || (signResult as any).signedXdr;
    if (!signedXdr) throw new Error("No signed transaction XDR returned from Freighter.");
    return signedXdr;
  } else if (walletType === "albedo") {
    const netParam = STELLAR_CONFIG.network.toLowerCase() === "public" ? "public" : "testnet";
    return await signAlbedoTransaction(preparedXdr, netParam);
  } else if (walletType === "xbull") {
    const xbull = (window as any).xBullSDK || (window as any).xbull;
    if (!xbull) throw new Error("xBull extension is not available.");
    return await xbull.signXDR(preparedXdr);
  } else if (walletType === "ledger") {
    const { signLedgerTransaction } = await import("./ledgerBridge");
    return await signLedgerTransaction(preparedXdr);
  } else if (walletType === "passkey") {
    const { authenticateWithPasskey } = await import("./passkeySigner");
    await authenticateWithPasskey();
    return preparedXdr;
  } else {
    // Mock / Read-only fallback
    return preparedXdr;
  }
}

/**
 * Retrieves the current connected network from Freighter.
 */
export async function getCurrentNetwork(): Promise<string> {
  try {
    const netResult = await getFreighterNetwork();
    if (netResult.error) return STELLAR_CONFIG.network;
    return netResult.network || STELLAR_CONFIG.network;
  } catch {
    return STELLAR_CONFIG.network;
  }
}

/**
 * Queries the Stellar Horizon API for the account's XLM balance with silent multi-endpoint failover.
 */
export async function fetchXlmBalance(address: string): Promise<string> {
  try {
    const response = await rpcFallbackManager.executeHorizonFetchWithFallback(
      (horizonBaseUrl) => `${horizonBaseUrl}/accounts/${address}`,
    );
    if (!response.ok) {
      if (response.status === 404) {
        return "0.0000000 (Unfunded)";
      }
      return "0.00";
    }
    const data = await response.json();
    const nativeBalance = data.balances?.find((b: any) => b.asset_type === "native");
    return nativeBalance ? parseFloat(nativeBalance.balance).toFixed(4) : "0.0000";
  } catch (error) {
    console.warn("Error fetching Horizon account balance:", error);
    return "0.00";
  }
}

/**
 * Helper to convert decimal amount string/number to BigInt stroops/units at given decimal precision
 * without floating-point inaccuracies.
 */
export function parseUnitsToBigInt(amount: number | string, decimals: number = 7): bigint {
  const str =
    typeof amount === "number"
      ? amount.toLocaleString("en-US", { useGrouping: false, maximumFractionDigits: 20 })
      : amount.trim();
  if (!/^-?\d*(\.\d*)?$/.test(str) || str === "" || str === ".") {
    throw new Error(`Invalid token amount: ${amount}`);
  }
  const [wholeStr, fracStr = ""] = str.split(".");
  const paddedFrac = fracStr.padEnd(decimals, "0").slice(0, decimals);
  const combined = `${wholeStr || "0"}${paddedFrac}`;
  return BigInt(combined);
}

/**
 * Queries the Stellar Horizon API for all supported escrow assets (XLM, USDC, EURC).
 */
export async function fetchAssetBalances(
  address: string,
): Promise<Record<SupportedEscrowAssetCode, string>> {
  try {
    const response = await fetch(`${STELLAR_CONFIG.horizonUrl}/accounts/${address}`);
    if (!response.ok) {
      return { XLM: "0.00", USDC: "0.00", EURC: "0.00" };
    }
    const data = await response.json();
    const balances = data.balances || [];

    const native = balances.find((b: any) => b.asset_type === "native");
    const usdc = balances.find(
      (b: any) =>
        b.asset_code === "USDC" &&
        (!SUPPORTED_ESCROW_ASSETS.USDC.issuer ||
          b.asset_issuer === SUPPORTED_ESCROW_ASSETS.USDC.issuer),
    );

    const eurc = balances.find(
      (b: any) =>
        b.asset_code === "EURC" &&
        (!SUPPORTED_ESCROW_ASSETS.EURC.issuer ||
          b.asset_issuer === SUPPORTED_ESCROW_ASSETS.EURC.issuer),
    );

    return {
      XLM: native ? parseFloat(native.balance).toFixed(4) : "0.00",
      USDC: usdc ? parseFloat(usdc.balance).toFixed(2) : "0.00",
      EURC: eurc ? parseFloat(eurc.balance).toFixed(2) : "0.00",
    };
  } catch (error) {
    console.warn("Error fetching multi-asset Horizon balances:", error);
    return { XLM: "0.00", USDC: "0.00", EURC: "0.00" };
  }
}

export const stellarOperations = {
  getSorobanRpcServer: (): rpc.Server => getSorobanRpcServer(),
  invokeSorobanMethod: (
    callerAddress: string,
    methodName: string,
    scValArgs: xdr.ScVal[],
    walletType: WalletType = "freighter",
    contractIdOverride?: string,
  ): Promise<SorobanInvokeResult> =>
    invokeSorobanMethod(callerAddress, methodName, scValArgs, walletType, contractIdOverride),
};

const ALLOWANCE_LEDGER_OFFSET = 100_000;

async function getAllowanceExpirationLedger(server: rpc.Server): Promise<number> {
  const latest = await server.getLatestLedger();
  if (typeof latest?.sequence !== "number") {
    throw new Error("Unable to determine the current ledger for allowance expiration.");
  }
  return latest.sequence + ALLOWANCE_LEDGER_OFFSET;
}

/**
 * Approves a token allowance on the corresponding Stellar Asset Contract (SAC).
 */
export async function approveTokenAllowance(
  ownerAddress: string,
  tokenContractAddress: string,
  spenderAddress: string,
  amount: number,
  walletType: WalletType = "freighter",
  decimals: number = 7,
): Promise<{ success: boolean; txHash: string }> {
  const amountStroops = parseUnitsToBigInt(amount, decimals);

  if (walletType === "mock" || walletType === "readonly") {
    return {
      success: true,
      txHash: "SIM_ALLOWANCE_" + Math.random().toString(36).substring(2, 10).toUpperCase(),
    };
  }

  const expirationLedger = await getAllowanceExpirationLedger(
    stellarOperations.getSorobanRpcServer(),
  );

  const args: xdr.ScVal[] = [
    new Address(ownerAddress).toScVal(),
    new Address(spenderAddress).toScVal(),
    nativeToScVal(amountStroops, { type: "i128" }),
    nativeToScVal(expirationLedger, { type: "u32" }),
  ];

  const result = await stellarOperations.invokeSorobanMethod(
    ownerAddress,
    "approve",
    args,
    walletType,
    tokenContractAddress,
  );
  return {
    success: true,
    txHash: result.txHash,
  };
}

/**
 * Formats a 56-character Stellar public key (G...) or Soroban contract ID (C...).
 */
export function formatStellarAddress(address: string): string {
  if (!address || address.length < 10) return address || "";
  return `${address.slice(0, 4)}...${address.slice(-4)}`;
}

/**
 * Validates whether a given string is a valid format for a Stellar public key (G...) or contract (C...).
 */
export function isValidStellarAddress(address: string): boolean {
  if (!address) return false;
  const trimmed = address.trim();
  return (
    (trimmed.startsWith("G") || trimmed.startsWith("C")) &&
    trimmed.length === 56 &&
    /^[A-Z0-9]+$/.test(trimmed)
  );
}

/* -------------------------------------------------------------------------- */
/* Minimum balance reserve & spendable balance calculation                     */
/* -------------------------------------------------------------------------- */

/** Stellar protocol base reserve, in XLM (2 * 0.5 XLM = 1 XLM minimum). */
export const STELLAR_BASE_RESERVE_XLM = STELLAR_CONFIG.baseReserveXlm;

/** Fixed account overhead (the account itself + the base reserve multiplier). */
export const STELLAR_ACCOUNT_ENTRY_COUNT = 2;

export interface ReserveCalculationOptions {
  /** Base reserve, in XLM. Defaults to 0.5 XLM. */
  baseReserveXlm?: number;
  /** Number of reserves this account sponsors for other accounts. */
  numSponsoring?: number;
  /** Number of this account's own reserves sponsored by another account. */
  numSponsored?: number;
  /**
   * Native XLM committed to open sell offers (Horizon `selling_liabilities`).
   * It stays in the balance but cannot be spent until the offers are removed.
   */
  sellingLiabilitiesXlm?: number;
}

export interface ReserveBreakdown {
  balanceXlm: number;
  subentries: number;
  baseReserveXlm: number;
  reserveXlm: number;
  spendableXlm: number;
  numSponsoring: number;
  numSponsored: number;
  sellingLiabilitiesXlm: number;
}

/** Clamps arbitrary input to a non-negative integer. */
function toCount(value: number | undefined): number {
  const n = Math.floor(Number(value));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * Calculates the minimum XLM reserve an account must hold:
 * `(2 + subentries + numSponsoring - numSponsored) * baseReserve`.
 * With the default base reserve this equals 1 XLM + 0.5 XLM per subentry.
 */
export function calculateAccountReserve(
  subentries: number,
  options: ReserveCalculationOptions = {},
): number {
  const baseReserveXlm = options.baseReserveXlm ?? STELLAR_BASE_RESERVE_XLM;
  const entries = toCount(subentries);
  const sponsoring = toCount(options.numSponsoring);
  const sponsored = toCount(options.numSponsored);
  return (STELLAR_ACCOUNT_ENTRY_COUNT + entries + sponsoring - sponsored) * baseReserveXlm;
}

/**
 * Returns the full reserve breakdown for an account balance: the locked minimum
 * reserve, the spendable balance, and the subentry count driving the reserve.
 */
export function calculateReserveBreakdown(
  balanceXlm: number | string,
  subentries: number,
  options: ReserveCalculationOptions = {},
): ReserveBreakdown {
  const parsedBalance = typeof balanceXlm === "number" ? balanceXlm : parseFloat(balanceXlm);
  const balance = Number.isFinite(parsedBalance) ? parsedBalance : 0;
  const baseReserveXlm = options.baseReserveXlm ?? STELLAR_BASE_RESERVE_XLM;
  const reserveXlm = calculateAccountReserve(subentries, { ...options, baseReserveXlm });
  const liabilities = Number(options.sellingLiabilitiesXlm);
  const sellingLiabilitiesXlm = Number.isFinite(liabilities) && liabilities > 0 ? liabilities : 0;

  return {
    balanceXlm: balance,
    subentries: toCount(subentries),
    baseReserveXlm,
    reserveXlm,
    spendableXlm: Math.max(0, balance - reserveXlm - sellingLiabilitiesXlm),
    numSponsoring: toCount(options.numSponsoring),
    numSponsored: toCount(options.numSponsored),
    sellingLiabilitiesXlm,
  };
}

/**
 * Convenience wrapper: the maximum amount an account can move out while
 * keeping its required minimum reserve.
 */
export function calculateSpendableBalance(
  balanceXlm: number | string,
  subentries: number,
  options: ReserveCalculationOptions = {},
): number {
  return calculateReserveBreakdown(balanceXlm, subentries, options).spendableXlm;
}

/** Minimal shape of a Horizon account balance entry. */
interface HorizonAccountBalance {
  asset_type?: string;
  balance?: string;
  selling_liabilities?: string;
}

/**
 * Outcome of a Horizon account lookup:
 * - `active`: the account was loaded and the figures are authoritative.
 * - `unfunded`: Horizon returned 404, so the account does not exist on-chain yet.
 * - `unavailable`: Horizon errored or was unreachable; the reserve is unknown.
 */
export type StellarAccountStatus = "active" | "unfunded" | "unavailable";

/** Detailed Horizon account snapshot used for reserve-aware validation. */
export interface StellarAccountDetails {
  address: string;
  status: StellarAccountStatus;
  exists: boolean;
  balanceXlm: number;
  subentries: number;
  numSponsoring: number;
  numSponsored: number;
  trustlineCount: number;
  /** Native XLM committed to open sell offers; not spendable. */
  sellingLiabilitiesXlm: number;
  reserveXlm: number;
  spendableXlm: number;
}

/**
 * Fetches an account's native balance, subentry count, and sponsorship data from
 * Horizon so the UI can compute the locked reserve and spendable balance.
 * Returns a zeroed, non-existent snapshot when the account is unfunded (404,
 * `status: "unfunded"`) or Horizon cannot be reached (`status: "unavailable"`),
 * so callers can tell a genuinely empty account from unknown reserve data.
 */
export async function fetchStellarAccountDetails(address: string): Promise<StellarAccountDetails> {
  const empty = (status: StellarAccountStatus): StellarAccountDetails => ({
    address,
    status,
    exists: false,
    balanceXlm: 0,
    subentries: 0,
    numSponsoring: 0,
    numSponsored: 0,
    trustlineCount: 0,
    sellingLiabilitiesXlm: 0,
    reserveXlm: calculateAccountReserve(0),
    spendableXlm: 0,
  });

  try {
    const response = await fetch(`${STELLAR_CONFIG.horizonUrl}/accounts/${address}`);
    if (!response.ok) {
      return empty(response.status === 404 ? "unfunded" : "unavailable");
    }

    const data = (await response.json()) as {
      subentry_count?: number;
      num_sponsoring?: number;
      num_sponsored?: number;
      balances?: HorizonAccountBalance[];
    };
    const balances = data.balances ?? [];
    const nativeBalance = balances.find((b) => b.asset_type === "native");
    const balanceXlm = nativeBalance?.balance ? parseFloat(nativeBalance.balance) : 0;
    const sellingLiabilitiesXlm = nativeBalance?.selling_liabilities
      ? parseFloat(nativeBalance.selling_liabilities) || 0
      : 0;
    // Horizon reports the subentry total as `subentry_count`.
    const subentries = Number(data.subentry_count) || 0;
    const numSponsoring = Number(data.num_sponsoring) || 0;
    const numSponsored = Number(data.num_sponsored) || 0;
    const trustlineCount = balances.filter((b) => b.asset_type !== "native").length;
    const reserveXlm = calculateAccountReserve(subentries, { numSponsoring, numSponsored });

    return {
      address,
      status: "active",
      exists: true,
      balanceXlm,
      subentries,
      numSponsoring,
      numSponsored,
      trustlineCount,
      sellingLiabilitiesXlm,
      reserveXlm,
      spendableXlm: Math.max(0, balanceXlm - reserveXlm - sellingLiabilitiesXlm),
    };
  } catch (error) {
    console.warn("Error fetching Horizon account details:", error);
    return empty("unavailable");
  }
}

/**
 * Validates a Stellar ed25519 account id (`G...`) with its StrKey base32 and
 * CRC16 checksum, rejecting contract ids and format-only lookalikes.
 */
export function isValidStellarAccount(address: string): boolean {
  if (!address) return false;
  return StrKey.isValidEd25519PublicKey(address.trim());
}

/* -------------------------------------------------------------------------- */
/* Stellar Federation (SEP-0002) address resolution                           */
/* -------------------------------------------------------------------------- */

/** A parsed `username*domain.com` federation address. */
export interface ParsedFederatedAddress {
  username: string;
  domain: string;
}

/** A record returned by a SEP-0002 federation server. */
export interface FederatedAddressRecord {
  /** The federation address that was resolved (e.g. `alice*stormsale.io`). */
  federatedAddress: string;
  /** The resolved ed25519 Stellar account id (`G...`). */
  accountId: string;
  /** Memo type the recipient requires for payments (e.g. `id`, `text`, `hash`). */
  memoType?: string;
  /** Memo value the recipient requires, if any. */
  memo?: string;
}

/** Outcome of validating/resolving a recipient input field. */
export type RecipientResolutionStatus = "raw" | "federated" | "unresolved" | "invalid";

export interface RecipientResolution {
  status: RecipientResolutionStatus;
  /** Resolved ed25519 public key when `status` is `raw` or `federated`. */
  address?: string;
  /** The original federation address, only present when `status` is `federated`. */
  federatedAddress?: string;
  memoType?: string;
  memo?: string;
  /** Human readable reason when `status` is `unresolved` or `invalid`. */
  error?: string;
}

/** Options for federation lookups. */
export interface FederationResolutionOptions {
  /** Request timeout in milliseconds. */
  timeoutMs?: number;
  /** Override the federation server URL (normally discovered from stellar.toml). */
  federationServer?: string;
}

// `name*domain.tld` — username allows common email-ish characters, domain must have a dot.
const FEDERATION_ADDRESS_PATTERN =
  /^([a-z0-9](?:[a-z0-9._%+-]*[a-z0-9])?)\*([a-z0-9-]+(?:\.[a-z0-9-]+)+)$/i;

// Extract `FEDERATION_SERVER = "https://..."` from a stellar.toml document.
const FEDERATION_SERVER_TOML_PATTERN = /^\s*FEDERATION_SERVER\s*=\s*["']([^"']+)["']/im;

/**
 * Returns true when the value looks like a `username*domain.com` federation address.
 */
export function isFederatedAddress(value: string): boolean {
  if (!value) return false;
  return FEDERATION_ADDRESS_PATTERN.test(value.trim());
}

/**
 * Splits a federation address into its username and domain parts.
 * Returns `null` when the value is not a valid federation address.
 */
export function parseFederatedAddress(value: string): ParsedFederatedAddress | null {
  const match = value?.trim().match(FEDERATION_ADDRESS_PATTERN);
  if (!match) return null;
  return { username: match[1], domain: match[2].toLowerCase() };
}

/**
 * Performs a fetch with an abort-based timeout that stays active while the
 * response body is consumed, so federation lookups never hang the UI.
 */
async function fetchWithTimeout<T>(
  url: string,
  timeoutMs: number,
  read: (response: Response) => Promise<T>,
): Promise<{ response: Response; body: T }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: "application/json, text/plain, */*" },
    });
    const body = await read(response);
    return { response, body };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`Federation request timed out after ${timeoutMs} ms`, { cause: error });
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Discovers the SEP-0002 federation server for a domain by reading its
 * `/.well-known/stellar.toml` file.
 */
export async function discoverFederationServer(
  domain: string,
  timeoutMs: number = STELLAR_CONFIG.federationTimeoutMs,
): Promise<string> {
  const tomlUrl = `https://${domain}/.well-known/stellar.toml`;
  const { response, body: toml } = await fetchWithTimeout(tomlUrl, timeoutMs, (res) => res.text());
  if (!response.ok) {
    throw new Error(`Could not load stellar.toml for ${domain} (HTTP ${response.status})`);
  }

  const match = toml.match(FEDERATION_SERVER_TOML_PATTERN);
  const server = match?.[1]?.trim();
  if (!server) {
    throw new Error(`stellar.toml for ${domain} does not declare a FEDERATION_SERVER`);
  }
  return server;
}

/**
 * Resolves a `username*domain.com` federation address to its ed25519 public key
 * and any memo the recipient requires. Throws when the lookup fails so callers
 * can gracefully fall back to a raw public key.
 *
 * @see https://developers.stellar.org/docs/learn/encyclopedia/federation
 */
export async function resolveFederatedAddress(
  federatedAddress: string,
  options: FederationResolutionOptions = {},
): Promise<FederatedAddressRecord> {
  const parsed = parseFederatedAddress(federatedAddress);
  if (!parsed) {
    throw new Error(`Invalid federation address: ${federatedAddress}`);
  }

  const timeoutMs = options.timeoutMs ?? STELLAR_CONFIG.federationTimeoutMs;
  const serverUrl =
    options.federationServer ?? (await discoverFederationServer(parsed.domain, timeoutMs));

  let url: URL;
  try {
    url = new URL(serverUrl);
  } catch {
    throw new Error(`Invalid federation server URL: ${serverUrl}`);
  }
  // SEP-0002 requires HTTPS; FEDERATION_SERVER comes from an untrusted stellar.toml.
  if (url.protocol !== "https:") {
    throw new Error(`Federation server must use HTTPS: ${serverUrl}`);
  }
  url.search = "";
  url.searchParams.set("q", `${parsed.username}*${parsed.domain}`);
  url.searchParams.set("type", "name");

  const { response, body: data } = await fetchWithTimeout(
    url.toString(),
    timeoutMs,
    async (res) =>
      (await res.json().catch(() => null)) as {
        stellar_address?: string;
        account_id?: string;
        memo_type?: string;
        memo?: string | number;
      } | null,
  );
  if (!response.ok) {
    throw new Error(`Federation server responded with HTTP ${response.status}`);
  }

  const accountId = data?.account_id?.trim();
  if (!accountId || !isValidStellarAccount(accountId)) {
    throw new Error("Federation server did not return a valid ed25519 account id");
  }

  return {
    federatedAddress: data?.stellar_address?.trim() || `${parsed.username}*${parsed.domain}`,
    accountId,
    memoType: data?.memo_type,
    memo: data?.memo !== undefined && data?.memo !== null ? String(data.memo) : undefined,
  };
}

/**
 * Resolves a recipient input that may be either a raw `G...` public key or a
 * `username*domain.com` federation address. Never throws: an unreachable or
 * misconfigured federation server yields `{ status: "unresolved" }` so the UI
 * can fall back to raw public key entry.
 */
export async function resolveRecipient(
  input: string,
  options: FederationResolutionOptions = {},
): Promise<RecipientResolution> {
  const value = input?.trim() ?? "";
  if (!value) {
    return { status: "invalid", error: "Enter a Stellar public key or federation address." };
  }

  if (isValidStellarAccount(value)) {
    return { status: "raw", address: value };
  }

  if (!isFederatedAddress(value)) {
    return {
      status: "invalid",
      error: "Enter a valid G... public key or name*domain.com federation address.",
    };
  }

  try {
    const record = await resolveFederatedAddress(value, options);
    return {
      status: "federated",
      address: record.accountId,
      federatedAddress: record.federatedAddress,
      memoType: record.memoType,
      memo: record.memo,
    };
  } catch (error) {
    return {
      status: "unresolved",
      error: error instanceof Error ? error.message : "Federation lookup failed.",
    };
  }
}

/**
 * Helper to request friendbot testnet XLM funding for new testnet accounts.
 */
export async function fundTestnetAccount(address: string): Promise<boolean> {
  try {
    const response = await fetch(`https://friendbot.stellar.org?addr=${address}`);
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Returns a configured Soroban RPC Server instance from the active node in rpcFallbackManager.
 */
export function getSorobanRpcServer(): rpc.Server {
  return rpcFallbackManager.getActiveRpcServer();
}

/**
 * Core Soroban Contract Invocation Engine:
 * 1. Fetches caller account sequence from Soroban RPC.
 * 2. Builds preliminary transaction with contract call.
 * 3. Simulates transaction to resolve footprint, resource fees, and auth.
 * 4. Assembles transaction with simulation response.
 * 5. Signs transaction via active Stellar wallet (Freighter / Albedo / xBull).
 * 6. Submits to Soroban RPC and polls ledger until confirmed.
 */
export async function invokeSorobanMethod(
  callerAddress: string,
  methodName: string,
  scValArgs: xdr.ScVal[],
  walletType: WalletType = "freighter",
  contractIdOverride?: string,
): Promise<SorobanInvokeResult> {
  // If mock wallet is specified (e.g. automated tests or sandbox simulation), return simulated success
  if (walletType === "mock") {
    const mockHash =
      "0x" + Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join("");
    return {
      success: true,
      txHash: mockHash,
      resultValue: 1,
    };
  }

  const targetContractId = contractIdOverride || STELLAR_CONFIG.contractId;

  addErrorBreadcrumb("contract.invoke", `Invoking ${methodName}`, {
    method: methodName,
    contractId: targetContractId,
    walletType,
  });

  // 1-5. Fetch account, simulate and assemble transaction with silent RPC failover
  let preparedTx: any;
  try {
    const { preliminaryTx, simResponse } = await rpcFallbackManager.executeWithFallback(
      async (activeServer) => {
        const account = await activeServer.getAccount(callerAddress);
        const contract = new Contract(targetContractId);
        const callOp = contract.call(methodName, ...scValArgs);
        const preliminaryTx = new TransactionBuilder(account, {
          fee: BASE_FEE,
          networkPassphrase: STELLAR_CONFIG.networkPassphrase,
        })
          .addOperation(callOp)
          .setTimeout(60)
          .build();

        const simResponse = await activeServer.simulateTransaction(preliminaryTx);
        return { preliminaryTx, simResponse };
      },
    );

    if (rpc.Api.isSimulationError(simResponse)) {
      throw new Error(`Soroban simulation failed: ${simResponse.error}`);
    }

    preparedTx = rpc.assembleTransaction(preliminaryTx, simResponse).build();
  } catch (err: unknown) {
    throw new Error(
      `Soroban invocation preparation failed for ${callerAddress}: ${getErrorMessage(err, String(err))}. ` +
        `If the account is not funded on Testnet, use Friendbot to fund it first.`,
      { cause: err },
    );
  }

  // 6. Sign transaction via the active wallet (Freighter, Albedo, xBull)
  const signedXdr = await signWalletTransaction(preparedTx.toXDR(), walletType);
  const signedTx = TransactionBuilder.fromXDR(signedXdr, STELLAR_CONFIG.networkPassphrase);

  // 7. Submit transaction to Soroban RPC with silent fallback
  const sendResponse = await rpcFallbackManager.executeWithFallback(async (activeServer) => {
    return await activeServer.sendTransaction(signedTx);
  });
  if (sendResponse.status === "ERROR") {
    throw new Error(`Failed to submit transaction: ${JSON.stringify(sendResponse.errorResult)}`);
  }

  // 8. Poll for ledger confirmation with silent fallback
  const txHash = sendResponse.hash;
  let attempts = 0;
  const maxAttempts = 25;

  while (attempts < maxAttempts) {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    attempts++;

    const statusResponse = await rpcFallbackManager.executeWithFallback(async (activeServer) => {
      return await activeServer.getTransaction(txHash);
    });
    if (statusResponse.status === "SUCCESS") {
      let resultValue: any = null;
      if (statusResponse.returnValue) {
        try {
          resultValue = scValToNative(statusResponse.returnValue);
        } catch {
          resultValue = null;
        }
      }
      return {
        success: true,
        txHash,
        resultValue,
      };
    } else if (statusResponse.status === "FAILED") {
      throw new Error(
        `Soroban execution reverted on ledger. Check contract preconditions or balance.`,
      );
    }
  }

  throw new Error(
    `Transaction timed out awaiting confirmation after ${maxAttempts} attempts. Hash: ${txHash}`,
  );
}

/**
 * Creates an on-chain campaign with an XLM or SAC stablecoin (USDC, EURC) escrow deposit.
 */
export async function createCampaignContractCall(
  advertiserAddress: string,
  commissionRatePercent: number,
  clearingPeriodSecs: number,
  budgetAmount: number,
  walletType: WalletType = "freighter",
  assetCode: SupportedEscrowAssetCode = "XLM",
): Promise<{
  success: boolean;
  campaignId: number;
  txHash: string;
  asset: SupportedEscrowAssetCode;
  assetAddress: string;
}> {
  const assetConfig = SUPPORTED_ESCROW_ASSETS[assetCode] || SUPPORTED_ESCROW_ASSETS.XLM;
  const budgetStroops = parseUnitsToBigInt(budgetAmount, assetConfig.decimals);

  if (walletType === "mock" || advertiserAddress.startsWith("GASTORMSALE7")) {
    const mockHash =
      "0x" + Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join("");
    const campaignId = Math.floor(Math.random() * 9000) + 1000;
    return {
      success: true,
      campaignId,
      txHash: mockHash,
      asset: assetConfig.code,
      assetAddress: assetConfig.contractAddress,
    };
  }
  const rateBasisPoints = Math.floor(commissionRatePercent * 100);

  const args: xdr.ScVal[] = [
    new Address(advertiserAddress).toScVal(),
    nativeToScVal(rateBasisPoints, { type: "u32" }),
    nativeToScVal(clearingPeriodSecs, { type: "u32" }),
    nativeToScVal(budgetStroops, { type: "i128" }),
    new Address(assetConfig.contractAddress).toScVal(),
  ];

  const result = await stellarOperations.invokeSorobanMethod(
    advertiserAddress,
    "create_campaign",
    args,
    walletType,
  );
  const campaignId =
    typeof result.resultValue === "number"
      ? result.resultValue
      : Math.floor(Math.random() * 9000) + 1000;

  return {
    success: true,
    campaignId,
    txHash: result.txHash,
    asset: assetCode,
    assetAddress: assetConfig.contractAddress,
  };
}

/**
 * Logs an affiliate sale on-chain for a campaign.
 */
export async function logSaleContractCall(
  advertiserAddress: string,
  campaignId: number,
  affiliateAddress: string,
  saleAmountXlm: number,
  walletType: WalletType = "freighter",
): Promise<{ success: boolean; txHash: string }> {
  if (walletType === "mock" || advertiserAddress.startsWith("GASTORMSALE7")) {
    const mockHash =
      "0x" + Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join("");
    return {
      success: true,
      txHash: mockHash,
    };
  }

  const amountStroops = BigInt(Math.floor(saleAmountXlm * 1e7));

  const args: xdr.ScVal[] = [
    new Address(advertiserAddress).toScVal(),
    nativeToScVal(campaignId, { type: "u32" }),
    new Address(affiliateAddress).toScVal(),
    nativeToScVal(amountStroops, { type: "i128" }),
  ];

  const result = await invokeSorobanMethod(advertiserAddress, "log_sale", args, walletType);
  return {
    success: true,
    txHash: result.txHash,
  };
}

/**
 * Claims cleared affiliate commission from escrow in the campaign's settlement asset.
 */
export async function claimPayoutContractCall(
  affiliateAddress: string,
  campaignId: number,
  walletType: WalletType = "freighter",
  assetCode?: SupportedEscrowAssetCode,
): Promise<{
  success: boolean;
  txHash: string;
  asset?: SupportedEscrowAssetCode;
  assetAddress?: string;
}> {
  let resolvedAssetCode = assetCode;
  let resolvedAssetAddress = assetCode
    ? SUPPORTED_ESCROW_ASSETS[assetCode]?.contractAddress
    : undefined;

  // When not explicitly provided by the caller, attempt to query the campaign's settlement asset from contract storage
  if (!resolvedAssetCode && !affiliateAddress.startsWith("GASTORMSALE7") && walletType !== "mock") {
    try {
      const campaign = await getCampaignContractQuery(campaignId);
      if (campaign && campaign.asset) {
        const matched = Object.values(SUPPORTED_ESCROW_ASSETS).find(
          (a) => a.contractAddress.toLowerCase() === String(campaign.asset).toLowerCase(),
        );
        if (matched) {
          resolvedAssetCode = matched.code;
          resolvedAssetAddress = matched.contractAddress;
        }
      }
    } catch {
      // Ignore simulation/query error on unmocked non-network calls
    }
  }

  if (walletType === "mock" || affiliateAddress.startsWith("GASTORMSALE7")) {
    const mockHash =
      "0x" + Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join("");
    return {
      success: true,
      txHash: mockHash,
      ...(resolvedAssetCode && resolvedAssetAddress
        ? { asset: resolvedAssetCode, assetAddress: resolvedAssetAddress }
        : {}),
    };
  }
  const args: xdr.ScVal[] = [
    new Address(affiliateAddress).toScVal(),
    nativeToScVal(campaignId, { type: "u32" }),
  ];

  const result = await invokeSorobanMethod(affiliateAddress, "claim_payout", args, walletType);
  return {
    success: true,
    txHash: result.txHash,
    ...(resolvedAssetCode && resolvedAssetAddress
      ? { asset: resolvedAssetCode, assetAddress: resolvedAssetAddress }
      : {}),
  };
}

/**
 * Reads campaign metadata directly from Soroban contract storage.
 */
export async function getCampaignContractQuery(campaignId: number): Promise<any> {
  return rpcFallbackManager.executeWithFallback(async (server) => {
    const contract = new Contract(STELLAR_CONFIG.contractId);
    const dummyAccount = new Account(
      "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
      "0",
    );

    const tx = new TransactionBuilder(dummyAccount, {
      fee: BASE_FEE,
      networkPassphrase: STELLAR_CONFIG.networkPassphrase,
    })
      .addOperation(contract.call("get_campaign", nativeToScVal(campaignId, { type: "u32" })))
      .setTimeout(30)
      .build();

    const sim = await server.simulateTransaction(tx);
    if (rpc.Api.isSimulationSuccess(sim) && sim.result) {
      return scValToNative(sim.result.retval);
    }
    return null;
  });
}

/**
 * Queries the token allowance granted by owner to spender on Soroban SEP-41 / SAC.
 * Defaults spender to CAMPAIGN_ESCROW and token to NATIVE_XLM_SAC.
 */
export async function getTokenAllowanceQuery(
  ownerAddress: string,
  spenderAddress: string = CONTRACT_ADDRESSES.CAMPAIGN_ESCROW,
  tokenContractId: string = CONTRACT_ADDRESSES.NATIVE_XLM_SAC,
  decimals: number = 7,
): Promise<number> {
  if (!ownerAddress) return 0;

  // In mock environment or demo accounts
  if (
    ownerAddress.startsWith("GASTORMSALE7") ||
    ownerAddress === "mock" ||
    (typeof (globalThis as any).process !== "undefined" &&
      (globalThis as any).process?.env?.NODE_ENV === "test")
  ) {
    if (typeof window !== "undefined" && window.localStorage) {
      const mockVal = window.localStorage.getItem(
        `mock_allowance_${ownerAddress}_${spenderAddress}`,
      );
      if (mockVal !== null) return parseFloat(mockVal) || 0;
    }
    return 0;
  }

  try {
    return await rpcFallbackManager.executeWithFallback(async (server) => {
      const contract = new Contract(tokenContractId);
      const dummyAccount = new Account(
        "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
        "0",
      );

      const tx = new TransactionBuilder(dummyAccount, {
        fee: BASE_FEE,
        networkPassphrase: STELLAR_CONFIG.networkPassphrase,
      })
        .addOperation(
          contract.call(
            "allowance",
            new Address(ownerAddress).toScVal(),
            new Address(spenderAddress).toScVal(),
          ),
        )
        .setTimeout(30)
        .build();

      const sim = await server.simulateTransaction(tx);
      if (rpc.Api.isSimulationSuccess(sim) && sim.result) {
        const nativeVal = scValToNative(sim.result.retval);
        const divisor = Math.pow(10, decimals);
        const stroops = typeof nativeVal === "bigint" ? Number(nativeVal) : parseFloat(nativeVal);
        return Math.max(0, stroops / divisor);
      }
      return 0;
    });
  } catch (error) {
    console.warn("Failed to query token allowance:", error);
    if (typeof window !== "undefined" && window.localStorage) {
      const fallback = window.localStorage.getItem(
        `mock_allowance_${ownerAddress}_${spenderAddress}`,
      );
      if (fallback !== null) return parseFloat(fallback) || 0;
    }
    return 0;
  }
}

/**
 * Grants token allowance from advertiser to the Campaign Escrow contract.
 */
export async function approveTokenContractCall(
  ownerAddress: string,
  amount: number,
  spenderAddress: string = CONTRACT_ADDRESSES.CAMPAIGN_ESCROW,
  walletType: WalletType = "freighter",
  tokenContractId: string = CONTRACT_ADDRESSES.NATIVE_XLM_SAC,
  decimals: number = 7,
): Promise<{ success: boolean; txHash: string; allowance: number }> {
  if (!ownerAddress) throw new Error("Wallet not connected");
  if (amount <= 0) throw new Error("Approval amount must be greater than zero");

  if (
    walletType === "mock" ||
    ownerAddress.startsWith("GASTORMSALE7") ||
    (typeof (globalThis as any).process !== "undefined" &&
      (globalThis as any).process?.env?.NODE_ENV === "test")
  ) {
    const mockHash =
      "0x" + Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join("");
    if (typeof window !== "undefined" && window.localStorage) {
      window.localStorage.setItem(
        `mock_allowance_${ownerAddress}_${spenderAddress}`,
        amount.toString(),
      );
    }
    return {
      success: true,
      txHash: mockHash,
      allowance: amount,
    };
  }

  const amountStroops = parseUnitsToBigInt(amount, decimals);
  const liveUntilLedger = await getAllowanceExpirationLedger(
    stellarOperations.getSorobanRpcServer(),
  );

  const args: xdr.ScVal[] = [
    new Address(ownerAddress).toScVal(),
    new Address(spenderAddress).toScVal(),
    nativeToScVal(amountStroops, { type: "i128" }),
    nativeToScVal(liveUntilLedger, { type: "u32" }),
  ];

  const result = await stellarOperations.invokeSorobanMethod(
    ownerAddress,
    "approve",
    args,
    walletType,
    tokenContractId,
  );

  if (typeof window !== "undefined" && window.localStorage) {
    window.localStorage.setItem(
      `mock_allowance_${ownerAddress}_${spenderAddress}`,
      amount.toString(),
    );
  }

  return {
    success: true,
    txHash: result.txHash,
    allowance: amount,
  };
}

/**
 * Refunds remaining unused escrow balance from a completed or ended campaign back to advertiser.
 */
export async function refundCampaignEscrowContractCall(
  advertiserAddress: string,
  campaignId: number,
  walletType: WalletType = "freighter",
): Promise<{ success: boolean; txHash: string; refundedAmount?: number }> {
  if (walletType === "mock" || advertiserAddress.startsWith("GASTORMSALE7") || !advertiserAddress) {
    const mockHash =
      "0x" + Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join("");
    return {
      success: true,
      txHash: mockHash,
    };
  }

  const args: xdr.ScVal[] = [
    new Address(advertiserAddress).toScVal(),
    nativeToScVal(campaignId, { type: "u32" }),
  ];

  const result = await invokeSorobanMethod(advertiserAddress, "refund_escrow", args, walletType);
  return {
    success: true,
    txHash: result.txHash,
  };
}

/**
 * Mints an on-chain non-transferable soulbound achievement badge on Soroban / Stellar.
 * Badges cannot be transferred and cryptographically verify affiliate milestone sales volume.
 */
export async function mintMilestoneBadgeContractCall(
  affiliateAddress: string,
  milestoneTier: "1k" | "10k" | "100k",
  walletType: WalletType = "freighter",
): Promise<{ success: boolean; txHash: string; tokenId: string }> {
  if (!isValidStellarAccount(affiliateAddress)) {
    throw new Error("Invalid affiliate Stellar account address.");
  }

  const tierFormatted = milestoneTier.toUpperCase();

  // Mock transactions are for automated tests and demonstrations only.
  if (walletType === "mock") {
    const tokenId = `SBT-STORM-${tierFormatted}-${Math.random()
      .toString(36)
      .substring(2, 8)
      .toUpperCase()}`;

    const mockHash =
      "0x" +
      Array.from({ length: 64 }, () =>
        Math.floor(Math.random() * 16).toString(16),
      ).join("");

    return {
      success: true,
      txHash: mockHash,
      tokenId,
    };
  }

  const args: xdr.ScVal[] = [
    new Address(affiliateAddress).toScVal(),
    nativeToScVal(tierFormatted, { type: "symbol" }),
    nativeToScVal(true, { type: "bool" }),
  ];

  // Real wallet transactions must succeed on-chain.
  // Errors are allowed to propagate; never fabricate a successful transaction hash.
  const result = await stellarOperations.invokeSorobanMethod(
    affiliateAddress,
    "mint_milestone_badge",
    args,
    walletType,
  );

  return {
    success: result.success,
    txHash: result.txHash,
    tokenId: `SBT-STORM-${tierFormatted}-${result.txHash.slice(0, 8)}`,
  };
}