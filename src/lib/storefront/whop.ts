import type { NormalizedSaleEvent } from "./types";

export interface WhopWebhookEnvelope {
  type: string;
  data?: Record<string, unknown>;
}

function toNumber(value: unknown): number | null {
  const n = typeof value === "string" ? Number(value) : value;
  return typeof n === "number" && Number.isFinite(n) ? n : null;
}

/** Returns null for event types we don't care about. */
export function parseWhopEvent(envelope: WhopWebhookEnvelope): NormalizedSaleEvent | null {
  const isSale = envelope.type === "payment.succeeded";
  const isRefund = envelope.type === "refund.created";
  if (!isSale && !isRefund) return null;

  const data = envelope.data ?? {};
  const payment = (data.payment ?? {}) as Record<string, unknown>;
  const metadata = (data.metadata ?? {}) as Record<string, unknown>;

  // NOTE: field names below are assumptions; confirm against a real Whop test event.
  const rawId = isRefund ? (payment.id ?? data.payment_id ?? data.id) : data.id;
  if (typeof rawId !== "string" || rawId === "") {
    throw new Error("Whop event is missing a payment id");
  }

  const amount = toNumber(data.usd_total ?? data.total ?? data.amount);
  if (isSale && amount === null) throw new Error("Whop payment is missing a total amount");

  const campaign = toNumber(metadata.campaign);

  return {
    platform: "whop",
    type: isRefund ? "refund" : "sale",
    orderId: rawId,
    amount: amount ?? 0,
    currency: String(data.currency ?? "usd").toLowerCase(),
    affiliateAddress: typeof metadata.ref === "string" && metadata.ref ? metadata.ref : null,
    campaignId: campaign !== null && Number.isInteger(campaign) && campaign >= 0 ? campaign : null,
  };
}
