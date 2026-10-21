import { describe, it, expect, vi } from "vitest";
import {
  queryIndexer,
  withRpcFallback,
  fetchAllPages,
  fetchAffiliateClaimsFromIndexer,
  summarizeClaimable,
  IndexerUnavailableError,
  type AffiliateClaimRow,
  type AffiliateSaleRow,
} from "../lib/graphqlClient";

const sale = (
  campaignId: number,
  commission: string,
  matured = true,
  loggedAt = "2026-10-01T00:00:00.000Z",
): AffiliateSaleRow => ({
  commissionStroops: commission,
  loggedAt,
  matured,
  campaign: { campaignId, advertiser: { address: "GADV" }, clearingPeriodSecs: 604800 },
});

const claim = (campaignId: number, amount: string): AffiliateClaimRow => ({
  amountStroops: amount,
  campaign: { campaignId },
});

describe("GraphQL indexer client", () => {
  it("returns data from the indexer", async () => {
    const f = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: { ok: 1 } }) });
    const data = await queryIndexer("{ok}", {}, "http://x/graphql", f as unknown as typeof fetch);
    expect(data).toEqual({ ok: 1 });
  });

  it("throws IndexerUnavailableError when the network fails", async () => {
    const f = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));
    await expect(
      queryIndexer("{ok}", {}, "http://x/graphql", f as unknown as typeof fetch),
    ).rejects.toBeInstanceOf(IndexerUnavailableError);
  });

  it("throws when no indexer URL is configured", async () => {
    await expect(queryIndexer("{ok}", {}, "")).rejects.toBeInstanceOf(IndexerUnavailableError);
  });

  it("falls back to RPC when the indexer is unavailable", async () => {
    const rpc = vi.fn().mockResolvedValue("from-rpc");
    const out = await withRpcFallback(async () => {
      throw new IndexerUnavailableError("down");
    }, rpc);
    expect(out).toBe("from-rpc");
    expect(rpc).toHaveBeenCalledOnce();
  });

  it("fetchAllPages collects every row across pages", async () => {
    const rows = Array.from({ length: 2500 }, (_, i) => i);
    const fetchPage = vi.fn(async (offset: number, limit: number) => rows.slice(offset, offset + limit));
    const out = await fetchAllPages(fetchPage, 1000);
    expect(out).toHaveLength(2500);
    expect(fetchPage).toHaveBeenCalledTimes(3);
  });

  it("fetchAllPages makes one extra request when the total is an exact multiple", async () => {
    const rows = Array.from({ length: 2000 }, (_, i) => i);
    const fetchPage = vi.fn(async (offset: number, limit: number) => rows.slice(offset, offset + limit));
    const out = await fetchAllPages(fetchPage, 1000);
    expect(out).toHaveLength(2000);
    expect(fetchPage).toHaveBeenCalledTimes(3);
  });

  it("fetchAllPages returns an empty list when there are no rows", async () => {
    expect(await fetchAllPages(async () => [], 1000)).toEqual([]);
  });

  it("does not hide unrelated errors", async () => {
    await expect(
      withRpcFallback(
        async () => {
          throw new Error("bug");
        },
        async () => "x",
      ),
    ).rejects.toThrow("bug");
  });
});

describe("summarizeClaimable", () => {
  it("sums matured commissions per campaign and ignores immature sales", () => {
    const out = summarizeClaimable(
      [sale(1, "100"), sale(1, "50"), sale(1, "999", false), sale(2, "70")],
      [],
    );
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({
      campaignId: 1,
      maturedCommissionStroops: "150",
      claimedStroops: "0",
      claimableStroops: "150",
      maturedSalesCount: 2,
    });
    expect(out[1]).toMatchObject({ campaignId: 2, claimableStroops: "70" });
  });

  it("subtracts payouts already claimed", () => {
    const [row] = summarizeClaimable([sale(1, "100"), sale(1, "50")], [claim(1, "60")]);
    expect(row.maturedCommissionStroops).toBe("150");
    expect(row.claimedStroops).toBe("60");
    expect(row.claimableStroops).toBe("90");
  });

  it("adds up several payouts for the same campaign", () => {
    const [row] = summarizeClaimable([sale(1, "100")], [claim(1, "30"), claim(1, "20")]);
    expect(row.claimedStroops).toBe("50");
    expect(row.claimableStroops).toBe("50");
  });

  it("leaves out a campaign that has been fully claimed", () => {
    const out = summarizeClaimable([sale(1, "100"), sale(2, "70")], [claim(1, "100")]);
    expect(out.map((r) => r.campaignId)).toEqual([2]);
  });

  it("leaves out a campaign when payouts exceed matured commission", () => {
    expect(summarizeClaimable([sale(1, "100")], [claim(1, "150")])).toEqual([]);
  });

  it("does not let payouts from one campaign reduce another", () => {
    const out = summarizeClaimable([sale(1, "100"), sale(2, "100")], [claim(2, "100")]);
    expect(out.map((r) => [r.campaignId, r.claimableStroops])).toEqual([[1, "100"]]);
  });

  it("keeps the most recent matured sale date", () => {
    const [row] = summarizeClaimable(
      [
        sale(1, "10", true, "2026-10-05T00:00:00.000Z"),
        sale(1, "10", true, "2026-10-09T00:00:00.000Z"),
        sale(1, "10", true, "2026-10-02T00:00:00.000Z"),
      ],
      [],
    );
    expect(row.lastSaleDate).toBe("2026-10-09T00:00:00.000Z");
  });

  it("handles amounts beyond the safe integer range", () => {
    const [row] = summarizeClaimable(
      [sale(1, "90000000000000000000")],
      [claim(1, "10000000000000000000")],
    );
    expect(row.claimableStroops).toBe("80000000000000000000");
  });
});

describe("fetchAffiliateClaimsFromIndexer", () => {
  it("requests sales and claims and returns the net claimable amounts", async () => {
    const f = vi.fn(async (_url: unknown, init: any) => {
      const { query } = JSON.parse(init.body);
      const data = query.includes("AffiliateClaims")
        ? { claims: [claim(1, "40")] }
        : { sales: [sale(1, "100"), sale(2, "25")] };
      return { ok: true, json: async () => ({ data }) };
    });

    const out = await fetchAffiliateClaimsFromIndexer(
      "GAFF",
      "http://x/graphql",
      f as unknown as typeof fetch,
    );

    expect(out.map((r) => [r.campaignId, r.claimableStroops])).toEqual([
      [1, "60"],
      [2, "25"],
    ]);
    expect(f).toHaveBeenCalledTimes(2); // one page of sales + one page of claims
  });

  it("throws IndexerUnavailableError when the claims request fails", async () => {
    const f = vi.fn(async (_url: unknown, init: any) => {
      const { query } = JSON.parse(init.body);
      if (query.includes("AffiliateClaims")) throw new Error("ECONNRESET");
      return { ok: true, json: async () => ({ data: { sales: [sale(1, "100")] } }) };
    });

    await expect(
      fetchAffiliateClaimsFromIndexer("GAFF", "http://x/graphql", f as unknown as typeof fetch),
    ).rejects.toBeInstanceOf(IndexerUnavailableError);
  });
});
