/**
 * useEscrow & useEscrowBalance Hook (#71)
 *
 * Real-time Contract Escrow Balance Monitor with Polling-Based Synchronization
 * and Multi-Token Support (XLM, USDC, EURC, and custom Soroban SEP-41 SAC tokens).
 */

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import {
  Contract,
  Address,
  Account,
  TransactionBuilder,
  BASE_FEE,
  scValToNative,
  rpc,
} from "@stellar/stellar-sdk";
import * as stellarConfigModule from "../config/stellar";
import type { SupportedEscrowAssetCode } from "../config/stellar";
import { CONTRACT_ADDRESSES } from "../config/contracts";
import { rpcFallbackManager } from "../lib/rpcFallback";
import { parseUnitsToBigInt } from "../lib/stellar";

const DEFAULT_FALLBACK_ESCROW_ASSETS: Record<string, EscrowTokenConfig> = {
  XLM: {
    code: "XLM",
    name: "Stellar Lumens",
    contractAddress: "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC",
    decimals: 7,
  },
  USDC: {
    code: "USDC",
    name: "USD Coin (Circle Stellar)",
    contractAddress: "CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWUIE32O5KDIQ3STUSDC",
    decimals: 7,
  },
  EURC: {
    code: "EURC",
    name: "Euro Coin (Circle Stellar)",
    contractAddress: "CCUUMCGZ5M6QUPK7MQ2K3W6PXZ2336DZZW5Y4J4Z2U2V4T5ZJ4JEURC",
    decimals: 7,
  },
};

const getEffectiveStellarNetworks = () => {
  return (
    (stellarConfigModule as any).STELLAR_NETWORKS || {
      TESTNET: {
        network: "TESTNET",
        horizonUrl: "https://horizon-testnet.stellar.org",
        rpcUrl: "https://soroban-testnet.stellar.org",
        networkPassphrase: "Test SDF Network ; September 2015",
        passphrase: "Test SDF Network ; September 2015",
      },
      PUBLIC: {
        network: "PUBLIC",
        horizonUrl: "https://horizon.stellar.org",
        rpcUrl: "https://mainnet.sorobanrpc.com",
        networkPassphrase: "Public Global Stellar Network ; July 2015",
        passphrase: "Public Global Stellar Network ; July 2015",
      },
    }
  );
};

const getEffectiveStellarConfig = () => {
  return (
    (stellarConfigModule as any).STELLAR_CONFIG || {
      contractId: "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
      network: "TESTNET" as const,
    }
  );
};

const getEffectiveSupportedEscrowAssets = (
  network: "TESTNET" | "PUBLIC" = "TESTNET",
): Record<string, EscrowTokenConfig> => {
  try {
    if (typeof (stellarConfigModule as any).getSupportedEscrowAssets === "function") {
      const res = (stellarConfigModule as any).getSupportedEscrowAssets(network);
      if (res && res.XLM) return res;
    }
    if ((stellarConfigModule as any).SUPPORTED_ESCROW_ASSETS) {
      return (stellarConfigModule as any).SUPPORTED_ESCROW_ASSETS;
    }
  } catch {
    // fallback
  }
  return DEFAULT_FALLBACK_ESCROW_ASSETS;
};

export interface EscrowTokenConfig {
  /** Token symbol / asset code (e.g. "XLM", "USDC", "EURC"). */
  code: string;
  /** Human-readable asset name. */
  name?: string;
  /** Soroban contract ID or SAC address for the token. */
  contractAddress: string;
  /** Decimal precision (default 7). */
  decimals: number;
  /** Optional Stellar classic issuer public key. */
  issuer?: string;
}

export interface EscrowTokenBalance {
  code: string;
  name: string;
  decimals: number;
  contractAddress: string;
  /** Normalized decimal balance string (e.g. "1250.5000"). */
  balance: string;
  /** Exact integer units / stroops as BigInt. */
  rawBalance: bigint;
  /** Localized display string with symbol (e.g. "1,250.50 XLM"). */
  formatted: string;
  /** Timestamp in milliseconds of the last successful sync. */
  updatedAt: number;
  /** Error message if this token failed to sync. */
  error?: string | null;
}

