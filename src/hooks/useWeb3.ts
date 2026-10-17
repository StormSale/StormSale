import { useWeb3 as useWebContext } from "../context/Web3Context";

export const useWeb3 = useWebContext;

export type { TransactionPollingState, TransactionPollingOptions } from "../context/Web3Context";
