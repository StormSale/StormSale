import { useWeb3 as useWebContext } from "../context/WebContext";

export const useWeb3 = useWebContext;

export const useSafeWeb3 = () => {
  try {
    return useWebContext();
  } catch {
    return undefined;
  }
};