// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Interactive coverage for the private-campaign screens (#147): the
 * affiliate's status card and application form, live refresh on the
 * `stormsale:campaign-access` event, and the advertiser's approve / reject
 * notifications.
 */

const wallet = vi.hoisted(() => ({ userAddress: null as string | null }));
const notify = vi.hoisted(() => vi.fn());

vi.mock("../hooks/useWeb3", () => ({
  useWeb3: () => ({ userAddress: wallet.userAddress, isConnected: Boolean(wallet.userAddress) }),
}));
// lib/stellar pulls in network config that cannot build Stellar assets under
// jsdom; the queue only needs the address formatter from it.
vi.mock("../lib/stellar", () => ({
  formatStellarAddress: (a: string) => `${a.slice(0, 4)}…${a.slice(-4)}`,
}));
vi.mock("../context/NotificationContext", () => ({
  useNotification: () => ({ showNotification: notify }),
}));

import { AffiliateApplicationsQueue } from "../components/advertiser/AffiliateApplicationsQueue";
import { CampaignApplication } from "../components/affiliate/CampaignApplication";
import {
  getApplication,
  reviewApplication,
  setCampaignVisibility,
  submitApplication,
} from "../lib/campaignAccess";
import { getLocalStorage } from "../lib/storage";

const ADVERTISER = "GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN7";
const AFFILIATE = "GBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFSHONUCEOASW7QC7OX2H";

beforeEach(() => {
  getLocalStorage().clear();
  notify.mockReset();
  wallet.userAddress = null;
});
afterEach(() => cleanup());

function lookUp(id: string) {
  fireEvent.change(screen.getByPlaceholderText(/Campaign ID/), { target: { value: id } });
  fireEvent.click(screen.getByRole("button", { name: "Check Access" }));
}

describe("CampaignApplication — status card and form", () => {
  it("shows the application form only while the affiliate has not applied", () => {
    setCampaignVisibility(7, ADVERTISER, "private");
    wallet.userAddress = AFFILIATE;
    render(<CampaignApplication />);
    lookUp("7");

    expect(screen.getByText("Private campaign — application required")).toBeTruthy();
    expect(screen.queryByText(/Generate/)).toBeNull();
    fireEvent.change(screen.getAllByPlaceholderText(/https/)[0], {
      target: { value: "https://example.com/blog" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Submit Application/ }));

    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Application Submitted" }),
    );
    expect(getApplication(7, AFFILIATE)?.status).toBe("pending");
    expect(screen.getByText("Application under review")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Submit Application/ })).toBeNull();
  });

  it("refreshes when the advertiser decides, via the campaign-access event", () => {
    setCampaignVisibility(7, ADVERTISER, "private");
    const application = submitApplication({
      campaignId: 7,
      affiliate: AFFILIATE,
      channels: ["https://example.com"],
    });
    wallet.userAddress = AFFILIATE;
    render(<CampaignApplication />);
    lookUp("7");
    expect(screen.getByText("Application under review")).toBeTruthy();

    // reviewApplication writes storage and dispatches stormsale:campaign-access.
    act(() => {
      reviewApplication(application.id, ADVERTISER, "approved");
    });
    expect(screen.getByText("You're approved")).toBeTruthy();

    act(() => {
      reviewApplication(application.id, ADVERTISER, "rejected");
    });
    expect(screen.getByText("Application declined")).toBeTruthy();
  });

  it("says it cannot tell when this browser holds no access setting", () => {
    wallet.userAddress = AFFILIATE;
    render(<CampaignApplication />);
    lookUp("42");
    expect(screen.getByText("Access setting not available on this device")).toBeTruthy();
    expect(screen.queryByText("Public campaign")).toBeNull();
  });
});

