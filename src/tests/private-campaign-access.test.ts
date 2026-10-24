import { beforeEach, describe, expect, it } from "vitest";
import { getLocalStorage } from "../lib/storage";
import {
  CampaignAccessError,
  MAX_CHANNELS,
  assertAffiliateAllowed,
  buildTrackingLink,
  getAffiliateAccess,
  getCampaignPolicy,
  isChannelUrl,
  listApplications,
  normalizeCampaignId,
  reviewApplication,
  setCampaignVisibility,
  submitApplication,
} from "../lib/campaignAccess";

const ADVERTISER = "GADVERTISER" + "A".repeat(45);
const OTHER_ADVERTISER = "GOTHERADV" + "B".repeat(47);
const AFFILIATE = "GAFFILIATE" + "C".repeat(46);
const AFFILIATE_2 = "GAFFILIATETWO" + "D".repeat(43);

const apply = (affiliate = AFFILIATE, campaignId: string | number = 7) =>
  submitApplication({
    campaignId,
    affiliate,
    channels: ["https://youtube.com/@reviews", "https://blog.example.com"],
    message: "Tech reviewer, 40k subscribers",
  });

beforeEach(() => {
  getLocalStorage().clear();
});

describe("Private campaigns & affiliate applications", () => {
  describe("campaign visibility", () => {
    it("reports a campaign with no policy here as unknown, not public, and still allows it", () => {
      expect(getCampaignPolicy(7)).toBeNull();
      expect(getAffiliateAccess(7, AFFILIATE)).toMatchObject({
        allowed: true,
        visibility: "unknown",
        status: "none",
      });
      expect(getAffiliateAccess(7, AFFILIATE).reason).toMatch(
        /not .*stored in this browser|No access setting/,
      );
      expect(() => buildTrackingLink(7, AFFILIATE, "https://stormsale.app")).not.toThrow();
    });

    it("reports public only when a policy says so", () => {
      setCampaignVisibility(7, ADVERTISER, "public");
      expect(getAffiliateAccess(7, AFFILIATE)).toMatchObject({
        allowed: true,
        visibility: "public",
      });
    });

    it("records a private campaign against its advertiser", () => {
      setCampaignVisibility(7, ADVERTISER, "private");
      expect(getCampaignPolicy("7")).toMatchObject({
        visibility: "private",
        advertiser: ADVERTISER,
      });
    });

    it("lets only the owning advertiser change visibility", () => {
      setCampaignVisibility(7, ADVERTISER, "private");
      expect(() => setCampaignVisibility(7, OTHER_ADVERTISER, "public")).toThrow(
        /Only the advertiser/,
      );
      expect(getCampaignPolicy(7)?.visibility).toBe("private");
    });

    it("normalises campaign ids and refuses non-numeric ones", () => {
      expect(normalizeCampaignId(" 0042 ")).toBe("42");
      expect(() => normalizeCampaignId("CCAMPAIGN")).toThrow(/whole number/);
      expect(() => normalizeCampaignId("-1")).toThrow();
      expect(() => normalizeCampaignId(2 ** 32)).toThrow();
    });
  });

  // Acceptance criterion 1
  describe("affiliates submit applications with promotional channel links", () => {
    beforeEach(() => setCampaignVisibility(7, ADVERTISER, "private"));

    it("stores a pending application with the channels", () => {
      const application = apply();
      expect(application).toMatchObject({
        campaignId: "7",
        affiliate: AFFILIATE,
        status: "pending",
        channels: ["https://youtube.com/@reviews", "https://blog.example.com"],
      });
      expect(listApplications({ advertiser: ADVERTISER, status: "pending" })).toHaveLength(1);
    });

    it("requires at least one valid http(s) channel link", () => {
      const base = { campaignId: 7, affiliate: AFFILIATE };
      expect(() => submitApplication({ ...base, channels: [] })).toThrow(/at least one/);
      expect(() => submitApplication({ ...base, channels: ["  "] })).toThrow(/at least one/);
      expect(() => submitApplication({ ...base, channels: ["not a url"] })).toThrow(/not a valid/);
      expect(() => submitApplication({ ...base, channels: ["javascript:alert(1)"] })).toThrow(
        /not a valid/,
      );
      const tooMany = Array.from(
        { length: MAX_CHANNELS + 1 },
        (_, i) => `https://site${i}.example.com`,
      );
      expect(() => submitApplication({ ...base, channels: tooMany })).toThrow(/at most/);
    });

    it("de-duplicates repeated channel links", () => {
      const application = submitApplication({
        campaignId: 7,
        affiliate: AFFILIATE,
        channels: ["https://a.example.com", " https://a.example.com "],
      });
      expect(application.channels).toEqual(["https://a.example.com"]);
    });

    it("refuses a second application while one is pending", () => {
      apply();
      expect(() => apply()).toThrow(/already awaiting review/);
    });

    it("refuses applications to a public campaign, which need none", () => {
      setCampaignVisibility(8, ADVERTISER, "public");
      expect(() => apply(AFFILIATE, 8)).toThrow(/public/);
      expect(() => apply(AFFILIATE, 9)).toThrow(/public/); // no policy at all
    });

    it("refuses the campaign's own advertiser and malformed wallets", () => {
      expect(() => apply(ADVERTISER)).toThrow(/own this campaign/);
      expect(() => apply("not-a-wallet")).toThrow(/valid Stellar wallet/);
    });

    it("validates channel URLs by protocol and host", () => {
      expect(isChannelUrl("https://twitter.com/handle")).toBe(true);
      expect(isChannelUrl("http://example.org")).toBe(true);
      expect(isChannelUrl("ftp://example.org")).toBe(false);
      expect(isChannelUrl("https://localhost")).toBe(false);
    });
  });

  // Acceptance criterion 2
  describe("advertisers review applications with one click", () => {
    beforeEach(() => setCampaignVisibility(7, ADVERTISER, "private"));

    it("approves in a single call, unlocking link generation", () => {
      const { id } = apply();
      expect(() => buildTrackingLink(7, AFFILIATE, "https://stormsale.app")).toThrow(
        CampaignAccessError,
      );

      reviewApplication(id, ADVERTISER, "approved");

      expect(getAffiliateAccess(7, AFFILIATE)).toMatchObject({ allowed: true, status: "approved" });
      expect(buildTrackingLink(7, AFFILIATE, "https://stormsale.app")).toBe(
        `https://stormsale.app/?campaign=7&ref=${AFFILIATE}`,
      );
    });

    it("rejects in a single call", () => {
      const { id } = apply();
      const reviewed = reviewApplication(id, ADVERTISER, "rejected");
      expect(reviewed).toMatchObject({ status: "rejected", reviewedBy: ADVERTISER });
      expect(reviewed.reviewedAt).toBeTypeOf("number");
    });

    it("lets only the campaign's advertiser review", () => {
      const { id } = apply();
      expect(() => reviewApplication(id, OTHER_ADVERTISER, "approved")).toThrow(
        /Only the campaign's advertiser/,
      );
      expect(() => reviewApplication(id, AFFILIATE, "approved")).toThrow(
        /Only the campaign's advertiser/,
      );
      expect(getAffiliateAccess(7, AFFILIATE).allowed).toBe(false);
    });

    it("shows each advertiser only their own campaigns' applications", () => {
      setCampaignVisibility(20, OTHER_ADVERTISER, "private");
      apply(AFFILIATE, 7);
      apply(AFFILIATE, 20);
      expect(listApplications({ advertiser: ADVERTISER }).map((a) => a.campaignId)).toEqual(["7"]);
      expect(listApplications({ advertiser: OTHER_ADVERTISER }).map((a) => a.campaignId)).toEqual([
        "20",
      ]);
    });

    it("lets the advertiser reverse a decision", () => {
      const { id } = apply();
      reviewApplication(id, ADVERTISER, "rejected");
      reviewApplication(id, ADVERTISER, "approved");
      expect(getAffiliateAccess(7, AFFILIATE).allowed).toBe(true);
    });
  });

  // Acceptance criterion 3
  describe("rejected affiliates cannot log sales on private campaigns", () => {
    beforeEach(() => setCampaignVisibility(7, ADVERTISER, "private"));

    it("blocks the sale gate for a rejected affiliate, with the reason", () => {
      reviewApplication(apply().id, ADVERTISER, "rejected");
      try {
        assertAffiliateAllowed(7, AFFILIATE);
        expect.unreachable("a rejected affiliate must not pass the sale gate");
      } catch (err) {
        expect(err).toBeInstanceOf(CampaignAccessError);
        expect((err as CampaignAccessError).access).toMatchObject({
          allowed: false,
          status: "rejected",
        });
        expect((err as Error).message).toMatch(/rejected/);
      }
    });

    it("blocks pending and never-applied affiliates too", () => {
      apply(AFFILIATE);
      expect(() => assertAffiliateAllowed(7, AFFILIATE)).toThrow(/awaiting/);
      expect(() => assertAffiliateAllowed(7, AFFILIATE_2)).toThrow(/has not applied/);
    });

    it("stops a rejected affiliate re-applying around the decision", () => {
      reviewApplication(apply().id, ADVERTISER, "rejected");
      expect(() => apply()).toThrow(/declined/);
      expect(listApplications({ campaignId: 7, affiliate: AFFILIATE })).toHaveLength(1);
    });

    it("blocks link generation for a rejected affiliate", () => {
      reviewApplication(apply().id, ADVERTISER, "rejected");
      expect(() => buildTrackingLink(7, AFFILIATE, "https://stormsale.app")).toThrow(
        CampaignAccessError,
      );
    });

    it("scopes a rejection to its own campaign", () => {
      setCampaignVisibility(8, ADVERTISER, "private");
      reviewApplication(apply(AFFILIATE, 7).id, ADVERTISER, "rejected");
      reviewApplication(apply(AFFILIATE, 8).id, ADVERTISER, "approved");
      expect(getAffiliateAccess(7, AFFILIATE).allowed).toBe(false);
      expect(getAffiliateAccess(8, AFFILIATE).allowed).toBe(true);
      expect(getAffiliateAccess(99, AFFILIATE).allowed).toBe(true); // no policy here
    });

    it("matches wallet addresses case-insensitively", () => {
      reviewApplication(apply().id, ADVERTISER, "rejected");
      expect(getAffiliateAccess(7, AFFILIATE.toLowerCase()).allowed).toBe(false);
    });
  });
});
