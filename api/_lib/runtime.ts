import { AffiliateLedger } from "../../src/lib/storefront/ledger";
import { createOnChainLogSale } from "../../src/lib/storefront/payout";
import type { ProcessorConfig } from "../../src/lib/storefront/processor";
import type { WalletType } from "../../src/lib/stellar";

// In-memory only: serverless instances don't share memory, so this must be
// replaced with a database or key-value store before production use.
const ledger = new AffiliateLedger();

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

export function getProcessorConfig(): ProcessorConfig {
  return {
    ledger,
    logSale: createOnChainLogSale(requireEnv("STORMSALE_PAYOUT_WALLET") as WalletType),
    advertiserAddress: requireEnv("STORMSALE_ADVERTISER_ADDRESS"),
    xlmPerUsd: Number(requireEnv("XLM_PER_USD")),
  };
}

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}
