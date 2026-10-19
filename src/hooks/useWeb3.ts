import { useWeb3 as useWebContext } from "../context/WebContext";
import { buildSep7TxUri, pollForTransactionInclusion } from "../lib/stellar";

export const useWeb3 = useWebContext;

export const useSep7MobileWallet = () => {
  const buildUri = (xdr: string) => buildSep7TxUri(xdr);
  const waitForConfirmation = (accountId: string, txHash: string) =>
    pollForTransactionInclusion(accountId, txHash);

  return { buildUri, waitForConfirmation };
};
