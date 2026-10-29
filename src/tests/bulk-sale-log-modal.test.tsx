// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderToString } from "react-dom/server";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  BulkSaleLogModal,
  isValidXlmAmount,
  generateSaleId,
} from "../components/advertiser/BulkSaleLogModal";
import type {
  BatchSaleSummaryReceipt,
  BatchExecutionProgress,
  SaleItem,
} from "../lib/batchSaleLogging";
import * as batchSaleLoggingModule from "../lib/batchSaleLogging";
import { STELLAR_CONFIG } from "../config/stellar";
import { Keypair } from "@stellar/stellar-sdk";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

let mockUserAddress: string | null = null;
let mockConnectorType: any = null;
const mockShowNotification = vi.fn();

vi.mock("../hooks/useWeb3", () => ({
  useWeb3: () => ({
    userAddress: mockUserAddress,
    connectorType: mockConnectorType,
    isConnected: !!mockUserAddress,
  }),
}));

vi.mock("../context/NotificationContext", () => ({
  useNotification: () => ({
    showNotification: mockShowNotification,
  }),
}));

function setInput(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  act(() => {
    setter.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

function setTextarea(textarea: HTMLTextAreaElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!;
  act(() => {
    setter.call(textarea, value);
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
    textarea.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

function clickButton(button: HTMLButtonElement) {
  act(() => {
    button.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
  });
}

function submitForm(container: HTMLElement) {
  const form = container.querySelector("form")!;
  act(() => {
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
}

describe("BulkSaleLogModal Component Suite (#133)", () => {
  const dummySalesList: SaleItem[] = [
    {
      id: "SALE_001",
      campaignId: 101,
      affiliateAddress: "GB2P34VNCNL6A5T3L2B2FVMOHR4J7XJ3N5KQLXGZ72K66B4TUP27H5O3",
      saleAmountXlm: 25.5,
      customerRef: "CUST_ALICE_01",
    },
    {
      id: "SALE_002",
      campaignId: 101,
      affiliateAddress: "GA5W24VNCNL6A5T3L2B2FVMOHR4J7XJ3N5KQLXGZ72K66B4TUP27H999",
      saleAmountXlm: 40.0,
      customerRef: "CUST_BOB_02",
    },
  ];

  let container: HTMLDivElement | null = null;
  let root: Root | null = null;

  beforeEach(() => {
    vi.clearAllMocks();
    mockUserAddress = null;
    mockConnectorType = null;
  });

  afterEach(async () => {
    if (root) {
      await act(async () => {
        root!.unmount();
      });
      root = null;
    }
    if (container) {
      container.remove();
      container = null;
    }
  });

  const renderComponent = async (props = {}) => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
      root!.render(<BulkSaleLogModal defaultCampaignId={101} {...props} />);
    });
    return container;
  };

  it("should render correctly in initial state with disconnected wallet", () => {
    const html = renderToString(<BulkSaleLogModal defaultCampaignId={101} />);
    expect(html).toContain("Bulk Batch Sale Logger");
    expect(html).toContain("Soroban Footprint Optimization Utility (#133)");
    expect(html).toContain("Add Real Sale Item");
    expect(html).toContain("Execute Bulk Log");
    expect(html).toContain("disabled");
  });

  it("should disable execution button when sales list has items but wallet is disconnected", () => {
    mockUserAddress = null;
    mockConnectorType = null;

    const html = renderToString(
      <BulkSaleLogModal defaultCampaignId={101} initialSalesList={dummySalesList} />,
    );

    expect(html).toContain("Connect Wallet to Execute Bulk Log");
    expect(html).toContain("disabled");
  });

  it("should enable execution button when sales list has items and wallet is connected", () => {
    mockUserAddress = "GB2P34VNCNL6A5T3L2B2FVMOHR4J7XJ3N5KQLXGZ72K66B4TUP27H5O3";
    mockConnectorType = "freighter";

    const html = renderToString(
      <BulkSaleLogModal defaultCampaignId={101} initialSalesList={dummySalesList} />,
    );

    expect(html).toMatch(/Execute Bulk Log.*2.*Sales in.*1.*Envelopes/);
    expect(html).not.toContain("Connect Wallet to Execute Bulk Log");
  });

  it("should render queue edit form controls inside fieldset", () => {
    const html = renderToString(<BulkSaleLogModal defaultCampaignId={101} />);
    expect(html).toContain("<fieldset");
    expect(html).toContain("Paste CSV");
  });

  it("should render real sale inputs with proper aria-labels and mobile-safe typography", () => {
    const html = renderToString(<BulkSaleLogModal defaultCampaignId={101} />);
    expect(html).toContain('aria-label="Affiliate Stellar public address"');
    expect(html).toContain('aria-label="Sale amount in XLM"');
    expect(html).toContain('aria-label="Customer order reference"');
    expect(html).toContain('aria-label="Add sale item"');
    expect(html).toContain("Generate Test Templates:");
    expect(html).toContain("5 Valid Sales");
    expect(html).toContain("15 Sales (Full Envelope)");
  });

  it("should render active sales table and remove buttons when sales are present", () => {
    mockUserAddress = "GB2P34VNCNL6A5T3L2B2FVMOHR4J7XJ3N5KQLXGZ72K66B4TUP27H5O3";
    mockConnectorType = "freighter";

    const html = renderToString(
      <BulkSaleLogModal defaultCampaignId={101} initialSalesList={dummySalesList} />,
    );
    expect(html).toContain("Total Operations");
    expect(html).toContain("Batches Required");
    expect(html).toContain("Footprint Optimization");
    expect(html).toContain('aria-label="Remove sale SALE_001"');
    expect(html).toContain('aria-label="Remove sale SALE_002"');
  });

  it("should render receipt with verified ledger title, txHash, copy/explorer aria-labels and href upon success", () => {
    mockUserAddress = "GB2P34VNCNL6A5T3L2B2FVMOHR4J7XJ3N5KQLXGZ72K66B4TUP27H5O3";
    mockConnectorType = "freighter";

    const dummyHash = "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2";
    const dummyReceipt: BatchSaleSummaryReceipt = {
      success: true,
      totalSalesCount: 15,
      confirmedCount: 15,
      failedCount: 0,
      batchesExecuted: 1,
      transactionHashes: [dummyHash],
      footprintStats: {
        originalReadOnlyCount: 15,
        originalReadWriteCount: 15,
        consolidatedReadOnlyCount: 5,
        consolidatedReadWriteCount: 15,
        redundantReadKeysPurged: 10,
      },
      itemizedResults: [],
    };

    const html = renderToString(
      <BulkSaleLogModal defaultCampaignId={101} initialReceipt={dummyReceipt} />,
    );

    expect(html).toContain("Bulk Execution Verified on Ledger");
    expect(html).toMatch(/15.*Confirmed/);
    expect(html).toContain(dummyHash);
    expect(html).toContain('aria-label="Copy transaction hash for batch 1"');
    expect(html).toContain('aria-label="View batch 1 transaction on Stellar Explorer"');
    expect(html).toContain(`href="${STELLAR_CONFIG.explorerUrl}/tx/${dummyHash}"`);
    expect(html).toContain("Consolidated Read Keys:");
    expect(html).toContain("Redundant Keys Purged:");
  });

  it("should render receipt with partial errors when some sales fail", () => {
    const dummyHash = "f1e2d3c4b5a6f1e2d3c4b5a6f1e2d3c4b5a6f1e2d3c4b5a6f1e2d3c4b5a6f1e2";
    const partialReceipt: BatchSaleSummaryReceipt = {
      success: false,
      totalSalesCount: 10,
      confirmedCount: 8,
      failedCount: 2,
      batchesExecuted: 1,
      transactionHashes: [dummyHash],
      footprintStats: {
        originalReadOnlyCount: 10,
        originalReadWriteCount: 10,
        consolidatedReadOnlyCount: 4,
        consolidatedReadWriteCount: 10,
        redundantReadKeysPurged: 6,
      },
      itemizedResults: [
        {
          saleId: "FAIL_01",
          campaignId: 101,
          affiliateAddress: "GA5W24VNCNL6A5T3L2B2FVMOHR4J7XJ3N5KQLXGZ72K66B4TUP27H999",
          saleAmountXlm: 20,
          status: "failed",
          error: "Campaign budget exhausted",
        },
      ],
    };

    const html = renderToString(
      <BulkSaleLogModal defaultCampaignId={101} initialReceipt={partialReceipt} />,
    );

    expect(html).toContain("Bulk Execution Completed with Partial Errors");
    expect(html).toMatch(/8.*10.*Confirmed/);
    expect(html).toContain("Failed Sales (<!-- -->2<!-- -->)");
    expect(html).toContain("Campaign budget exhausted");
  });

  it("should render receipt with failed state when no sales succeeded", () => {
    const failedReceipt: BatchSaleSummaryReceipt = {
      success: false,
      totalSalesCount: 5,
      confirmedCount: 0,
      failedCount: 5,
      batchesExecuted: 0,
      transactionHashes: [],
      footprintStats: {
        originalReadOnlyCount: 0,
        originalReadWriteCount: 0,
        consolidatedReadOnlyCount: 0,
        consolidatedReadWriteCount: 0,
        redundantReadKeysPurged: 0,
      },
      itemizedResults: [],
    };

    const html = renderToString(
      <BulkSaleLogModal defaultCampaignId={101} initialReceipt={failedReceipt} />,
    );

    expect(html).toContain("Bulk Execution Failed");
    expect(html).toMatch(/0.*5.*Confirmed/);
  });

  it("should render live progress bar updates and transaction hash", () => {
    const dummyHash = "c1d2e3f4a5b6c1d2e3f4a5b6c1d2e3f4a5b6c1d2e3f4a5b6c1d2e3f4a5b6c1d2";
    const progress: BatchExecutionProgress = {
      totalBatches: 2,
      currentBatchIndex: 2,
      totalSales: 25,
      processedSales: 15,
      confirmedSales: 15,
      failedSales: 0,
      currentTxHash: dummyHash,
      currentStatus: "completed",
      recentItemResults: [],
      message: "Batch 2 confirmed on ledger",
    };

    const html = renderToString(
      <BulkSaleLogModal defaultCampaignId={101} initialProgress={progress} />,
    );

    expect(html).toContain("100%");
    expect(html).toContain('role="progressbar"');
    expect(html).toContain('aria-label="Batch execution progress"');
    expect(html).toContain('aria-valuenow="100"');
    expect(html).toContain('aria-valuemin="0"');
    expect(html).toContain('aria-valuemax="100"');
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain(dummyHash);
    expect(html).toContain("Batch 2 confirmed on ledger");
    expect(html).toContain('aria-label="Copy current transaction hash"');
    expect(html).toContain('aria-label="View current transaction on Stellar Explorer"');
  });

  describe("Interactive Handlers & DOM Events", () => {
    it("handles adding a valid sale item", async () => {
      const c = await renderComponent();
      const kp = Keypair.random();
      const addrInput = c.querySelector('input[aria-label="Affiliate Stellar public address"]') as HTMLInputElement;
      const amtInput = c.querySelector('input[aria-label="Sale amount in XLM"]') as HTMLInputElement;
      const refInput = c.querySelector('input[aria-label="Customer order reference"]') as HTMLInputElement;

      setInput(addrInput, kp.publicKey());
      setInput(amtInput, "75.50");
      setInput(refInput, "ORDER_TEST_99");
      submitForm(c);

      expect(c.textContent).toContain("ORDER_TEST_99");
      expect(c.textContent).toContain("75.5 XLM");
    });

    it("shows notifications for invalid inputs when adding a sale item", async () => {
      const c = await renderComponent();
      const addrInput = c.querySelector('input[aria-label="Affiliate Stellar public address"]') as HTMLInputElement;
      const amtInput = c.querySelector('input[aria-label="Sale amount in XLM"]') as HTMLInputElement;

      // 1. Missing address
      submitForm(c);
      expect(mockShowNotification).toHaveBeenCalledWith(
        expect.objectContaining({ title: "Missing Address" }),
      );

      // 2. Invalid address
      setInput(addrInput, "INVALID_ADDR");
      submitForm(c);
      expect(mockShowNotification).toHaveBeenCalledWith(
        expect.objectContaining({ title: "Invalid Address" }),
      );

      // 3. Invalid amount
      const kp = Keypair.random();
      setInput(addrInput, kp.publicKey());
      setInput(amtInput, "INVALID_AMT");
      submitForm(c);
      expect(mockShowNotification).toHaveBeenCalledWith(
        expect.objectContaining({ title: "Invalid Amount" }),
      );
    });

    it("handles CSV paste modal and import", async () => {
      const c = await renderComponent();
      const allButtons = Array.from(c.querySelectorAll("button"));
      const pasteCsvBtn = allButtons.find((b) => b.textContent?.includes("Paste CSV"));

      // Open CSV box
      clickButton(pasteCsvBtn!);

      const textarea = c.querySelector("textarea") as HTMLTextAreaElement;
      expect(textarea).not.toBeNull();

      const kp1 = Keypair.random().publicKey();
      const kp2 = Keypair.random().publicKey();
      const csvData = `AffiliateAddress,SaleAmountXlm,CustomerRef\n${kp1},50.0,REF_1\n${kp2},100.25,REF_2`;

      setTextarea(textarea, csvData);

      const importBtn = Array.from(c.querySelectorAll("button")).find((b) =>
        b.textContent?.includes("Import CSV Rows"),
      );

      clickButton(importBtn!);

      expect(mockShowNotification).toHaveBeenCalledWith(
        expect.objectContaining({ title: "Sales Imported" }),
      );
      expect(c.textContent).toContain("REF_1");
      expect(c.textContent).toContain("REF_2");
    });

    it("handles populating test templates and clearing items", async () => {
      const c = await renderComponent();
      const btn5 = Array.from(c.querySelectorAll("button")).find((b) =>
        b.textContent?.includes("5 Valid Sales"),
      );
      const btn15 = Array.from(c.querySelectorAll("button")).find((b) =>
        b.textContent?.includes("15 Sales (Full Envelope)"),
      );

      clickButton(btn5!);
      expect(c.textContent).toContain("BATCH_SALE_005");

      clickButton(btn15!);
      expect(c.textContent).toContain("BATCH_SALE_015");

      // Clear all
      const clearBtn = Array.from(c.querySelectorAll("button")).find((b) =>
        b.textContent?.includes("Clear All"),
      );
      clickButton(clearBtn!);
      expect(c.textContent).toContain("Total Operations0");
    });

    it("handles removing single sale item from queue", async () => {
      const c = await renderComponent({ initialSalesList: dummySalesList });
      expect(c.textContent).toContain("SALE_001");

      const removeBtn = c.querySelector('button[aria-label="Remove sale SALE_001"]') as HTMLButtonElement;
      clickButton(removeBtn);

      expect(c.textContent).not.toContain("SALE_001");
      expect(c.textContent).toContain("SALE_002");
    });

    it("executes bulk batch logging when wallet is connected", async () => {
      mockUserAddress = "GB2P34VNCNL6A5T3L2B2FVMOHR4J7XJ3N5KQLXGZ72K66B4TUP27H5O3";
      mockConnectorType = "freighter";

      const dummyHash = "e".repeat(64);
      const mockReceipt: BatchSaleSummaryReceipt = {
        success: true,
        totalSalesCount: 2,
        confirmedCount: 2,
        failedCount: 0,
        batchesExecuted: 1,
        transactionHashes: [dummyHash],
        itemizedResults: [
          {
            saleId: "SALE_001",
            campaignId: 101,
            affiliateAddress: dummySalesList[0].affiliateAddress,
            saleAmountXlm: 25.5,
            status: "confirmed",
            txHash: dummyHash,
          },
          {
            saleId: "SALE_002",
            campaignId: 101,
            affiliateAddress: dummySalesList[1].affiliateAddress,
            saleAmountXlm: 40.0,
            status: "confirmed",
            txHash: dummyHash,
          },
        ],
        footprintStats: {
          originalReadOnlyCount: 4,
          originalReadWriteCount: 4,
          consolidatedReadOnlyCount: 2,
          consolidatedReadWriteCount: 4,
          redundantReadKeysPurged: 2,
        },
      };

      vi.spyOn(batchSaleLoggingModule, "executeBatchSaleLogging").mockResolvedValueOnce(mockReceipt);

      const c = await renderComponent({ initialSalesList: dummySalesList });
      const execBtn = Array.from(c.querySelectorAll("button")).find((b) =>
        b.textContent?.includes("Execute Bulk Log"),
      );

      await act(async () => {
        execBtn!.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
        await new Promise((resolve) => setTimeout(resolve, 50));
      });

      expect(batchSaleLoggingModule.executeBatchSaleLogging).toHaveBeenCalled();
      expect(mockShowNotification).toHaveBeenCalledWith(
        expect.objectContaining({ title: "Batch Logging Completed" }),
      );
      expect(c.textContent).toContain("Bulk Execution Verified on Ledger");
    });
  });

  describe("Strict XLM Amount Validator (isValidXlmAmount)", () => {
    it("should accept valid standard decimal amounts up to 7 decimal places", () => {
      expect(isValidXlmAmount("25.5").valid).toBe(true);
      expect(isValidXlmAmount("25.5").amount).toBe(25.5);
      expect(isValidXlmAmount("100").valid).toBe(true);
      expect(isValidXlmAmount("0.0000001").valid).toBe(true);
      expect(isValidXlmAmount("12.1234567").valid).toBe(true);
    });

    it("should reject non-positive amounts", () => {
      expect(isValidXlmAmount("0").valid).toBe(false);
      expect(isValidXlmAmount("-5").valid).toBe(false);
      expect(isValidXlmAmount("").valid).toBe(false);
    });

    it("should reject amounts exceeding 7 decimal places", () => {
      const res = isValidXlmAmount("12.12345678");
      expect(res.valid).toBe(false);
      expect(res.error).toContain("7 decimal places");
    });

    it("should reject values with trailing garbage or non-decimal characters", () => {
      expect(isValidXlmAmount("25.5abc").valid).toBe(false);
      expect(isValidXlmAmount("abc").valid).toBe(false);
      expect(isValidXlmAmount("25.5.5").valid).toBe(false);
    });

    it("should reject scientific notation", () => {
      expect(isValidXlmAmount("1e5").valid).toBe(false);
      expect(isValidXlmAmount("1e-8").valid).toBe(false);
    });

    it("generateSaleId produces unique strings", () => {
      const id1 = generateSaleId("TEST");
      const id2 = generateSaleId("TEST");
      expect(id1).toContain("TEST_");
      expect(id1).not.toBe(id2);
    });
  });
});
