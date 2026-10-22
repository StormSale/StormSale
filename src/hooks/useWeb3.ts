import { useWeb3 as useWeb3Context } from "../context/Web3Context";
import { buildSep7TxUri, pollTransactionInclusion } from "../lib/stellar";

export const useWeb3 = useWeb3Context;

export const useSep7MobileWallet = () => ({
  buildSep7TxUri,
  pollTransactionInclusion,
});
