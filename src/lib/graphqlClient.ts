import { getCampaignContractQuery } from "./stellar";

const INDEXER_URL: string = import.meta.env.VITE_INDEXER_URL || "";
const INDEXER_TIMEOUT_MS = 3000;

export class IndexerUnavailableError extends Error {}

/** Sends a GraphQL query to the indexer. Throws IndexerUnavailableError on any failure. */
export async function queryIndexer<T>(
  query: string,
  variables: Record<string, unknown> = {},
  url: string = INDEXER_URL,
  fetchImpl: typeof fetch = fetch,
): Promise<T> {
  if (!url) throw new IndexerUnavailableError("VITE_INDEXER_URL is not configured");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), INDEXER_TIMEOUT_MS);
  try {
    const res = await fetchImpl(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, variables }),
      signal: controller.signal,
    });
    if (!res.ok) throw new IndexerUnavailableError(`Indexer responded ${res.status}`);
    const json = await res.json();
    if (json.errors?.length) throw new IndexerUnavailableError(json.errors[0].message);
    return json.data as T;
  } catch (err) {
    if (err instanceof IndexerUnavailableError) throw err;
    throw new IndexerUnavailableError((err as Error).message || "Indexer request failed");
  } finally {
    clearTimeout(timer);
  }
}

/** Runs the indexer query; if it is down or slow, runs the direct Soroban RPC fallback. */
export async function withRpcFallback<T>(
  fromIndexer: () => Promise<T>,
  fromRpc: () => Promise<T>,
): Promise<T> {
  try {
    return await fromIndexer();
  } catch (err) {
    if (!(err instanceof IndexerUnavailableError)) throw err;
    console.warn("[indexer] unavailable, falling back to Soroban RPC:", err.message);
    return fromRpc();
  }
}

/** Matches the indexer's per-request cap on `limit`. */
export const INDEXER_PAGE_SIZE = 1000;

/**
 * Collects every row by requesting pages until one comes back short, so results
 * are never silently truncated at the indexer's per-request cap.
 *
 * The indexer lists newest first and keeps indexing while we page. A sale that arrives
 * between two page requests shifts every row down by one, so the last row of one page
 * can come back again as the first row of the next. Pass `keyOf` (a row's unique id) to
 * drop those repeats. Rows without a key are kept as they are.
 */
export async function fetchAllPages<T>(
  fetchPage: (offset: number, limit: number) => Promise<T[]>,
  pageSize: number = INDEXER_PAGE_SIZE,
  keyOf?: (row: T) => string | undefined,
): Promise<T[]> {
  const all: T[] = [];
  const seen = new Set<string>();
  for (let offset = 0; ; offset += pageSize) {
    const rows = await fetchPage(offset, pageSize);
    for (const row of rows) {
      const key = keyOf?.(row);
      if (key !== undefined) {
        if (seen.has(key)) continue;
        seen.add(key);
      }
      all.push(row);
    }
    // Stop on the raw page size, not the de-duplicated size.
    if (rows.length < pageSize) return all;
  }
}

export interface CampaignHistory {
  campaignId: number;
  advertiser: string;
  commissionBps: number;
  clearingPeriodSecs: number;
  budgetStroops: string;
  saleCount: number;
  grossVolumeStroops: string;
  claimedStroops: string;
  sales: {
    id: string;
    affiliate: string;
    amountStroops: string;
    loggedAt: string;
    matured: boolean;
  }[];
}

const CAMPAIGN_HISTORY_QUERY = /* GraphQL */ `
  query CampaignHistory($id: Int!, $limit: Int!, $offset: Int!) {
    campaign(campaignId: $id) {
      campaignId
      advertiser {
        address
      }
      commissionBps
      clearingPeriodSecs
      budgetStroops
      saleCount
      grossVolumeStroops
      claimedStroops
      sales(limit: $limit, offset: $offset) {
        id
        affiliate {
          address
        }
        amountStroops
        loggedAt
        matured
      }
    }
  }
`;

/**
 * Complete campaign history from the indexer (all sales, fetched page by page);
 * falls back to a direct RPC `get_campaign`.
 */
export function getCampaignHistory(campaignId: number): Promise<CampaignHistory | null> {
  return withRpcFallback(
    async () => {
      let campaign: any | null = null;
      const sales = await fetchAllPages(
        async (offset, limit) => {
          const data = await queryIndexer<{ campaign: any | null }>(CAMPAIGN_HISTORY_QUERY, {
            id: campaignId,
            limit,
            offset,
          });
          campaign = campaign ?? data.campaign;
          return data.campaign?.sales ?? [];
        },
        INDEXER_PAGE_SIZE,
        (s: any) => s.id,
      );
      if (!campaign) return null;
      return {
        ...campaign,
        advertiser: campaign.advertiser.address,
        // Counted from the sales we actually collected, so it always matches the list.
        saleCount: sales.length,
        sales: sales.map((s: any) => ({ ...s, affiliate: s.affiliate.address })),
      };
    },
    async () => {
      const c = await getCampaignContractQuery(campaignId);
      if (!c) return null;
      return {
        campaignId,
        advertiser: String(c.advertiser ?? ""),
        commissionBps: Number(c.rate_bps ?? c.commission_bps ?? 0),
        clearingPeriodSecs: Number(c.clearing_period ?? c.clearing_secs ?? 0),
        budgetStroops: String(c.budget ?? "0"),
        saleCount: 0,
        grossVolumeStroops: "0",
        claimedStroops: "0",
        sales: [],
      };
    },
  );
}

