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

/**
 * Mock wallet bridge used by E2E tests to simulate a wallet connection
 * without requiring manual input or a browser extension.
 */
export const MOCK_WALLET_BRIDGE = {
  id: "mock-bridge",
  name: "Mock Bridge",
  autoConnect: true,
  address: "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF",
  network: "testnet",
} as const;

/**
 * Simulates a wallet connection through the mock bridge.
 * Used by E2E tests to verify the connection flow without manual input.
 */
export async function connectMockWallet(): Promise<{
  address: string;
  network: string;
  connected: boolean;
}> {
  return {
    address: MOCK_WALLET_BRIDGE.address,
    network: MOCK_WALLET_BRIDGE.network,
    connected: true,
  };
}

export type SupportedStellarWallet = (typeof SUPPORTED_STELLAR_WALLETS)[number];
export type MockWalletBridge = typeof MOCK_WALLET_BRIDGE;
