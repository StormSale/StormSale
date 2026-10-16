import { describe, it, expect, vi } from "vitest";
import { Keypair } from "@stellar/stellar-sdk";
import { AffiliateLedger } from "../lib/storefront/ledger";
import { createOnChainLogSale } from "../lib/storefront/payout";
import { processStorefrontEvent } from "../lib/storefront/processor";
import { computeWhopSignature, verifyWhopSignature } from "../lib/storefront/whopSignature";
import type { NormalizedSaleEvent } from "../lib/storefront/types";

// Real, randomly generated Stellar addresses (the contract client validates them).
const AFFILIATE = Keypair.random().publicKey();
const ADVERTISER = Keypair.random().publicKey();

const sale: NormalizedSaleEvent = {
  platform: "gumroad",
  type: "sale",
  orderId: "o1",
  amount: 100,
  currency: "usd",
  affiliateAddress: AFFILIATE,
  campaignId: 7,
};
const refund: NormalizedSaleEvent = { ...sale, type: "refund" };

function setup() {
  const ledger = new AffiliateLedger();
  const logSale = vi.fn().mockResolvedValue({ txHash: "tx_1" });
  return {
    ledger,
    logSale,
    config: { ledger, logSale, advertiserAddress: ADVERTISER, xlmPerUsd: 8 },
  };
}

describe("storefront processor", () => {
  it("pays commission on-chain for a sale", async () => {
    const { ledger, logSale, config } = setup();
    const result = await processStorefrontEvent(sale, config);
    expect(result).toEqual({ status: "paid", commission: 10, txHash: "tx_1" });
    expect(logSale).toHaveBeenCalledWith({
      advertiserAddress: ADVERTISER,
      campaignId: 7,
      affiliateAddress: AFFILIATE,
      saleAmountXlm: 800,
    });
    expect(ledger.getBalance(AFFILIATE)).toBe(10);
  });

  it("does not pay twice for a repeated webhook", async () => {
    const { logSale, config } = setup();
    await processStorefrontEvent(sale, config);
    expect(await processStorefrontEvent(sale, config)).toEqual({ status: "duplicate" });
    expect(logSale).toHaveBeenCalledTimes(1);
  });

  it("reverses the affiliate balance on refund", async () => {
    const { ledger, config } = setup();
    await processStorefrontEvent(sale, config);
    expect(await processStorefrontEvent(refund, config)).toEqual({
      status: "refunded",
      commission: 10,
    });
    expect(ledger.getBalance(AFFILIATE)).toBe(0);
  });

  it("ignores a refund for an unknown order", async () => {
    const { config } = setup();
    expect((await processStorefrontEvent(refund, config)).status).toBe("ignored");
  });

  it("ignores a sale whose affiliate address is not a valid Stellar address", async () => {
    const { logSale, config } = setup();
    const result = await processStorefrontEvent(
      { ...sale, affiliateAddress: "not-an-address" },
      config,
    );
    expect(result.status).toBe("ignored");
    expect(logSale).not.toHaveBeenCalled();
  });

  it("records nothing when the on-chain call fails", async () => {
    const { ledger, logSale, config } = setup();
    logSale.mockRejectedValueOnce(new Error("rpc down"));
    await expect(processStorefrontEvent(sale, config)).rejects.toThrow("rpc down");
    expect(ledger.getBalance(AFFILIATE)).toBe(0);
  });

  it("completes a payout through the project's mock wallet", async () => {
    const ledger = new AffiliateLedger();
    const result = await processStorefrontEvent(sale, {
      ledger,
      logSale: createOnChainLogSale("mock"),
      advertiserAddress: ADVERTISER,
      xlmPerUsd: 8,
    });
    expect(result.status).toBe("paid");
    if (result.status === "paid") expect(result.txHash.startsWith("0x")).toBe(true);
  });
});

describe("Whop signature check", () => {
  const secret = "ws_" + "0".repeat(32);
  const rawBody = JSON.stringify({ type: "payment.succeeded", data: { id: "pay_1" } });
  const now = 1_800_000_000;

  async function headers() {
    const sig = await computeWhopSignature({
      secret,
      id: "msg_1",
      timestamp: String(now),
      rawBody,
    });
    return { id: "msg_1", timestamp: String(now), signature: `v1,${sig}` };
  }

  it("accepts a valid signature", async () => {
    expect(
      await verifyWhopSignature({ secret, rawBody, nowSeconds: now, ...(await headers()) }),
    ).toBe(true);
  });

  it("rejects a tampered body", async () => {
    expect(
      await verifyWhopSignature({
        secret,
        rawBody: rawBody + " ",
        nowSeconds: now,
        ...(await headers()),
      }),
    ).toBe(false);
  });

  it("rejects an old timestamp", async () => {
    expect(
      await verifyWhopSignature({ secret, rawBody, nowSeconds: now + 1000, ...(await headers()) }),
    ).toBe(false);
  });

  it("rejects missing headers", async () => {
    expect(
      await verifyWhopSignature({ secret, rawBody, id: null, timestamp: null, signature: null }),
    ).toBe(false);
  });
});
