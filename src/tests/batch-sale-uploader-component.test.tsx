// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup, within } from "@testing-library/react";
import { BatchSaleUploader } from "../components/advertiser/BatchSaleUploader";
import { NotificationProvider } from "../context/NotificationContext";
import { SAMPLE_STELLAR_KEYS } from "../lib/batchSaleParser";

const web3 = vi.hoisted(() => ({
  isConnected: true,
  logSaleOnChain: vi.fn(),
  openWalletModal: vi.fn(),
}));

vi.mock("../hooks/useWeb3", () => ({
  useWeb3: () => ({
    userAddress: "GADVERTISERTESTADDRESS",
    isConnected: web3.isConnected,
    logSaleOnChain: web3.logSaleOnChain,
    openWalletModal: web3.openWalletModal,
  }),
}));

const postback = vi.hoisted(() => vi.fn());
vi.mock("../lib/webhookEngine", () => ({
  triggerConversionPostback: postback,
}));

const KEY_A = SAMPLE_STELLAR_KEYS[0];
const KEY_B = SAMPLE_STELLAR_KEYS[1];

const SMALL_CSV = [
  "Order ID,Affiliate Address,Sale Amount,Timestamp",
  `ORD-A,${KEY_A},100.00,2026-10-17T10:00:00.000Z`,
  `ORD-B,${KEY_B},50.50,2026-10-17T11:00:00.000Z`,
  `ORD-BAD,GBAD_ADDRESS,-5,NOT_A_DATE`,
].join("\n");

function renderUploader() {
  return render(
    <NotificationProvider>
      <BatchSaleUploader />
    </NotificationProvider>,
  );
}

async function uploadFile(container: HTMLElement, name: string, content: string) {
  const input = container.querySelector("#batch-file-input") as HTMLInputElement;
  const file = new File([content], name, { type: "text/plain" });
  fireEvent.change(input, { target: { files: [file] } });
  await screen.findByText("Visual Preview Table");
}

function rowFor(text: string): HTMLElement {
  return screen.getByText(text).closest("tr") as HTMLElement;
}