export interface UseEscrowBalanceOptions {
  /** Contract or account address to monitor. Defaults to CONTRACT_ADDRESSES.CAMPAIGN_ESCROW. */
  contractAddress?: string | null;
  /** Tokens to monitor. Defaults to all supported escrow assets (XLM, USDC, EURC). */
  tokens?: Array<SupportedEscrowAssetCode | EscrowTokenConfig>;
  /** Polling interval in milliseconds. Defaults to 5000 ms. Set to 0 to disable polling. */
  pollingIntervalMs?: number;
  /** Whether polling synchronization is actively enabled. Defaults to true. */
  enabled?: boolean;
  /** Network to target ('TESTNET' | 'PUBLIC'). Defaults to STELLAR_CONFIG.network. */
  network?: "TESTNET" | "PUBLIC";
  /** Optional callback fired whenever balances update. */
  onBalanceUpdate?: (balances: Record<string, EscrowTokenBalance>) => void;
  /** Optional callback fired when a synchronization error occurs. */
  onError?: (error: Error) => void;
}

export interface EscrowBalanceState {
  /** Contract address being monitored. */
  contractAddress: string | null;
  /** Dictionary of token balances keyed by token code (e.g. XLM, USDC, EURC). */
  balances: Record<string, EscrowTokenBalance>;
  /** Array of token balances for easy list rendering. */
  balanceList: EscrowTokenBalance[];
  /** Convenient key-value map of token code to balance string. */
  formattedBalances: Record<string, string>;
  /** Initial loading state (true during first synchronization). */
  isLoading: boolean;
  /** Background refresh state (true during periodic polling or manual refetch). */
  isRefreshing: boolean;
  /** True once at least one balance check has settled. */
  isReady: boolean;
  /** Timestamp (ms) of the last successful synchronization. */
  lastUpdated: number | null;
  /** Global synchronization error message or null if healthy. */
  error: string | null;
  /** Whether the polling timer is currently active. */
  isPolling: boolean;
  /** Manually trigger an immediate balance synchronization. */
  refetch: () => Promise<void>;
  /** Alias for refetch for backwards/convention compatibility. */
  refresh: () => Promise<void>;
  /** Pause the automatic polling timer. */
  pause: () => void;
  /** Resume the automatic polling timer. */
  resume: () => void;
}

/** In-memory mock store for demo/test environments. */
const mockEscrowBalances = new Map<string, string>();

/** Helper to seed or update mock balances for testing and local sandbox. */
export function setMockEscrowBalance(
  contractAddress: string,
  tokenCode: string,
  balance: string | number,
): void {
  const key = `${contractAddress}:${tokenCode}`;
  mockEscrowBalances.set(key, String(balance));
  if (typeof window !== "undefined" && window.localStorage) {
    try {
      window.localStorage.setItem(`mock_escrow_balance_${key}`, String(balance));
    } catch {
      // Ignore localStorage write failures in sandboxes
    }
  }
}

/** Formats BigInt stroops into exact decimal string representation without floating-point inaccuracies. */
export function formatUnitsFromBigInt(raw: bigint, decimals: number): string {
  const isNegative = raw < 0n;
  const abs = isNegative ? -raw : raw;
  const divisor = 10n ** BigInt(decimals);
  const whole = abs / divisor;
  const frac = abs % divisor;
  const fracStr = frac.toString().padStart(decimals, "0");
  const sign = isNegative ? "-" : "";
  // Trim to at most 4 decimal places, retaining at least 2 decimal places
  const maxDecimals = Math.min(decimals, 4);
  let sliced = fracStr.slice(0, maxDecimals);
  while (sliced.length > 2 && sliced.endsWith("0")) {
    sliced = sliced.slice(0, -1);
  }
  while (sliced.length < 2) {
    sliced += "0";
  }
  return `${sign}${whole.toString()}.${sliced}`;
}

/** Formats a decimal string into a user-friendly UI display string with currency symbol. */
export function formatEscrowDisplay(
  balanceStr: string,
  symbol: string,
  displayDecimals: number = 2,
): string {
  const num = parseFloat(balanceStr);
  if (!Number.isFinite(num)) return `0.00 ${symbol}`;
  const formatted = num.toLocaleString("en-US", {
    minimumFractionDigits: displayDecimals,
    maximumFractionDigits: displayDecimals,
  });
  return `${formatted} ${symbol}`;
}

