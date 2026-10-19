import { describe, it, expect, vi } from "vitest";
import {
  queryIndexer,
  withRpcFallback,
  fetchAllPages,
  IndexerUnavailableError,
} from "../lib/graphqlClient";

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
