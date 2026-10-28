import * as Web3ContextModule from "../context/Web3Context";

export const useWeb3 = () => {
  return Web3ContextModule.useWeb3();
};

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