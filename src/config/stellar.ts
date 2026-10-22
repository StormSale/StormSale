/**
 * Stellar & Soroban Network Configuration for StormSale
 */
import { Asset, Networks } from "@stellar/stellar-sdk";

export const STELLAR_CONFIG = {
  network: (import.meta.env.VITE_STELLAR_NETWORK as "TESTNET" | "PUBLIC") || "TESTNET",
  networkPassphrase:
    import.meta.env.VITE_STELLAR_NETWORK_PASSPHRASE || "Test SDF Network ; September 2015",
  rpcUrl: import.meta.env.VITE_STELLAR_RPC_URL || "https://soroban-testnet.stellar.org",
  horizonUrl: import.meta.env.VITE_STELLAR_HORIZON_URL || "https://horizon-testnet.stellar.org",
  explorerUrl: "https://stellar.expert/explorer/testnet",

  // Deployed Soroban Contract ID on Stellar Testnet
  contractId:
    import.meta.env.VITE_STORMSALE_CONTRACT_ID ||
    "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",

  nativeAsset: "XLM",
  nativeDecimals: 7,
};

export interface EscrowAsset {
  code: "XLM" | "USDC" | "EURC";
  name: string;
  decimals: number;
  contractAddress: string;
  issuer?: string;
}

/**
 * Authoritative Circle stablecoin issuer addresses on Stellar (Mainnet & Testnet).
 * Sourced directly from Circle's official documentation:
 * https://developers.circle.com/stablecoins/docs/stellar
 *
 * TESTNET:
 * - USDC Issuer: GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5
 * - EURC Issuer: GB3Q6QDZYTHWT7E5PVS3W7FUT5GVAFC5KSZFFLPU25GO7VTC3NM2ZTVO
 *
 * PUBLIC (Mainnet):
 * - USDC Issuer: GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN
 * - EURC Issuer: GDHU6WRG4IEQXM5NZ4BMPKOXHW76MZM4Y2IEMFDVXBSDP6SJY4ITNPP2
 */
export const ISSUERS = {
  TESTNET: {
    USDC: "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
    EURC: "GB3Q6QDZYTHWT7E5PVS3W7FUT5GVAFC5KSZFFLPU25GO7VTC3NM2ZTVO",
  },
  PUBLIC: {
    USDC: "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN",
    EURC: "GDHU6WRG4IEQXM5NZ4BMPKOXHW76MZM4Y2IEMFDVXBSDP6SJY4ITNPP2",
  },
} as const;

export const NETWORK_ESCROW_ASSETS = {
  TESTNET: {
    USDC: {
      contractAddress: new Asset("USDC", ISSUERS.TESTNET.USDC).contractId(Networks.TESTNET),
      issuer: ISSUERS.TESTNET.USDC,
    },
    EURC: {
      contractAddress: new Asset("EURC", ISSUERS.TESTNET.EURC).contractId(Networks.TESTNET),
      issuer: ISSUERS.TESTNET.EURC,
    },
  },
  PUBLIC: {
    USDC: {
      contractAddress: new Asset("USDC", ISSUERS.PUBLIC.USDC).contractId(Networks.PUBLIC),
      issuer: ISSUERS.PUBLIC.USDC,
    },
    EURC: {
      contractAddress: new Asset("EURC", ISSUERS.PUBLIC.EURC).contractId(Networks.PUBLIC),
      issuer: ISSUERS.PUBLIC.EURC,
    },
  },
} as const;

export function getSupportedEscrowAssets(
  network: "TESTNET" | "PUBLIC" = STELLAR_CONFIG.network,
): Record<"XLM" | "USDC" | "EURC", EscrowAsset> {
  const net = network === "PUBLIC" ? "PUBLIC" : "TESTNET";
  const passphrase = net === "PUBLIC" ? Networks.PUBLIC : Networks.TESTNET;
  return {
    XLM: {
      code: "XLM",
      name: "Stellar Lumens",
      decimals: 7,
      contractAddress: Asset.native().contractId(passphrase),
    },
    USDC: {
      code: "USDC",
      name: "USD Coin (Circle SAC)",
      decimals: 7,
      contractAddress: new Asset("USDC", ISSUERS[net].USDC).contractId(passphrase),
      issuer: ISSUERS[net].USDC,
    },
    EURC: {
      code: "EURC",
      name: "Euro Coin (Circle SAC)",
      decimals: 7,
      contractAddress: new Asset("EURC", ISSUERS[net].EURC).contractId(passphrase),
      issuer: ISSUERS[net].EURC,
    },
  };
}

