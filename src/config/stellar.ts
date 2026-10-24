import { Asset, Networks } from "@stellar/stellar-sdk";

/**
 * Stellar & Soroban Network Configuration for StormSale
 */
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
    "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",

  nativeAsset: "XLM",
  nativeDecimals: 7,

  // Timeout for stellar.toml discovery and federation server lookups (ms).
  federationTimeoutMs: 8000,
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
 * - USDC Issuer: GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NATDAQH3ZLLFLA5
 * - EURC Issuer: GB3Q6QDZYTHWT7E5PVS3W7FUT5GVAFC5KSZFFLPU25GO7VTC3NM2ZTVO
 *
 * PUBLIC (Mainnet):
 * - USDC Issuer: GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPPPRE34K4KZVN
 * - EURC Issuer: GDHU6WRG4IEQXM5NZ4BMPGOXHW76MZM4Y2IEMFDVXBSDP6SJY4ITNPP2
 */
export const ISSUERS = {
  TESTNET: {
    USDC: "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NATDAQH3ZLLFLA5",
    EURC: "GB3Q6QDZYTHWT7E5PVS3W7FUT5GVAFC5KSZFFLPU25GO7VTC3NM2ZTVO",
  },
  PUBLIC: {
    USDC: "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPPPRE34K4KZVN",
    EURC: "GDHU6WRG4IEQXM5NZ4BMPGOXHW76MZM4Y2IEMFDVXBSDP6SJY4ITNPP2",
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
 * SEP-0024 Hosted Deposit and Withdrawal (Anchor) configuration.
 *
 * SEP-0024 defines a standard way for wallets to discover and interact with
 * anchors that provide fiat on/off-ramps. The wallet fetches the anchor's
 * `stellar.toml` (via `TRANSFER_SERVER_SEP024`), then drives the interactive
 * withdrawal flow through the anchor's popup UI.
 *
 * @see https://github.com/stellar/stellar-protocol/blob/master/ecosystem/sep-0024.md
 */
export interface Sep24AnchorConfig {
  /** Human-readable anchor name shown in the payout UI. */
  name: string;
  /** Anchor home domain used to resolve `stellar.toml`. */
  homeDomain: string;
  /** Optional explicit override for the SEP-0024 transfer server URL. */
  transferServerSep24?: string;
  /** Fiat currencies this anchor supports for off-ramp payouts. */
  supportedFiat: readonly string[];
  /** Stellar assets accepted by the anchor for withdrawal. */
  supportedAssets: readonly SupportedEscrowAssetCode[];
}

/**
 * Default SEP-0024 anchors used for fiat payouts.
 *
 * These are reference anchors; production deployments should override via
 * `VITE_SEP24_ANCHORS` (JSON array) so operators can point at anchors that
 * serve their region without a code change.
 */
export const SEP24_ANCHORS: readonly Sep24AnchorConfig[] = (() => {
  const raw = import.meta.env.VITE_SEP24_ANCHORS as string | undefined;
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as Sep24AnchorConfig[];
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    } catch {
      // Fall through to defaults on malformed config.
    }
  }
  return [
    {
      name: "Stellar Anchor (Testnet)",
      homeDomain: "testanchor.stellar.org",
      transferServerSep24: "https://testanchor.stellar.org/sep24",
      supportedFiat: ["USD", "EUR"],
      supportedAssets: ["USDC", "EURC"],
    },
  ];
})();

/**
 * Resolve the SEP-0024 transfer server URL for an anchor by fetching its
 * `stellar.toml` and reading the `TRANSFER_SERVER_SEP0024` field.
 *
 * Callers should prefer the explicit `transferServerSep24` when provided to
 * avoid an extra network round-trip.
 */
export function getSep24TransferServer(anchor: Sep24AnchorConfig): string {
  if (anchor.transferServerSep24) {
    return anchor.transferServerSep24;
  }
  return `https://${anchor.homeDomain}/sep24`;
}

/**
 * Look up the configured SEP-0024 anchor that supports a given fiat currency
 * and Stellar asset. Returns `undefined` when no anchor can service the pair.
 */
export function findSep24Anchor(
  fiat: string,
  asset: SupportedEscrowAssetCode,
): Sep24AnchorConfig | undefined {
  const normalizedFiat = fiat.toUpperCase();
  return SEP24_ANCHORS.find(
    (anchor) =>
      anchor.supportedFiat.includes(normalizedFiat) &&
      anchor.supportedAssets.includes(asset),
  );
}
