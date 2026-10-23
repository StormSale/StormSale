import {
  rpc,
  Contract,
  TransactionBuilder,
  nativeToScVal,
  Address,
  Account,
  BASE_FEE,
  xdr,
  Keypair,
  StrKey,
} from "@stellar/stellar-sdk";
import { STELLAR_CONFIG } from "../config/stellar";
import { signWalletTransaction, getSorobanRpcServer, type WalletType } from "./stellar";

/** Maximum number of log_sale operations allowed in a single transaction envelope */
export const MAX_BATCH_SIZE = 15;

export interface SaleItem {
  id: string;
  campaignId: number;
  affiliateAddress: string;
  saleAmountXlm: number;
  customerRef?: string;
  metadata?: Record<string, unknown>;
}

export interface BatchSaleItemResult {
  saleId: string;
  campaignId: number;
  affiliateAddress: string;
  saleAmountXlm: number;
  status: "confirmed" | "failed" | "skipped";
  txHash?: string;
  error?: string;
}

export type BatchExecutionStatus =
  | "idle"
  | "simulating"
  | "optimizing_footprint"
  | "signing"
  | "submitting"
  | "confirmed"
  | "recovering_partial"
  | "completed"
  | "error";

export interface BatchExecutionProgress {
  totalBatches: number;
  currentBatchIndex: number; // 1-indexed
  totalSales: number;
  processedSales: number;
  confirmedSales: number;
  failedSales: number;
  currentTxHash?: string;
  currentStatus: BatchExecutionStatus;
  recentItemResults: BatchSaleItemResult[];
  message?: string;
}

export type BatchProgressCallback = (progress: BatchExecutionProgress) => void;

export interface FootprintOptimizationStats {
  originalReadOnlyCount: number;
  originalReadWriteCount: number;
  consolidatedReadOnlyCount: number;
  consolidatedReadWriteCount: number;
  redundantReadKeysPurged: number;
}

export interface BatchSaleSummaryReceipt {
  success: boolean;
  totalSalesCount: number;
  confirmedCount: number;
  failedCount: number;
  batchesExecuted: number;
  transactionHashes: string[];
  itemizedResults: BatchSaleItemResult[];
  footprintStats: FootprintOptimizationStats;
}

/**
 * Validates individual sale items for bulk submission.
 */
export function validateSaleItems(sales: SaleItem[]): void {
  if (!Array.isArray(sales) || sales.length === 0) {
    throw new Error("No sales provided for batch logging.");
  }
  for (let i = 0; i < sales.length; i++) {
    const s = sales[i];
    if (!s || typeof s !== "object") {
      throw new Error(`Invalid sale record at index ${i}.`);
    }
    if (!s.id || typeof s.id !== "string") {
      throw new Error(`Sale item at index ${i} requires a valid string id.`);
    }
    if (!Number.isInteger(s.campaignId) || s.campaignId <= 0) {
      throw new Error(`Invalid campaignId "${s.campaignId}" for sale ${s.id}.`);
    }
    if (!s.affiliateAddress || typeof s.affiliateAddress !== "string") {
      throw new Error(`Invalid affiliate address for sale ${s.id}.`);
    }
    if (
      !StrKey.isValidEd25519PublicKey(s.affiliateAddress) &&
      !StrKey.isValidContract(s.affiliateAddress)
    ) {
      throw new Error(
        `Affiliate address "${s.affiliateAddress}" is not a valid Stellar public key (G...) or contract ID (C...) for sale ${s.id}.`,
      );
    }
    if (typeof s.saleAmountXlm !== "number" || !Number.isFinite(s.saleAmountXlm) || s.saleAmountXlm <= 0) {
      throw new Error(`Invalid saleAmountXlm for sale ${s.id}. Must be a positive number.`);
    }
    const stroops = s.saleAmountXlm * 1e7;
    const roundedStroops = Math.round(stroops);
    if (
      !Number.isSafeInteger(roundedStroops) ||
      roundedStroops < 1 ||
      Math.abs(stroops - roundedStroops) > 1e-5
    ) {
      throw new Error(
        `Sale amount for sale ${s.id} (${s.saleAmountXlm}) exceeds Stellar's 7-decimal limit.`,
      );
    }
  }
}