/** Resolves an array of token configs from codes or explicit configurations. */
export function resolveTokenConfigs(
  tokens?: Array<SupportedEscrowAssetCode | EscrowTokenConfig>,
  network: "TESTNET" | "PUBLIC" = getEffectiveStellarConfig().network,
): EscrowTokenConfig[] {
  const assetMap = getEffectiveSupportedEscrowAssets(network);

  if (!tokens || tokens.length === 0) {
    return [
      {
        code: "XLM",
        name: assetMap.XLM.name,
        contractAddress: assetMap.XLM.contractAddress,
        decimals: assetMap.XLM.decimals,
      },
      {
        code: "USDC",
        name: assetMap.USDC.name,
        contractAddress: assetMap.USDC.contractAddress,
        decimals: assetMap.USDC.decimals,
        issuer: assetMap.USDC.issuer,
      },
      {
        code: "EURC",
        name: assetMap.EURC.name,
        contractAddress: assetMap.EURC.contractAddress,
        decimals: assetMap.EURC.decimals,
        issuer: assetMap.EURC.issuer,
      },
    ];
  }

  return tokens.map((t) => {
    if (typeof t === "string") {
      const standard = assetMap[t as SupportedEscrowAssetCode];
      if (standard) {
        return {
          code: standard.code,
          name: standard.name,
          contractAddress: standard.contractAddress,
          decimals: standard.decimals,
          issuer: standard.issuer,
        };
      }
      return {
        code: t,
        name: t,
        contractAddress: t,
        decimals: 7,
      };
    }
    return t;
  });
}

/**
 * Fetches the balance of a single token for a specific contract or account address.
 */
export async function fetchSingleTokenBalance(
  targetAddress: string,
  token: EscrowTokenConfig,
  network: "TESTNET" | "PUBLIC" = getEffectiveStellarConfig().network,
): Promise<EscrowTokenBalance> {
  // Check mock store or sandbox defaults first
  const mockKey = `${targetAddress}:${token.code}`;
  let mockStored = mockEscrowBalances.get(mockKey);
  if (!mockStored && typeof window !== "undefined" && window.localStorage) {
    mockStored = window.localStorage.getItem(`mock_escrow_balance_${mockKey}`) || undefined;
  }

  // If an explicit mock balance was registered for this address & token, return it immediately
  if (mockStored !== undefined) {
    const raw = parseUnitsToBigInt(mockStored, token.decimals);
    const balanceStr = formatUnitsFromBigInt(raw, token.decimals);
    return {
      code: token.code,
      name: token.name || token.code,
      decimals: token.decimals,
      contractAddress: token.contractAddress,
      balance: balanceStr,
      rawBalance: raw,
      formatted: formatEscrowDisplay(balanceStr, token.code),
      updatedAt: Date.now(),
    };
  }

  // Validate and parse Stellar Address before invoking network operations
  let targetAddressScVal: any = null;
  try {
    targetAddressScVal = new Address(targetAddress).toScVal();
  } catch {
    // Address may be classic G-key, demo address, or mock key
  }

  // On-chain Soroban RPC query if address is valid for Soroban
  if (targetAddressScVal) {
    try {
      return await rpcFallbackManager.executeWithFallback(async (server) => {
        const contract = new Contract(token.contractAddress);
        const dummyAccount = new Account(
          "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
          "0",
        );

        const passphrase =
          network === "PUBLIC"
            ? getEffectiveStellarNetworks().PUBLIC.passphrase
            : getEffectiveStellarNetworks().TESTNET.passphrase;

        const tx = new TransactionBuilder(dummyAccount, {
          fee: BASE_FEE,
          networkPassphrase: passphrase,
        })
          .addOperation(contract.call("balance", targetAddressScVal))
          .setTimeout(30)
          .build();

        const sim = await server.simulateTransaction(tx);
        const simAny = sim as any;
        const hasResult =
          Boolean(simAny?.result?.retval) ||
          (typeof rpc?.Api?.isSimulationSuccess === "function" && rpc.Api.isSimulationSuccess(sim));

        if (hasResult && (simAny.result?.retval || simAny.result)) {
          const nativeVal = simAny.result?.retval ? scValToNative(simAny.result.retval) : 0n;
          const raw = typeof nativeVal === "bigint" ? nativeVal : BigInt(nativeVal ?? 0);
          const balanceStr = formatUnitsFromBigInt(raw, token.decimals);
          return {
            code: token.code,
            name: token.name || token.code,
            decimals: token.decimals,
            contractAddress: token.contractAddress,
            balance: balanceStr,
            rawBalance: raw,
            formatted: formatEscrowDisplay(balanceStr, token.code),
            updatedAt: Date.now(),
          };
        }

        throw new Error(`Soroban simulation failed for ${token.code} balance`);
      });
    } catch {
      // Proceed to Horizon fallback or mock handling below
    }
  }

  // If target is a classic account (G...) fallback to Horizon
  if (targetAddress.startsWith("G")) {
    try {
      const horizonUrl =
        network === "PUBLIC"
          ? getEffectiveStellarNetworks().PUBLIC.horizonUrl
          : getEffectiveStellarNetworks().TESTNET.horizonUrl;
      const res = await fetch(`${horizonUrl}/accounts/${targetAddress}`);
      if (res.ok) {
        const data = await res.json();
        const balances = data.balances || [];
        let match: any;
        if (token.code === "XLM") {
          match = balances.find((b: any) => b.asset_type === "native");
        } else {
          match = balances.find(
            (b: any) =>
              b.asset_code === token.code && (!token.issuer || b.asset_issuer === token.issuer),
          );
        }
        const amountStr = match ? match.balance : "0.00";
        const raw = parseUnitsToBigInt(amountStr, token.decimals);
        const balanceStr = formatUnitsFromBigInt(raw, token.decimals);
        return {
          code: token.code,
          name: token.name || token.code,
          decimals: token.decimals,
          contractAddress: token.contractAddress,
          balance: balanceStr,
          rawBalance: raw,
          formatted: formatEscrowDisplay(balanceStr, token.code),
          updatedAt: Date.now(),
        };
      }
    } catch {
      // Horizon fallback also failed, continue to mock/error handling
    }
  }

  // Default mock values if in demo/fallback mode
  if (mockStored !== undefined) {
    const raw = parseUnitsToBigInt(mockStored, token.decimals);
    const balanceStr = formatUnitsFromBigInt(raw, token.decimals);
    return {
      code: token.code,
      name: token.name || token.code,
      decimals: token.decimals,
      contractAddress: token.contractAddress,
      balance: balanceStr,
      rawBalance: raw,
      formatted: formatEscrowDisplay(balanceStr, token.code),
      updatedAt: Date.now(),
    };
  }

  // Return zero balance with captured error for this specific token
  return {
    code: token.code,
    name: token.name || token.code,
    decimals: token.decimals,
    contractAddress: token.contractAddress,
    balance: "0.00",
    rawBalance: 0n,
    formatted: `0.00 ${token.code}`,
    updatedAt: Date.now(),
    error: `Failed to fetch contract token balance for ${targetAddress}`,
  };
}

