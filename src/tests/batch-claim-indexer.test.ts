import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../lib/graphqlClient", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/graphqlClient")>();
  return { ...actual, fetchAffiliateClaimsFromIndexer: vi.fn() };
});

import { fetchAffiliateClaimsFromIndexer } from "../lib/graphqlClient";
import { fetchAffiliateMaturedClaims } from "../lib/batchClaim";

const mocked = vi.mocked(fetchAffiliateClaimsFromIndexer);

describe("fetchAffiliateMaturedClaims via the indexer", () => {
  beforeEach(() => mocked.mockReset());

  it("offers the net claimable amount, not the gross matured commission", async () => {
    mocked.mockResolvedValue([
      {
        campaignId: 7,
        advertiser: "GADV",
        clearingPeriodSecs: 7 * 86400,
        maturedCommissionStroops: "1000000000", // 100 XLM earned
        claimedStroops: "400000000", // 40 XLM already paid out
        claimableStroops: "600000000", // 60 XLM left
        maturedSalesCount: 3,
        lastSaleDate: "2026-10-09T10:00:00.000Z",
      },
    ]);

    const items = await fetchAffiliateMaturedClaims("GAFFILIATE");

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      campaignId: 7,
      claimableXlm: 60,
      clearingPeriodDays: 7,
      lastSaleDate: "2026-10-09",
      status: "matured",
    });
  });

  it("returns no items when everything has been claimed", async () => {
    mocked.mockResolvedValue([]);

    expect(await fetchAffiliateMaturedClaims("GAFFILIATE")).toEqual([]);
  });
});
