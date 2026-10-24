import { getNetwork } from "@stellar/freighter-api";

export interface WalletNetworkVerification {
  network: string;
  isStellarNetwork: boolean;
}

export async function verifyFreighterNetwork(): Promise<WalletNetworkVerification | null> {
  try {
    const result = await getNetwork();
    if (result.error || !result.network) return null;

    const network = result.network;
    return {
      network,
      isStellarNetwork: network.toUpperCase() === "TESTNET" || network.toUpperCase() === "PUBLIC",
    };
  } catch {
    return null;
  }
}