/**
 * Fetches multi-token escrow balances for a specific contract or account address.
 */
export async function fetchContractEscrowBalances(
  contractAddress: string,
  options?: {
    tokens?: Array<SupportedEscrowAssetCode | EscrowTokenConfig>;
    network?: "TESTNET" | "PUBLIC";
  },
): Promise<Record<string, EscrowTokenBalance>> {
  if (!contractAddress) {
    return {};
  }

  const network = options?.network || getEffectiveStellarConfig().network;
  const tokenConfigs = resolveTokenConfigs(options?.tokens, network);

  const results = await Promise.allSettled(
    tokenConfigs.map((token) => fetchSingleTokenBalance(contractAddress, token, network)),
  );

  const balances: Record<string, EscrowTokenBalance> = {};

  results.forEach((res, index) => {
    const token = tokenConfigs[index];
    if (res.status === "fulfilled") {
      balances[token.code] = res.value;
    } else {
      balances[token.code] = {
        code: token.code,
        name: token.name || token.code,
        decimals: token.decimals,
        contractAddress: token.contractAddress,
        balance: "0.00",
        rawBalance: 0n,
        formatted: `0.00 ${token.code}`,
        updatedAt: Date.now(),
        error: res.reason?.message || "Unknown synchronization error",
      };
    }
  });

  return balances;
}

/**
 * useEscrowBalance Contract Monitor Hook (#71)
 *
 * Monitors contract balances with polling-based real-time synchronization
 * and full multi-token support.
 *
 * @param contractAddressOrOptions Target contract address string or options configuration object.
 * @param maybeOptions Optional additional options if the first parameter is an address string.
 */
