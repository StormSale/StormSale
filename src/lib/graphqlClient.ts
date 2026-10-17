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
  query CampaignHistory($id: Int!) {
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
      sales(limit: 1000) {
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

/** Campaign history from the indexer in one request; falls back to a direct RPC `get_campaign`. */
export function getCampaignHistory(campaignId: number): Promise<CampaignHistory | null> {
  return withRpcFallback(
    async () => {
      const data = await queryIndexer<{ campaign: any | null }>(CAMPAIGN_HISTORY_QUERY, {
        id: campaignId,
      });
      const c = data.campaign;
      if (!c) return null;
      return {
        ...c,
        advertiser: c.advertiser.address,
        sales: c.sales.map((s: any) => ({ ...s, affiliate: s.affiliate.address })),
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
  maturedCommissionStroops: string;
  maturedSalesCount: number;
  lastSaleDate: string;
}

const AFFILIATE_QUERY = /* GraphQL */ `
  query AffiliateSales($address: String!) {
    sales(affiliate: $address, limit: 1000) {
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

/** Affiliate's matured commissions grouped per campaign, from the indexer. Throws if unavailable. */
export async function fetchAffiliateClaimsFromIndexer(
  address: string,
): Promise<AffiliateClaimSummary[]> {
  const data = await queryIndexer<{ sales: any[] }>(AFFILIATE_QUERY, { address });
  const byCampaign = new Map<number, AffiliateClaimSummary>();
  for (const s of data.sales) {
    if (!s.matured) continue;
    const id = s.campaign.campaignId as number;
    const cur = byCampaign.get(id) ?? {
      campaignId: id,
      advertiser: s.campaign.advertiser.address,
      clearingPeriodSecs: s.campaign.clearingPeriodSecs,
      maturedCommissionStroops: "0",
      maturedSalesCount: 0,
      lastSaleDate: s.loggedAt,
    };
    cur.maturedCommissionStroops = (
      BigInt(cur.maturedCommissionStroops) + BigInt(s.commissionStroops)
    ).toString();
    cur.maturedSalesCount++;
    if (s.loggedAt > cur.lastSaleDate) cur.lastSaleDate = s.loggedAt;
    byCampaign.set(id, cur);
  }
  return [...byCampaign.values()];
}
