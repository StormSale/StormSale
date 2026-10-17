import { scValToNative, type rpc } from "@stellar/stellar-sdk";
import type { Store } from "./store.js";

/**
 * Maps raw Soroban contract events to domain records.
 *
 * ASSUMPTION: the contract publishes events whose first topic is a symbol
 * naming the action. Update EVENT_NAMES below if the deployed contract uses
 * different symbols (inspect real events with `stellar events` or the RPC).
 */
export const EVENT_NAMES = {
  campaignCreated: ["campaign_created", "create_campaign", "campaign"],
  saleLogged: ["sale_logged", "log_sale", "sale"],
  claimed: ["claim_payout", "claim_commission", "payout_claimed", "claimed"],
} as const;

type Native = Record<string, unknown>;

const pick = (o: Native, ...keys: string[]): unknown => {
  for (const k of keys) if (o[k] !== undefined) return o[k];
  return undefined;
};

/** Normalise native event data (object or positional tuple) into a keyed object. */
function toObject(data: unknown, fields: string[]): Native {
  if (Array.isArray(data)) return Object.fromEntries(fields.map((f, i) => [f, data[i]]));
  if (data && typeof data === "object") return data as Native;
  return { [fields[0]]: data };
}

const str = (v: unknown) => (v === undefined || v === null ? "" : String(v));
const num = (v: unknown) => Number(v ?? 0);

/** Applies one contract event to the store. Returns true if the event was recognised. */
export function applyEvent(store: Store, ev: rpc.Api.EventResponse, _index = 0): boolean {
  const topics = ev.topic.map((t) => scValToNative(t));
  const name = String(topics[0] ?? "");
  const data = scValToNative(ev.value);
  const when = new Date(ev.ledgerClosedAt).toISOString();
    const id = ev.id;
  const topicCampaignId = topics[1] !== undefined ? num(topics[1]) : undefined;

  if ((EVENT_NAMES.campaignCreated as readonly string[]).includes(name)) {
    const o = toObject(data, ["campaign_id", "advertiser", "rate_bps", "clearing_secs", "budget"]);
    store.addCampaign({
      campaignId: topicCampaignId ?? num(pick(o, "campaign_id", "id")),
      advertiser: str(pick(o, "advertiser")),
      commissionBps: num(pick(o, "rate_bps", "commission_bps", "rate")),
      clearingPeriodSecs: num(pick(o, "clearing_secs", "clearing_period", "clearing_period_secs")),
      budgetStroops: str(pick(o, "budget", "budget_stroops")),
      createdAt: when,
      txHash: ev.txHash,
    });
    return true;
  }

  if ((EVENT_NAMES.saleLogged as readonly string[]).includes(name)) {
    const o = toObject(data, ["campaign_id", "affiliate", "amount"]);
    const campaignId = topicCampaignId ?? num(pick(o, "campaign_id"));
    const campaign = store.campaigns.get(campaignId);
    const amount = BigInt(str(pick(o, "amount", "sale_amount")) || "0");
    const bps = BigInt(campaign?.commissionBps ?? 0);
    const commission = (amount * bps) / 10000n;
    const matures = new Date(new Date(when).getTime() + (campaign?.clearingPeriodSecs ?? 0) * 1000);
    store.addSale({
      id,
      campaignId,
      affiliate: str(pick(o, "affiliate")),
      amountStroops: amount.toString(),
      commissionStroops: commission.toString(),
      loggedAt: when,
      maturesAt: matures.toISOString(),
      txHash: ev.txHash,
    });
    return true;
  }

  if ((EVENT_NAMES.claimed as readonly string[]).includes(name)) {
    const o = toObject(data, ["campaign_id", "affiliate", "amount"]);
    store.addClaim({
      id,
      campaignId: topicCampaignId ?? num(pick(o, "campaign_id")),
      affiliate: str(pick(o, "affiliate")),
      amountStroops: str(pick(o, "amount", "payout")) || "0",
      claimedAt: when,
      txHash: ev.txHash,
    });
    return true;
  }

  return false;
}