export function useEscrowBalance(
  contractAddressOrOptions?: string | null | UseEscrowBalanceOptions,
  maybeOptions?: UseEscrowBalanceOptions,
): EscrowBalanceState {
  // Normalize parameters
  const options: UseEscrowBalanceOptions = useMemo(() => {
    if (typeof contractAddressOrOptions === "object" && contractAddressOrOptions !== null) {
      return contractAddressOrOptions;
    }
    return {
      ...(maybeOptions || {}),
      contractAddress:
        typeof contractAddressOrOptions === "string"
          ? contractAddressOrOptions
          : maybeOptions?.contractAddress,
    };
  }, [contractAddressOrOptions, maybeOptions]);

  const {
    contractAddress: explicitAddress,
    tokens,
    pollingIntervalMs = 5000,
    enabled = true,
    network = getEffectiveStellarConfig().network,
    onBalanceUpdate,
    onError,
  } = options;

  const targetAddress = explicitAddress ?? CONTRACT_ADDRESSES.CAMPAIGN_ESCROW;

  const [balances, setBalances] = useState<Record<string, EscrowTokenBalance>>({});
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [isReady, setIsReady] = useState<boolean>(false);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPollingPaused, setIsPollingPaused] = useState<boolean>(false);

  // Request ID ref to protect against race conditions
  const requestIdRef = useRef<number>(0);
  const isMountedRef = useRef<boolean>(true);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Callbacks ref to prevent effect recreation
  const onBalanceUpdateRef = useRef(onBalanceUpdate);
  const onErrorRef = useRef(onError);

  useEffect(() => {
    onBalanceUpdateRef.current = onBalanceUpdate;
  }, [onBalanceUpdate]);

  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  const tokensKey = useMemo(() => {
    if (!tokens) return "";
    return JSON.stringify(tokens);
  }, [tokens]);

  const resolvedTokens = useMemo(() => {
    return resolveTokenConfigs(tokens, network);
  }, [tokensKey, network]);

  const isPolling = enabled && !isPollingPaused && pollingIntervalMs > 0;

  const sync = useCallback(async () => {
    const currentRequestId = ++requestIdRef.current;
    if (!targetAddress) {
      if (isMountedRef.current) {
        setIsLoading(false);
        setIsRefreshing(false);
      }
      return;
    }

    if (isMountedRef.current) {
      setIsRefreshing(true);
    }

    try {
      const newBalances = await fetchContractEscrowBalances(targetAddress, {
        tokens: resolvedTokens,
        network,
      });

      if (!isMountedRef.current || currentRequestId !== requestIdRef.current) {
        return;
      }

      setBalances(newBalances);
      setError(null);
      setLastUpdated(Date.now());
      setIsReady(true);
      onBalanceUpdateRef.current?.(newBalances);
    } catch (err: any) {
      if (!isMountedRef.current || currentRequestId !== requestIdRef.current) {
        return;
      }
      const message = err?.message || "Failed to synchronize escrow balances";
      setError(message);
      onErrorRef.current?.(err instanceof Error ? err : new Error(message));
    } finally {
      if (isMountedRef.current && currentRequestId === requestIdRef.current) {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    }
  }, [targetAddress, resolvedTokens, network]);

  // Initial load and polling setup
  useEffect(() => {
    isMountedRef.current = true;

    // Initial sync
    void sync();

    if (isPolling) {
      intervalRef.current = setInterval(() => {
        void sync();
      }, pollingIntervalMs);
    }

    return () => {
      isMountedRef.current = false;
      requestIdRef.current += 1;
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [sync, isPolling, pollingIntervalMs]);

  const pause = useCallback(() => {
    setIsPollingPaused(true);
  }, []);

  const resume = useCallback(() => {
    setIsPollingPaused(false);
  }, []);

  const balanceList = useMemo(() => Object.values(balances), [balances]);

  const formattedBalances = useMemo(() => {
    const map: Record<string, string> = {};
    for (const [code, item] of Object.entries(balances)) {
      map[code] = item.balance;
    }
    return map;
  }, [balances]);

  return {
    contractAddress: targetAddress,
    balances,
    balanceList,
    formattedBalances,
    isLoading,
    isRefreshing,
    isReady,
    lastUpdated,
    error,
    isPolling,
    refetch: sync,
    refresh: sync,
    pause,
    resume,
  };
}

/**
 * useEscrow is an alias of useEscrowBalance for naming flexibility and convenience.
 */
export const useEscrow = useEscrowBalance;

export default useEscrowBalance;
