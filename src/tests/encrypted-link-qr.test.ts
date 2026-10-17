import { describe, it, expect } from "vitest";
import { buildReferralLink } from "../lib/referralLink";

describe("Encrypted Link & QR Generator (#46)", () => {
  it("generates URL with ref and tag params", async () => {
    const link = await buildReferralLink({
      campaignId: "1042",
      affiliateAddress: "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
      origin: "https://stormsale.xyz",
    });
    const url = new URL(link);
    expect(url.pathname).toBe("/c/1042");
    expect(url.searchParams.get("ref")).toBeTruthy();
    expect(url.searchParams.get("tag")).toBeTruthy();
  });
});
