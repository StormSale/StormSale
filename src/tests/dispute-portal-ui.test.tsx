/**
 * Dispute Submission Portal — UI suite (Issue #171)
 *
 * Rendered with `react-dom/server` in the node vitest environment, following
 * the house pattern from cohort-visualizer.test.tsx. SalesList reads persisted
 * disputes synchronously at mount time via a guarded window.localStorage
 * lookup, so the "Under Auditor Review" badge path is exercised by stubbing a
 * minimal window with a seeded dispute store.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { renderToString } from "react-dom/server";
import { SalesList, type Sale } from "../components/affiliate/SalesList";
import { DisputeEvidenceForm } from "../components/affiliate/DisputeSubmissionPortal";
import { DISPUTE_STORE_KEY } from "../lib/affiliate/disputePortal";

const CONVERSION_TX = "3f9c1e77a0b5d2448c1e3a05f6b7d8c9e0f1a2b3c4d5e6f708192a3b4c5d6e7f";

const contestedSale: Sale = {
  id: 4,
  affiliate: "GBBD...5678",
  saleAmount: "320.0",
  commissionAmount: "32.0",
  timestamp: Math.floor(Date.now() / 1000) - 3600,
  clearingPeriod: 604800,
  claimed: false,
  txHash: CONVERSION_TX,
  disputeState: "contested",
};

const rejectedSale: Sale = { ...contestedSale, id: 6, disputeState: "rejected" };

const cleanSale: Sale = {
  id: 7,
  affiliate: "GBBD...5678",
  saleAmount: "50.0",
  commissionAmount: "5.0",
  timestamp: Math.floor(Date.now() / 1000) - 7200,
  clearingPeriod: 604800,
  claimed: false,
};

function stubWindowWithDisputes(disputes: unknown[]): void {
  const store: Record<string, string> = {};
  if (disputes.length > 0) {
    store[DISPUTE_STORE_KEY] = JSON.stringify(disputes);
  }
  vi.stubGlobal("window", {
    localStorage: {
      getItem: (key: string) => (key in store ? store[key] : null),
      setItem: (key: string, value: string) => {
        store[key] = value;
      },
    },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("SalesList dispute affordance (#171 AC1)", () => {
  it("shows an Open Dispute action button for a contested conversion", () => {
    stubWindowWithDisputes([]);
    const html = renderToString(<SalesList sales={[contestedSale]} />);
    expect(html).toContain("Open Dispute");
  });

  it("shows an Open Dispute action button for a rejected conversion", () => {
    stubWindowWithDisputes([]);
    const html = renderToString(<SalesList sales={[rejectedSale]} />);
    expect(html).toContain("Open Dispute");
  });

  it("does not show Open Dispute for undisputed conversions", () => {
    stubWindowWithDisputes([]);
    const html = renderToString(<SalesList sales={[cleanSale]} />);
    expect(html).not.toContain("Open Dispute");
  });

  it("replaces the affordance with an Under Auditor Review badge and docket ID once submitted", () => {
    stubWindowWithDisputes([
      {
        schemaVersion: 1,
        docketId: "DSP-202610-0123456789ABCDEF",
        conversionId: "4",
        affiliate: "GBBD...5678",
        txHash: CONVERSION_TX,
        status: "under_auditor_review",
        statusLabel: "Under Auditor Review",
        submittedAt: "2026-10-20T10:00:00.000Z",
        auditorKeyId: "STORMSALE-PUBKEY:AUDITOR_PROTOCOL_1",
        evidenceEnvelope: "e",
        wrappedEvidenceKey: "w",
        orderIds: ["ORD-10239"],
        attachmentManifest: [],
      },
    ]);
    const html = renderToString(<SalesList sales={[contestedSale]} />);
    expect(html).toContain("Under Auditor Review");
    expect(html).toContain("DSP-202610-0123456789ABCDEF");
    expect(html).not.toContain("Open Dispute");
  });

  it("survives a corrupt dispute store without throwing at mount", () => {
    vi.stubGlobal("window", {
      localStorage: { getItem: () => "{not json", setItem: () => {} },
    });
    const html = renderToString(<SalesList sales={[contestedSale]} />);
    expect(html).toContain("Open Dispute");
  });
});

describe("DisputeEvidenceForm (#171 AC2)", () => {
  const formProps = {
    conversion: {
      id: 4,
      affiliate: "GBBD...5678",
      txHash: CONVERSION_TX,
      disputeState: "contested" as const,
    },
    orderIds: ["ORD-10239"],
    attachmentNames: ["click-log.csv"],
    submitting: false,
    errorMessage: null,
    onDescriptionChange: () => {},
    onOrderInputChange: () => {},
    onAddOrderId: () => {},
    onRemoveOrderId: () => {},
    onFilesSelected: () => {},
    onSubmit: () => {},
  };

  it("accepts an evidence description, order IDs and file attachments, linked to the conversion tx hash", () => {
    const html = renderToString(<DisputeEvidenceForm {...formProps} />);
    expect(html).toContain('id="dispute-evidence-description"');
    expect(html).toContain("Evidence description");
    expect(html).toContain('id="dispute-order-id-input"');
    expect(html).toContain("Order IDs");
    expect(html).toContain("ORD-10239");
    expect(html).toContain('type="file"');
    expect(html).toContain("click-log.csv");
    expect(html).toContain(CONVERSION_TX);
    expect(html).toContain("Submit Dispute for Auditor Review");
  });

  it("renders validation errors and a busy state for the submit action", () => {
    const html = renderToString(
      <DisputeEvidenceForm {...formProps} errorMessage="Evidence description is required." submitting />,
    );
    expect(html).toContain("Evidence description is required.");
    expect(html).toContain("Submitting Dispute...");
  });
});
