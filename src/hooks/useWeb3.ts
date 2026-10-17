import { useWeb3 as useWeb3Context } from "../context/Web3Context";

export const useWeb3 = useWeb3Context;

export const useRole = () => {
  const { role, isConnected, isLoading } = useWeb3Context();
  return { role, isConnected, isLoading };
};
