import type { NormalizedSaleEvent } from "./types";

type GumroadPing = Record<string, string | undefined>;

export function parseGumroadPing(body: GumroadPing): NormalizedSaleEvent {
  const orderId = body.sale_id;
  if (!orderId) throw new Error("Gumroad ping is missing sale_id");

  const priceCents = Number(body.price);
  if (!Number.isFinite(priceCents)) throw new Error("Gumroad ping has an invalid price");

  const rawCampaign = body["url_params[campaign]"];
  const campaign = rawCampaign ? Number(rawCampaign) : NaN;

  return {
    platform: "gumroad",
    type: body.refunded === "true" ? "refund" : "sale",
    orderId,
    amount: priceCents / 100,
    currency: (body.currency ?? "usd").toLowerCase(),
    affiliateAddress: body["url_params[ref]"] || null,
    campaignId: Number.isInteger(campaign) && campaign >= 0 ? campaign : null,
  };
}
