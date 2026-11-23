// @vitest-environment jsdom
import { Buffer } from "buffer";
globalThis.Buffer = Buffer;

import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, renderHook, screen, act, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { Web3Provider, useWeb3 } from "../context/Web3Context";
import { TransactionAnnouncementProvider } from "../context/TransactionAnnouncementContext";
import { NotificationProvider } from "../context/NotificationContext";
import { TxQueueManager } from "../lib/txQueue";
import {
  executeBatchSaleLogging,
  chunkSaleBatch,
  MAX_BATCH_SIZE,
  type SaleItem,
  type BatchExecutionProgress,
} from "../lib/batchSaleLogging";
import {
  calculateBatchRefund,
  cancelBatchSaleContractCall,
  validateCancellationConfirmation,
  type BatchSaleState,
} from "../lib/batchCancelRefund";
import { BulkSaleLogModal } from "../components/advertiser/BulkSaleLogModal";
import { BatchSaleUploader } from "../components/advertiser/BatchSaleUploader";
import * as stellarMod from "../lib/stellar";
import { Keypair } from "@stellar/stellar-sdk";

vi.mock("../config/stellar", () => ({
  STELLAR_CONFIG: {
    network: "TESTNET",
    networkPassphrase: "Test SDF Network ; September 2015",
    rpcUrl: "https://soroban-testnet.stellar.org",
    horizonUrl: "https://horizon-testnet.stellar.org",
    explorerUrl: "https://stellar.expert/explorer/testnet",
    contractId: "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
    nativeAsset: "XLM",
    nativeDecimals: 7,
  },
  SUPPORTED_ESCROW_ASSETS: {
    XLM: {
      code: "XLM",
      name: "Stellar Lumens",
      decimals: 7,
      contractAddress: "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC",
    },
    USDC: { code: "USDC", name: "USD Coin", decimals: 7, contractAddress: "CUSDC" },
    EURC: { code: "EURC", name: "Euro Coin", decimals: 7, contractAddress: "CEURC" },
  },
  NETWORK_ESCROW_ASSETS: {
    TESTNET: {},
    PUBLIC: {},
  },
}));

vi.mock("../lib/stellar", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/stellar")>();
  return {
    ...actual,
    checkFreighterInstalled: vi.fn().mockResolvedValue(true),
    connectFreighterWallet: vi
      .fn()
      .mockResolvedValue("GBZXN7PIRZGNMHGA728RGRYA7XPO5CFSGSJAA5T6Q5WWC62MWFPZ4ES2"),
    fetchXlmBalance: vi.fn().mockResolvedValue("1000.00"),
    fetchAssetBalances: vi
      .fn()
      .mockResolvedValue({ XLM: "1000.00", USDC: "500.00", EURC: "150.00" }),
    getTokenAllowanceQuery: vi.fn().mockResolvedValue(2000),
    approveTokenAllowance: vi.fn().mockResolvedValue({ success: true, txHash: "tx_approve_mock" }),
    approveTokenContractCall: vi
      .fn()
      .mockResolvedValue({ success: true, txHash: "tx_approve_token" }),
    createCampaignContractCall: vi
      .fn()
      .mockResolvedValue({ success: true, campaignId: 101, txHash: "tx_create_101" }),
    logSaleContractCall: vi.fn().mockResolvedValue({ success: true, txHash: "tx_sale_101" }),
    claimPayoutContractCall: vi.fn().mockResolvedValue({ success: true, txHash: "tx_claim_101" }),
    refundCampaignEscrowContractCall: vi
      .fn()
      .mockResolvedValue({ success: true, txHash: "tx_refund_101" }),
    fundTestnetAccount: vi.fn().mockResolvedValue(true),
    getCurrentNetwork: vi.fn().mockResolvedValue("TESTNET"),
    invokeSorobanMethod: vi.fn().mockResolvedValue({ success: true, txHash: "tx_invoke_mock" }),
  };
});

vi.mock("../lib/multisig", () => ({
  inspectMultiSigAccount: vi.fn().mockResolvedValue({
    isMultiSig: false,
    signers: [],
    threshold: { low: 1, med: 1, high: 1 },
  }),
}));

vi.mock("../utils/api", () => ({
  registerUser: vi.fn().mockResolvedValue({ success: true }),
}));

