// @vitest-environment jsdom
import { createElement, type PropsWithChildren } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ROLE_REFETCH_INTERVALS, useRoleQuery } from "../hooks/useRoleQuery";
import { queryClient, queryKeys } from "../lib/queryClient";

function createWrapper(client: QueryClient) {
  return ({ children }: PropsWithChildren) =>
    createElement(QueryClientProvider, { client }, children);
}

describe("global TanStack Query configuration", () => {
  it("uses bounded cache and automatic reconnect/focus refetch defaults", () => {
    const defaults = queryClient.getDefaultOptions();

    expect(defaults.queries).toMatchObject({
      staleTime: 30_000,
      gcTime: 600_000,
      retry: 2,
      refetchOnReconnect: true,
      refetchOnWindowFocus: true,
    });
  });

  it("provides deterministic isolated keys and refresh intervals for every role", () => {
    expect(Object.keys(ROLE_REFETCH_INTERVALS).sort()).toEqual([
      "admin",
      "advertiser",
      "affiliate",
      "auditor",
    ]);
    expect(queryKeys.roleData("affiliate", "GABC", "sales")).toEqual([
      "stormsale",
      "user",
      "GABC",
      "role",
      "affiliate",
      "sales",
    ]);
  });

  it("does not execute a role query without an authenticated address", () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const queryFn = vi.fn().mockResolvedValue({ campaigns: [] });

    const { result } = renderHook(
      () =>
        useRoleQuery({
          role: "advertiser",
          address: null,
          resource: "campaign-history",
          queryFn,
        }),
      { wrapper: createWrapper(client) },
    );

    expect(result.current.fetchStatus).toBe("idle");
    expect(queryFn).not.toHaveBeenCalled();
    const options = client.getQueryCache().find({
      queryKey: queryKeys.roleData("advertiser", "disconnected", "campaign-history"),
    })?.options as unknown as { enabled?: boolean };
    expect(options.enabled).toBe(false);
  });

  it("applies the role-specific polling interval to an active role query", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const queryFn = vi.fn().mockResolvedValue({ campaigns: [] });
    const address = "GTESTADDRESS";

    const { result } = renderHook(
      () =>
        useRoleQuery({
          role: "auditor",
          address,
          resource: "campaign-history",
          queryFn,
        }),
      { wrapper: createWrapper(client) },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(queryFn).toHaveBeenCalledTimes(1);
    const options = client.getQueryCache().find({
      queryKey: queryKeys.roleData("auditor", address, "campaign-history"),
    })?.options as unknown as { refetchInterval?: number };
    expect(options.refetchInterval).toBe(ROLE_REFETCH_INTERVALS.auditor);
  });
});
