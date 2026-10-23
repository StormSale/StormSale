import { describe, it, expect, vi } from "vitest";
import {
  chunkSaleBatch,
  validateSaleItems,
  consolidateFootprint,
  buildLogSaleArgs,
  buildBatchTransactionEnvelope,
  executeBatchSaleLogging,
  MAX_BATCH_SIZE,
  type SaleItem,
  type BatchExecutionProgress,
} from "../lib/batchSaleLogging";
import { xdr, Account, Keypair, scValToNative } from "@stellar/stellar-sdk";

describe("Soroban Footprint Optimization & Multi-Operation Batches (#133)", () => {
  const dummyMerchantKp = Keypair.random();
  const dummyMerchant = dummyMerchantKp.publicKey();
  const dummyAffiliate1Kp = Keypair.random();
  const dummyAffiliate1 = dummyAffiliate1Kp.publicKey();
  const dummyAffiliate2Kp = Keypair.random();
  const dummyAffiliate2 = dummyAffiliate2Kp.publicKey();

  const generateSalesList = (count: number): SaleItem[] => {
    return Array.from({ length: count }, (_, i) => ({
      id: `SALE_${i + 1}`,
      campaignId: 100 + (i % 3),
      affiliateAddress: i % 2 === 0 ? dummyAffiliate1 : dummyAffiliate2,
      saleAmountXlm: 25.5 + i,
      customerRef: `CUST_${i + 1}`,
    }));
  };

  describe("Validation & Batch Slicing", () => {
    it("should chunk 35 sales into batches capped at 15 operations", () => {
      const sales = generateSalesList(35);
      const chunks = chunkSaleBatch(sales, MAX_BATCH_SIZE);

      expect(chunks.length).toBe(3);
      expect(chunks[0].length).toBe(15);
      expect(chunks[1].length).toBe(15);
      expect(chunks[2].length).toBe(5);
    });

    it("should return empty array when no sales are provided", () => {
      expect(chunkSaleBatch([])).toEqual([]);
    });

    it("should enforce maximum batch limit of 15 even if a larger number is requested", () => {
      const sales = generateSalesList(20);
      const chunks = chunkSaleBatch(sales, 50); // Requesting 50, but max is 15
      expect(chunks[0].length).toBe(15);
      expect(chunks[1].length).toBe(5);
    });

    it("should throw error if sales array is empty or contains invalid items", () => {
      expect(() => validateSaleItems([])).toThrow("No sales provided");
      expect(() =>
        validateSaleItems([
          {
            id: "S1",
            campaignId: -1,
            affiliateAddress: dummyAffiliate1,
            saleAmountXlm: 10,
          },
        ]),
      ).toThrow("Invalid campaignId");
      expect(() =>
        validateSaleItems([
          {
            id: "S2",
            campaignId: 10,
            affiliateAddress: dummyAffiliate1,
            saleAmountXlm: 0,
          },
        ]),
      ).toThrow("Invalid saleAmountXlm");
    });
  });

  describe("Ledger Footprint Consolidation & Collision Avoidance", () => {
    it("should consolidate redundant read keys and eliminate read-write collisions", () => {
      // Create 3 ledger keys
      const keyA = xdr.LedgerKey.account(
        new xdr.LedgerKeyAccount({
          accountId: dummyMerchantKp.xdrAccountId(),
        }),
      );
      const keyB = xdr.LedgerKey.account(
        new xdr.LedgerKeyAccount({
          accountId: dummyAffiliate1Kp.xdrAccountId(),
        }),
      );
      const keyC = xdr.LedgerKey.account(
        new xdr.LedgerKeyAccount({
          accountId: dummyAffiliate2Kp.xdrAccountId(),
        }),
      );

      // Raw unoptimized footprint:
      // readOnly contains: [keyA, keyB, keyB, keyC] (keyB is duplicated, keyA will collide with readWrite)
      // readWrite contains: [keyA, keyA] (keyA is duplicated)
      const rawFootprint = new xdr.LedgerFootprint({
        readOnly: [keyA, keyB, keyB, keyC],
        readWrite: [keyA, keyA],
      });

      const { optimizedFootprint, stats } = consolidateFootprint(rawFootprint);

      // 1. readWrite should have deduplicated keyA (1 key)
      const optReadWrite = Array.isArray((optimizedFootprint as any).readWrite)
        ? (optimizedFootprint as any).readWrite
        : (optimizedFootprint as any).readWrite();
      expect(optReadWrite.length).toBe(1);
      expect(stats.consolidatedReadWriteCount).toBe(1);

      // 2. keyA in readOnly should be purged because readWrite already includes it
      // 3. duplicate keyB in readOnly should be deduplicated
      // Resulting readOnly should only have [keyB, keyC] (2 keys)
      const optReadOnly = Array.isArray((optimizedFootprint as any).readOnly)
        ? (optimizedFootprint as any).readOnly
        : (optimizedFootprint as any).readOnly();
      expect(optReadOnly.length).toBe(2);
      expect(stats.consolidatedReadOnlyCount).toBe(2);

      // Redundant read keys purged:
      // 1 from collision (keyA), 1 duplicate read (keyB), 1 duplicate write (keyA) = 3 total purged
      expect(stats.redundantReadKeysPurged).toBe(3);
    });
  });

  describe("Transaction Envelope Construction", () => {
    it("should build ScVal arguments adhering to contract specifications", () => {
      const sale: SaleItem = {
        id: "SALE_1",
        campaignId: 101,
        affiliateAddress: dummyAffiliate1,
        saleAmountXlm: 10.5,
      };

      const args = buildLogSaleArgs(dummyMerchant, sale);
      expect(args.length).toBe(4);
      // ScVal 0: Advertiser Address
      expect(scValToNative(args[0])).toBe(dummyMerchant);
      // ScVal 1: Campaign ID (u32)
      expect(scValToNative(args[1])).toBe(101);
      // ScVal 2: Affiliate Address
      expect(scValToNative(args[2])).toBe(dummyAffiliate1);
      // ScVal 3: Amount in stroops (10.5 XLM = 105,000,000 stroops as i128)
      expect(scValToNative(args[3])).toBe(105000000n);
    });

    it("should build a single transaction envelope containing multiple log_sale operations", () => {
      const sales = generateSalesList(10);
      const account = new Account(dummyMerchant, "1000");

      const txBuilder = buildBatchTransactionEnvelope(account, dummyMerchant, sales);
      const tx = txBuilder.build();

      expect(tx.operations.length).toBe(10);
      for (const op of tx.operations) {
        expect(op.type).toBe("invokeHostFunction");
      }
    });
  });

  describe("Live Progress Bar & Batch Execution Execution", () => {
    it("should execute bulk sale logging in batches of up to 15 with live txHash confirmations", async () => {
      const sales = generateSalesList(28); // 2 batches: 15 and 13
      const progressSnapshots: BatchExecutionProgress[] = [];

      const onProgress = vi.fn((progress: BatchExecutionProgress) => {
        progressSnapshots.push({ ...progress });
      });

      const receipt = await executeBatchSaleLogging(
        dummyMerchant,
        sales,
        "mock",
        onProgress,
      );

      // Verify overall summary receipt
      expect(receipt.success).toBe(true);
      expect(receipt.totalSalesCount).toBe(28);
      expect(receipt.confirmedCount).toBe(28);
      expect(receipt.failedCount).toBe(0);
      expect(receipt.batchesExecuted).toBe(2);
      expect(receipt.transactionHashes.length).toBe(2);

      // Verify transaction hashes are valid 64-character hex strings without 0x prefix
      for (const hash of receipt.transactionHashes) {
        expect(hash).toMatch(/^[0-9a-f]{64}$/);
      }

      // Verify itemized results mapping
      expect(receipt.itemizedResults.length).toBe(28);
      expect(receipt.itemizedResults[0].status).toBe("confirmed");
      expect(receipt.itemizedResults[0].txHash).toBe(receipt.transactionHashes[0]);
      expect(receipt.itemizedResults[14].txHash).toBe(receipt.transactionHashes[0]);
      expect(receipt.itemizedResults[15].txHash).toBe(receipt.transactionHashes[1]);

      // Verify live progress callback behavior
      expect(onProgress).toHaveBeenCalled();
      const confirmedEvents = progressSnapshots.filter(
        (p) => p.currentStatus === "confirmed" && p.currentTxHash,
      );
      expect(confirmedEvents.length).toBeGreaterThanOrEqual(2);

      // Progress bar should reach 100% / completed
      const finalProgress = progressSnapshots[progressSnapshots.length - 1];
      expect(finalProgress.currentStatus).toBe("completed");
      expect(finalProgress.processedSales).toBe(28);
      expect(finalProgress.confirmedSales).toBe(28);
    });

    it("should report footprint optimization statistics in the summary receipt", async () => {
      const sales = generateSalesList(5);
      const receipt = await executeBatchSaleLogging(dummyMerchant, sales, "mock");

      expect(receipt.footprintStats).toBeDefined();
      expect(receipt.footprintStats.redundantReadKeysPurged).toBeGreaterThan(0);
      expect(receipt.footprintStats.consolidatedReadOnlyCount).toBeGreaterThan(0);
    });

    it("should throw validation error when an affiliate address is invalid", () => {
      expect(() => {
        validateSaleItems([
          {
            id: "SALE_BAD",
            campaignId: 101,
            affiliateAddress: "INVALID_ADDRESS_12345",
            saleAmountXlm: 20.0,
          },
        ]);
      }).toThrow(/not a valid Stellar public key/);
    });

    it("should throw validation error when sale amount exceeds 7 decimals", () => {
      expect(() => {
        validateSaleItems([
          {
            id: "SALE_DEC",
            campaignId: 101,
            affiliateAddress: dummyAffiliate1,
            saleAmountXlm: 12.12345678,
          },
        ]);
      }).toThrow(/7-decimal limit/);
    });
  });
});
