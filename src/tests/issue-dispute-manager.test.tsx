// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { IssueDisputeManager } from "../components/affiliate/IssueDisputeManager";
import * as disputesUtil from "../utils/disputes";

vi.mock("../hooks/useWeb3", () => ({
  useWeb3: () => ({
    userAddress: "GBBD5678TESTWALLETADDRESSXXXX",
  }),
}));

describe("IssueDisputeManager Component Suite (#51, #55, #95)", () => {
  const mockDisputes: disputesUtil.DisputeReport[] = [
    {
      id: "DSP-1001",
      campaignId: 1,
      campaignName: "Tech Gadgets Pro",
      orderReference: "ORD-001",
      referralLinkUsed: "https://stormsale.xyz/c/1?ref=GBBD5678",
      estimatedSaleAmountXlm: 100,
      expectedCommissionXlm: 10,
      category: "missing_attribution",
      description: "Missing order attribution note",
      status: "submitted",
      submittedAt: "10/10/2026, 10:00 AM",
      updatedAt: "10/10/2026, 10:00 AM",
    },
    {
      id: "DSP-1002",
      campaignId: 2,
      campaignName: "Web3 Masterclass 2026",
      orderReference: "ORD-002",
      referralLinkUsed: "https://stormsale.xyz/c/2?ref=GBBD5678",
      estimatedSaleAmountXlm: 200,
      expectedCommissionXlm: 20,
      category: "uncredited_sale",
      description: "Uncredited conversion",
      status: "under_review",
      submittedAt: "10/11/2026, 11:00 AM",
      updatedAt: "10/11/2026, 11:00 AM",
    },
    {
      id: "DSP-1003",
      campaignId: 3,
      campaignName: "Crypto Security Hardware",
      orderReference: "ORD-003",
      referralLinkUsed: "https://stormsale.xyz/c/3?ref=GBBD5678",
      estimatedSaleAmountXlm: 300,
      expectedCommissionXlm: 30,
      category: "delayed_clearing",
      description: "Delayed clearing note",
      status: "investigating",
      submittedAt: "10/12/2026, 12:00 PM",
      updatedAt: "10/12/2026, 12:00 PM",
      attachmentName: "screenshot.png",
      attachmentSize: "120 KB",
    },
    {
      id: "DSP-1004",
      campaignId: 4,
      campaignName: "DeFi Yield Aggregator",
      orderReference: "ORD-004",
      referralLinkUsed: "https://stormsale.xyz/c/4?ref=GBBD5678",
      estimatedSaleAmountXlm: 400,
      expectedCommissionXlm: 40,
      category: "incorrect_commission",
      description: "Approved dispute notes",
      status: "approved",
      submittedAt: "10/13/2026, 01:00 PM",
      updatedAt: "10/13/2026, 01:00 PM",
      advertiserResponse: "Approved by advertiser",
    },
    {
      id: "DSP-1005",
      campaignId: 1,
      campaignName: "Tech Gadgets Pro",
      orderReference: "ORD-005",
      referralLinkUsed: "https://stormsale.xyz/c/1?ref=GBBD5678",
      estimatedSaleAmountXlm: 500,
      expectedCommissionXlm: 50,
      category: "other",
      description: "Rejected dispute notes",
      status: "rejected",
      submittedAt: "10/14/2026, 02:00 PM",
      updatedAt: "10/14/2026, 02:00 PM",
    },
  ];

  beforeEach(() => {
    vi.spyOn(disputesUtil, "fetchDisputes").mockResolvedValue(mockDisputes);
    vi.spyOn(disputesUtil, "submitDisputeReport").mockImplementation(async (data) => ({
      id: "DSP-9999",
      ...data,
      status: "submitted",
      submittedAt: "10/22/2026, 01:00 PM",
      updatedAt: "10/22/2026, 01:00 PM",
    }));

    // Mock FileReader for jsdom
    class MockFileReader {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      result: string | null = "data:image/png;base64,mock";
      readAsDataURL() {
        this.onload?.();
      }
    }
    (window as any).FileReader = MockFileReader;
    (globalThis as any).FileReader = MockFileReader;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("renders closed dialog when isOpen is false", () => {
    const { container } = render(
      <IssueDisputeManager isOpen={false} onClose={() => {}} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders dispute form when isOpen is true and validates required fields", async () => {
    const handleClose = vi.fn();
    render(<IssueDisputeManager isOpen={true} onClose={handleClose} initialTab="form" />);

    expect(screen.getByText(/Affiliate Dispute & Issue Reporting/i)).toBeTruthy();

    const form = document.querySelector("form");
    expect(form).toBeTruthy();

    // Trigger form submit without required fields
    fireEvent.submit(form!);

    expect(screen.getByText(/Please provide an order reference and detailed description/i)).toBeTruthy();

    // Test Cancel button
    const cancelBtn = screen.getByRole("button", { name: /Cancel/i });
    fireEvent.click(cancelBtn);
    expect(handleClose).toHaveBeenCalledTimes(1);
  });

  it("updates form fields and validates estimated sale amount", async () => {
    render(<IssueDisputeManager isOpen={true} onClose={() => {}} initialTab="form" />);

    // Select campaign
    const campaignSelect = screen.getByLabelText(/Target Campaign/i);
    fireEvent.change(campaignSelect, { target: { value: "2" } });

    // Select category
    const categorySelect = screen.getByLabelText(/Dispute Reason/i);
    fireEvent.change(categorySelect, { target: { value: "uncredited_sale" } });

    // Enter order reference
    const orderInput = screen.getByLabelText(/Order \/ Tx Reference ID/i);
    fireEvent.change(orderInput, { target: { value: "ORD-TEST-1234" } });

    // Enter description
    const descInput = screen.getByLabelText(/Dispute Explanation & Context/i);
    fireEvent.change(descInput, { target: { value: "Customer completed conversion without cookie." } });

    // Set invalid estimated sale amount
    const amountInput = screen.getByLabelText(/Estimated Sale Amount/i);
    fireEvent.change(amountInput, { target: { value: "-50" } });

    const form = document.querySelector("form")!;
    fireEvent.submit(form);

    expect(screen.getByText(/positive sale amount/i)).toBeTruthy();

    // Set valid estimated sale amount
    fireEvent.change(amountInput, { target: { value: "300" } });
    expect(screen.getByText("30.00 XLM")).toBeTruthy();
  });

  it("handles file selection, rejection, and removal", async () => {
    render(<IssueDisputeManager isOpen={true} onClose={() => {}} initialTab="form" />);

    const fileInput = document.getElementById("dispute-file-input") as HTMLInputElement;
    expect(fileInput).toBeTruthy();

    // Test invalid file type
    const textFile = new File(["test content"], "notes.txt", { type: "text/plain" });
    fireEvent.change(fileInput, { target: { files: [textFile] } });
    expect(screen.getByText(/Unsupported file format/i)).toBeTruthy();

    // Test oversized file (>5MB)
    const largeFile = new File([new Uint8Array(6 * 1024 * 1024)], "large.png", { type: "image/png" });
    fireEvent.change(fileInput, { target: { files: [largeFile] } });
    expect(screen.getByText(/File size exceeds 5MB limit/i)).toBeTruthy();

    // Test valid PDF file
    const pdfFile = new File(["%PDF-1.4 mock"], "invoice.pdf", { type: "application/pdf" });
    fireEvent.change(fileInput, { target: { files: [pdfFile] } });

    await waitFor(() => {
      expect(screen.getByText("invoice.pdf")).toBeTruthy();
    });

    // Remove file
    const removeBtn = screen.getByTitle("Remove attachment");
    fireEvent.click(removeBtn);
    expect(screen.queryByText("invoice.pdf")).toBeNull();

    // Test valid image file
    const newFileInput = document.getElementById("dispute-file-input") as HTMLInputElement;
    const imgFile = new File(["mock img"], "receipt.png", { type: "image/png" });
    fireEvent.change(newFileInput, { target: { files: [imgFile] } });

    await waitFor(() => {
      expect(screen.getByText("receipt.png")).toBeTruthy();
    });
  });

  it("submits valid dispute report and switches to tracker tab with success notification", async () => {
    const onSubmitted = vi.fn();
    render(
      <IssueDisputeManager
        isOpen={true}
        onClose={() => {}}
        onReportSubmitted={onSubmitted}
        initialTab="form"
        userAddress="GAAATESTUSERADDRESS123456789"
      />,
    );

    const orderInput = screen.getByLabelText(/Order \/ Tx Reference ID/i);
    fireEvent.change(orderInput, { target: { value: "ORD-9999-SUBMIT" } });

    const descInput = screen.getByLabelText(/Dispute Explanation & Context/i);
    fireEvent.change(descInput, { target: { value: "Sale logged by customer, proof verified." } });

    const amountInput = screen.getByLabelText(/Estimated Sale Amount/i);
    fireEvent.change(amountInput, { target: { value: "250" } });

    const form = document.querySelector("form")!;
    fireEvent.submit(form);

    await waitFor(() => {
      expect(disputesUtil.submitDisputeReport).toHaveBeenCalledTimes(1);
      expect(screen.getByText(/Dispute #DSP-9999 logged successfully/i)).toBeTruthy();
      expect(onSubmitted).toHaveBeenCalledTimes(1);
    });

    // Dismiss banner
    const dismissBtn = screen.getByLabelText("Dismiss message");
    fireEvent.click(dismissBtn);
    expect(screen.queryByText(/Dispute #DSP-9999 logged successfully/i)).toBeNull();
  });

  it("renders tracker tab with dispute cards and switches back to form via New Dispute", async () => {
    render(<IssueDisputeManager isOpen={true} onClose={() => {}} initialTab="tracker" />);

    await waitFor(() => {
      expect(screen.getByText("#DSP-1001")).toBeTruthy();
      expect(screen.getByText("#DSP-1002")).toBeTruthy();
      expect(screen.getByText("#DSP-1003")).toBeTruthy();
      expect(screen.getByText("#DSP-1004")).toBeTruthy();
      expect(screen.getByText("#DSP-1005")).toBeTruthy();
    });

    // Check status badges
    expect(screen.getByText("Submitted")).toBeTruthy();
    expect(screen.getByText("Under Review")).toBeTruthy();
    expect(screen.getByText("Investigating")).toBeTruthy();
    expect(screen.getByText("Approved & Credited")).toBeTruthy();
    expect(screen.getByText("Rejected")).toBeTruthy();

    // Check attached proof & advertiser response
    expect(screen.getByText("Attached Proof: screenshot.png")).toBeTruthy();
    expect(screen.getByText(/Approved by advertiser/i)).toBeTruthy();

    // Click "New Dispute" button in tracker tab
    const newDisputeBtn = screen.getByRole("button", { name: /New Dispute/i });
    fireEvent.click(newDisputeBtn);

    expect(screen.getByRole("button", { name: /Submit Dispute Report/i })).toBeTruthy();
  });

  it("renders empty state in tracker tab when no disputes exist", async () => {
    vi.spyOn(disputesUtil, "fetchDisputes").mockResolvedValueOnce([]);
    render(<IssueDisputeManager isOpen={true} onClose={() => {}} initialTab="tracker" />);

    await waitFor(() => {
      expect(screen.getByText("No disputes filed yet.")).toBeTruthy();
    });
  });

  it("handles keyboard events on upload dropzone and FileReader onerror", async () => {
    render(<IssueDisputeManager isOpen={true} onClose={() => {}} initialTab="form" />);

    const dropzone = screen.getByText(/Click to select screenshot or proof file/i).closest("label");
    expect(dropzone).toBeTruthy();

    // Test Enter and Space keyboard events on dropzone label
    fireEvent.keyDown(dropzone!, { key: "Enter" });
    fireEvent.keyDown(dropzone!, { key: " " });

    // Test FileReader error
    class FailingFileReader {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      readAsDataURL() {
        this.onerror?.();
      }
    }
    (window as any).FileReader = FailingFileReader;
    (globalThis as any).FileReader = FailingFileReader;

    const fileInput = document.getElementById("dispute-file-input") as HTMLInputElement;
    const imgFile = new File(["bad img"], "broken.png", { type: "image/png" });
    fireEvent.change(fileInput, { target: { files: [imgFile] } });

    await waitFor(() => {
      expect(screen.getByText(/Failed to read the attachment file/i)).toBeTruthy();
    });
  });
});
