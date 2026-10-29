import { useWeb3 as useWebContext } from "../context/WebContext";

export const useWeb3 = useWebContext;

export const useSafeWeb3 = () => {
  if (typeof (Web3ContextModule as any).useSafeWeb3 === "function") {
    return (Web3ContextModule as any).useSafeWeb3();
  }
  try {
    return Web3ContextModule.useWeb3();
  } catch {
    return undefined;
  }
};