/**
 * Partitions an array of sales into batches capped at maxBatchSize (default 15).
 */
export function chunkSaleBatch<T>(items: T[], maxBatchSize: number = MAX_BATCH_SIZE): T[][] {
  if (!Array.isArray(items) || items.length === 0) return [];
  const limit = Math.max(1, Math.min(maxBatchSize, MAX_BATCH_SIZE));
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += limit) {
    chunks.push(items.slice(i, i + limit));
  }
  return chunks;
}

function getXdrArray<T = any>(parent: any, field: string): T[] {
  if (!parent) return [];
  const val = parent[field];
  if (typeof val === "function") {
    const res = val.call(parent);
    if (Array.isArray(res)) return res;
  }
  if (Array.isArray(val)) return val;
  if (parent._attributes && Array.isArray(parent._attributes[field])) {
    return parent._attributes[field];
  }
  return [];
}

function getXdrValue<T = any>(parent: any, field: string): T {
  if (!parent) return undefined as any;
  const val = parent[field];
  if (typeof val === "function") {
    return val.call(parent);
  }
  if (val !== undefined) return val;
  if (parent._attributes && parent._attributes[field] !== undefined) {
    return parent._attributes[field];
  }
  return undefined as any;
}

/**
 * Consolidates a Soroban ledger footprint:
 * 1. Deduplicates readOnly keys.
 * 2. Deduplicates readWrite keys.
 * 3. Removes any readOnly key that is already contained in readWrite (readWrite subsumes readOnly).
 * This eliminates duplicate key collisions and minimizes Soroban ledger footprints.
 */
export function consolidateFootprint(
  footprint: xdr.LedgerFootprint,
): { optimizedFootprint: xdr.LedgerFootprint; stats: FootprintOptimizationStats } {
  const originalReadOnly = getXdrArray<xdr.LedgerKey>(footprint, "readOnly");
  const originalReadWrite = getXdrArray<xdr.LedgerKey>(footprint, "readWrite");

  const readWriteMap = new Map<string, xdr.LedgerKey>();
  for (const key of originalReadWrite) {
    const keyXdr = key.toXDR("base64");
    if (!readWriteMap.has(keyXdr)) {
      readWriteMap.set(keyXdr, key);
    }
  }

  const readOnlyMap = new Map<string, xdr.LedgerKey>();
  let redundantReadCount = 0;

  for (const key of originalReadOnly) {
    const keyXdr = key.toXDR("base64");
    // If the key is already in readWrite, remove from readOnly to prevent collision
    if (readWriteMap.has(keyXdr)) {
      redundantReadCount++;
      continue;
    }
    // If already in readOnly, it's a redundant duplicate read key
    if (readOnlyMap.has(keyXdr)) {
      redundantReadCount++;
      continue;
    }
    readOnlyMap.set(keyXdr, key);
  }

  const consolidatedReadOnly = Array.from(readOnlyMap.values());
  const consolidatedReadWrite = Array.from(readWriteMap.values());
  const duplicateWriteCount = originalReadWrite.length - consolidatedReadWrite.length;

  const optimizedFootprint = new xdr.LedgerFootprint({
    readOnly: consolidatedReadOnly,
    readWrite: consolidatedReadWrite,
  });

  return {
    optimizedFootprint,
    stats: {
      originalReadOnlyCount: originalReadOnly.length,
      originalReadWriteCount: originalReadWrite.length,
      consolidatedReadOnlyCount: consolidatedReadOnly.length,
      consolidatedReadWriteCount: consolidatedReadWrite.length,
      redundantReadKeysPurged: redundantReadCount + duplicateWriteCount,
    },
  };
}

/**
 * Optimizes SorobanTransactionData (or SorobanDataBuilder) by consolidating its LedgerFootprint.
 */
