import { describe, it, expect, afterEach } from "vitest";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store } from "./store.js";
import type { CampaignRecord, ClaimRecord, SaleRecord } from "./types.js";

const campaign: CampaignRecord = {
  campaignId: 1,
  advertiser: "GADV",
  commissionBps: 1000,
  clearingPeriodSecs: 3600,
  budgetStroops: "1000000000",
  createdAt: "2026-01-01T00:00:00.000Z",
  txHash: "tx-campaign",
};

const sale: SaleRecord = {
  id: "s1",
  campaignId: 1,
  affiliate: "GAFF",
  amountStroops: "10000000",
  commissionStroops: "1000000",
  loggedAt: "2026-01-02T00:00:00.000Z",
  maturesAt: "2026-01-02T01:00:00.000Z",
  txHash: "tx-sale",
};

const claim: ClaimRecord = {
  id: "c1",
  campaignId: 1,
  affiliate: "GAFF",
  amountStroops: "500000",
  claimedAt: "2026-01-03T00:00:00.000Z",
  txHash: "tx-claim",
};

const dirs: string[] = [];
const tmpFile = () => {
  const dir = mkdtempSync(join(tmpdir(), "indexer-store-"));
  dirs.push(dir);
  return join(dir, "data.json");
};

afterEach(() => {
  while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true });
});

describe("Store persistence", () => {
  it("reloads campaigns, sales, claims and state from a saved snapshot", () => {
    const path = tmpFile();
    const a = new Store(path);
    a.addCampaign(campaign);
    a.addSale(sale);
    a.addClaim(claim);
    a.state = {
      lastIndexedLedger: 1234,
      eventCount: 3,
      lastPollAt: "2026-01-04T00:00:00.000Z",
      cursor: "cursor-abc",
    };
    a.save();

    const b = new Store(path);

    expect(b.campaigns.get(1)).toEqual(campaign);
    expect(b.sales).toEqual([sale]);
    expect(b.claims).toEqual([claim]);
    expect(b.state).toEqual(a.state);
  });

  it("rebuilds the secondary indexes and dedupe set on load", () => {
    const path = tmpFile();
    const a = new Store(path);
    a.addCampaign(campaign);
    a.addSale(sale);
    a.addClaim(claim);
    a.save();

    const b = new Store(path);

    expect(b.salesFor(1)).toEqual([sale]);
    expect(b.claimsFor(1)).toEqual([claim]);
    b.addSale({ ...sale }); // re-polled event after a restart must not duplicate
    b.addClaim({ ...claim });
    expect(b.sales).toHaveLength(1);
    expect(b.claims).toHaveLength(1);
  });

  it("writes atomically, leaving no temp file behind", () => {
    const path = tmpFile();
    const store = new Store(path);
    store.addCampaign(campaign);
    store.save();

    expect(existsSync(path)).toBe(true);
    expect(existsSync(`${path}.tmp`)).toBe(false);
  });

  it("starts empty when the snapshot file does not exist", () => {
    const store = new Store(tmpFile());

    expect(store.campaigns.size).toBe(0);
    expect(store.sales).toEqual([]);
    expect(store.state.lastIndexedLedger).toBe(0);
  });

  it("save() is a no-op for an in-memory store", () => {
    expect(() => new Store().save()).not.toThrow();
  });

  it("throws on a corrupt snapshot instead of silently starting empty", () => {
    const path = tmpFile();
    writeFileSync(path, "{not json");

    expect(() => new Store(path)).toThrow();
  });
});
