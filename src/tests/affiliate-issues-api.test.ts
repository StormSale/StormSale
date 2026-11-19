import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { API_URL } from "../utils/api";
import {
  fetchAffiliateIssueReports,
  submitAffiliateIssueReport,
} from "../utils/affiliateIssuesApi";

const report = {
  id: "issue-1",
  affiliateAddress: "Gaffiliate",
  campaignId: "spring-campaign",
  saleDate: "2026-10-10",
  details: "My attributed sale is missing from this campaign.",
  attachmentCount: 0,
  status: "submitted",
  createdAt: "2026-10-11T12:00:00.000Z",
};

describe("affiliate issue reporting API", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => vi.restoreAllMocks());
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("loads and validates reports for the connected affiliate", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify([report])));
    globalThis.fetch = fetchMock;

    await expect(fetchAffiliateIssueReports("Gaffiliate")).resolves.toEqual([report]);
    expect(fetchMock).toHaveBeenCalledWith(
      `${API_URL}/affiliate/issues?affiliateAddress=Gaffiliate`,
      { signal: undefined },
    );
  });

  it("submits form fields and attachments as multipart data", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify(report), { status: 201 }));
    globalThis.fetch = fetchMock;
    const attachment = new File(["evidence"], "sale.png", { type: "image/png" });

    await expect(
      submitAffiliateIssueReport({
        affiliateAddress: "Gaffiliate",
        campaignId: "spring-campaign",
        saleDate: "2026-10-10",
        details: "My attributed sale is missing from this campaign.",
        attachments: [attachment],
      }),
    ).resolves.toEqual(report);

    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${API_URL}/affiliate/issues`);
    expect(options.method).toBe("POST");
    expect(options.headers).toBeUndefined();
    expect(options.body).toBeInstanceOf(FormData);
    expect((options.body as FormData).get("affiliateAddress")).toBe("Gaffiliate");
    expect((options.body as FormData).get("attachments")).toMatchObject({ name: "sale.png" });
  });

  it("reports unavailable backend errors instead of returning empty reports", async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ error: "Reporting is not configured" }), { status: 503 }),
      );

    await expect(fetchAffiliateIssueReports("Gaffiliate")).rejects.toThrow(
      "Reporting is not configured",
    );
  });
});
