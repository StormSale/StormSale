import { describe, it, expect } from "vitest";
import { parseGumroadPing } from "../lib/storefront/gumroad";
import { parseWhopEvent } from "../lib/storefront/whop";
import { calculateCommission, tierRatePercent } from "../lib/storefront/rewards";
import { AffiliateLedger } from "../lib/storefront/ledger";

const AFFILIATE = "GAFFILIATE777DEMOWALLET9999STORMTESTNET1234567890";

describe("storefront webhook parsers", () => {
  it("parses a Gumroad sale", () => {
    const event = parseGumroadPing({
      sale_id: "g_1",
      price: "4999",
      currency: "USD",
      refunded: "false",
      "url_params[ref]": AFFILIATE,
      "url_params[campaign]": "7",
    });
    expect(event).toEqual({
      platform: "gumroad",
      type: "sale",
      orderId: "g_1",
      amount: 49.99,
      currency: "usd",
      affiliateAddress: AFFILIATE,
      campaignId: 7,
    });
  });

  it("parses a Gumroad refund", () => {
    const event = parseGumroadPing({ sale_id: "g_1", price: "4999", refunded: "true" });
    expect(event.type).toBe("refund");
  });

  it("parses a Whop payment and ignores unrelated events", () => {
    const event = parseWhopEvent({
      type: "payment.succeeded",
      data: { id: "pay_1", usd_total: 49.99, metadata: { ref: AFFILIATE, campaign: "7" } },
    });
    expect(event).toMatchObject({ orderId: "pay_1", type: "sale", amount: 49.99, campaignId: 7 });
    expect(parseWhopEvent({ type: "membership.went_valid", data: {} })).toBeNull();
  });
});

describe("tiered rewards", () => {
  it("raises the rate as confirmed sales grow", () => {
    expect(tierRatePercent(0)).toBe(10);
    expect(tierRatePercent(10)).toBe(15);
    expect(tierRatePercent(50)).toBe(20);
    expect(calculateCommission(100, 0)).toBe(10);
    expect(calculateCommission(100, 10)).toBe(15);
  });
});

describe("affiliate ledger", () => {
  it("ignores duplicate sales", () => {
    const ledger = new AffiliateLedger();
    expect(ledger.recordSale({ orderId: "o1", affiliateAddress: AFFILIATE, commission: 10 })).toBe(
      true,
    );
    expect(ledger.recordSale({ orderId: "o1", affiliateAddress: AFFILIATE, commission: 10 })).toBe(
      false,
    );
    expect(ledger.getBalance(AFFILIATE)).toBe(10);
  });

  it("reverses a refund exactly once", () => {
    const ledger = new AffiliateLedger();
    ledger.recordSale({ orderId: "o1", affiliateAddress: AFFILIATE, commission: 10 });
    expect(ledger.recordRefund("o1")).not.toBeNull();
    expect(ledger.getBalance(AFFILIATE)).toBe(0);
    expect(ledger.getConfirmedSales(AFFILIATE)).toBe(0);
    expect(ledger.recordRefund("o1")).toBeNull();
    expect(ledger.getBalance(AFFILIATE)).toBe(0);
  });
});
