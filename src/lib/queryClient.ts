import { QueryClient } from "@tanstack/react-query";

export const queryKeys = {
  all: ["stormsale"] as const,
  user: (address: string) => [...queryKeys.all, "user", address] as const,
  balance: (address: string) => [...queryKeys.user(address), "balance"] as const,
  roleData: (role: string, address: string, resource: string) =>
    [...queryKeys.user(address), "role", role, resource] as const,
};

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 10 * 60_000,
      retry: 2,
      refetchOnReconnect: true,
      refetchOnWindowFocus: true,
    },
    mutations: {
      retry: 0,
    },
  },
});
