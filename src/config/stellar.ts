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
    "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",

  nativeAsset: "XLM",
  nativeDecimals: 7,

  // Stellar protocol base reserve (XLM).
  // The minimum account reserve is (2 + subentries) * baseReserveXlm,
  // i.e. 1 XLM base + 0.5 XLM for every additional subentry.
  baseReserveXlm: 0.5,
  // Timeout for stellar.toml discovery and federation server lookups (ms).
  federationTimeoutMs: 8000,
};

import { Asset, Networks } from "@stellar/stellar-sdk";

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

function deriveContractId(asset: Asset, passphrase: string, fallback: string): string {
  try {
    return asset.contractId(passphrase);
  } catch {
    return fallback;
  }
}

export const NETWORK_ESCROW_ASSETS = {
  TESTNET: {
    USDC: {
      contractAddress: deriveContractId(
        new Asset("USDC", ISSUERS.TESTNET.USDC),
        Networks.TESTNET,
        "CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA",
      ),
      issuer: ISSUERS.TESTNET.USDC,
    },
    EURC: {
      contractAddress: deriveContractId(
        new Asset("EURC", ISSUERS.TESTNET.EURC),
        Networks.TESTNET,
        "CCUUDM434BMZMYWYDITHFXHDMIVTGGD6T2I5UKNX5BSLXLW7HVR4MCGZ",
      ),
      issuer: ISSUERS.TESTNET.EURC,
    },
  },
  PUBLIC: {
    USDC: {
      contractAddress: deriveContractId(
        new Asset("USDC", ISSUERS.PUBLIC.USDC),
        Networks.PUBLIC,
        "CCW67TSZV3SSS2HXMBQ5JFGCKJNXKZM7UQUWUZPUTHXSTZLEO7SJMI75",
      ),
      issuer: ISSUERS.PUBLIC.USDC,
    },
    EURC: {
      contractAddress: deriveContractId(
        new Asset("EURC", ISSUERS.PUBLIC.EURC),
        Networks.PUBLIC,
        "CDTKPWPLOURQA2SGTKTUQOWRCBZEORB4BWBOMJ3D3ZTQQSGE5F6JBQLV",
      ),
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
      contractAddress: deriveContractId(
        Asset.native(),
        passphrase,
        net === "PUBLIC"
          ? "CAS3J7GYLGXMF6TDJBBYYSE3HQ6BBSMLNUQ34T6TZMYMW2EVH34XOWMA"
          : "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC",
      ),
    },
    USDC: {
      code: "USDC",
      name: "USD Coin (Circle SAC)",
      decimals: 7,
      contractAddress: NETWORK_ESCROW_ASSETS[net].USDC.contractAddress,
      issuer: ISSUERS[net].USDC,
    },
    EURC: {
      code: "EURC",
      name: "Euro Coin (Circle SAC)",
      decimals: 7,
      contractAddress: NETWORK_ESCROW_ASSETS[net].EURC.contractAddress,
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
