import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderToString } from "react-dom/server";
import {
  BulkSaleLogModal,
  isValidXlmAmount,
} from "../components/advertiser/BulkSaleLogModal";
import type {
  BatchSaleSummaryReceipt,
  BatchExecutionProgress,
  SaleItem,
} from "../lib/batchSaleLogging";
import { STELLAR_CONFIG } from "../config/stellar";

let mockUserAddress: string | null = null;
let mockConnectorType: string | null = null;
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

  beforeEach(() => {
    vi.clearAllMocks();
    mockUserAddress = null;
    mockConnectorType = null;
  });

  it("should render correctly in initial state with disconnected wallet", () => {
    const html = renderToString(<BulkSaleLogModal defaultCampaignId={101} />);
    expect(html).toContain("Bulk Batch Sale Logger");
    expect(html).toContain("Soroban Footprint Optimization Utility (#133)");
    expect(html).toContain("Add Real Sale Item");
    expect(html).toContain("Execute Bulk Log");
    // Should be disabled when salesList is empty or wallet is disconnected
    expect(html).toContain("disabled");
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

    // Three-state receipt title when none failed
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
    expect(html).toContain(dummyHash);
    expect(html).toContain("Batch 2 confirmed on ledger");
    expect(html).toContain('aria-label="Copy current transaction hash"');
    expect(html).toContain('aria-label="View current transaction on Stellar Explorer"');
  });

  describe("Strict XLM Amount Validator (isValidXlmAmount)", () => {
    it("should accept valid standard decimal amounts up to 7 decimal places", () => {
      expect(isValidXlmAmount("25.5").valid).toBe(true);
      expect(isValidXlmAmount("25.5").amount).toBe(25.5);
      expect(isValidXlmAmount("100").valid).toBe(true);
      expect(isValidXlmAmount("0.0000001").valid).toBe(true); // 1 stroop
      expect(isValidXlmAmount("12.1234567").valid).toBe(true); // 7 decimals
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
  });
});
