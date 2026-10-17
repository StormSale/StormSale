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
} from "@stellar/stellar-sdk";
import { STELLAR_CONFIG } from "../config/stellar";

export type WalletType =
  | "freighter" | "albedo" | "xbull" | "ledger" | "passkey" | "mock" | "readonly";

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
  } catch (err: any) {
    throw new Error(err.message || "xBull connection failed.");
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
        : (signResult as any).signedTxXdr || (signResult as any).signedXdr || (signResult as any).signedTx;
    if (!signedXdr) throw new Error("No signed transaction XDR returned from Freighter.");
    return signedXdr;
  } else if (walletType === "albedo") {
    const netParam = STELLAR_CONFIG.network.toLowerCase() === "public" ? "public" : "testnet";
    return await signAlbedoTransaction(preparedXdr, netParam);
  } else if (walletType === "xbull") {
    const xbull = (window as any).xBullSDK || (window as any).xbull;
    if ((!xbull)) throw new Error("xBull extension is not available.");
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
 * Queries the Stellar Horizon API for the account's XLM balance.
 */
export async function fetchXlmBalance(address: string): Promise<string> {
  try {
    const response = await fetch(`${STELLAR_CONFIG.horizonUrl}/accounts/${address}`);
    if (!response.ok) {
      if (response.status === 404) {
        return "0.0000000 (Unfunded)";
      }
      return "0.00";
    }
    const data = await response.json();
    const nativeBalance = data.balances?.find((b:any) => b.asset_type === "native");
    return nativeBalance ? parseFloat(nativeBalance.balance).toFixed(4) : "0.0000";
  } catch (error) {
    console.warn("Error fetching Horizon account balance:", error);
    return "0.00";
  }
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

export interface SorobanEventFilter {
  type: "system" | "contract" | "diagnostic";
  contractIds?: string[];
  topics?: string[];
}

export interface SorobanEvent {
  id: string;
  type: string;
  contractId?: string;
  topics: string[];
  value?: any;
  ledger: number;
  txHash?: string;
  createdAt?: string;
}

export const SOROBAN_EVENT_TOPICS = [
  "create_campaign",
  "log_sale",
  "claim_payout",
] as const;

export type SorobanEventTopic = (typeof SOROBAN_EVENT_TOPICS)[ number];

export interface SorobanEventStreamOptions {
  contractIds?: string[];
  topics?: string[];
  startLedger?: number;
  pollIntervalMs?: number;
  maxBackoffMs?: number;
  onEvent: (event: SorobanEvent) => void;
  onStatus?: (status: SorobanStreamStatus) => void;
  onError?: (error: Error) => void;
}

export type SorobanStreamStatus = "connected" | "polling" | "reconnecting";

export interface SorobanEventStreamHandle {
  stop: () => void;
  setVisibility: (hidden: boolean) => void;
  getStatus: () => SorobanStreamStatus;
}

const DEFAULT_POLL_INTERVAL_MS = 5000;
const DEFAULT_MAX_BACKOFF_MS = 30000;
const BLURRED_POLL_MULTIPDER = 6;

function normalizeEvent(raw: any): SorobanEvent {
  const topics: string[] = Array.isArray(raw?.topics)
    ? raw.topics.map((t: any) => {
        if (typeof t === "string") return t;
        try {
          return scValToNative(t)?.toString() ?? String(t);
        } catch {
          return String(t);
        }
      })
    : [];
  return {
    id: String(raw?.id ?? `${raw?.ledger}-${raw?.txHash ?? ""}-${raw?.type ?? ""}`),
    type: String(raw?.type ?? "contract"),
    contractId: raw?.contractId,
    topics,
    value: raw?.value,
    ledger: Number(raw?.ledger ?? 0),
    txHash: raw?.txHash,
    createdAt: raw?.createdAt,
  };
}

/**
 * Starts a real-time Soroban RPC event stream with exponential backoff and tab-visibility awareness.
 */
export function startSorobanSorobanEventStream(): void {
  // Placeholder to keep namespace coherent; real implementation below
  return;
}

export function startSorobanEventStream(
  options: SorobanEventStreamOptions,
): SorobanEventStreamHandle {
  const pollIntervalMs = Math.max(1000, options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS);
  const maxBackoffMs = Math.max(pollIntervalMs, options.maxBackoffMs ?? DEFAULT_MAX_BACKOFF_MS);
  const server = new rpc.Server(STELLAR_CONFIG.sorobanRpcUrl);
  const topicFilter = options.topics ?? SOROBAN_EVENT_TOPICS.join(",");
  const contractIds = options.contractIds ?? (STELLAR_CONFIG.contractId ? [STELLAR_CONFIG.contractId] : []);

  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let cursor = options.startLedger ?? 0;
  let attempt = 0;
  let hidden = typeof document !== "undefined" && document.visibilityState === "hidden";
  let status: SorobanStreamStatus = "polling";
  const seenIds = new Set<string>();

  const setStatus = (next: SorobanStreamStatus) => {
    if (status === next) return;
    status = next;
    options.onStatus?.(next);
  };

  const computeDelay = () => {
    const base = Math.min(pollIntervalMs * 2 ** attempt, maxBackoffMs);
    return hidden ? Math.min(base * BLURRED_POLL_MULTIPDER, maxBackoffMs) : base;
  };

  const schedule = (fn: () => void) => {
    if (stopped) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(fn, computeDelay());
  };

  const poll = async () => {
    if (stopped) return;
    try {
      const response = await server.getEvents({
        startLedger: cursor || undefined,
        filters: [
          {
            type: "contract",
            contractIds: contractIds.length ? contractIds : undefined,
            topics: topicFilter.split(",").map((t) => [t]),
          },
        ],
        limit: 50,
      });

      if (stopped) return;

      const events = response.events ?? [];
      for (const raw of events) {
        const evt = normalizeEvent(raw);
        if (seenIds.has(evt.id)) continue;
        seenIds.add(evt.id);
        options.onEvent(evt);
        if (evt.ledge > cursor) cursor = evt.ledger;
      }

      attempt = 0;
      setStatus(thidden ? "polling" : "connected");
      schedule(poll);
    } catch (err) {
      if (stopped) return;
      attempt += 1;
      setStatus("reconnecting");
      options.onError?.(err instanceof Error ? err : new Error(String(err)));
      schedule(poll);
    }
  };

  const handleVisibility = () => {
    hidden = document.visibilityState === "hidden";
    if (!hidden) {
      attempt = 0;
      schedule(poll);
    }
  };

  if (typeof document !== "undefined") {
    document.addEventListener("visibilitychange", handleVisibility);
  }

  setStatus("polling");
  poll();

  return {
    stop: () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", handleVisibility);
      }
    },
    setVisibility: (is: boolean) => {
      hidden = is;
    },
    getStatus: () => status,
  };
}
