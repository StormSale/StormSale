import { describe, it, expect } from "vitest";
import { createYoga } from "graphql-yoga";
import { Store } from "./store.js";
import { buildSchema } from "./schema.js";

const ADV = "GADV";
const AFF = "GAFF";

function seeded(nSales = 5000) {
  const store = new Store();
  store.addCampaign({
    campaignId: 1,
    advertiser: ADV,
    commissionBps: 1000,
    clearingPeriodSecs: 0,
    budgetStroops: "1000000000",
    createdAt: "2026-01-01T00:00:00.000Z",
    txHash: "tx0",
  });
  for (let i = 0; i < nSales; i++) {
    store.addSale({
      id: `s${i}`,
      campaignId: 1,
      affiliate: AFF,
      amountStroops: "10000000",
      commissionStroops: "1000000",
      loggedAt: new Date(2026, 0, 1, 0, 0, i).toISOString(),
      maturesAt: "2026-01-01T00:00:00.000Z",
      txHash: `tx${i}`,
    });
  }
  store.addClaim({
    id: "c1",
    campaignId: 1,
    affiliate: AFF,
    amountStroops: "2000000",
    claimedAt: "2026-02-01T00:00:00.000Z",
    txHash: "txc",
  });
  return store;
}

const makeRunner = (store: Store) => {
  const yoga = createYoga({ schema: buildSchema(store), logging: false });
  return async (query: string) => {
    const r = await yoga.fetch("http://localhost/graphql", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query }),
    });
    return (await r.json()) as { data?: any; errors?: unknown };
  };
};

describe("indexer GraphQL", () => {
  it("returns complete campaign history (all 5,000 sales, paged), each request < 100ms", async () => {
    const run = makeRunner(seeded());
    // Same query shape the client sends for each page.
    const pageQuery = (offset: number) => `{ campaign(campaignId: 1) { saleCount grossVolumeStroops
           claimedStroops sales(limit: 1000, offset: ${offset}) { id amountStroops matured } } }`;
    await run(pageQuery(0)); // warm-up: server start and query parsing are not per-request cost

    // Same loop the client uses: request pages until one comes back short.
    const ids: string[] = [];
    const pageMs: number[] = [];
    let first: any;
    for (let offset = 0; ; offset += 1000) {
      const t0 = performance.now();
      const res = await run(pageQuery(offset));
      pageMs.push(performance.now() - t0);
      expect(res.errors).toBeUndefined();
      first = first ?? res.data.campaign;
      const rows = res.data.campaign.sales as { id: string }[];
      ids.push(...rows.map((s) => s.id));
      if (rows.length < 1000) break;
    }

    expect(first.saleCount).toBe(5000);
    expect(first.grossVolumeStroops).toBe("50000000000");
    expect(first.claimedStroops).toBe("2000000");
    expect(ids).toHaveLength(5000);
    expect(new Set(ids).size).toBe(5000); // no duplicates or gaps across pages
    expect(pageMs).toHaveLength(6); // 5 full pages + 1 empty page that ends the loop
    // The latency target is per request; total time scales with the number of pages.
    expect(Math.max(...pageMs)).toBeLessThan(100);
  });

  it("serves newest-first sales and refreshes the cached order when a sale is added", async () => {
    const store = seeded(3);
    const run = makeRunner(store);
    const q = `{ campaign(campaignId: 1) { sales(limit: 10) { id } } }`;

    const before = await run(q);
    expect(before.data.campaign.sales.map((s: { id: string }) => s.id)).toEqual(["s2", "s1", "s0"]);

    store.addSale({
      id: "s-new",
      campaignId: 1,
      affiliate: AFF,
      amountStroops: "1",
      commissionStroops: "0",
      loggedAt: "2027-01-01T00:00:00.000Z",
      maturesAt: "2027-01-01T00:00:00.000Z",
      txHash: "tx-new",
    });

    const after = await run(q);
    expect(after.data.campaign.sales.map((s: { id: string }) => s.id)).toEqual([
      "s-new",
      "s2",
      "s1",
      "s0",
    ]);
  });

  it("resolves user earnings and relationships", async () => {
    const res = await makeRunner(seeded(3))(
      `{ user(address: "${AFF}") { totalEarnedStroops totalClaimedStroops
           sales { campaign { campaignId advertiser { address } } } } }`,
    );
    expect(res.errors).toBeUndefined();
    const u = res.data.user;
    expect(u.totalEarnedStroops).toBe("3000000");
    expect(u.totalClaimedStroops).toBe("2000000");
    expect(u.sales[0].campaign.advertiser.address).toBe(ADV);
  });

  it("is idempotent when the same event is added twice", () => {
    const store = seeded(1);
    store.addSale({ ...store.sales[0] });
    expect(store.sales).toHaveLength(1);
  });
});
