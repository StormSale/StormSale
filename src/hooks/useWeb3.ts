import { useWeb3 as useWebContext } from "../context/Web3Context";

export const useWeb3 = useWebContext;

/**
 * Role is sourced from the Web3 context, which hydrates it from the DB
 * before the first paint. Exposing a dedicated selector keeps role-based
 * routing unified and avoids flicker from reading stale/undefined state.
 */
export const useRole = () => {
  const { userRole, isRoleResolved } = useWebContext();
  return { role: userRole, isRoleLoading: !isRoleResolved };
};