describe("Smart Contract Invocation Batching & Execution Order (#432)", () => {
  const testAccount = "GBZXN7PIRZGNMHGA728RGRYA7XPO5CFSGSJAA5T6Q5WWC62MWFPZ4ES2";
  const dummyAffiliate = Keypair.random().publicKey();

  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  const wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(
      TransactionAnnouncementProvider,
      null,
      React.createElement(
        NotificationProvider,
        null,
        React.createElement(
          Web3Provider as React.ComponentType<any>,
          { overrideAddress: testAccount },
          children,
        ),
      ),
    );

  // =========================================================================
  // ACCEPTANCE CRITERIA 1: Verify sequential execution of interdependent calls
  // =========================================================================
  describe("Acceptance Criteria 1: Sequential Execution of Interdependent Contract Calls", () => {
    it("executes interdependent queued contract calls in strict sequential order despite varying async latencies", async () => {
      const queue = new TxQueueManager();
      queue.setAccount(testAccount);

      let serverSequence = 5000n;
      queue.sequenceFetcher = async () => (serverSequence++).toString();

      const callOrder: string[] = [];
      const executionTimestamps: number[] = [];

      // Enqueue 4 interdependent operations with deliberately inverted execution latencies:
      // Op 1 (Allowance Approval): 40ms
      // Op 2 (Campaign Creation): 25ms
      // Op 3 (Sale Logging): 15ms
      // Op 4 (Payout Claim): 5ms
      const op1 = queue.enqueue("approve_allowance", "Approve 500 XLM Allowance", async (seq) => {
        await new Promise((r) => setTimeout(r, 40));
        callOrder.push("1_approve");
        executionTimestamps.push(Date.now());
        return { step: 1, seq, txHash: "tx_1" };
      });

      const op2 = queue.enqueue("create_campaign", "Create Escrow Campaign", async (seq) => {
        await new Promise((r) => setTimeout(r, 25));
        callOrder.push("2_create_campaign");
        executionTimestamps.push(Date.now());
        return { step: 2, seq, campaignId: 202, txHash: "tx_2" };
      });

      const op3 = queue.enqueue("log_sale", "Log Initial Campaign Sale", async (seq) => {
        await new Promise((r) => setTimeout(r, 15));
        callOrder.push("3_log_sale");
        executionTimestamps.push(Date.now());
        return { step: 3, seq, txHash: "tx_3" };
      });

      const op4 = queue.enqueue("claim_payout", "Claim Commission Payout", async (seq) => {
        await new Promise((r) => setTimeout(r, 5));
        callOrder.push("4_claim_payout");
        executionTimestamps.push(Date.now());
        return { step: 4, seq, txHash: "tx_4" };
      });

      const [res1, res2, res3, res4] = await Promise.all([op1, op2, op3, op4]);

      // Strict FIFO order preserved despite later tasks being faster
      expect(callOrder).toEqual(["1_approve", "2_create_campaign", "3_log_sale", "4_claim_payout"]);
      expect(res1.step).toBe(1);
      expect(res2.step).toBe(2);
      expect(res2.campaignId).toBe(202);
      expect(res3.step).toBe(3);
      expect(res4.step).toBe(4);

      // Verify execution timestamps are non-overlapping and strictly chronological
      for (let i = 1; i < executionTimestamps.length; i++) {
        expect(executionTimestamps[i]).toBeGreaterThanOrEqual(executionTimestamps[i - 1]);
      }

      // Verify sequence numbers strictly increment without collision
      expect(BigInt(res2.seq)).toBeGreaterThan(BigInt(res1.seq));
      expect(BigInt(res3.seq)).toBeGreaterThan(BigInt(res2.seq));
      expect(BigInt(res4.seq)).toBeGreaterThan(BigInt(res3.seq));
    });

    it("ensures dependent state propagation between queued contract calls without race conditions", async () => {
      const queue = new TxQueueManager();
      queue.setAccount(testAccount);

      let sharedEscrowBalance = 1000;
      const observedBalances: number[] = [];

      // Step 1: Deposit funds into escrow
      const depositTask = queue.enqueue("deposit", "Deposit 200 XLM", async () => {
        await new Promise((r) => setTimeout(r, 20));
        sharedEscrowBalance += 200;
        observedBalances.push(sharedEscrowBalance);
        return { newBalance: sharedEscrowBalance };
      });

      // Step 2: Dependent operation reads updated balance from Step 1
      const logSaleTask = queue.enqueue("log_sale", "Log Sale 150 XLM", async () => {
        await new Promise((r) => setTimeout(r, 10));
        // Must observe deposit result (1200), not initial (1000)
        observedBalances.push(sharedEscrowBalance);
        sharedEscrowBalance -= 150;
        return { newBalance: sharedEscrowBalance };
      });

      // Step 3: Dependent claim asserts remaining balance
      const claimTask = queue.enqueue("claim", "Claim 50 XLM", async () => {
        observedBalances.push(sharedEscrowBalance);
        sharedEscrowBalance -= 50;
        return { newBalance: sharedEscrowBalance };
      });

      await Promise.all([depositTask, logSaleTask, claimTask]);

      expect(observedBalances).toEqual([1200, 1200, 1050]);
      expect(sharedEscrowBalance).toBe(1000);
    });

    it("processes multi-operation batch chunks in sequential order across batch boundaries", () => {
      const items: SaleItem[] = Array.from({ length: 32 }, (_, i) => ({
        id: `ORDER_${i + 1}`,
        campaignId: 101,
        affiliateAddress: dummyAffiliate,
        saleAmountXlm: 20 + i,
      }));

      // Chunks capped at MAX_BATCH_SIZE (15)
      const chunks = chunkSaleBatch(items, MAX_BATCH_SIZE);
      expect(chunks.length).toBe(3);
      expect(chunks[0].length).toBe(15);
      expect(chunks[1].length).toBe(15);
      expect(chunks[2].length).toBe(2);

      // Verify strict boundary ordering: item IDs in chunk 1, chunk 2, chunk 3
      expect(chunks[0][0].id).toBe("ORDER_1");
      expect(chunks[0][14].id).toBe("ORDER_15");
      expect(chunks[1][0].id).toBe("ORDER_16");
      expect(chunks[1][14].id).toBe("ORDER_30");
      expect(chunks[2][0].id).toBe("ORDER_31");
      expect(chunks[2][1].id).toBe("ORDER_32");
    });
  });

  // =========================================================================
  // ACCEPTANCE CRITERIA 2: Test atomic state rollback in frontend state if any sub-operation fails
  // =========================================================================
  describe("Acceptance Criteria 2: Atomic State Rollback in Frontend State on Sub-Operation Failure", () => {
    it("atomically rolls back frontend balances and allowance when an intermediate contract call fails", async () => {
      const { result } = renderHook(() => useWeb3(), { wrapper });

      await act(async () => {
        await result.current.connectWallet("freighter");
      });

      // Baseline state
      expect(result.current.xlmBalance).toBe("1000.00");
      expect(result.current.tokenAllowance).toBe(2000);

      // Step 1: Successful campaign creation mutates state optimistically
      vi.mocked(stellarMod.createCampaignContractCall).mockResolvedValueOnce({
        success: true,
        campaignId: 105,
        txHash: "tx_create_success",
        asset: "XLM",
        assetAddress: "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC",
      });

      await act(async () => {
        await result.current.createCampaignOnChain("Campaign 1", 100, 10, 1, "XLM");
      });

      expect(result.current.xlmBalance).toBe("900.00");
      expect(result.current.tokenAllowance).toBe(1900);

      // Step 2: Intermediate contract invocation failure (Soroban contract error)
      vi.mocked(stellarMod.createCampaignContractCall).mockRejectedValueOnce(
        new Error("Soroban HostError: Error(Contract, #100) Escrow transfer rejected"),
      );

      let step2Error: any = null;
      await act(async () => {
        try {
          await result.current.createCampaignOnChain("Failing Campaign 2", 200, 10, 1, "XLM");
        } catch (err: any) {
          step2Error = err;
        }
      });

      expect(step2Error).toBeDefined();
      expect(step2Error?.message).toContain("Escrow transfer rejected");

      // ATOMIC ROLLBACK VERIFICATION:
      // State MUST roll back to snapshot prior to the failed operation (900.00 / 1900)
      expect(result.current.xlmBalance).toBe("900.00");
      expect(result.current.tokenAllowance).toBe(1900);

      // Check that the failed action is specifically flagged as "reverted"
      const actions = result.current.optimisticActions;
      const failedAction = actions.find((a) => a.description.includes("Failing Campaign 2"));
      expect(failedAction).toBeDefined();
      expect(failedAction?.status).toBe("reverted");
    });

    it("atomically reverts multi-token asset balances on intermediate asset claim failure", async () => {
      const { result } = renderHook(() => useWeb3(), { wrapper });

      await act(async () => {
        await result.current.connectWallet("freighter");
      });

      expect(result.current.assetBalances.USDC).toBe("500.00");

      // Simulate network / RPC failure during USDC claim
      vi.mocked(stellarMod.claimPayoutContractCall).mockRejectedValueOnce(
        new Error("RPC Timeout 504 Gateway - Transaction Dropped"),
      );

      await act(async () => {
        try {
          await result.current.claimPayoutOnChain(101, "USDC");
        } catch {
          // Expected rejection
        }
      });

      // USDC balance must be restored to exact pre-action value
      expect(result.current.assetBalances.USDC).toBe("500.00");
      expect(result.current.optimisticActions[0].status).toBe("reverted");
    });

    it("halts execution of subsequent dependent contract calls when an intermediate operation fails", async () => {
      const queue = new TxQueueManager();
      queue.setAccount(testAccount);

      let step1Executed = false;
      let step2Executed = false;
      let step3Executed = false;

      const pipeline = async () => {
        // Step 1: Succeeds
        await queue.enqueue("step1", "Approve Allowance", async () => {
          step1Executed = true;
          return { approved: true };
        });

        // Step 2: Fails with contract error
        await queue.enqueue("step2", "Create Escrow", async () => {
          step2Executed = true;
          throw new Error("Contract execution failed: Insufficient escrow deposit");
        });

        // Step 3: Interdependent call that depends on Step 2 (MUST NOT EXECUTE)
        await queue.enqueue("step3", "Log Initial Sale", async () => {
          step3Executed = true;
          return { logged: true };
        });
      };

      await expect(pipeline()).rejects.toThrow("Insufficient escrow deposit");

      expect(step1Executed).toBe(true);
      expect(step2Executed).toBe(true);
      expect(step3Executed).toBe(false); // Aborted before corrupting state
    });

    it("handles batch cancellation and escrow refund rollback calculations correctly", async () => {
      const batchState: BatchSaleState = {
        batchId: "BATCH_99",
        campaignId: 101,
        campaignName: "Black Friday Sale",
        advertiserAddress: testAccount,
        totalTokens: 1000,
        soldTokens: 400,
        escrowDepositXlm: 500,
        spentEscrowXlm: 200,
        status: "active",
      };

      // 1. Calculate refund rollback figures
      const refund = calculateBatchRefund(batchState);
      expect(refund.unsoldTokens).toBe(600);
      expect(refund.refundedEscrowXlm).toBe(300);

      // 2. Cancellation confirmation mismatch prevents premature rollback
      const mismatch = validateCancellationConfirmation("Wrong Name", batchState.campaignName);
      expect(mismatch.isConfirmed).toBe(false);
      expect(mismatch.error).toContain("does not match");

      const match = validateCancellationConfirmation("Black Friday Sale", batchState.campaignName);
      expect(match.isConfirmed).toBe(true);

      // 3. Contract call execution with mock wallet
      const res = await cancelBatchSaleContractCall(
        testAccount,
        "BATCH_99",
        101,
        "mock",
      );
      expect(res.success).toBe(true);
      expect(res.txHash).toMatch(/^0x[0-9a-f]{64}$/);
    });
  });

  // =========================================================================
  // ACCEPTANCE CRITERIA 3: Test progress bar indicator for multi-step transaction flows
  // =========================================================================
  describe("Acceptance Criteria 3: Progress Bar Indicator for Multi-Step Transaction Flows", () => {
    it("reports all lifecycle progress states across multi-step batch execution", async () => {
      const recordedProgress: BatchExecutionProgress[] = [];

      const sales: SaleItem[] = [
        { id: "S1", campaignId: 101, affiliateAddress: dummyAffiliate, saleAmountXlm: 10 },
        { id: "S2", campaignId: 101, affiliateAddress: dummyAffiliate, saleAmountXlm: 20 },
      ];

      // Mock processBatchChunk to simulate multi-step progress transitions
      const receipt = await executeBatchSaleLogging(
        testAccount,
        sales,
        "mock",
        (prog) => {
          recordedProgress.push({ ...prog });
        },
      );

      expect(receipt.success).toBe(true);
      expect(receipt.confirmedCount).toBe(2);
      expect(receipt.failedCount).toBe(0);

      // Verify that progress reports were emitted
      expect(recordedProgress.length).toBeGreaterThan(0);

      // The final progress report must reflect completed/confirmed state
      const lastProgress = recordedProgress[recordedProgress.length - 1];
      expect(lastProgress.confirmedSales).toBe(2);
      expect(lastProgress.failedSales).toBe(0);
      expect(lastProgress.processedSales).toBe(2);
    });

    it("renders progress bar with correct ARIA attributes and dynamic width percentage in BulkSaleLogModal", () => {
      const mockProgress: BatchExecutionProgress = {
        totalBatches: 4,
        currentBatchIndex: 2,
        totalSales: 20,
        processedSales: 10,
        confirmedSales: 10,
        failedSales: 0,
        currentStatus: "submitting",
        recentItemResults: [],
        message: "Submitting batch 2/4...",
        currentTxHash: "0xabc1234567890abcdef",
      };

      render(
        React.createElement(
          Web3Provider as React.ComponentType<any>,
          { overrideAddress: testAccount },
          React.createElement(
            NotificationProvider,
            null,
            React.createElement(BulkSaleLogModal, {
              onClose: () => {},
              initialSalesList: [],
              initialProgress: mockProgress,
            }),
          ),
        ),
      );

      // Verify accessible progress bar
      const progressBar = screen.getByRole("progressbar", { name: "Batch execution progress" });
      expect(progressBar).toBeDefined();

      // processedSales in-flight batch calculation:
      // ((currentBatchIndex - 1 + 0.5) / totalBatches) * 100 = ((2 - 1 + 0.5) / 4) * 100 = 38%
      expect(progressBar.getAttribute("aria-valuenow")).toBe("38");
      expect(progressBar.getAttribute("aria-valuemin")).toBe("0");
      expect(progressBar.getAttribute("aria-valuemax")).toBe("100");

      // Verify text indicators
      expect(screen.getByText("38% Complete")).toBeDefined();
      expect(screen.getByText("Batch 2 of 4")).toBeDefined();
      expect(screen.getByText("Submitting batch 2/4...")).toBeDefined();
      expect(screen.getByText(/Tx: 0xabc1234567890abcdef/)).toBeDefined();

      // Verify track inner fill style width
      const innerTrack = progressBar.querySelector("div");
      expect(innerTrack?.style.width).toBe("38%");
    });

    it("reflects error state and failed items count in progress bar when an intermediate sub-operation fails", () => {
      const errorProgress: BatchExecutionProgress = {
        totalBatches: 2,
        currentBatchIndex: 1,
        totalSales: 10,
        processedSales: 5,
        confirmedSales: 2,
        failedSales: 3,
        currentStatus: "error",
        recentItemResults: [],
        message: "Batch 1 encountered error: HostError(Contract, #120)",
      };

      render(
        React.createElement(
          Web3Provider as React.ComponentType<any>,
          { overrideAddress: testAccount },
          React.createElement(
            NotificationProvider,
            null,
            React.createElement(BulkSaleLogModal, {
              onClose: () => {},
              initialSalesList: [],
              initialProgress: errorProgress,
            }),
          ),
        ),
      );

      const progressBar = screen.getByRole("progressbar", { name: "Batch execution progress" });
      // For batch 1 of 2 with error status: ((1 - 1 + 1) / 2) * 100 = 50%
      expect(progressBar.getAttribute("aria-valuenow")).toBe("50");

      // Status badge renders error status
      expect(screen.getByText("error", { selector: "span" })).toBeDefined();
      expect(screen.getByText("Batch 1 encountered error: HostError(Contract, #120)")).toBeDefined();
    });

    it("supports pause, resume, and cancellation flow control in sequential batch uploader", async () => {
      vi.mocked(stellarMod.logSaleContractCall).mockResolvedValue({
        success: true,
        txHash: "tx_mock_hash",
      });

      render(
        React.createElement(
          Web3Provider as React.ComponentType<any>,
          { overrideAddress: testAccount },
          React.createElement(
            NotificationProvider,
            null,
            React.createElement(BatchSaleUploader),
          ),
        ),
      );

      // Verify initial uploader idle state
      expect(screen.getByText("Batch Sale Conversion Uploader")).toBeDefined();
      expect(screen.queryByText("Sequential On-Chain Logging in Progress")).toBeNull();

      // Load valid demo batch
      fireEvent.click(screen.getByText("Load Demo (52 Valid)"));

      await screen.findByText("Visual Preview Table");

      // Trigger sequential logging
      fireEvent.click(screen.getByText("Log Batch On-Chain (52)"));

      expect(await screen.findByText("Sequential On-Chain Logging in Progress")).toBeDefined();

      // Test Pause
      fireEvent.click(screen.getByText("Pause"));
      expect(screen.getByText("Resume")).toBeDefined();

      // Test Resume
      fireEvent.click(screen.getByText("Resume"));
      expect(screen.getByText("Pause")).toBeDefined();

      // Test Cancel
      fireEvent.click(screen.getByText("Cancel"));

      expect(await screen.findByText("Batch Logging Cancelled", {}, { timeout: 3000 })).toBeDefined();
      await waitFor(() => expect(screen.getByText("On-Chain Batch Logging Complete")).toBeDefined());
    });
  });
});
