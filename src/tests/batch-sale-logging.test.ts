import { describe, it, expect, vi } from "vitest";
import {
  chunkSaleBatch,
  validateSaleItems,
  consolidateFootprint,
  optimizeSorobanTransactionData,
  buildLogSaleArgs,
  buildBatchTransactionEnvelope,
  executeBatchSaleLogging,
  waitForConfirmation,
  MAX_BATCH_SIZE,
  type SaleItem,
  type BatchExecutionProgress,
} from "../lib/batchSaleLogging";
import { xdr, Account, Keypair, scValToNative, StrKey, SorobanDataBuilder } from "@stellar/stellar-sdk";
import * as stellarLib from "../lib/stellar";

describe("Soroban Footprint Optimization & Multi-Operation Batches (#133)", () => {
  const dummyMerchantKp = Keypair.random();
  const dummyMerchant = dummyMerchantKp.publicKey();
  const dummyAffiliate1Kp = Keypair.random();
  const dummyAffiliate1 = dummyAffiliate1Kp.publicKey();
  const dummyAffiliate2Kp = Keypair.random();
  const dummyAffiliate2 = dummyAffiliate2Kp.publicKey();
  const dummyContractAffiliate = StrKey.encodeContract(Buffer.alloc(32, 7));

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

    it("should return empty array when no sales are provided or invalid items", () => {
      expect(chunkSaleBatch([])).toEqual([]);
      expect(chunkSaleBatch(null as any)).toEqual([]);
      expect(chunkSaleBatch(undefined as any)).toEqual([]);
    });

    it("should enforce maximum batch limit of 15 even if a larger number is requested", () => {
      const sales = generateSalesList(20);
      const chunks = chunkSaleBatch(sales, 50); // Requesting 50, but max is 15
      expect(chunks[0].length).toBe(15);
      expect(chunks[1].length).toBe(5);
    });

    it("should support smaller custom batch size", () => {
      const sales = generateSalesList(12);
      const chunks = chunkSaleBatch(sales, 5);
      expect(chunks.length).toBe(3);
      expect(chunks[0].length).toBe(5);
      expect(chunks[1].length).toBe(5);
      expect(chunks[2].length).toBe(2);
    });

    it("should throw error if sales array is empty or contains invalid items", () => {
      expect(() => validateSaleItems([])).toThrow("No sales provided");
      expect(() => validateSaleItems(null as any)).toThrow("No sales provided");
      expect(() => validateSaleItems([null as any])).toThrow("Invalid sale record at index 0");
      expect(() =>
        validateSaleItems([
          {
            id: "",
            campaignId: 101,
            affiliateAddress: dummyAffiliate1,
            saleAmountXlm: 10,
          },
        ]),
      ).toThrow("requires a valid string id");
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
            id: "S1",
            campaignId: 1.5,
            affiliateAddress: dummyAffiliate1,
            saleAmountXlm: 10,
          },
        ]),
      ).toThrow("Invalid campaignId");
      expect(() =>
        validateSaleItems([
          {
            id: "S1",
            campaignId: 10,
            affiliateAddress: "",
            saleAmountXlm: 10,
          },
        ]),
      ).toThrow("Invalid affiliate address");
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
      expect(() =>
        validateSaleItems([
          {
            id: "S2",
            campaignId: 10,
            affiliateAddress: dummyAffiliate1,
            saleAmountXlm: -5,
          },
        ]),
      ).toThrow("Invalid saleAmountXlm");
      expect(() =>
        validateSaleItems([
          {
            id: "S2",
            campaignId: 10,
            affiliateAddress: dummyAffiliate1,
            saleAmountXlm: NaN,
          },
        ]),
      ).toThrow("Invalid saleAmountXlm");
    });

    it("should accept valid Contract ID as affiliate address", () => {
      expect(() =>
        validateSaleItems([
          {
            id: "S_CONTRACT",
            campaignId: 101,
            affiliateAddress: dummyContractAffiliate,
            saleAmountXlm: 50.0,
          },
        ]),
      ).not.toThrow();
    });
  });

  describe("Ledger Footprint Consolidation & Collision Avoidance", () => {
    it("should consolidate redundant read keys and eliminate read-write collisions", () => {
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

      const rawFootprint = new xdr.LedgerFootprint({
        readOnly: [keyA, keyB, keyB, keyC],
        readWrite: [keyA, keyA],
      });

      const { optimizedFootprint, stats } = consolidateFootprint(rawFootprint);

      const optReadWrite = Array.isArray((optimizedFootprint as any).readWrite)
        ? (optimizedFootprint as any).readWrite
        : (optimizedFootprint as any).readWrite();
      expect(optReadWrite.length).toBe(1);
      expect(stats.consolidatedReadWriteCount).toBe(1);

      const optReadOnly = Array.isArray((optimizedFootprint as any).readOnly)
        ? (optimizedFootprint as any).readOnly
        : (optimizedFootprint as any).readOnly();
      expect(optReadOnly.length).toBe(2);
      expect(stats.consolidatedReadOnlyCount).toBe(2);
      expect(stats.redundantReadKeysPurged).toBe(3);
    });

    it("should handle null or empty footprint gracefully", () => {
      const { optimizedFootprint, stats } = consolidateFootprint(null as any);
      expect(stats.originalReadOnlyCount).toBe(0);
      expect(stats.originalReadWriteCount).toBe(0);
      expect(stats.redundantReadKeysPurged).toBe(0);
      expect(optimizedFootprint).toBeDefined();
    });

    it("should optimize SorobanDataBuilder instance", () => {
      const keyA = xdr.LedgerKey.account(
        new xdr.LedgerKeyAccount({
          accountId: dummyMerchantKp.xdrAccountId(),
        }),
      );
      let setReadOnly: any[] = [];
      let setReadWrite: any[] = [];

      const mockDataBuilder = {
        getFootprint: () => ({
          readOnly: [keyA, keyA],
          readWrite: [keyA],
        }),
        setFootprint: (ro: any[], rw: any[]) => {
          setReadOnly = ro;
          setReadWrite = rw;
        },
      };

      const { optimizedTxData, stats } = optimizeSorobanTransactionData(mockDataBuilder);
      expect(optimizedTxData).toBe(mockDataBuilder);
      expect(stats.redundantReadKeysPurged).toBe(2);
      expect(setReadOnly.length).toBe(0);
      expect(setReadWrite.length).toBe(1);
    });

    it("should optimize raw xdr.SorobanTransactionData", () => {
      const keyA = xdr.LedgerKey.account(
        new xdr.LedgerKeyAccount({
          accountId: dummyMerchantKp.xdrAccountId(),
        }),
      );
      const rawFootprint = new xdr.LedgerFootprint({
        readOnly: [keyA],
        readWrite: [],
      });
      const txData = new xdr.SorobanTransactionData({
        ext: xdr.ExtensionPoint.v0(),
        resources: new xdr.SorobanResources({
          footprint: rawFootprint,
          instructions: 1000,
          diskReadBytes: 100,
          writeBytes: 0,
        }),
        resourceFee: 100n as any,
      });

      const { optimizedTxData, stats } = optimizeSorobanTransactionData(txData);
      expect(stats.consolidatedReadOnlyCount).toBe(1);
      expect(optimizedTxData).toBeInstanceOf(xdr.SorobanTransactionData);
    });
  });

  describe("Transaction Envelope Construction", () => {
    it("should build ScVal arguments adhering to contract specifications", () => {
      const sale: SaleItem = {
        id: "SALE_1",
        campaignId: 101,
        affiliateAddress: dummyAffiliate1,
        saleAmountXlm: 10.5,
        customerRef: "CUST_123",
      };

      const args = buildLogSaleArgs(dummyMerchant, sale);
      expect(args.length).toBe(4);
      expect(scValToNative(args[0])).toBe(dummyMerchant);
      expect(scValToNative(args[1])).toBe(101);
      expect(scValToNative(args[2])).toBe(dummyAffiliate1);
      expect(scValToNative(args[3])).toBe(105000000n);
    });

    it("should build ScVal arguments when customerRef is omitted", () => {
      const sale: SaleItem = {
        id: "SALE_NO_REF",
        campaignId: 102,
        affiliateAddress: dummyAffiliate2,
        saleAmountXlm: 20.0,
      };
      const args = buildLogSaleArgs(dummyMerchant, sale);
      expect(args.length).toBe(4);
      expect(scValToNative(args[1])).toBe(102);
    });

    it("should reject building arguments if advertiser address is invalid", () => {
      const sale: SaleItem = {
        id: "SALE_1",
        campaignId: 101,
        affiliateAddress: dummyAffiliate1,
        saleAmountXlm: 10.5,
      };
      expect(() => buildLogSaleArgs("INVALID_ADV", sale)).toThrow(/Invalid advertiser address/);
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

    it("should reject building an envelope if contractId is invalid or missing", () => {
      const sales = generateSalesList(2);
      const account = new Account(dummyMerchant, "1000");

      expect(() =>
        buildBatchTransactionEnvelope(account, dummyMerchant, sales, "INVALID_CONTRACT_ID"),
      ).toThrow(/Invalid contract ID/);

      expect(() =>
        buildBatchTransactionEnvelope(account, dummyMerchant, sales, ""),
      ).toThrow(/Invalid contract ID/);
    });
  });

  describe("Live Progress Bar & Batch Execution", () => {
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

      expect(receipt.success).toBe(true);
      expect(receipt.totalSalesCount).toBe(28);
      expect(receipt.confirmedCount).toBe(28);
      expect(receipt.failedCount).toBe(0);
      expect(receipt.batchesExecuted).toBe(2);
      expect(receipt.transactionHashes.length).toBe(2);

      for (const hash of receipt.transactionHashes) {
        expect(hash).toMatch(/^[0-9a-f]{64}$/);
      }

      expect(receipt.itemizedResults.length).toBe(28);
      expect(receipt.itemizedResults[0].status).toBe("confirmed");
      expect(receipt.itemizedResults[0].txHash).toBe(receipt.transactionHashes[0]);
      expect(receipt.itemizedResults[14].txHash).toBe(receipt.transactionHashes[0]);
      expect(receipt.itemizedResults[15].txHash).toBe(receipt.transactionHashes[1]);

      expect(onProgress).toHaveBeenCalled();
      const confirmedEvents = progressSnapshots.filter(
        (p) => p.currentStatus === "confirmed" && p.currentTxHash,
      );
      expect(confirmedEvents.length).toBeGreaterThanOrEqual(2);

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

    it("should reject batch execution when wallet is readonly", async () => {
      const sales = generateSalesList(2);
      await expect(
        executeBatchSaleLogging(dummyMerchant, sales, "readonly"),
      ).rejects.toThrow(/Read-only wallet cannot sign/);
    });

    it("should handle error during executeBatchSaleLogging gracefully and mark items as failed", async () => {
      const sales = generateSalesList(3);
      // Spy on processBatchChunk or throw error by using a wallet type that fails getSorobanRpcServer
      vi.spyOn(stellarLib, "getSorobanRpcServer").mockImplementationOnce(() => {
        throw new Error("RPC Server Offline");
      });

      const receipt = await executeBatchSaleLogging(dummyMerchant, sales, "freighter");
      expect(receipt.success).toBe(false);
      expect(receipt.failedCount).toBe(3);
      expect(receipt.confirmedCount).toBe(0);
      expect(receipt.itemizedResults[0].status).toBe("failed");
      expect(receipt.itemizedResults[0].error).toContain("RPC Server Offline");
    });

    it("should execute real wallet transaction flow through mocked RPC server", async () => {
      const sales = generateSalesList(1);
      const mockTxHash = "9".repeat(64);

      const dummyAccount = new Account(dummyMerchant, "100");
      const mockSim = {
        transactionData: new SorobanDataBuilder().build().toXDR("base64"),
        minResourceFee: "100",
        results: [{ auth: [] }],
      };

      const mockServer = {
        getAccount: vi.fn().mockResolvedValue(dummyAccount),
        simulateTransaction: vi.fn().mockResolvedValue(mockSim),
        sendTransaction: vi.fn().mockResolvedValue({
          status: "PENDING",
          hash: mockTxHash,
        }),
        getTransaction: vi.fn().mockResolvedValue({
          status: "SUCCESS",
        }),
      };

      vi.spyOn(stellarLib, "getSorobanRpcServer").mockReturnValue(mockServer as any);
      vi.spyOn(stellarLib, "signWalletTransaction").mockImplementation(async (xdrStr) => xdrStr);

      const receipt = await executeBatchSaleLogging(dummyMerchant, sales, "freighter");
      expect(receipt.success).toBe(true);
      expect(receipt.confirmedCount).toBe(1);
      expect(receipt.transactionHashes).toContain(mockTxHash);
    });

    it("should isolate failing items during simulation and recover valid items", async () => {
      const sales = generateSalesList(2);
      const mockTxHash = "8".repeat(64);

      const dummyAccount = new Account(dummyMerchant, "100");
      const mockSim = {
        transactionData: new SorobanDataBuilder().build().toXDR("base64"),
        minResourceFee: "100",
        results: [{ auth: [] }],
      };

      let simCallCount = 0;
      const mockServer = {
        getAccount: vi.fn().mockResolvedValue(dummyAccount),
        simulateTransaction: vi.fn().mockImplementation(async () => {
          simCallCount++;
          if (simCallCount === 1) {
            return { error: "Batch Simulation Reverted" };
          }
          if (simCallCount === 2) {
            return { error: "Item 1 Invalid Contract Call" };
          }
          if (simCallCount === 3) {
            return mockSim;
          }
          return mockSim;
        }),
        sendTransaction: vi.fn().mockResolvedValue({
          status: "PENDING",
          hash: mockTxHash,
        }),
        getTransaction: vi.fn().mockResolvedValue({
          status: "SUCCESS",
        }),
      };

      vi.spyOn(stellarLib, "getSorobanRpcServer").mockReturnValue(mockServer as any);
      vi.spyOn(stellarLib, "signWalletTransaction").mockImplementation(async (xdrStr) => xdrStr);

      const receipt = await executeBatchSaleLogging(dummyMerchant, sales, "freighter");
      expect(receipt.success).toBe(true);
      expect(receipt.confirmedCount).toBe(1);
      expect(receipt.failedCount).toBe(1);
      expect(receipt.itemizedResults.find((i) => i.saleId === sales[0].id)?.status).toBe("failed");
      expect(receipt.itemizedResults.find((i) => i.saleId === sales[1].id)?.status).toBe("confirmed");
    });
  });

  describe("waitForConfirmation Polling & Errors", () => {
    it("should resolve when transaction status is SUCCESS", async () => {
      const mockServer = {
        getTransaction: vi.fn().mockResolvedValue({
          status: "SUCCESS",
          resultXdr: "AAAA",
        }),
      } as any;

      const res = await waitForConfirmation(mockServer, "b".repeat(64), 5000, 10);
      expect(res.status).toBe("SUCCESS");
    });

    it("should poll through NOT_FOUND until SUCCESS", async () => {
      const mockServer = {
        getTransaction: vi
          .fn()
          .mockResolvedValueOnce({ status: "NOT_FOUND" })
          .mockResolvedValueOnce({ status: "SUCCESS", resultXdr: "AAAA" }),
      } as any;

      const res = await waitForConfirmation(mockServer, "c".repeat(64), 5000, 10);
      expect(res.status).toBe("SUCCESS");
      expect(mockServer.getTransaction).toHaveBeenCalledTimes(2);
    });

    it("should attach txHash to thrown error when waitForConfirmation encounters FAILED status", async () => {
      const mockServer = {
        getTransaction: vi.fn().mockResolvedValue({
          status: "FAILED",
        }),
      } as any;

      const dummyTxHash = "a".repeat(64);
      let caughtErr: any;
      try {
        await waitForConfirmation(mockServer, dummyTxHash, 5000, 10);
      } catch (err: any) {
        caughtErr = err;
      }

      expect(caughtErr).toBeDefined();
      expect(caughtErr.txHash).toBe(dummyTxHash);
      expect(caughtErr.message).toContain("failed on ledger");
    });

    it("should throw timeout error when confirmation takes too long", async () => {
      const mockServer = {
        getTransaction: vi.fn().mockResolvedValue({
          status: "NOT_FOUND",
        }),
      } as any;

      const dummyTxHash = "d".repeat(64);
      await expect(
        waitForConfirmation(mockServer, dummyTxHash, 50, 10),
      ).rejects.toThrow(/timed out/);
    });
  });
});