export const SUPPORTED_ESCROW_ASSETS: Record<"XLM" | "USDC" | "EURC", EscrowAsset> =
  getSupportedEscrowAssets(STELLAR_CONFIG.network);

export type SupportedEscrowAssetCode = keyof typeof SUPPORTED_ESCROW_ASSETS;

export const STELLAR_NETWORKS = {
  TESTNET: {
    name: "Testnet",
    passphrase: "Test SDF Network ; September 2015",
    rpcUrl: "https://soroban-testnet.stellar.org",
    horizonUrl: "https://horizon-testnet.stellar.org",
  },
  PUBLIC: {
    name: "Public (Mainnet)",
    passphrase: "Public Global Stellar Network ; September 2015",
    rpcUrl: "https://soroban-rpc.mainnet.stellar.org",
    horizonUrl: "https://horizon.stellar.org",
  },
};

/**
 * SEP-0007 URI scheme helpers for universal mobile wallet invocations.
 * @see https://github.com/stellar/stellar-protocol/blob/master/ecosystem/sep-0007.md
 */
export const SEP0007_SCHEME = "web+stellar" as const;

export type Sep0007Operation = "tx" | "pay";

export interface Sep0007TxParams {
  xdr: string;
  replace?: boolean;
  callback?: string;
  msg?: string;
  networkPassphrase?: string;
  originDomain?: string;
  signature?: string;
}

export interface Sep0007UriOptions {
  /** Override the network passphrase embedded in the URI (defaults to STELLAR_CONFIG). */
  networkPassphrase?: string;
  /** Optional callback URL for wallets to POST the signed XDR to. */
  callback?: string;
  /** Optional human-readable message shown in the wallet. */
  msg?: string;
  /** Whether the wallet should replace an existing transaction (defaults to false). */
  replace?: boolean;
  /** Optional origin domain for the request. */
  originDomain?: string;
}

/**
 * Build a SEP-0007 `web+stellar:tx?xdr=...&replace=false` deep link.
 *
 * @param xdr Base64-encoded transaction envelope XDR.
 * @param options Optional SEP-0007 parameters.
 * @returns A fully-formed `web+stellar:tx` URI suitable for deep-linking.
 */
export function buildSep0007TxUri(xdr: string, options: Sep0007UriOptions = {}): string {
  if (!xdr || typeof xdr !== "string") {
    throw new Error("buildSep0007TxUri: xdr must be a non-empty base64 string");
  }

  const params = new URLSearchParams();
  params.set("xdr", xdr);
  params.set("replace", String(options.replace ?? false));

  if (options.callback) params.set("callback", options.callback);
  if (options.msg) params.set("msg", options.msg);
  if (options.originDomain) params.set("origin_domain", options.originDomain);

  const passphrase = options.networkPassphrase ?? STELLAR_CONFIG.networkPassphrase;
  if (passphrase) params.set("network_passphrase", passphrase);

  return `${SEP0007_SCHEME}:tx?${params.toString()}`;
}

/**
 * Build a SEP-0007 `web+stellar:pay` URI for simple payment requests.
 */
export function buildSep0007PayUri(
  destination: string,
  amount: string,
  assetCode: string = "XLM",
  assetIssuer?: string,
  options: Sep0007UriOptions = {},
): string {
  if (!destination) {
    throw new Error("buildSep0007PayUri: destination is required");
  }

  const params = new URLSearchParams();
  params.set("destination", destination);
  params.set("amount", amount);
  params.set("asset_code", assetCode);
  if (assetIssuer) params.set("asset_issuer", assetIssuer);
  if (options.msg) params.set("msg", options.msg);
  if (options.callback) params.set("callback", options.callback);
  if (options.originDomain) params.set("origin_domain", options.originDomain);

  return `${SEP0007_SCHEME}:pay?${params.toString()}`;
}

/**
 * Detect whether the current environment is likely a mobile device capable of
 * handling `web+stellar:` deep links. Used to decide whether to surface the
 * "Sign with SEP-0007 Mobile Wallet" option in the connect modal.
 */
export function isMobileWalletEnvironment(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  return /Android|iPhone|iPad|iPod|Mobile/i.test(ua);
}

/**
 * Open a SEP-0007 URI, preferring a direct navigation (which triggers the OS
 * deep-link handler) and falling back to a new tab on desktop browsers.
 */
export function openSep0007Uri(uri: string): void {
  if (typeof window === "undefined") {
    throw new Error("openSep0007Uri: window is not available in this environment");
  }
  window.location.href = uri;
}
