import { STELLAR_CONFIG } from "../config/stellar";
import { isConnected, getNetworkDetails } from "@stellar/freighter-api";

/**
 * Checks if Freighter wallet is currently configured for the expected Stellar network.
 */
export const checkStellarNetwork = async (): Promise<{
  isCorrect: boolean;
  currentNetwork?: string;
  expectedNetwork: string;
}> => {
  try {
    const connected = await isConnected();
    if (!connected) {
      return { isCorrect: false, expectedNetwork: STELLAR_CONFIG.network };
    }
    const details = await getNetworkDetails();
    const isCorrect = details.network === STELLAR_CONFIG.network;
    return {
      isCorrect,
      currentNetwork: details.network,
      expectedNetwork: STELLAR_CONFIG.network,
    };
  } catch (error) {
    console.error("Error checking Stellar network:", error);
    return { isCorrect: false, expectedNetwork: STELLAR_CONFIG.network };
  }
};

/**
 * Verifies Horizon API connectivity.
 */
export const verifyHorizonConnectivity = async (): Promise<boolean> => {
  try {
    const response = await fetch(STELLAR_CONFIG.horizonUrl);
    return response.ok;
  } catch {
    return false;
  }
};

/**
 * Generates Stellar Expert explorer link.
 */
export const getStellarExplorerLink = (
  type: "account" | "tx" | "contract",
  identifier: string,
): string => {
  const base = STELLAR_CONFIG.explorerUrl;
  return `${base}/${type}/${identifier}`;
};
