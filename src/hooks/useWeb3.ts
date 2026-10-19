import { useWeb3 as useWeb3Context } from "../context/Web3Context";

export const useWeb3 = useWeb3Context;

export type Web3ContextValue = ReturnType<typeof useWeb3Context>;
