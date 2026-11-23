// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
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

  it("keeps submission and status tracking unavailable without a reporting backend", () => {
    render(<AffiliateIssueReports />);

    expect(screen.getByText(/Issue reporting is unavailable until a backend/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Reporting unavailable" })).toHaveProperty(
      "disabled",
      true,
    );
    expect(screen.getByLabelText("Campaign ID *")).toHaveProperty("disabled", true);
    expect(mocks.fetchReports).not.toHaveBeenCalled();
    expect(mocks.submitReport).not.toHaveBeenCalled();
  });

  it("submits a validated report with evidence and adds its status to the tracker", async () => {
    render(<AffiliateIssueReports reportingServiceAvailable />);
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
    render(<AffiliateIssueReports reportingServiceAvailable />);
    fireEvent.click(screen.getByRole("button", { name: "Submit report" }));

    expect(await screen.findByText("Campaign ID is required")).toBeTruthy();
    expect(screen.getByText("Sale date is required")).toBeTruthy();
    expect(mocks.submitReport).not.toHaveBeenCalled();
  });

  it("rejects unsupported attachments and displays API load failures", async () => {
    mocks.fetchReports.mockRejectedValue(new Error("Reporting service unavailable"));
    render(<AffiliateIssueReports reportingServiceAvailable />);

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
    render(<AffiliateIssueReports reportingServiceAvailable />);
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
    expect(screen.getByLabelText("Campaign ID *")).toHaveProperty("value", "spring-campaign");
    expect(screen.queryByText(/was accepted by the reporting service/)).toBeNull();
  });

  it("ignores an older load error after a submission succeeds", async () => {
    let rejectLoad!: (error: Error) => void;
    const pendingLoad = new Promise<AffiliateIssueReport[]>((_, reject) => {
      rejectLoad = reject;
    });
    mocks.fetchReports.mockReturnValueOnce(pendingLoad);
    render(<AffiliateIssueReports reportingServiceAvailable />);
    fillValidDraft();
    fireEvent.click(screen.getByRole("button", { name: "Submit report" }));

    await screen.findByText("Report issue-1 was accepted by the reporting service.");
    rejectLoad(new Error("Stale load failed"));

    await waitFor(() => expect(screen.getByText("Report issue-1")).toBeTruthy());
    expect(screen.queryByText("Stale load failed")).toBeNull();
  });

  it("keeps a successful report when an older GET resolves afterward", async () => {
    let resolveLoad!: (reports: AffiliateIssueReport[]) => void;
    const pendingLoad = new Promise<AffiliateIssueReport[]>((resolve) => {
      resolveLoad = resolve;
    });
    mocks.fetchReports.mockReturnValueOnce(pendingLoad);
    render(<AffiliateIssueReports reportingServiceAvailable />);
    fillValidDraft();
    fireEvent.click(screen.getByRole("button", { name: "Submit report" }));

    await screen.findByText("Report issue-1 was accepted by the reporting service.");
    resolveLoad([]);

    await waitFor(() => expect(screen.getByText("Report issue-1")).toBeTruthy());
    expect(screen.getAllByText("Under review")).toHaveLength(2);
  });

  it("reloads existing reports after submission invalidates the initial GET", async () => {
    let resolveInitialLoad!: (reports: AffiliateIssueReport[]) => void;
    const pendingInitialLoad = new Promise<AffiliateIssueReport[]>((resolve) => {
      resolveInitialLoad = resolve;
    });
    const earlierReport: AffiliateIssueReport = {
      ...report,
      id: "issue-earlier",
      campaignId: "winter-campaign",
      status: "submitted",
    };
    mocks.fetchReports
      .mockReturnValueOnce(pendingInitialLoad)
      .mockResolvedValueOnce([earlierReport]);
    render(<AffiliateIssueReports reportingServiceAvailable />);
    fillValidDraft();
    fireEvent.click(screen.getByRole("button", { name: "Submit report" }));

    await screen.findByText("Report issue-1 was accepted by the reporting service.");
    await screen.findByText("Report issue-earlier");
    await act(async () => {
      resolveInitialLoad([earlierReport]);
    });

    expect(screen.getByText("Report issue-1")).toBeTruthy();
    expect(screen.getByText("Report issue-earlier")).toBeTruthy();
    expect(mocks.fetchReports).toHaveBeenCalledTimes(2);
  });

  it("prevents retries during submission and reloads the active request afterward", async () => {
    let resolveSubmit!: (value: AffiliateIssueReport) => void;
    mocks.fetchReports.mockRejectedValueOnce(new Error("Initial load failed"));
    mocks.submitReport.mockReturnValueOnce(
      new Promise<AffiliateIssueReport>((resolve) => {
        resolveSubmit = resolve;
      }),
    );
    render(<AffiliateIssueReports reportingServiceAvailable />);
    await screen.findByText("Initial load failed");

    fillValidDraft();
    fireEvent.click(screen.getByRole("button", { name: "Submit report" }));
    const retryButton = screen.getByRole("button", { name: "Try again" });
    expect(retryButton).toHaveProperty("disabled", true);
    fireEvent.click(retryButton);
    expect(mocks.fetchReports).toHaveBeenCalledTimes(1);

    resolveSubmit(report);
    await screen.findByText("Report issue-1 was accepted by the reporting service.");
    await waitFor(() => expect(screen.getByText("Report issue-1")).toBeTruthy());
    expect(screen.queryByText("Initial load failed")).toBeNull();
    expect(mocks.fetchReports).toHaveBeenCalledTimes(2);
  });

  it("ignores a pending submission after the connected wallet changes", async () => {
    let resolveSubmit!: (value: AffiliateIssueReport) => void;
    mocks.submitReport.mockReturnValueOnce(
      new Promise<AffiliateIssueReport>((resolve) => {
        resolveSubmit = resolve;
      }),
    );
    const { rerender } = render(<AffiliateIssueReports reportingServiceAvailable />);
    fillValidDraft();
    fireEvent.click(screen.getByRole("button", { name: "Submit report" }));
    expect(screen.getByLabelText("Campaign ID *")).toHaveProperty("disabled", true);

    mocks.useWeb3.mockReturnValue({ userAddress: "Gdifferent" });
    rerender(<AffiliateIssueReports reportingServiceAvailable />);
    resolveSubmit(report);

    await waitFor(() => expect(screen.getByLabelText("Campaign ID *")).toHaveProperty("value", ""));
    expect(screen.getByRole("button", { name: "Submit report" })).toHaveProperty("disabled", false);
    expect(screen.queryByText("Report issue-1 was accepted by the reporting service.")).toBeNull();
    expect(screen.queryByText("Report issue-1")).toBeNull();
  });
});

function fillValidDraft() {
  fireEvent.change(screen.getByLabelText("Campaign ID *"), {
    target: { value: "spring-campaign" },
  });
  fireEvent.change(screen.getByLabelText("Sale date *"), {
    target: { value: "2026-10-10" },
  });
  fireEvent.change(screen.getByLabelText(/What happened/), {
    target: { value: "My attributed sale is missing from this campaign." },
  });
}
