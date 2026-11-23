import { describe, expect, it } from "vitest";
import { ROLE_REFETCH_INTERVALS } from "../hooks/useRoleQuery";
import { queryClient, queryKeys } from "../lib/queryClient";

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
});