export function optimizeSorobanTransactionData(
  txData: xdr.SorobanTransactionData | any,
): { optimizedTxData: any; stats: FootprintOptimizationStats } {
  // If txData is a SorobanDataBuilder (as returned by simulateTransaction in stellar-sdk)
  if (
    txData &&
    typeof txData.getFootprint === "function" &&
    typeof txData.setFootprint === "function"
  ) {
    const rawFp = txData.getFootprint();
    const { optimizedFootprint, stats } = consolidateFootprint(rawFp);
    const readOnlyKeys = getXdrArray<xdr.LedgerKey>(optimizedFootprint, "readOnly");
    const readWriteKeys = getXdrArray<xdr.LedgerKey>(optimizedFootprint, "readWrite");
    txData.setFootprint(readOnlyKeys, readWriteKeys);
    return { optimizedTxData: txData, stats };
  }

  const resources = getXdrValue<xdr.SorobanResources>(txData, "resources");
  const currentFootprint = getXdrValue<xdr.LedgerFootprint>(resources, "footprint");
  const { optimizedFootprint, stats } = consolidateFootprint(currentFootprint);

  const instructions = getXdrValue<number>(resources, "instructions") ?? 0;
  const diskReadBytes = getXdrValue<number>(resources, "diskReadBytes") ?? 0;
  const writeBytes = getXdrValue<number>(resources, "writeBytes") ?? 0;

  const optimizedResources = new xdr.SorobanResources({
    footprint: optimizedFootprint,
    instructions,
    diskReadBytes,
    writeBytes,
  });

  const ext = getXdrValue<xdr.ExtensionPoint>(txData, "ext") ?? xdr.ExtensionPoint.v0();
  const resourceFee = getXdrValue<xdr.Int64>(txData, "resourceFee");

  const optimizedTxData = new xdr.SorobanTransactionData({
    ext,
    resources: optimizedResources,
    resourceFee,
  });

  return { optimizedTxData, stats };
}

/**
 * Generates an ScVal array for contract `log_sale` invocation.
 */
export function buildLogSaleArgs(advertiserAddress: string, sale: SaleItem): xdr.ScVal[] {
  if (
    !StrKey.isValidEd25519PublicKey(advertiserAddress) &&
    !StrKey.isValidContract(advertiserAddress)
  ) {
    throw new Error(`Invalid advertiser address "${advertiserAddress}".`);
  }
  if (
    !StrKey.isValidEd25519PublicKey(sale.affiliateAddress) &&
    !StrKey.isValidContract(sale.affiliateAddress)
  ) {
    throw new Error(`Invalid affiliate address "${sale.affiliateAddress}" for sale ${sale.id}.`);
  }

  const amountStroops = BigInt(Math.round(sale.saleAmountXlm * 1e7));
  const advAddressVal = new Address(advertiserAddress).toScVal();
  const affAddressVal = new Address(sale.affiliateAddress).toScVal();

  return [
    advAddressVal,
    nativeToScVal(sale.campaignId, { type: "u32" }),
    affAddressVal,
    nativeToScVal(amountStroops, { type: "i128" }),
  ];
}

/**
 * Generates a mock 64-character hex string for transaction hashes.
 */
