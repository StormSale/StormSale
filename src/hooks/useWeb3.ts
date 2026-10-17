import { useWeb3 as useWebContext } from "../context/WebContext";

/**
 * Re-export the Web3 context hook so consumers get a single source of
 * truth for the connected account and role. Role state is managed inside the
 * context provider and hydrated from persisted storage before the first render,
 * which is what eliminates the role-based route flicker on load.
 */
export const useWeb3 = useWeb3Context;
