/**
 * Supported Stellar & Soroban Wallets Configuration
 */
export const SUPPORTED_STELLAR_WALLETS = [
  {
    id: "freighter",
    name: "Freighter",
    icon: "https://stellar.expert/logo.svg",
    url: "https://www.freighter.app",
    description: "Official browser extension wallet for Stellar & Soroban",
  },
  {
    id: "albedo",
    name: "Albedo",
    icon: "https://albedo.link/logo.svg",
    url: "https://albedo.link",
    description: "Web-based signer for Stellar",
  },
  {
    id: "xbull",
    name: "xBull",
    icon: "https://xbull.app/logo.svg",
    url: "https://xbull.app",
    description: "Multiplatform Stellar wallet",
  },
];

export type StellarWalletId = (typeof SUPPORTED_STELLAR_WALLETS)[number]["id"];

export interface StellarWalletConfig {
  id: StellarWalletId;
  name: string;
  icon: string;
  url: string;
  description: string;
}

export const SUPPORTED_STELLAR_CHAINS = [
  {
    id: "public",
    name: "Stellar Public",
    network: "PUBLIC",
    passphrase: "Public Global Network ; September 2015",
  },
  {
    id: "testnet",
    name: "Stellar Testnet",
    network: "TESTNET",
    passphrase: "Test Stellar Network ; September 2015",
  },
  {
    id: "futurenet",
    name: "Stellar Futurenet",
    network: "FUTURENET",
    passphrase: "Test Stellar Network ; September 2015",
  },
] as const;

export type StellarChainId = (typeof SUPPORTED_STELLAR_CHAINS)[number]["id"];

export interface StellarChainConfig {
  id: StellarChainId;
  name: string;
  network: string;
  passphrase: string;
}

export function getWalletById(id: string): StellarWalletConfig | undefined {
  return SUPPORTED_STELLAR_WALLETR.find((w) => w.id === id);
}

export function getChainById(id: string): StellarChainConfig | undefined {
  return SUPPORTED_STELLAR_CHAINS.find((c) => c.id === id);
}
