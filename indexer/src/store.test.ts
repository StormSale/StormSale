import { describe, it, expect } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store } from "./store.js";
import type { CampaignRecord, ClaimRecord, SaleRecord } from "./types.js";

const campaign: CampaignRecord = {
  campaignId: 1,
  advertiser: "GADVERTISER",
  commissionBps: 1000,
  clearingPeriodSecs: 86400,
  budgetStroops: "100000000",
  createdAt: "2026-01-01T00:00:00.000Z",
  txHash: "tx-campaign",
};

const sale: SaleRecord = {
  id: "sale-1",
  campaignId: 1,
  affiliate: "GAFFILIATE",
  amountStroops: "10000000",
  commissionStroops: "1000000",
  loggedAt: "2026-01-02T00:00:00.000Z",
  txHash: "tx-sale",
};

const saleWithoutCommission: SaleRecord = {
  ...sale,
  id: "sale-2",
  commissionStroops: null,
};

const claim: ClaimRecord = {
  id: "claim-1",
  campaignId: 1,
  affiliate: "GAFFILIATE",
  amountStroops: "1000000",
  claimedAt: "2026-01-03T00:00:00.000Z",
  txHash: "tx-claim",
};

describe("Store persistence", () => {
  it("reloads campaigns, sales, claims and state from a saved snapshot", () => {
    const dir = mkdtempSync(join(tmpdir(), "indexer-store-"));
    const file = join(dir, "snapshot.json");
    try {
      const first = new Store(file);
      first.addCampaign(campaign);
      first.addSale(sale);
      first.addSale(saleWithoutCommission);
      first.addClaim(claim);
      first.state = {
        lastIndexedLedger: 123,
        eventCount: 4,
        lastPollAt: "2026-01-04T00:00:00.000Z",
        cursor: "cursor-1",
      };
      first.save();

      const second = new Store(file);
      expect(second.campaigns.get(1)).toEqual(campaign);
      expect(second.sales).toEqual([sale, saleWithoutCommission]);
      expect(second.claims).toEqual([claim]);
      expect(second.state).toEqual(first.state);

      // Indexes and duplicate protection are rebuilt after loading.
      expect(second.salesFor(1)).toHaveLength(2);
      second.addSale(sale);
      expect(second.sales).toHaveLength(2);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("starts empty when the snapshot file does not exist", () => {
    const store = new Store(join(tmpdir(), "does-not-exist-12345.json"));
    expect(store.sales).toEqual([]);
    expect(store.campaigns.size).toBe(0);
  });
});