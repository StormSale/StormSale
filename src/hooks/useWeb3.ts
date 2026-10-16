import { useWeb3 as useWebContext } from "../context/WebContext";
import type { Web3Hook } from "../context/WebContext";

export const useWeb3 = useWebContext;

export type { Web3Hook };

export const mockWeb3 = (
  base: Web3Hook,
  overrides: Partial<Web3Hook> = {},
): Web3Hook => ({
  ...base,
  ...overrides,
});
