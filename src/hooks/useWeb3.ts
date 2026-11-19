import * as Web3ContextModule from "../context/Web3Context";

export const useWeb3 = () => {
  return Web3ContextModule.useWeb3();
};

export const useSafeWeb3 = () => {
  return Web3ContextModule.useSafeWeb3();
};