describe("CampaignApplication — links, channels and errors", () => {
  it("asks for a wallet before anything else", () => {
    render(<CampaignApplication />);
    expect(screen.getByText(/Connect your wallet to apply/)).toBeTruthy();
  });

  it("refuses a campaign id that is not a number", () => {
    wallet.userAddress = AFFILIATE;
    render(<CampaignApplication />);
    lookUp("abc");
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({ title: "Invalid Campaign ID" }));
  });

  it("adds and removes channel links, and reports an application it cannot take", () => {
    setCampaignVisibility(7, ADVERTISER, "private");
    wallet.userAddress = AFFILIATE;
    render(<CampaignApplication />);
    lookUp("7");

    fireEvent.click(screen.getByRole("button", { name: /Add another channel/ }));
    expect(screen.getAllByPlaceholderText(/https/)).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: "Remove channel link 2" }));
    expect(screen.getAllByPlaceholderText(/https/)).toHaveLength(1);

    fireEvent.change(screen.getByPlaceholderText(/Audience size/), { target: { value: "Tech" } });
    // No channel link: the library refuses it, and the form says why.
    // (Submitted directly: the browser's own `required` check would stop a click.)
    fireEvent.submit(screen.getByRole("button", { name: /Submit Application/ }).closest("form")!);
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({ title: "Could Not Apply" }));
    expect(getApplication(7, AFFILIATE)).toBeNull();
  });

  it("generates and copies a tracking link for a public campaign", async () => {
    setCampaignVisibility(9, ADVERTISER, "public");
    const writeText = vi.fn(async () => undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    wallet.userAddress = AFFILIATE;
    render(<CampaignApplication />);
    lookUp("9");
    expect(screen.getByText("Public campaign")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /Generate Tracking Link/ }));
    const link = (screen.getByLabelText("Your tracking link") as HTMLInputElement).value;
    expect(link).toContain("campaign=9");
    expect(link).toContain(AFFILIATE);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Copy tracking link" }));
    });
    expect(writeText).toHaveBeenCalledWith(link);

    writeText.mockRejectedValueOnce(new Error("denied"));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Copy tracking link" }));
    });
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({ title: "Copy Failed" }));
  });

  it("drops the previous wallet's link after an account switch", () => {
    setCampaignVisibility(9, ADVERTISER, "public");
    wallet.userAddress = AFFILIATE;
    const { rerender } = render(<CampaignApplication />);
    lookUp("9");
    fireEvent.click(screen.getByRole("button", { name: /Generate Tracking Link/ }));
    expect(screen.queryByLabelText("Your tracking link")).toBeTruthy();

    wallet.userAddress = ADVERTISER;
    rerender(<CampaignApplication />);
    expect(screen.queryByLabelText("Your tracking link")).toBeNull();
  });

  it("hides the link as soon as an approval is withdrawn", () => {
    setCampaignVisibility(7, ADVERTISER, "private");
    const application = submitApplication({
      campaignId: 7,
      affiliate: AFFILIATE,
      channels: ["https://example.com"],
    });
    reviewApplication(application.id, ADVERTISER, "approved");
    wallet.userAddress = AFFILIATE;
    render(<CampaignApplication />);
    lookUp("7");
    fireEvent.click(screen.getByRole("button", { name: /Generate Tracking Link/ }));
    expect(screen.queryByLabelText("Your tracking link")).toBeTruthy();

    act(() => {
      reviewApplication(application.id, ADVERTISER, "rejected");
    });
    expect(screen.queryByLabelText("Your tracking link")).toBeNull();
  });
});

describe("AffiliateApplicationsQueue — decisions", () => {
  function seed() {
    setCampaignVisibility(7, ADVERTISER, "private");
    return submitApplication({
      campaignId: 7,
      affiliate: AFFILIATE,
      channels: ["https://example.com"],
    });
  }

  it("approves in one click and tells the advertiser", () => {
    const application = seed();
    wallet.userAddress = ADVERTISER;
    render(<AffiliateApplicationsQueue />);

    fireEvent.click(screen.getByRole("button", { name: `Approve ${AFFILIATE} for campaign 7` }));

    expect(getApplication(7, AFFILIATE)?.status).toBe("approved");
    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({ type: "success", title: "Affiliate Approved" }),
    );
    // Left the pending view.
    expect(
      screen.queryByRole("button", { name: `Approve ${AFFILIATE} for campaign 7` }),
    ).toBeNull();
    expect(application.status).toBe("pending"); // the returned record is a snapshot
  });

  it("rejects in one click and tells the advertiser", () => {
    seed();
    wallet.userAddress = ADVERTISER;
    render(<AffiliateApplicationsQueue />);

    fireEvent.click(screen.getByRole("button", { name: `Reject ${AFFILIATE} for campaign 7` }));

    expect(getApplication(7, AFFILIATE)?.status).toBe("rejected");
    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({ type: "info", title: "Affiliate Rejected" }),
    );
  });

  it("shows a new application without a reload", () => {
    setCampaignVisibility(7, ADVERTISER, "private");
    wallet.userAddress = ADVERTISER;
    render(<AffiliateApplicationsQueue />);
    const approve = { name: `Approve ${AFFILIATE} for campaign 7` };
    expect(screen.queryByRole("button", approve)).toBeNull();

    act(() => {
      submitApplication({
        campaignId: 7,
        affiliate: AFFILIATE,
        channels: ["https://example.com/new"],
      });
    });
    expect(screen.getByRole("button", approve)).toBeTruthy();
    expect(screen.getByRole("link", { name: /example\.com\/new/ }).getAttribute("href")).toBe(
      "https://example.com/new",
    );
  });
});
