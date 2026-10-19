import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createSchema } from "graphql-yoga";
import { newestFirst, type Store } from "./store.js";
import type { CampaignRecord, ClaimRecord, SaleRecord } from "./types.js";

const typeDefs = readFileSync(fileURLToPath(new URL("../schema.graphql", import.meta.url)), "utf8");

type Page = { limit?: number; offset?: number };
/** Slices a page. Negative offset or limit is treated as 0 and limit is capped at 1000. */
const page = <T>(rows: T[], limit = 100, offset = 0) => {
  const start = Math.max(offset, 0);
  return rows.slice(start, start + Math.min(Math.max(limit, 0), 1000));
};
const sum = (xs: string[]) => xs.reduce((a, x) => a + BigInt(x), 0n).toString();

export function buildSchema(store: Store) {
  const sales = (f: (s: SaleRecord) => boolean) =>
    newestFirst(store.sales.filter(f), (s) => s.loggedAt);
  const claims = (f: (c: ClaimRecord) => boolean) =>
    newestFirst(store.claims.filter(f), (c) => c.claimedAt);

  /** Commission from the event if we have it, otherwise computed from the campaign at read time. */
  const commissionOf = (s: SaleRecord): string => {
    if (s.commissionStroops !== null) return s.commissionStroops;
    const bps = BigInt(store.campaigns.get(s.campaignId)?.commissionBps ?? 0);
    return ((BigInt(s.amountStroops) * bps) / 10000n).toString();
  };
  /**
   * Maturity date computed at read time. Returns null when the campaign is not indexed yet,
   * because the clearing period is then unknown (it must not be treated as 0 seconds).
   */
  const maturesAtOf = (s: SaleRecord): string | null => {
    const campaign = store.campaigns.get(s.campaignId);
    if (!campaign) return null;
    return new Date(
      new Date(s.loggedAt).getTime() + campaign.clearingPeriodSecs * 1000,
    ).toISOString();
  };

  return createSchema({
    typeDefs,
    resolvers: {
      Query: {
        campaign: (_: unknown, { campaignId }: { campaignId: number }) =>
          store.campaigns.get(campaignId) ?? null,
        campaigns: (_: unknown, a: Page & { advertiser?: string }) =>
          page(
            newestFirst(
              [...store.campaigns.values()].filter(
                (c) => !a.advertiser || c.advertiser === a.advertiser,
              ),
              (c) => c.createdAt,
            ),
            a.limit,
            a.offset,
          ),
        sales: (_: unknown, a: Page & { campaignId?: number; affiliate?: string }) =>
          page(
            a.campaignId !== undefined && a.campaignId !== null
              ? store
                  .salesNewestFirst(a.campaignId)
                  .filter((s) => !a.affiliate || s.affiliate === a.affiliate)
              : sales((s) => !a.affiliate || s.affiliate === a.affiliate),
            a.limit,
            a.offset,
          ),
        claims: (_: unknown, a: Page & { campaignId?: number; affiliate?: string }) =>
          page(
            claims(
              (c) =>
                (a.campaignId == null || c.campaignId === a.campaignId) &&
                (!a.affiliate || c.affiliate === a.affiliate),
            ),
            a.limit,
            a.offset,
          ),
        user: (_: unknown, { address }: { address: string }) => ({ address }),
        indexerStatus: () => ({
          lastIndexedLedger: store.state.lastIndexedLedger,
          eventCount: store.state.eventCount,
          lastPollAt: store.state.lastPollAt,
        }),
      },
      Campaign: {
        id: (c: CampaignRecord) => String(c.campaignId),
        advertiser: (c: CampaignRecord) => ({ address: c.advertiser }),
        saleCount: (c: CampaignRecord) => store.salesFor(c.campaignId).length,
        grossVolumeStroops: (c: CampaignRecord) =>
          sum(store.salesFor(c.campaignId).map((s) => s.amountStroops)),
        claimedStroops: (c: CampaignRecord) =>
          sum(store.claimsFor(c.campaignId).map((x) => x.amountStroops)),
        sales: (c: CampaignRecord, a: Page) =>
          page(store.salesNewestFirst(c.campaignId), a.limit, a.offset),
        claims: (c: CampaignRecord, a: Page) =>
          page(newestFirst(store.claimsFor(c.campaignId), (x) => x.claimedAt), a.limit, a.offset),
      },
      Sale: {
        // A sale can arrive before its campaign is indexed, so this may be null.
        campaign: (s: SaleRecord) => store.campaigns.get(s.campaignId) ?? null,
        affiliate: (s: SaleRecord) => ({ address: s.affiliate }),
        commissionStroops: (s: SaleRecord) => commissionOf(s),
        maturesAt: (s: SaleRecord) => maturesAtOf(s),
        // Unknown campaign means unknown clearing period, so the sale is not matured.
        matured: (s: SaleRecord) => {
          const maturesAt = maturesAtOf(s);
          return maturesAt !== null && new Date(maturesAt).getTime() <= Date.now();
        },
      },
      Claim: {
        campaign: (c: ClaimRecord) => store.campaigns.get(c.campaignId) ?? null,
        affiliate: (c: ClaimRecord) => ({ address: c.affiliate }),
      },
      User: {
        campaigns: (u: { address: string }) =>
          [...store.campaigns.values()].filter((c) => c.advertiser === u.address),
        sales: (u: { address: string }, a: Page) =>
          page(sales((s) => s.affiliate === u.address), a.limit, a.offset),
        claims: (u: { address: string }, a: Page) =>
          page(claims((c) => c.affiliate === u.address), a.limit, a.offset),
        totalEarnedStroops: (u: { address: string }) =>
          sum(store.sales.filter((s) => s.affiliate === u.address).map(commissionOf)),
        totalClaimedStroops: (u: { address: string }) =>
          sum(store.claims.filter((c) => c.affiliate === u.address).map((c) => c.amountStroops)),
      },
    },
  });
}