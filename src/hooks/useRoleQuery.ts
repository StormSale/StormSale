import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { queryKeys } from "../lib/queryClient";

export type StormSaleRole = "advertiser" | "affiliate" | "auditor" | "admin";

export const ROLE_REFETCH_INTERVALS: Record<StormSaleRole, number> = {
  advertiser: 30_000,
  affiliate: 30_000,
  auditor: 15_000,
  admin: 15_000,
};

interface RoleQueryOptions<T> {
  role: StormSaleRole;
  address: string | null;
  resource: string;
  queryFn: () => Promise<T>;
  enabled?: boolean;
}

/**
 * Shared role-data query with consistent caching and background refresh rules.
 * Queries pause without an authenticated wallet and refetch after reconnect or
 * focus through the root QueryClient defaults.
 */
export function useRoleQuery<T>({
  role,
  address,
  resource,
  queryFn,
  enabled = true,
}: RoleQueryOptions<T>): UseQueryResult<T, Error> {
  return useQuery({
    queryKey: queryKeys.roleData(role, address ?? "disconnected", resource),
    queryFn,
    enabled: enabled && Boolean(address),
    refetchInterval: ROLE_REFETCH_INTERVALS[role],
    refetchIntervalInBackground: false,
  });
}
