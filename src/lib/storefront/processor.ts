import { StrKey } from "@stellar/stellar-sdk";
import { AffiliateLedger } from "./ledger";
import { convertToXlm, type LogSaleFn } from "./payout";
import { calculateCommission, DEFAULT_TIERS, type RewardTier } from "./rewards";
import type { NormalizedSaleEvent } from "./types";

export interface ProcessorConfig {
  ledger: AffiliateLedger;
  logSale: LogSaleFn;
  advertiserAddress: string;
  xlmPerUsd: number;
  tiers?: RewardTier[];
}

export type ProcessResult =
  | { status: "paid"; commission: number; txHash: string }
  | { status: "refunded"; commission: number }
  | { status: "duplicate" }
  | { status: "ignored"; reason: string };

export async function processStorefrontEvent(
  event: NormalizedSaleEvent,
  config: ProcessorConfig,
): Promise<ProcessResult> {
  const { ledger } = config;

  if (event.type === "refund") {
    const entry = ledger.recordRefund(event.orderId);
    return entry
      ? { status: "refunded", commission: entry.commission }
      : { status: "ignored", reason: "unknown or already refunded order" };
  }

  if (ledger.has(event.orderId)) return { status: "duplicate" };
  if (!event.affiliateAddress || event.campaignId === null) {
    return { status: "ignored", reason: "sale has no affiliate or campaign" };
  }
  // A bad link should be skipped, not retried forever by the platform.
  if (!StrKey.isValidEd25519PublicKey(event.affiliateAddress)) {
    return { status: "ignored", reason: "affiliate address is not a valid Stellar address" };
  }

  const commission = calculateCommission(
    event.amount,
    ledger.getConfirmedSales(event.affiliateAddress),
    config.tiers ?? DEFAULT_TIERS,
  );

  // If this throws, nothing is recorded and the platform's retry will try again.
  const { txHash } = await config.logSale({
    advertiserAddress: config.advertiserAddress,
    campaignId: event.campaignId,
    affiliateAddress: event.affiliateAddress,
    saleAmountXlm: convertToXlm(event.amount, event.currency, config.xlmPerUsd),
  });

  ledger.recordSale({
    orderId: event.orderId,
    affiliateAddress: event.affiliateAddress,
    commission,
    txHash,
  });
  return { status: "paid", commission, txHash };
}
