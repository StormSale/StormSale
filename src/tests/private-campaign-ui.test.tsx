import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderToString } from "react-dom/server";

/**
 * UI coverage for private campaigns (#147): the advertiser's visibility
 * toggle, the application queue, and the affiliate's apply screen — plus the
 * validation and storage guarantees the review asked for.
 */

const wallet = vi.hoisted(() => ({ userAddress: null as string | null }));

vi.mock("../hooks/useWeb3", () => ({
  useWeb3: () => ({
    userAddress: wallet.userAddress,
    isConnected: Boolean(wallet.userAddress),
    createCampaignOnChain: vi.fn(),
    tokenAllowance: 0,
    refreshTokenAllowance: vi.fn(),
    approveTokenAllowance: vi.fn(),
    assetBalances: {},
    getCampaignContract: vi.fn(),
  }),
}));

import { NotificationProvider } from "../context/NotificationContext";
import { AffiliateApplicationsQueue } from "../components/advertiser/AffiliateApplicationsQueue";
import { CampaignApplication } from "../components/affiliate/CampaignApplication";
import { CreateCampaignForm } from "../components/advertiser/CreateCampaignForm";
import {
  CampaignAccessStorageError,
  setCampaignVisibility,
  submitApplication,
} from "../lib/campaignAccess";
import { getLocalStorage } from "../lib/storage";
import { logSaleSchema } from "../lib/validation";

const ADVERTISER = "GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN7";
const AFFILIATE = "GBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFSHONUCEOASW7QC7OX2H";

const render = (ui: React.ReactElement) =>
  renderToString(<NotificationProvider>{ui}</NotificationProvider>);

beforeEach(() => {
  getLocalStorage().clear();
  wallet.userAddress = null;
});

describe("CreateCampaignForm — visibility toggle", () => {
  it("renders an accessible switch, off (public) by default", () => {
    wallet.userAddress = ADVERTISER;
    const html = render(<CreateCampaignForm />);
    expect(html).toContain('role="switch"');
    expect(html).toContain('aria-checked="false"');
    expect(html).toContain('aria-labelledby="campaign-private-label"');
    expect(html).toContain("Private / Application Required");
    expect(html).toContain("Any affiliate can generate a tracking link");
  });
});

describe("AffiliateApplicationsQueue", () => {
  it("lists a pending application with approve and reject actions for its advertiser", () => {
    setCampaignVisibility(7, ADVERTISER, "private");
    submitApplication({
      campaignId: 7,
      affiliate: AFFILIATE,
      channels: ["https://example.com/blog"],
      message: "Tech reviews",
    });
    wallet.userAddress = ADVERTISER;
    const html = render(<AffiliateApplicationsQueue />);
    expect(html).toContain("https://example.com/blog");
    expect(html).toContain(`aria-label="Approve ${AFFILIATE} for campaign 7"`);
    expect(html).toContain(`aria-label="Reject ${AFFILIATE} for campaign 7"`);
  });

  it("does not show another advertiser's applications", () => {
    setCampaignVisibility(7, ADVERTISER, "private");
    submitApplication({ campaignId: 7, affiliate: AFFILIATE, channels: ["https://example.com"] });
    wallet.userAddress = "GCEZWKCA5VLDNRLN3RPRJMRZOX3Z6G5CHCGSNFHEYVXM3XOJMDS674JZ";
    const html = render(<AffiliateApplicationsQueue />);
    expect(html).not.toContain("https://example.com");
    expect(html).not.toContain(`Approve ${AFFILIATE}`);
  });
});

describe("CampaignApplication", () => {
  it("renders the lookup form and no tracking link before anything is generated", () => {
    wallet.userAddress = AFFILIATE;
    const html = render(<CampaignApplication />);
    expect(html).toContain("Apply &amp; Tracking Links");
    expect(html).not.toContain("?campaign=");
  });
});

describe("Log sale — campaign id validation (u32)", () => {
  const base = { affiliateAddress: AFFILIATE, saleAmount: "10" };

  it("accepts an on-chain campaign id up to the u32 maximum", () => {
    expect(logSaleSchema.safeParse({ ...base, campaignAddress: "7" }).success).toBe(true);
    expect(logSaleSchema.safeParse({ ...base, campaignAddress: "4294967295" }).success).toBe(true);
  });

  it("rejects an id above u32 with a message instead of failing later on-chain", () => {
    const result = logSaleSchema.safeParse({ ...base, campaignAddress: "4294967296" });
    expect(result.success).toBe(false);
  });

  it("still accepts a contract address", () => {
    const result = logSaleSchema.safeParse({
      ...base,
      campaignAddress: "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC",
    });
    expect(result.success).toBe(true);
  });
});

describe("campaign access storage failures", () => {
  it("surface as CampaignAccessStorageError with a readable message", () => {
    const storage = getLocalStorage();
    const spy = vi.spyOn(storage, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });
    try {
      expect(() => setCampaignVisibility(9, ADVERTISER, "private")).toThrow(
        CampaignAccessStorageError,
      );
      expect(() => setCampaignVisibility(9, ADVERTISER, "private")).toThrow(
        /could not save the campaign access data \(QuotaExceededError\)/,
      );
    } finally {
      spy.mockRestore();
    }
  });
});
