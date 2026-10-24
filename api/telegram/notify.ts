/**
 * POST /api/telegram/notify — send a conversion alert to the affiliate.
 *
 * Body: { affiliateWallet, txHash, campaignName, saleAmount, commission?, asset? }
 *
 * The sale's transaction hash must be a successful transaction on Horizon,
 * and each hash produces at most one alert, so the endpoint cannot be used to
 * spam an affiliate with made-up sales.
 */
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getRedisClient } from "../_lib/redis";
import { getTelegramSender, isSuccessfulTransaction } from "../_lib/telegram";
import { isValidWallet, sendConversionAlert } from "../../src/lib/telegramAlerts";

const AMOUNT_RE = /^\d{1,12}(\.\d{1,7})?$/;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method Not Allowed" });
  }
  const body = (req.body ?? {}) as Record<string, unknown>;
  const { affiliateWallet, txHash, campaignName, saleAmount, commission, asset } = body;

  if (!isValidWallet(affiliateWallet)) {
    return res.status(400).json({ error: "A valid affiliateWallet is required." });
  }
  if (typeof txHash !== "string" || typeof saleAmount !== "string" || !AMOUNT_RE.test(saleAmount)) {
    return res.status(400).json({ error: "txHash and a numeric saleAmount are required." });
  }
  if (commission !== undefined && (typeof commission !== "string" || !AMOUNT_RE.test(commission))) {
    return res.status(400).json({ error: "commission must be numeric." });
  }
  if (!(await isSuccessfulTransaction(txHash))) {
    return res.status(422).json({ error: "txHash is not a successful Stellar transaction." });
  }

  const outcome = await sendConversionAlert(
    getRedisClient(),
    getTelegramSender(),
    affiliateWallet.trim(),
    txHash,
    {
      campaignName:
        typeof campaignName === "string" && campaignName.trim()
          ? campaignName.trim().slice(0, 80)
          : "Your campaign",
      saleAmount,
      commission: typeof commission === "string" ? commission : null,
      asset: typeof asset === "string" && /^[A-Z0-9]{1,12}$/.test(asset) ? asset : "XLM",
    },
  );
  return res.status(outcome === "send_failed" ? 502 : 200).json({ outcome });
}
