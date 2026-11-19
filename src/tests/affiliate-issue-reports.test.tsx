// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AffiliateIssueReports } from "../components/affiliate/AffiliateIssueReports";
import type { AffiliateIssueReport } from "../utils/affiliateIssuesApi";

const mocks = vi.hoisted(() => ({
  useWeb3: vi.fn(),
  fetchReports: vi.fn(),
  submitReport: vi.fn(),
}));

vi.mock("../context/Web3Context", () => ({ useWeb3: mocks.useWeb3 }));
vi.mock("../utils/affiliateIssuesApi", () => ({
  fetchAffiliateIssueReports: mocks.fetchReports,
  submitAffiliateIssueReport: mocks.submitReport,
}));

const report: AffiliateIssueReport = {
  id: "issue-1",
  affiliateAddress: "Gaffiliate",
  campaignId: "spring-campaign",
  saleDate: "2026-10-10",
  details: "Sale was not included in the conversion list.",
  attachmentCount: 1,
  status: "under_review",
  createdAt: "2026-10-11T12:00:00.000Z",
};

describe("AffiliateIssueReports", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.useWeb3.mockReturnValue({ userAddress: "Gaffiliate" });
    mocks.fetchReports.mockResolvedValue([]);
    mocks.submitReport.mockResolvedValue(report);
  });

  afterEach(cleanup);

  it("submits a validated report with evidence and adds its status to the tracker", async () => {
    render(<AffiliateIssueReports />);
    fireEvent.change(screen.getByLabelText("Campaign ID *"), {
      target: { value: "spring-campaign" },
    });
    fireEvent.change(screen.getByLabelText("Sale date *"), {
      target: { value: "2026-10-10" },
    });
    fireEvent.change(screen.getByLabelText(/What happened/), {
      target: { value: "My attributed sale is missing from this campaign." },
    });
    const evidence = new File(["screenshot"], "sale.png", { type: "image/png" });
    fireEvent.change(screen.getByLabelText("Attach evidence optional"), {
      target: { files: [evidence] },
    });

    fireEvent.click(screen.getByRole("button", { name: "Submit report" }));

    await screen.findByText("Report issue-1 was accepted by the reporting service.");
    expect(mocks.submitReport).toHaveBeenCalledWith(
      expect.objectContaining({
        affiliateAddress: "Gaffiliate",
        campaignId: "spring-campaign",
        saleDate: "2026-10-10",
        attachments: [evidence],
      }),
    );
    expect(screen.getAllByText("Under review")).toHaveLength(2);
  });

  it("shows field validation errors without submitting", async () => {
    render(<AffiliateIssueReports />);
    fireEvent.click(screen.getByRole("button", { name: "Submit report" }));

    expect(await screen.findByText("Campaign ID is required")).toBeTruthy();
    expect(screen.getByText("Sale date is required")).toBeTruthy();
    expect(mocks.submitReport).not.toHaveBeenCalled();
  });

  it("rejects unsupported attachments and displays API load failures", async () => {
    mocks.fetchReports.mockRejectedValue(new Error("Reporting service unavailable"));
    render(<AffiliateIssueReports />);

    const invalidFile = new File(["not an image"], "script.svg", { type: "image/svg+xml" });
    fireEvent.change(screen.getByLabelText("Attach evidence optional"), {
      target: { files: [invalidFile] },
    });

    expect(await screen.findByText(/Reporting service unavailable/)).toBeTruthy();
    expect(screen.getByText(/use a JPG, PNG, WebP, PDF, or CSV/)).toBeTruthy();
    expect(screen.queryByText("script.svg")).toBeNull();
  });

  it("surfaces report submission errors instead of showing a success state", async () => {
    mocks.submitReport.mockRejectedValue(new Error("Backend unavailable"));
    render(<AffiliateIssueReports />);
    fireEvent.change(screen.getByLabelText("Campaign ID *"), {
      target: { value: "spring-campaign" },
    });
    fireEvent.change(screen.getByLabelText("Sale date *"), {
      target: { value: "2026-10-10" },
    });
    fireEvent.change(screen.getByLabelText(/What happened/), {
      target: { value: "My attributed sale is missing from this campaign." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Submit report" }));

    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toContain("Backend unavailable"),
    );
    expect(screen.queryByText(/was accepted by the reporting service/)).toBeNull();
  });
});
