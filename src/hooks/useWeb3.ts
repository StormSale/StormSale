import {
  useWeb3 as useWeb3Context,
  useSafeWeb3 as useSafeWeb3Context,
} from "../context/Web3Context";

export const useWeb3 = () => {
  return useWeb3Context();
};

export const useSafeWeb3 = () => {
  return useSafeWeb3Context();
};
