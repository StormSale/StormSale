import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import type { CampaignRecord, ClaimRecord, IndexerState, SaleRecord } from "./types.js";

interface Snapshot {
  campaigns: CampaignRecord[];
  sales: SaleRecord[];
  claims: ClaimRecord[];
  state: IndexerState;
}

/**
 * In-memory store with JSON snapshot persistence and secondary indexes,
 * so reads are O(1)/O(k) and well under the 100ms budget.
 * Swap this class for Postgres later without touching the resolvers.
 */
export class Store {
  campaigns = new Map<number, CampaignRecord>();
  sales: SaleRecord[] = [];
  claims: ClaimRecord[] = [];
  state: IndexerState = { lastIndexedLedger: 0, eventCount: 0, lastPollAt: null, cursor: null };

  private salesByCampaign = new Map<number, SaleRecord[]>();
  private claimsByCampaign = new Map<number, ClaimRecord[]>();
  /** Newest-first copy per campaign, built on first read and dropped when a sale is added. */
  private sortedSalesByCampaign = new Map<number, SaleRecord[]>();
  private seen = new Set<string>();

  constructor(private readonly filePath?: string) {
    if (filePath && existsSync(filePath)) this.load(JSON.parse(readFileSync(filePath, "utf8")));
  }

  private load(s: Snapshot) {
    s.campaigns.forEach((c) => this.addCampaign(c));
    s.sales.forEach((x) => this.addSale(x));
    s.claims.forEach((x) => this.addClaim(x));
    this.state = s.state;
  }

  save() {
    if (!this.filePath) return;
    const snap: Snapshot = {
      campaigns: [...this.campaigns.values()],
      sales: this.sales,
      claims: this.claims,
      state: this.state,
    };
        // Write to a temp file first, then rename, so a crash can't leave a half-written snapshot.
    const tmp = `${this.filePath}.tmp`;
    writeFileSync(tmp, JSON.stringify(snap));
    renameSync(tmp, this.filePath);
  }

  /** Each add* is idempotent so re-polling the same ledgers never duplicates data. */
  addCampaign(c: CampaignRecord) {
    this.campaigns.set(c.campaignId, c);
  }

  addSale(s: SaleRecord) {
    if (this.seen.has(s.id)) return;
    this.seen.add(s.id);
    this.sales.push(s);
    const list = this.salesByCampaign.get(s.campaignId) ?? [];
    list.push(s);
    this.salesByCampaign.set(s.campaignId, list);
    this.sortedSalesByCampaign.delete(s.campaignId);
  }

  addClaim(c: ClaimRecord) {
    if (this.seen.has(c.id)) return;
    this.seen.add(c.id);
    this.claims.push(c);
    const list = this.claimsByCampaign.get(c.campaignId) ?? [];
    list.push(c);
    this.claimsByCampaign.set(c.campaignId, list);
  }

  salesFor(campaignId: number): SaleRecord[] {
    return this.salesByCampaign.get(campaignId) ?? [];
  }

  /**
   * A campaign's sales, newest first. The sorted list is cached so paging through
   * a large history does not re-sort it on every request. Callers must not mutate it.
   */
  salesNewestFirst(campaignId: number): SaleRecord[] {
    let sorted = this.sortedSalesByCampaign.get(campaignId);
    if (!sorted) {
      sorted = newestFirst(this.salesFor(campaignId), (s) => s.loggedAt);
      this.sortedSalesByCampaign.set(campaignId, sorted);
    }
    return sorted;
  }

  claimsFor(campaignId: number): ClaimRecord[] {
    return this.claimsByCampaign.get(campaignId) ?? [];
  }
}

/** Sorts newest first. Plain string comparison is much faster than localeCompare and ISO dates sort correctly. */
export const newestFirst = <T extends { txHash: string }>(rows: T[], key: (r: T) => string): T[] =>
  [...rows].sort((a, b) => {
    const ka = key(a);
    const kb = key(b);
    return ka < kb ? 1 : ka > kb ? -1 : 0;
  });
