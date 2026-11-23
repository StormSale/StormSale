import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { API_URL } from "../utils/api";
import {
  fetchAffiliateIssueReports,
  submitAffiliateIssueReport,
} from "../utils/affiliateIssuesApi";
import type { MessageSigner } from "../lib/telegramClient";

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
    const signer: MessageSigner = vi.fn().mockResolvedValue("signed-read-proof");

    await expect(fetchAffiliateIssueReports("Gaffiliate", undefined, signer)).resolves.toEqual([
      report,
    ]);
    expect(fetchMock).toHaveBeenCalledWith(
      `${API_URL}/affiliate/issues`,
      expect.objectContaining({
        headers: expect.objectContaining({
          "X-StormSale-Wallet": "Gaffiliate",
          "X-StormSale-Signature": "signed-read-proof",
        }),
        signal: undefined,
      }),
    );
    expect(signer).toHaveBeenCalledWith(expect.stringContaining("Action: read"), "Gaffiliate");
  });

  it("submits validated report metadata with a wallet signature", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify(report), { status: 201 }));
    globalThis.fetch = fetchMock;
    const signer: MessageSigner = vi.fn().mockResolvedValue("signed-submit-proof");

    await expect(
      submitAffiliateIssueReport(
        {
          affiliateAddress: "Gaffiliate",
          campaignId: "spring-campaign",
          saleDate: "2026-10-10",
          details: "My attributed sale is missing from this campaign.",
          attachments: [],
        },
        signer,
      ),
    ).resolves.toEqual(report);

    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${API_URL}/affiliate/issues`);
    expect(options.method).toBe("POST");
    expect(options.headers).toMatchObject({
      "X-StormSale-Wallet": "Gaffiliate",
      "X-StormSale-Signature": "signed-submit-proof",
      "Content-Type": "application/json",
    });
    expect(JSON.parse(String(options.body))).toEqual({
      campaignId: "spring-campaign",
      saleDate: "2026-10-10",
      details: "My attributed sale is missing from this campaign.",
    });
    expect(signer).toHaveBeenCalledWith(expect.stringContaining("Action: submit"), "Gaffiliate");
  });

  it("does not send evidence when private file storage is unavailable", async () => {
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock;
    const signer: MessageSigner = vi.fn();
    const attachment = new File(["evidence"], "sale.png", { type: "image/png" });

    await expect(
      submitAffiliateIssueReport(
        {
          affiliateAddress: "Gaffiliate",
          campaignId: "spring-campaign",
          saleDate: "2026-10-10",
          details: "My attributed sale is missing from this campaign.",
          attachments: [attachment],
        },
        signer,
      ),
    ).rejects.toThrow("Private evidence storage is not configured");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(signer).not.toHaveBeenCalled();
  });

  it("reports unavailable backend errors instead of returning empty reports", async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ error: "Reporting is not configured" }), { status: 503 }),
      );
    const signer: MessageSigner = vi.fn().mockResolvedValue("signed-read-proof");

    await expect(fetchAffiliateIssueReports("Gaffiliate", undefined, signer)).rejects.toThrow(
      "Reporting is not configured",
    );
  });
});