describe("BatchSaleUploader component", () => {
  let downloads: string[];

  beforeEach(() => {
    downloads = [];
    web3.isConnected = true;
    web3.logSaleOnChain.mockReset();
    web3.openWalletModal.mockReset();
    postback.mockReset();
    vi.stubGlobal("navigator", { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
    vi.stubGlobal("URL", {
      createObjectURL: vi.fn().mockReturnValue("blob:mock"),
      revokeObjectURL: vi.fn(),
    });
    const realCreate = document.createElement.bind(document);
    vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
      const el = realCreate(tag);
      if (tag === "a") {
        vi.spyOn(el as HTMLAnchorElement, "click").mockImplementation(() => {
          downloads.push((el as HTMLAnchorElement).download);
        });
      }
      return el;
    });
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("parses an uploaded CSV and shows totals, Merkle root and validation flags", async () => {
    const { container } = renderUploader();
    await uploadFile(container, "orders.csv", SMALL_CSV);

    expect(screen.getByText("orders.csv")).toBeDefined();
    expect(screen.getByText("All (3)")).toBeDefined();
    expect(screen.getByText("Valid (2)")).toBeDefined();
    expect(screen.getByText("Malformed (1)")).toBeDefined();
    expect(screen.getByText("Cryptographic Audit Merkle Root")).toBeDefined();
    expect(screen.getByText("1 Malformed Row(s) Detected")).toBeDefined();
    expect(within(rowFor("ORD-BAD")).getByText("Malformed")).toBeDefined();
    expect(within(rowFor("ORD-BAD")).getByText("Excluded")).toBeDefined();
    expect(within(rowFor("ORD-A")).getByText("Ready")).toBeDefined();
    expect(screen.getByText("Log Batch On-Chain (2)")).toBeDefined();
  });

  it("parses JSON uploads and reports missing required columns", async () => {
    const { container } = renderUploader();
    const json = JSON.stringify([
      {
        orderId: "ORD-J1",
        affiliateAddress: KEY_A,
        saleAmount: 10,
        timestamp: "2026-10-17T10:00:00.000Z",
      },
    ]);
    await uploadFile(container, "orders.json", json);
    expect(screen.getByText("ORD-J1")).toBeDefined();

    const input = container.querySelector("#batch-file-input") as HTMLInputElement;
    fireEvent.change(input, {
      target: { files: [new File(["foo,bar\n1,2"], "bad.csv")] },
    });
    expect(await screen.findByText("Missing Required Columns")).toBeDefined();
  });

  it("accepts dropped files and toggles the drag state", async () => {
    const { container } = renderUploader();
    const dropZone = container.querySelector(".border-dashed") as HTMLElement;
    fireEvent.dragOver(dropZone);
    expect(dropZone.className).toContain("border-indigo-500");
    fireEvent.dragLeave(dropZone);
    expect(dropZone.className).not.toContain("scale-[1.01]");

    fireEvent.drop(dropZone, {
      dataTransfer: { files: [new File([SMALL_CSV], "dropped.csv")] },
    });
    expect(await screen.findByText("dropped.csv")).toBeDefined();
    expect(await screen.findByText("Valid (2)")).toBeDefined();
  });

  it("loads demo batches and downloads sample templates", async () => {
    renderUploader();
    fireEvent.click(screen.getByText("Load Demo (3 Malformed)"));
    expect(await screen.findByText("demo_52_orders_with_malformed.csv")).toBeDefined();
    expect(screen.getByText("Malformed (3)")).toBeDefined();

    fireEvent.click(screen.getByText("Load Demo (52 Valid)"));
    expect(await screen.findByText("demo_52_orders_valid.csv")).toBeDefined();
    expect(screen.getByText("Malformed (0)")).toBeDefined();

    fireEvent.click(screen.getByText("Sample CSV"));
    fireEvent.click(screen.getByText("Sample JSON"));
    expect(downloads).toEqual([
      "stormsale_batch_orders_template.csv",
      "stormsale_batch_orders_template.json",
    ]);
  });

  it("filters, searches and excludes malformed rows", async () => {
    const { container } = renderUploader();
    await uploadFile(container, "orders.csv", SMALL_CSV);

    fireEvent.click(screen.getByText("Valid (2)"));
    expect(screen.queryByText("ORD-BAD")).toBeNull();
    fireEvent.click(screen.getByText("Malformed (1)"));
    expect(screen.queryByText("ORD-A")).toBeNull();
    expect(screen.getByText("ORD-BAD")).toBeDefined();
    fireEvent.click(screen.getByText("All (3)"));

    fireEvent.change(screen.getByPlaceholderText("Search Order ID / Address..."), {
      target: { value: "no-such-order" },
    });
    expect(screen.getByText("No rows match your filter criteria.")).toBeDefined();
    fireEvent.change(screen.getByPlaceholderText("Search Order ID / Address..."), {
      target: { value: "ord-b" },
    });
    expect(screen.getByText("ORD-B")).toBeDefined();
    expect(screen.queryByText("ORD-A")).toBeNull();
    fireEvent.change(screen.getByPlaceholderText("Search Order ID / Address..."), {
      target: { value: "" },
    });

    fireEvent.click(screen.getByText("Exclude Malformed Rows"));
    expect(screen.queryByText("ORD-BAD")).toBeNull();
    fireEvent.click(screen.getByText("Show All Rows"));
    expect(screen.getByText("ORD-BAD")).toBeDefined();
  });

  it("copies the Merkle root, downloads the audit manifest, and verifies proofs", async () => {
    const { container } = renderUploader();
    await uploadFile(container, "orders.csv", SMALL_CSV);

    fireEvent.click(screen.getByText("Copy Root"));
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      expect.stringMatching(/^0x[0-9a-f]{64}$/),
    );
    expect(screen.getByText("Copied")).toBeDefined();

    fireEvent.click(screen.getByText("Audit Manifest (.json)"));
    expect(downloads[0]).toMatch(/^merkle_audit_manifest_1_\d+\.json$/);

    const verifyInput = screen.getByPlaceholderText(/Enter Order ID to verify/);
    fireEvent.change(verifyInput, { target: { value: "ord-b" } });
    fireEvent.click(screen.getByText("Verify Proof"));
    expect(screen.getByText(/Valid Merkle membership proof/)).toBeDefined();

    fireEvent.change(verifyInput, { target: { value: "ORD-BAD" } });
    fireEvent.click(screen.getByText("Verify Proof"));
    expect(screen.getByText("Proof verification failed or order not in batch.")).toBeDefined();
  });

  it("edits a malformed row inline and revalidates it into the Merkle tree", async () => {
    const { container } = renderUploader();
    await uploadFile(container, "orders.csv", SMALL_CSV);

    // Saving with errors still leaves the row malformed
    fireEvent.click(within(rowFor("ORD-BAD")).getByTitle("Edit row inline"));
    let editRow = screen.getByDisplayValue("ORD-BAD").closest("tr") as HTMLElement;
    fireEvent.click(within(editRow).getAllByRole("button")[0]);
    expect(await screen.findByText("Row Still Malformed")).toBeDefined();

    // Cancelling an edit restores the read-only row
    fireEvent.click(within(rowFor("ORD-BAD")).getByTitle("Edit row inline"));
    editRow = screen.getByDisplayValue("ORD-BAD").closest("tr") as HTMLElement;
    fireEvent.click(within(editRow).getAllByRole("button")[1]);
    expect(screen.queryByDisplayValue("ORD-BAD")).toBeNull();

    // Fix every field, then save
    fireEvent.click(within(rowFor("ORD-BAD")).getByTitle("Edit row inline"));
    editRow = screen.getByDisplayValue("ORD-BAD").closest("tr") as HTMLElement;
    fireEvent.change(screen.getByDisplayValue("ORD-BAD"), { target: { value: "ORD-FIXED" } });
    fireEvent.change(screen.getByDisplayValue("GBAD_ADDRESS"), { target: { value: KEY_A } });
    fireEvent.change(screen.getByDisplayValue("-5"), { target: { value: "25" } });
    fireEvent.change(screen.getByDisplayValue("NOT_A_DATE"), {
      target: { value: "2026-10-17T12:00:00.000Z" },
    });
    fireEvent.click(within(editRow).getAllByRole("button")[0]);

    expect(await screen.findByText("Row Validated")).toBeDefined();
    expect(screen.getByText("Valid (3)")).toBeDefined();
    expect(screen.getByText("Malformed (0)")).toBeDefined();
    expect(screen.getByText("Log Batch On-Chain (3)")).toBeDefined();
  });

  it("opens the wallet modal instead of logging when disconnected", async () => {
    web3.isConnected = false;
    const { container } = renderUploader();
    await uploadFile(container, "orders.csv", SMALL_CSV);

    fireEvent.click(screen.getByText("Log Batch On-Chain (2)"));
    expect(web3.openWalletModal).toHaveBeenCalled();
    expect(web3.logSaleOnChain).not.toHaveBeenCalled();
  });

  it("logs valid rows sequentially, records failures, and exports a settlement report", async () => {
    web3.logSaleOnChain
      .mockResolvedValueOnce({ success: true, txHash: "abc123" })
      .mockRejectedValueOnce(new Error("ledger rejected"));
    postback.mockRejectedValue(new Error("no webhook"));
    vi.spyOn(console, "warn").mockImplementation(() => {});

    const { container } = renderUploader();
    await uploadFile(container, "orders.csv", SMALL_CSV);

    fireEvent.change(screen.getByDisplayValue("1"), { target: { value: "7" } });
    fireEvent.click(screen.getByText("Log Batch On-Chain (2)"));

    expect(
      await screen.findByText("On-Chain Batch Logging Complete", {}, { timeout: 3000 }),
    ).toBeDefined();
    expect(web3.logSaleOnChain).toHaveBeenNthCalledWith(1, 7, KEY_A, 100);
    expect(web3.logSaleOnChain).toHaveBeenNthCalledWith(2, 7, KEY_B, 50.5);
    expect(postback).toHaveBeenCalledWith(
      expect.objectContaining({ saleId: "ORD-A", stellarTxHash: "abc123" }),
    );

    expect(within(rowFor("ORD-A")).getByText("Confirmed")).toBeDefined();
    expect(
      within(rowFor("ORD-A")).getByTitle("View on Stellar Expert").getAttribute("href"),
    ).toContain("abc123");
    expect(within(rowFor("ORD-B")).getByText("Failed").getAttribute("title")).toBe(
      "ledger rejected",
    );
    expect(screen.getByText(/Successfully logged 1 of 2 sales/)).toBeDefined();
    expect(screen.getByText("Batch Logging Completed with Warnings")).toBeDefined();

    fireEvent.click(screen.getByText("Download Settlement CSV"));
    expect(downloads.at(-1)).toMatch(/^settlement_report_\d+\.csv$/);
  });

  it("pauses, resumes and cancels an in-flight batch", async () => {
    web3.logSaleOnChain.mockResolvedValue({ success: true, txHash: "tx" });
    const { container } = renderUploader();
    await uploadFile(container, "orders.csv", SMALL_CSV);

    fireEvent.click(screen.getByText("Log Batch On-Chain (2)"));
    expect(await screen.findByText("Sequential On-Chain Logging in Progress")).toBeDefined();

    fireEvent.click(screen.getByText("Pause"));
    expect(screen.getByText("Resume")).toBeDefined();
    fireEvent.click(screen.getByText("Resume"));
    fireEvent.click(screen.getByText("Cancel"));

    expect(await screen.findByText("Batch Logging Cancelled", {}, { timeout: 3000 })).toBeDefined();
    await waitFor(() => expect(screen.getByText("On-Chain Batch Logging Complete")).toBeDefined());
    expect(web3.logSaleOnChain).toHaveBeenCalledTimes(1);
  });
});