export interface AffiliateClaimSummary {
  campaignId: number;
  advertiser: string;
  clearingPeriodSecs: number;
  /** Total commission on matured sales, before any payouts. */
  maturedCommissionStroops: string;
  /** Payouts the affiliate has already claimed for this campaign. */
  claimedStroops: string;
  /** Matured commission minus completed payouts. Always greater than zero in results. */
  claimableStroops: string;
  /** Number of matured sales in the campaign (including ones already paid out). */
  maturedSalesCount: number;
  lastSaleDate: string;
}

const AFFILIATE_QUERY = /* GraphQL */ `
  query AffiliateSales($address: String!, $limit: Int!, $offset: Int!) {
    sales(affiliate: $address, limit: $limit, offset: $offset) {
      id
      commissionStroops
      loggedAt
      matured
      campaign {
        campaignId
        advertiser {
          address
        }
        clearingPeriodSecs
      }
    }
  }
`;

const AFFILIATE_CLAIMS_QUERY = /* GraphQL */ `
  query AffiliateClaims($address: String!, $limit: Int!, $offset: Int!) {
    claims(affiliate: $address, limit: $limit, offset: $offset) {
      id
      amountStroops
      campaign {
        campaignId
      }
    }
  }
`;

export interface AffiliateSaleRow {
  id?: string;
  commissionStroops: string;
  loggedAt: string;
  matured: boolean;
  /** Null when the sale was indexed before its campaign. */
  campaign: {
    campaignId: number;
    advertiser: { address: string };
    clearingPeriodSecs: number;
  } | null;
}

export interface AffiliateClaimRow {
  id?: string;
  amountStroops: string;
  /** Null when the claim was indexed before its campaign. */
  campaign: { campaignId: number } | null;
}

/**
 * Groups matured commissions per campaign and subtracts payouts already claimed,
 * so a commission that was paid out is not offered as claimable again.
 * Campaigns with nothing left to claim are left out. Rows whose campaign is not
 * indexed yet are skipped: their clearing period is unknown, so they cannot be
 * treated as matured or grouped under a campaign.
 */
export function summarizeClaimable(
  sales: AffiliateSaleRow[],
  claims: AffiliateClaimRow[],
): AffiliateClaimSummary[] {
  const claimedByCampaign = new Map<number, bigint>();
  for (const c of claims) {
    if (!c.campaign) continue;
    const id = c.campaign.campaignId;
    claimedByCampaign.set(id, (claimedByCampaign.get(id) ?? 0n) + BigInt(c.amountStroops));
  }

  const matured = new Map<number, { row: AffiliateClaimSummary; total: bigint }>();
  for (const s of sales) {
    if (!s.matured || !s.campaign) continue;
    const id = s.campaign.campaignId;
    const cur = matured.get(id) ?? {
      row: {
        campaignId: id,
        advertiser: s.campaign.advertiser.address,
        clearingPeriodSecs: s.campaign.clearingPeriodSecs,
        maturedCommissionStroops: "0",
        claimedStroops: "0",
        claimableStroops: "0",
        maturedSalesCount: 0,
        lastSaleDate: s.loggedAt,
      },
      total: 0n,
    };
    cur.total += BigInt(s.commissionStroops);
    cur.row.maturedSalesCount++;
    if (s.loggedAt > cur.row.lastSaleDate) cur.row.lastSaleDate = s.loggedAt;
    matured.set(id, cur);
  }

  const out: AffiliateClaimSummary[] = [];
  for (const [id, { row, total }] of matured) {
    const claimed = claimedByCampaign.get(id) ?? 0n;
    const remaining = total - claimed;
    if (remaining <= 0n) continue; // fully paid out (or over-claimed): nothing to offer
    out.push({
      ...row,
      maturedCommissionStroops: total.toString(),
      claimedStroops: claimed.toString(),
      claimableStroops: remaining.toString(),
    });
  }
  return out;
}

/**
 * Affiliate's claimable commissions grouped per campaign, from the indexer:
 * matured sales minus payouts already claimed. Throws if the indexer is unavailable.
 */
export async function fetchAffiliateClaimsFromIndexer(
  address: string,
  url?: string,
  fetchImpl?: typeof fetch,
): Promise<AffiliateClaimSummary[]> {
  // Page through every sale and claim so totals are never understated or overstated.
  // Rows are de-duplicated by id in case new events shift the pages while we read them.
  const [sales, claims] = await Promise.all([
    fetchAllPages(
      async (offset, limit) => {
        const data = await queryIndexer<{ sales: AffiliateSaleRow[] }>(
          AFFILIATE_QUERY,
          { address, limit, offset },
          url,
          fetchImpl,
        );
        return data.sales;
      },
      INDEXER_PAGE_SIZE,
      (s) => s.id,
    ),
    fetchAllPages(
      async (offset, limit) => {
        const data = await queryIndexer<{ claims: AffiliateClaimRow[] }>(
          AFFILIATE_CLAIMS_QUERY,
          { address, limit, offset },
          url,
          fetchImpl,
        );
        return data.claims;
      },
      INDEXER_PAGE_SIZE,
      (c) => c.id,
    ),
  ]);
  return summarizeClaimable(sales, claims);
}