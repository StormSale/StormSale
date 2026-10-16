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
  it("returns complete campaign history in < 100ms", async () => {
    const run = makeRunner(seeded());
    const query = `{ campaign(campaignId: 1) { saleCount grossVolumeStroops claimedStroops
           sales(limit: 1000) { id amountStroops matured } claims { id } } }`;
    await run(query); // warm-up: server start and query parsing are not per-request cost
    const t0 = performance.now();
    const res = await run(query);
    const ms = performance.now() - t0;
    expect(res.errors).toBeUndefined();
    const c = res.data.campaign;
    expect(c.saleCount).toBe(5000);
    expect(c.grossVolumeStroops).toBe("50000000000");
    expect(c.claimedStroops).toBe("2000000");
    expect(c.sales).toHaveLength(1000);
    expect(ms).toBeLessThan(100);
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