function generateMockTxHash(): string {
  const bytes = new Uint8Array(32);
  const cryptoObj = globalThis.crypto ?? (globalThis as unknown as { webcrypto?: Crypto }).webcrypto;
  if (cryptoObj?.getRandomValues) {
    cryptoObj.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Builds a multi-operation transaction envelope for a batch of sales.
 */
export function buildBatchTransactionEnvelope(
  account: Account,
  advertiserAddress: string,
  salesBatch: SaleItem[],
  contractId: string = STELLAR_CONFIG.contractId,
): TransactionBuilder {
  const contract = new Contract(contractId);
  const baseOpFee = Number(BASE_FEE) * salesBatch.length;

  const builder = new TransactionBuilder(account, {
    fee: String(Math.max(baseOpFee, Number(BASE_FEE))),
    networkPassphrase: STELLAR_CONFIG.networkPassphrase,
  });

  for (const sale of salesBatch) {
    const args = buildLogSaleArgs(advertiserAddress, sale);
    const callOp = contract.call("log_sale", ...args);
    builder.addOperation(callOp);
  }

  return builder.setTimeout(90);
}

/**
 * Shared helper that polls for on-chain transaction confirmation.
 * Returns immediately on SUCCESS, propagates FAILED without catching it as a transient error,
 * retries transient RPC errors, and enforces a timeout covering the transaction timebound.
 */
export async function waitForConfirmation(
  server: rpc.Server,
  txHash: string,
  timeoutMs: number = 95000,
  pollIntervalMs: number = 1200,
): Promise<rpc.Api.GetTransactionResponse> {
  const startTime = Date.now();
  let lastError: unknown = null;

  while (Date.now() - startTime < timeoutMs) {
    await new Promise((res) => setTimeout(res, pollIntervalMs));
    let txStatus: rpc.Api.GetTransactionResponse;
    try {
      txStatus = await server.getTransaction(txHash);
    } catch (pollErr: unknown) {
      lastError = pollErr;
      continue;
    }

    if (txStatus.status === "SUCCESS") {
      return txStatus;
    }
    if (txStatus.status === "FAILED") {
      throw new Error(`Batch transaction ${txHash} failed on ledger.`);
    }
  }

  if (lastError) {
    throw new Error(
      `Batch transaction ${txHash} timed out after ${timeoutMs}ms waiting for ledger confirmation: ${
        lastError instanceof Error ? lastError.message : String(lastError)
      }`,
    );
  }
  throw new Error(`Batch transaction ${txHash} timed out waiting for ledger confirmation.`);
}

/**
 * Executes a single batch of sales (up to 15) with footprint optimization and partial revert handling.
 */
async function processBatchChunk(
  chunk: SaleItem[],
  advertiserAddress: string,
  walletType: WalletType,
  onProgress?: (status: BatchExecutionStatus, txHash?: string, message?: string) => void,
): Promise<{
  results: BatchSaleItemResult[];
  txHash?: string;
  stats: FootprintOptimizationStats;
}> {
  // Mock mode strictly for tests or when "mock" connector is explicitly selected
  const isMock = walletType === "mock";

  if (isMock) {
    onProgress?.("simulating", undefined, "Simulating Soroban batch operations...");

    // Create a mock footprint with simulated redundant read keys to exercise optimizer
    const mockKp1 = Keypair.random();
    const mockKp2 = Keypair.random();

    const dummyKey1 = xdr.LedgerKey.account(
      new xdr.LedgerKeyAccount({
        accountId: mockKp1.xdrAccountId(),
      }),
    );
    const dummyKey2 = xdr.LedgerKey.account(
      new xdr.LedgerKeyAccount({
        accountId: mockKp2.xdrAccountId(),
      }),
    );

    // Mock footprint: dummyKey1 in both readOnly and readWrite (collision), plus repeated dummyKey2 in readOnly
    const mockFootprint = new xdr.LedgerFootprint({
      readOnly: [dummyKey1, dummyKey2, dummyKey2],
      readWrite: [dummyKey1],
    });

    const { stats } = consolidateFootprint(mockFootprint);

    onProgress?.("optimizing_footprint", undefined, "Consolidating Soroban ledger footprint...");
    onProgress?.("signing", undefined, "Awaiting wallet signature...");
    onProgress?.("submitting", undefined, "Broadcasting transaction to Stellar network...");

    const txHash = generateMockTxHash();
    onProgress?.("confirmed", txHash, `Confirmed batch on ledger (${txHash.slice(0, 10)}...)`);

    const results: BatchSaleItemResult[] = chunk.map((s) => ({
      saleId: s.id,
      campaignId: s.campaignId,
      affiliateAddress: s.affiliateAddress,
      saleAmountXlm: s.saleAmountXlm,
      status: "confirmed",
      txHash,
    }));

    return { results, txHash, stats };
  }

  const server = getSorobanRpcServer();
  let account: Account;
  try {
    account = await server.getAccount(advertiserAddress);
  } catch (err: unknown) {
    const reason = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to load advertiser account on ledger: ${reason}`, { cause: err });
  }

  // Preserve base sequence number to avoid advancing sequences on simulation probes
  const baseSequence = account.sequenceNumber();

  // 1. Build preliminary transaction envelope with all ops using isolated sequence
  const preliminaryTx = buildBatchTransactionEnvelope(
    new Account(advertiserAddress, baseSequence),
    advertiserAddress,
    chunk,
  ).build();

  onProgress?.("simulating", undefined, "Simulating multi-operation batch envelope...");
  let simResponse = await server.simulateTransaction(preliminaryTx);

  // Partial revert handling: If batch simulation fails, isolate failing operations gracefully
  if (rpc.Api.isSimulationError(simResponse)) {
    onProgress?.(
      "recovering_partial",
      undefined,
      "Simulation failed for batch. Isolating problematic operations...",
    );

    const validItems: SaleItem[] = [];
    const itemResults: BatchSaleItemResult[] = [];

    for (const item of chunk) {
      try {
        const singleTx = buildBatchTransactionEnvelope(
          new Account(advertiserAddress, baseSequence),
          advertiserAddress,
          [item],
        ).build();
        const singleSim = await server.simulateTransaction(singleTx);
        if (rpc.Api.isSimulationError(singleSim)) {
          itemResults.push({
            saleId: item.id,
            campaignId: item.campaignId,
            affiliateAddress: item.affiliateAddress,
            saleAmountXlm: item.saleAmountXlm,
            status: "failed",
            error: singleSim.error || "Simulation reverted for this sale",
          });
        } else {
          validItems.push(item);
        }
      } catch (itemErr: unknown) {
        itemResults.push({
          saleId: item.id,
          campaignId: item.campaignId,
          affiliateAddress: item.affiliateAddress,
          saleAmountXlm: item.saleAmountXlm,
          status: "failed",
          error: itemErr instanceof Error ? itemErr.message : String(itemErr),
        });
      }
    }

    // If no items are valid, return results directly
    if (validItems.length === 0) {
      return {
        results: itemResults,
        stats: {
          originalReadOnlyCount: 0,
          originalReadWriteCount: 0,
          consolidatedReadOnlyCount: 0,
          consolidatedReadWriteCount: 0,
          redundantReadKeysPurged: 0,
        },
      };
    }

    // Re-simulate with only valid items using isolated account
    const recoveryTx = buildBatchTransactionEnvelope(
      new Account(advertiserAddress, baseSequence),
      advertiserAddress,
      validItems,
    ).build();
    simResponse = await server.simulateTransaction(recoveryTx);
    if (rpc.Api.isSimulationError(simResponse)) {
      throw new Error(`Simulation failed after partial recovery: ${simResponse.error}`);
    }

    // Optimize footprint before assembling transaction
    onProgress?.("optimizing_footprint", undefined, "Consolidating Soroban footprint...");
    let recoveryOptimizationStats: FootprintOptimizationStats = {
      originalReadOnlyCount: 0,
      originalReadWriteCount: 0,
      consolidatedReadOnlyCount: 0,
      consolidatedReadWriteCount: 0,
      redundantReadKeysPurged: 0,
    };
    let recoverySimToAssemble: rpc.Api.SimulateTransactionSuccessResponse = simResponse;

    if (simResponse.transactionData) {
      const { optimizedTxData, stats } = optimizeSorobanTransactionData(simResponse.transactionData);
      recoveryOptimizationStats = stats;
      recoverySimToAssemble = {
        ...simResponse,
        transactionData: optimizedTxData,
      };
    }

    // Proceed to assemble and submit valid items
    const preparedTx = rpc.assembleTransaction(recoveryTx, recoverySimToAssemble).build();

    onProgress?.("signing", undefined, "Waiting for wallet signature...");
    const signedXdr = await signWalletTransaction(preparedTx.toXDR(), walletType);
    const signedTx = TransactionBuilder.fromXDR(signedXdr, STELLAR_CONFIG.networkPassphrase);

    onProgress?.("submitting", undefined, "Submitting optimized batch transaction...");
    const sendResponse = await server.sendTransaction(signedTx);
    if (sendResponse.status !== "PENDING" && sendResponse.status !== "DUPLICATE") {
      const errorDetail = sendResponse.errorResult
        ? JSON.stringify(sendResponse.errorResult)
        : JSON.stringify(sendResponse);
      throw new Error(
        `Failed to submit batch transaction (${sendResponse.status}): ${errorDetail}`,
      );
    }
    const txHash = sendResponse.hash;

    // Poll until on-chain confirmation using shared helper
    await waitForConfirmation(server, txHash);

    for (const v of validItems) {
      itemResults.push({
        saleId: v.id,
        campaignId: v.campaignId,
        affiliateAddress: v.affiliateAddress,
        saleAmountXlm: v.saleAmountXlm,
        status: "confirmed",
        txHash,
      });
    }

    onProgress?.("confirmed", txHash, `Confirmed valid items in batch (${txHash.slice(0, 10)}...)`);
    return {
      results: itemResults,
      txHash,
      stats: recoveryOptimizationStats,
    };
  }

  // 2. Assemble and optimize footprint for standard batch
  onProgress?.("optimizing_footprint", undefined, "Consolidating Soroban footprint...");
  let batchOptimizationStats: FootprintOptimizationStats = {
    originalReadOnlyCount: 0,
    originalReadWriteCount: 0,
    consolidatedReadOnlyCount: 0,
    consolidatedReadWriteCount: 0,
    redundantReadKeysPurged: 0,
  };
  let simToAssemble: rpc.Api.SimulateTransactionSuccessResponse = simResponse;

  if (simResponse.transactionData) {
    const { optimizedTxData, stats } = optimizeSorobanTransactionData(simResponse.transactionData);
    batchOptimizationStats = stats;
    simToAssemble = {
      ...simResponse,
      transactionData: optimizedTxData,
    };
  }

  const assembledTx = rpc.assembleTransaction(preliminaryTx, simToAssemble).build();

  // 3. Sign & Submit
  onProgress?.("signing", undefined, "Awaiting wallet signature...");
  const signedXdr = await signWalletTransaction(assembledTx.toXDR(), walletType);
  const signedTx = TransactionBuilder.fromXDR(signedXdr, STELLAR_CONFIG.networkPassphrase);

  onProgress?.("submitting", undefined, "Submitting batch transaction...");
  const sendResponse = await server.sendTransaction(signedTx);
  if (sendResponse.status !== "PENDING" && sendResponse.status !== "DUPLICATE") {
    const errorDetail = sendResponse.errorResult
      ? JSON.stringify(sendResponse.errorResult)
      : JSON.stringify(sendResponse);
    throw new Error(
      `Failed to submit batch transaction (${sendResponse.status}): ${errorDetail}`,
    );
  }
  const txHash = sendResponse.hash;

  // Poll until on-chain confirmation using shared helper
  await waitForConfirmation(server, txHash);

  onProgress?.("confirmed", txHash, `Confirmed batch on ledger (${txHash.slice(0, 10)}...)`);

  const results: BatchSaleItemResult[] = chunk.map((s) => ({
    saleId: s.id,
    campaignId: s.campaignId,
    affiliateAddress: s.affiliateAddress,
    saleAmountXlm: s.saleAmountXlm,
    status: "confirmed",
    txHash,
  }));

  return {
    results,
    txHash,
    stats: batchOptimizationStats,
  };
}

/**
 * Main entry point: Executes bulk sale logging with batching (up to 15 per envelope),
 * Soroban footprint optimization, live progress reporting, and partial revert tolerance.
 */
export async function executeBatchSaleLogging(
  advertiserAddress: string,
  sales: SaleItem[],
  walletType: WalletType = "freighter",
  onProgress?: BatchProgressCallback,
): Promise<BatchSaleSummaryReceipt> {
  validateSaleItems(sales);

  const chunks = chunkSaleBatch(sales, MAX_BATCH_SIZE);
  const totalBatches = chunks.length;
  const totalSales = sales.length;

  let processedSales = 0;
  let confirmedSales = 0;
  let failedSales = 0;

  const transactionHashes: string[] = [];
  const allItemResults: BatchSaleItemResult[] = [];

  let aggregateStats: FootprintOptimizationStats = {
    originalReadOnlyCount: 0,
    originalReadWriteCount: 0,
    consolidatedReadOnlyCount: 0,
    consolidatedReadWriteCount: 0,
    redundantReadKeysPurged: 0,
  };

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const currentBatchIndex = i + 1;

    // Report batch start
    onProgress?.({
      totalBatches,
      currentBatchIndex,
      totalSales,
      processedSales,
      confirmedSales,
      failedSales,
      currentStatus: "simulating",
      recentItemResults: allItemResults.slice(-5),
      message: `Starting batch ${currentBatchIndex}/${totalBatches} (${chunk.length} operations)...`,
    });

    try {
      const { results, txHash, stats } = await processBatchChunk(
        chunk,
        advertiserAddress,
        walletType,
        (status, hash, msg) => {
          onProgress?.({
            totalBatches,
            currentBatchIndex,
            totalSales,
            processedSales,
            confirmedSales,
            failedSales,
            currentTxHash: hash,
            currentStatus: status,
            recentItemResults: allItemResults.slice(-5),
            message: msg,
          });
        },
      );

      if (txHash && !transactionHashes.includes(txHash)) {
        transactionHashes.push(txHash);
      }

      // Aggregate footprint stats
      aggregateStats = {
        originalReadOnlyCount: aggregateStats.originalReadOnlyCount + stats.originalReadOnlyCount,
        originalReadWriteCount: aggregateStats.originalReadWriteCount + stats.originalReadWriteCount,
        consolidatedReadOnlyCount:
          aggregateStats.consolidatedReadOnlyCount + stats.consolidatedReadOnlyCount,
        consolidatedReadWriteCount:
          aggregateStats.consolidatedReadWriteCount + stats.consolidatedReadWriteCount,
        redundantReadKeysPurged:
          aggregateStats.redundantReadKeysPurged + stats.redundantReadKeysPurged,
      };

      for (const res of results) {
        allItemResults.push(res);
        if (res.status === "confirmed") {
          confirmedSales++;
        } else {
          failedSales++;
        }
      }
      processedSales += chunk.length;

      // Report batch completion
      onProgress?.({
        totalBatches,
        currentBatchIndex,
        totalSales,
        processedSales,
        confirmedSales,
        failedSales,
        currentTxHash: txHash,
        currentStatus: "confirmed",
        recentItemResults: allItemResults.slice(-5),
        message: `Batch ${currentBatchIndex}/${totalBatches} processed successfully.`,
      });
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      // Mark entire chunk items as failed
      for (const item of chunk) {
        allItemResults.push({
          saleId: item.id,
          campaignId: item.campaignId,
          affiliateAddress: item.affiliateAddress,
          saleAmountXlm: item.saleAmountXlm,
          status: "failed",
          error: errMsg,
        });
        failedSales++;
      }
      processedSales += chunk.length;

      onProgress?.({
        totalBatches,
        currentBatchIndex,
        totalSales,
        processedSales,
        confirmedSales,
        failedSales,
        currentStatus: "error",
        recentItemResults: allItemResults.slice(-5),
        message: `Batch ${currentBatchIndex} encountered error: ${errMsg}`,
      });
    }
  }

  // Final completion dispatch
  onProgress?.({
    totalBatches,
    currentBatchIndex: totalBatches,
    totalSales,
    processedSales,
    confirmedSales,
    failedSales,
    currentStatus: "completed",
    recentItemResults: allItemResults.slice(-10),
    message: `Bulk sale logging completed. ${confirmedSales} confirmed, ${failedSales} failed.`,
  });

  return {
    success: confirmedSales > 0,
    totalSalesCount: totalSales,
    confirmedCount: confirmedSales,
    failedCount: failedSales,
    batchesExecuted: totalBatches,
    transactionHashes,
    itemizedResults: allItemResults,
    footprintStats: aggregateStats,
  };
}
