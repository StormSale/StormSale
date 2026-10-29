/**
 * POST /api/telegram/notify — send a conversion alert to the affiliate.
 *
 * Body: { txHash } — the hash of a confirmed StormSale `log_sale` transaction.
 *
 * Everything in the alert comes from the ledger, not from the caller: the
 * server loads the transaction from Soroban RPC, requires it to be a
 * successful `log_sale` call on the StormSale contract, and reads the
 * affiliate, campaign and sale amount from its arguments. The commission uses
 * the campaign's on-chain rate, the same formula the contract escrows.
 * Each hash produces at most one alert, and callers are rate limited.
 */
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getRedisClient } from "../_lib/redis";
import {
  clientIp,
  fetchCommissionRateBps,
  fetchConfirmedTransaction,
  getContractId,
  getTelegramSender,
} from "../_lib/telegram";
import {
  commissionForSale,
  consumeRateLimit,
  formatStroops,
  parseLogSaleTransaction,
  sendConversionAlert,
} from "../../src/lib/telegramAlerts";

const NOTIFY_LIMIT_PER_MINUTE = 30;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method Not Allowed" });
  }
  const txHash = ((req.body ?? {}) as { txHash?: unknown }).txHash;
  if (typeof txHash !== "string" || !/^[0-9a-f]{64}$/i.test(txHash)) {
    return res.status(400).json({ error: "txHash must be a 64-character transaction hash." });
  }
  const contractId = getContractId();
  if (!contractId) {
    return res.status(503).json({ error: "Telegram alerts are not configured." });
  }

  try {
    const store = getRedisClient();
    if (!(await consumeRateLimit(store, `notify:${clientIp(req)}`, NOTIFY_LIMIT_PER_MINUTE, 60))) {
      res.setHeader("Retry-After", "60");
      return res.status(429).json({ error: "Too many requests." });
    }

    const tx = await fetchConfirmedTransaction(txHash);
    const sale = tx && parseLogSaleTransaction(tx.envelopeXdr, contractId);
    if (!sale) {
      return res
        .status(422)
        .json({ error: "txHash is not a successful StormSale log_sale transaction." });
    }

    const rateBps = await fetchCommissionRateBps(contractId, sale.campaignId);
    const outcome = await sendConversionAlert(store, getTelegramSender(), sale.affiliate, txHash, {
      campaignLabel: `Campaign #${sale.campaignId}`,
      saleAmount: formatStroops(sale.amount),
      commission: rateBps === null ? null : formatStroops(commissionForSale(sale.amount, rateBps)),
      asset: "XLM",
    });
    return res.status(outcome === "send_failed" ? 502 : 200).json({ outcome });
  } catch (err) {
    console.error("[telegram/notify]", err instanceof Error ? err.message : err);
    return res.status(503).json({ error: "Telegram alerts are temporarily unavailable." });
  }
}
