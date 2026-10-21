import { describe, it, expect } from "vitest";
import { fetchAllPages, summarizeClaimable } from "../lib/graphqlClient";

describe("fetchAllPages de-duplication", () => {
  it("drops rows repeated when a new row shifts the next page", async () => {
    // Page size 2. A new row "d" arrives after the first request, so "b" shows up again.
    const pages = [
      [{ id: "c" }, { id: "b" }],
      [{ id: "b" }, { id: "a" }],
    ];
    let call = 0;
    const rows = await fetchAllPages(async () => pages[call++] ?? [], 2, (r) => r.id);
    expect(rows.map((r) => r.id)).toEqual(["c", "b", "a"]);
  });

  it("keeps rows that have no id", async () => {
    const pages: { n: number; id?: string }[][] = [[{ n: 1 }, { n: 2 }], [{ n: 3 }]];
    let call = 0;
    const rows = await fetchAllPages(
      async () => pages[call++] ?? [],
      2,
      (r: { id?: string }) => r.id,
    );
    expect(rows).toHaveLength(3);
  });
});

describe("summarizeClaimable with orphan rows", () => {
  it("skips sales and claims whose campaign is not indexed yet", () => {
    const result = summarizeClaimable(
      [
        {
          id: "s1",
          commissionStroops: "1000000",
          loggedAt: "2026-01-01T00:00:00.000Z",
          matured: true,
          campaign: { campaignId: 1, advertiser: { address: "GADV" }, clearingPeriodSecs: 0 },
        },
        {
          id: "s2",
          commissionStroops: "9999999",
          loggedAt: "2026-01-01T00:00:00.000Z",
          matured: false,
          campaign: null,
        },
      ],
      [{ id: "c1", amountStroops: "5", campaign: null }],
    );
    expect(result).toHaveLength(1);
    expect(result[0].campaignId).toBe(1);
    expect(result[0].claimableStroops).toBe("1000000");
  });
});