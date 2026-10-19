import { describe, it, expect } from "vitest";
import { Keypair, nativeToScVal, xdr, type rpc } from "@stellar/stellar-sdk";
import { applyEvent } from "./events.js";
import { Store } from "./store.js";

const ADVERTISER = Keypair.random().publicKey();
const AFFILIATE = Keypair.random().publicKey();
const LEDGER_TIME = "2026-03-01T12:00:00.000Z";

const sym = (s: string) => nativeToScVal(s, { type: "symbol" });
const u32 = (n: number) => nativeToScVal(n, { type: "u32" });
const i128 = (n: bigint) => nativeToScVal(n, { type: "i128" });
const addr = (a: string) => nativeToScVal(a, { type: "address" });
const tuple = (...items: xdr.ScVal[]) => xdr.ScVal.scvVec(items);

function makeEvent(
  topic: xdr.ScVal[],
  value: xdr.ScVal,
  id = "0000000001-0000000001",
  txHash = "tx-1",
): rpc.Api.EventResponse {
  return { id, txHash, topic, value, ledgerClosedAt: LEDGER_TIME } as unknown as rpc.Api.EventResponse;
}

/** campaign_created: topics [name, campaignId], data (advertiser, rate_bps, clearing_secs, budget). */
const campaignEvent = (campaignId: number, id?: string) =>
  makeEvent(
    [sym("campaign_created"), u32(campaignId)],
    tuple(u32(campaignId), addr(ADVERTISER), u32(1000), u32(3600), i128(50_000_000n)),
    id,
  );

describe("applyEvent", () => {
  it("indexes a campaign_created event", () => {
    const store = new Store();
    expect(applyEvent(store, campaignEvent(7))).toBe(true);

    expect(store.campaigns.get(7)).toEqual({
      campaignId: 7,
      advertiser: ADVERTISER,
      commissionBps: 1000,
      clearingPeriodSecs: 3600,
      budgetStroops: "50000000",
      createdAt: LEDGER_TIME,
      txHash: "tx-1",
    });
  });

  it("stores a sale without a commission when the event does not include one", () => {
    const store = new Store();
    applyEvent(store, campaignEvent(7));
    const sale = makeEvent(
      [sym("sale_logged"), u32(7)],
      tuple(u32(7), addr(AFFILIATE), i128(10_000_000n)),
      "0000000002-0000000001",
      "tx-2",
    );

    expect(applyEvent(store, sale)).toBe(true);
    expect(store.sales).toHaveLength(1);
    expect(store.sales[0]).toEqual({
      id: "0000000002-0000000001",
      campaignId: 7,
      affiliate: AFFILIATE,
      amountStroops: "10000000",
      commissionStroops: null, // calculated later, when the sale is read
      loggedAt: LEDGER_TIME,
      txHash: "tx-2",
    });
  });

  it("stores a sale before its campaign is indexed, without a wrong 0 commission", () => {
    const store = new Store(); // no campaign indexed yet
    const sale = makeEvent(
      [sym("sale_logged"), u32(7)],
      tuple(u32(7), addr(AFFILIATE), i128(10_000_000n)),
    );

    expect(applyEvent(store, sale)).toBe(true);
    expect(store.sales[0].commissionStroops).toBeNull();
  });

  it("uses the commission from the sale event when it includes one", () => {
    const store = new Store();
    const sale = makeEvent(
      [sym("sale_logged"), u32(7)],
      tuple(u32(7), addr(AFFILIATE), i128(10_000_000n), i128(1_234_567n)),
    );

    expect(applyEvent(store, sale)).toBe(true);
    expect(store.sales[0].commissionStroops).toBe("1234567");
  });

  it("indexes a claim_payout event", () => {
    const store = new Store();
    const claim = makeEvent(
      [sym("claim_payout"), u32(7)],
      tuple(u32(7), addr(AFFILIATE), i128(2_000_000n)),
      "0000000003-0000000001",
      "tx-3",
    );

    expect(applyEvent(store, claim)).toBe(true);
    expect(store.claims).toEqual([
      {
        id: "0000000003-0000000001",
        campaignId: 7,
        affiliate: AFFILIATE,
        amountStroops: "2000000",
        claimedAt: LEDGER_TIME,
        txHash: "tx-3",
      },
    ]);
  });

  it("prefers the campaign id in the topics over the one in the data", () => {
    const store = new Store();
    // topic says campaign 7, data says campaign 99
    const sale = makeEvent(
      [sym("sale_logged"), u32(7)],
      tuple(u32(99), addr(AFFILIATE), i128(1_000n)),
    );
    const claim = makeEvent(
      [sym("claim_payout"), u32(7)],
      tuple(u32(99), addr(AFFILIATE), i128(500n)),
      "0000000004-0000000001",
    );

    applyEvent(store, sale);
    applyEvent(store, claim);

    expect(store.sales[0].campaignId).toBe(7);
    expect(store.claims[0].campaignId).toBe(7);
  });

  it("falls back to the campaign id in the data when the topics have none", () => {
    const store = new Store();
    const sale = makeEvent([sym("sale_logged")], tuple(u32(42), addr(AFFILIATE), i128(1_000n)));

    applyEvent(store, sale);

    expect(store.sales[0].campaignId).toBe(42);
  });

  it("returns false and leaves the store untouched for unknown events", () => {
    const store = new Store();
    applyEvent(store, campaignEvent(7)); // pre-existing data to compare against
    const before = JSON.stringify({
      campaigns: [...store.campaigns.values()],
      sales: store.sales,
      claims: store.claims,
    });

    const unknown = makeEvent([sym("something_else"), u32(7)], tuple(u32(7), i128(1n)));

    expect(applyEvent(store, unknown)).toBe(false);
    expect(
      JSON.stringify({
        campaigns: [...store.campaigns.values()],
        sales: store.sales,
        claims: store.claims,
      }),
    ).toBe(before);
  });

  it("does not duplicate a sale when the same event is applied twice", () => {
    const store = new Store();
    const sale = makeEvent([sym("sale_logged"), u32(7)], tuple(u32(7), addr(AFFILIATE), i128(1_000n)));

    applyEvent(store, sale);
    applyEvent(store, sale);

    expect(store.sales).toHaveLength(1);
  });
});