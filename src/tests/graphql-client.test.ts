import { describe, it, expect, vi } from "vitest";
import { queryIndexer, withRpcFallback, IndexerUnavailableError } from "../lib/graphqlClient";

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
