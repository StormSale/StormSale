import React, { useState } from "react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import {
  Layers,
  Zap,
  CheckCircle2,
  AlertTriangle,
  ExternalLink,
  Copy,
  Check,
  RefreshCw,
  Cpu,
  Plus,
  Trash2,
  UploadCloud,
  XCircle,
} from "lucide-react";
import {
  executeBatchSaleLogging,
  chunkSaleBatch,
  MAX_BATCH_SIZE,
  type SaleItem,
  type BatchExecutionProgress,
  type BatchSaleSummaryReceipt,
} from "../../lib/batchSaleLogging";
import { useWeb3 } from "../../hooks/useWeb3";
import { useNotification } from "../../context/NotificationContext";
import { STELLAR_CONFIG } from "../../config/stellar";
import { StrKey, Keypair } from "@stellar/stellar-sdk";

export interface BulkSaleLogModalProps {
  onClose?: () => void;
  defaultCampaignId?: number;
  initialSalesList?: SaleItem[];
  initialReceipt?: BatchSaleSummaryReceipt | null;
  initialProgress?: BatchExecutionProgress | null;
}

/**
 * Strict decimal validator for XLM amounts:
 * Requires a positive decimal number with at most 7 fractional digits.
 * Rejects trailing garbage, empty input, non-numeric strings, and scientific notation.
 */
export function isValidXlmAmount(val: string): { valid: boolean; amount?: number; error?: string } {
  const trimmed = val.trim();
  if (!trimmed) {
    return { valid: false, error: "Please enter a positive XLM sale amount." };
  }
  // Strict decimal format: positive number without exponents, up to 7 decimal places
  if (!/^(0|[1-9]\d*)(\.\d+)?$/.test(trimmed)) {
    return {
      valid: false,
      error: "Amount must be a valid positive decimal number without scientific notation.",
    };
  }
  const decimalPart = trimmed.includes(".") ? trimmed.split(".")[1] : "";
  if (decimalPart.length > 7) {
    return { valid: false, error: "Stellar amounts support a maximum of 7 decimal places." };
  }
  const amount = parseFloat(trimmed);
  if (isNaN(amount) || amount <= 0) {
    return { valid: false, error: "Please enter a positive XLM sale amount." };
  }
  return { valid: true, amount };
}

/**
 * Generates collision-resistant unique IDs for queued sale items.
 */
export function generateSaleId(prefix: string): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${prefix}_${crypto.randomUUID()}`;
  }
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export const BulkSaleLogModal: React.FC<BulkSaleLogModalProps> = ({
  onClose: _onClose,
  defaultCampaignId = 101,
  initialSalesList,
  initialReceipt = null,
  initialProgress = null,
}) => {
  const { userAddress, connectorType } = useWeb3();
  const { showNotification } = useNotification();

  // Initialize with empty array unless initialSalesList is provided; test templates are only rendered in DEV mode
  const [salesList, setSalesList] = useState<SaleItem[]>(initialSalesList ?? []);

  // Real sale entry fields
  const [newAffiliate, setNewAffiliate] = useState("");
  const [newAmount, setNewAmount] = useState("");
  const [newRef, setNewRef] = useState("");
  const [showCsvBox, setShowCsvBox] = useState(false);
  const [csvText, setCsvText] = useState("");

  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState<BatchExecutionProgress | null>(initialProgress);
  const [receipt, setReceipt] = useState<BatchSaleSummaryReceipt | null>(initialReceipt);
  const [copiedHash, setCopiedHash] = useState<string | null>(null);

  // Add individual real sale
  const handleAddSale = (e: React.FormEvent) => {
    e.preventDefault();
    if (isProcessing) return;
    const trimmedAffiliate = newAffiliate.trim();
    if (!trimmedAffiliate) {
      showNotification({
        type: "warning",
        title: "Missing Address",
        message: "Please enter an affiliate Stellar public key.",
      });
      return;
    }

    if (!StrKey.isValidEd25519PublicKey(trimmedAffiliate)) {
      showNotification({
        type: "error",
        title: "Invalid Address",
        message: "Affiliate address must be a valid 56-character Stellar public key (G...).",
      });
      return;
    }

    const amtValidation = isValidXlmAmount(newAmount);
    if (!amtValidation.valid || amtValidation.amount === undefined) {
      showNotification({
        type: "warning",
        title: "Invalid Amount",
        message: amtValidation.error || "Please enter a positive XLM sale amount.",
      });
      return;
    }

    const newSaleItem: SaleItem = {
      id: generateSaleId("SALE"),
      campaignId: defaultCampaignId,
      affiliateAddress: trimmedAffiliate,
      saleAmountXlm: amtValidation.amount,
      customerRef: newRef.trim() || generateSaleId("ORDER"),
    };

    setSalesList((prev) => [...prev, newSaleItem]);
    setNewAffiliate("");
    setNewAmount("");
    setNewRef("");
    setReceipt(null);
  };

  // CSV parsing
  const handleImportCsv = () => {
    if (isProcessing) return;
    if (!csvText.trim()) return;
    const lines = csvText.trim().split("\n");
    const imported: SaleItem[] = [];
    const errors: string[] = [];

    lines.forEach((line, index) => {
      const trimmedLine = line.trim();
      if (!trimmedLine) return;

      const parts = trimmedLine.split(",").map((p) => p.trim());
      const [affAddr, amtStr, custRef, campIdStr] = parts;

      // Skip header row only when the first column looks like a header label
      if (index === 0 && /^(affiliate|address)/i.test(affAddr)) {
        return;
      }

      if (parts.length < 2) {
        errors.push(`Row ${index + 1}: Expected AffiliateAddress,SaleAmountXlm[,CustomerRef[,CampaignId]]`);
        return;
      }
      if (!StrKey.isValidEd25519PublicKey(affAddr)) {
        errors.push(`Row ${index + 1}: Invalid public key (${affAddr})`);
        return;
      }
      const amtValidation = isValidXlmAmount(amtStr);
      if (!amtValidation.valid || amtValidation.amount === undefined) {
        errors.push(`Row ${index + 1}: ${amtValidation.error || "Invalid amount"} (${amtStr})`);
        return;
      }
      let rowCampaignId = defaultCampaignId;
      if (campIdStr && campIdStr.trim()) {
        const parsedCamp = parseInt(campIdStr.trim(), 10);
        if (isNaN(parsedCamp) || parsedCamp <= 0) {
          errors.push(
            `Row ${index + 1}: Invalid Campaign ID "${campIdStr.trim()}". Must be a positive integer.`,
          );
          return;
        }
        rowCampaignId = parsedCamp;
      }
      imported.push({
        id: generateSaleId(`CSV_${index + 1}`),
        campaignId: rowCampaignId,
        affiliateAddress: affAddr,
        saleAmountXlm: amtValidation.amount,
        customerRef: custRef || `ORDER_${index + 1}`,
      });
    });

    if (errors.length > 0) {
      showNotification({
        type: "error",
        title: "CSV Validation Errors",
        message: errors.slice(0, 3).join("; ") + (errors.length > 3 ? "..." : ""),
      });
    }

    if (imported.length > 0) {
      setSalesList((prev) => [...prev, ...imported]);
      setCsvText("");
      setShowCsvBox(false);
      showNotification({
        type: "success",
        title: "Sales Imported",
        message: `Successfully imported ${imported.length} sales from CSV.`,
      });
    }
  };

  const handleRemoveSale = (id: string) => {
    if (isProcessing) return;
    setSalesList((prev) => prev.filter((s) => s.id !== id));
  };

  const handleClearAll = () => {
    setSalesList([]);
    setReceipt(null);
    setProgress(null);
  };

  // Helper to generate template batches using valid Stellar keys
  const populateTemplateBatch = (count: number) => {
    const kps = [Keypair.random().publicKey(), Keypair.random().publicKey()];
    const generated: SaleItem[] = Array.from({ length: count }, (_, i) => ({
      id: `BATCH_SALE_${String(i + 1).padStart(3, "0")}`,
      campaignId: defaultCampaignId,
      affiliateAddress: kps[i % 2],
      saleAmountXlm: Math.round((20 + (i * 3.5) % 80) * 100) / 100,
      customerRef: `ORDER_${1000 + i}`,
    }));
    setSalesList(generated);
    setReceipt(null);
    setProgress(null);
  };

  const handleCopyHash = (hash: string) => {
    navigator.clipboard.writeText(hash);
    setCopiedHash(hash);
    setTimeout(() => setCopiedHash(null), 2000);
  };

  const handleStartBatchExecution = async () => {
    if (salesList.length === 0) {
      showNotification({
        type: "warning",
        title: "Empty Batch",
        message: "Please add at least one sale item to execute.",
      });
      return;
    }

    // Require real wallet connection
    if (!userAddress || !connectorType) {
      showNotification({
        type: "warning",
        title: "Wallet Not Connected",
        message: "Connect your Stellar wallet before executing a bulk batch.",
      });
      return;
    }

    setIsProcessing(true);
    setReceipt(null);

    try {
      showNotification({
        type: "info",
        title: "Initiating Soroban Batch",
        message: `Packaging ${salesList.length} sales into batches of up to ${MAX_BATCH_SIZE}...`,
      });

      const finalReceipt = await executeBatchSaleLogging(
        userAddress,
        salesList,
        connectorType,
        (prog) => {
          setProgress(prog);
        },
      );

      setReceipt(finalReceipt);

      // Remove confirmed sales from salesList using confirmed sale IDs in itemizedResults
      const confirmedIds = new Set(
        finalReceipt.itemizedResults
          .filter((item) => item.status === "confirmed")
          .map((item) => item.saleId),
      );
      if (confirmedIds.size > 0) {
        setSalesList((prev) => prev.filter((s) => !confirmedIds.has(s.id)));
      }

      const receiptState: "ok" | "partial" | "failed" =
        finalReceipt.failedCount === 0
          ? "ok"
          : finalReceipt.confirmedCount > 0
          ? "partial"
          : "failed";

      if (receiptState === "ok") {
        showNotification({
          type: "success",
          title: "Batch Logging Completed",
          message: `Successfully logged ${finalReceipt.confirmedCount} sales across ${finalReceipt.batchesExecuted} transaction(s)!`,
        });
      } else if (receiptState === "partial") {
        showNotification({
          type: "warning",
          title: "Batch Completed with Partial Errors",
          message: `${finalReceipt.confirmedCount} sales confirmed, ${finalReceipt.failedCount} sales failed.`,
        });
      } else {
        showNotification({
          type: "error",
          title: "Batch Logging Failed",
          message: `All ${finalReceipt.failedCount} sales could not be logged.`,
        });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      showNotification({
        type: "error",
        title: "Batch Logging Failed",
        message: msg,
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const chunks = chunkSaleBatch(salesList, MAX_BATCH_SIZE);
  const totalOperations = salesList.length;
  const progressPercent = progress
    ? progress.currentStatus === "completed"
      ? 100
      : Math.round(
          ((progress.currentBatchIndex -
            1 +
            (progress.currentStatus === "confirmed" || progress.currentStatus === "error" ? 1 : 0.5)) /
            progress.totalBatches) *
            100,
        )
    : 0;

  return (
    <div className="w-full">
      <Card className="border border-slate-200 dark:border-zinc-800 shadow-md rounded-3xl bg-white dark:bg-zinc-950/70 overflow-hidden">
        <CardHeader className="pb-4 pt-6 px-6 sm:px-8 border-b border-slate-100 dark:border-zinc-800/80">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center text-white shadow-sm">
                  <Layers className="w-5 h-5" />
                </div>
                <div>
                  <CardTitle className="text-xl sm:text-2xl font-bold text-zinc-900 dark:text-white">
                    Bulk Batch Sale Logger
                  </CardTitle>
                  <span className="text-xs text-indigo-600 dark:text-indigo-400 font-semibold tracking-wide uppercase">
                    Soroban Footprint Optimization Utility (#133)
                  </span>
                </div>
              </div>
              <CardDescription className="text-zinc-500 dark:text-zinc-400 mt-2 text-xs sm:text-sm">
                Bundle up to {MAX_BATCH_SIZE} contract calls into a single transaction envelope with
                consolidated ledger footprints.
              </CardDescription>
            </div>

            <div className="flex items-center space-x-2 bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800/50 px-3.5 py-1.5 rounded-full text-xs font-semibold text-indigo-700 dark:text-indigo-300 self-start sm:self-auto">
              <Zap className="w-4 h-4 text-indigo-500" />
              <span>Optimized Multi-Op Envelopes</span>
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-6 pt-6 px-6 sm:px-8">
          {/* Real Sale Entry Form */}
          <div className="p-4 rounded-2xl bg-slate-50 dark:bg-zinc-900/60 border border-slate-200/80 dark:border-zinc-800 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider">
                Add Real Sale Item
              </span>
              <button
                type="button"
                onClick={() => setShowCsvBox(!showCsvBox)}
                disabled={isProcessing}
                className="text-xs text-indigo-600 dark:text-indigo-400 font-medium hover:underline flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <UploadCloud className="w-3.5 h-3.5" />
                {showCsvBox ? "Close CSV" : "Paste CSV"}
              </button>
            </div>

            {showCsvBox && (
              <div className="space-y-2 pt-2 border-t border-slate-200 dark:border-zinc-800">
                <p className="text-[11px] text-zinc-500">
                  Format: <code>AffiliateAddress,SaleAmountXlm[,CustomerRef[,CampaignId]]</code> (one per line)
                </p>
                <textarea
                  value={csvText}
                  onChange={(e) => setCsvText(e.target.value)}
                  placeholder="GB2P...,25.5,ORDER_101,101"
                  rows={3}
                  disabled={isProcessing}
                  aria-label="CSV input for bulk sales"
                  className="w-full text-base sm:text-xs p-2.5 rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 font-mono disabled:opacity-60 disabled:cursor-not-allowed"
                />
                <Button
                  size="sm"
                  type="button"
                  onClick={handleImportCsv}
                  disabled={isProcessing}
                  className="h-8 text-xs"
                >
                  Import CSV Rows
                </Button>
              </div>
            )}

            <form onSubmit={handleAddSale}>
              <fieldset disabled={isProcessing} className="grid grid-cols-1 sm:grid-cols-4 gap-2 pt-1">
                <div className="sm:col-span-2">
                  <Input
                    value={newAffiliate}
                    onChange={(e) => setNewAffiliate(e.target.value)}
                    placeholder="Affiliate Stellar Address (G...)"
                    aria-label="Affiliate Stellar public address"
                    className="h-10 text-xs bg-white dark:bg-zinc-950 border-slate-200 dark:border-zinc-800"
                  />
                </div>
                <div>
                  <Input
                    type="number"
                    step="any"
                    value={newAmount}
                    onChange={(e) => setNewAmount(e.target.value)}
                    placeholder="Amount XLM"
                    aria-label="Sale amount in XLM"
                    className="h-10 text-xs bg-white dark:bg-zinc-950 border-slate-200 dark:border-zinc-800"
                  />
                </div>
                <div className="flex gap-2">
                  <Input
                    value={newRef}
                    onChange={(e) => setNewRef(e.target.value)}
                    placeholder="Ref (optional)"
                    aria-label="Customer order reference"
                    className="h-10 text-xs bg-white dark:bg-zinc-950 border-slate-200 dark:border-zinc-800"
                  />
                  <Button
                    type="submit"
                    size="sm"
                    aria-label="Add sale item"
                    className="h-10 px-3 bg-zinc-900 dark:bg-indigo-600 text-white shrink-0"
                  >
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>
              </fieldset>
            </form>
          </div>

          {/* Template Generators & Clear Button */}
          <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-xl bg-white dark:bg-zinc-900/80 border border-slate-200/80 dark:border-zinc-800 text-xs">
            {import.meta.env.DEV ? (
              <>
                <div className="flex items-center space-x-2 text-zinc-600 dark:text-zinc-400">
                  <Cpu className="w-4 h-4 text-indigo-500" />
                  <span>Generate Test Templates:</span>
                </div>
                <div className="flex items-center space-x-2">
                  <button
                    type="button"
                    onClick={() => populateTemplateBatch(5)}
                    disabled={isProcessing}
                    className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 transition-colors"
                  >
                    5 Valid Sales
                  </button>
                  <button
                    type="button"
                    onClick={() => populateTemplateBatch(15)}
                    disabled={isProcessing}
                    className="px-2.5 py-1 rounded-lg bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300 transition-colors"
                  >
                    15 Sales (Full Envelope)
                  </button>
                  <button
                    type="button"
                    onClick={handleClearAll}
                    disabled={isProcessing || salesList.length === 0}
                    className="px-2.5 py-1 rounded-lg text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/20 transition-colors"
                  >
                    Clear All
                  </button>
                </div>
              </>
            ) : (
              <div className="flex items-center justify-between w-full">
                <span className="text-zinc-500 text-xs">Sales Queue ({salesList.length})</span>
                <button
                  type="button"
                  onClick={handleClearAll}
                  disabled={isProcessing || salesList.length === 0}
                  className="px-2.5 py-1 rounded-lg text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/20 transition-colors"
                >
                  Clear All
                </button>
              </div>
            )}
          </div>

          {/* Batch Summary Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-zinc-900 border border-slate-100 dark:border-zinc-800/60">
              <span className="text-xs text-zinc-400 font-medium">Total Operations</span>
              <p className="text-xl font-bold text-zinc-900 dark:text-white mt-0.5">
                {totalOperations}
              </p>
            </div>
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-zinc-900 border border-slate-100 dark:border-zinc-800/60">
              <span className="text-xs text-zinc-400 font-medium">Batches Required</span>
              <p className="text-xl font-bold text-indigo-600 dark:text-indigo-400 mt-0.5">
                {chunks.length} <span className="text-xs font-normal text-zinc-400">(max {MAX_BATCH_SIZE}/tx)</span>
              </p>
            </div>
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-zinc-900 border border-slate-100 dark:border-zinc-800/60">
              <span className="text-xs text-zinc-400 font-medium">Total Volume</span>
              <p className="text-xl font-bold text-zinc-900 dark:text-white mt-0.5">
                {salesList.reduce((acc, s) => acc + s.saleAmountXlm, 0).toFixed(2)} XLM
              </p>
            </div>
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-zinc-900 border border-slate-100 dark:border-zinc-800/60">
              <span className="text-xs text-zinc-400 font-medium">Footprint Optimization</span>
              <p className="text-xl font-bold text-emerald-600 dark:text-emerald-400 mt-0.5">
                {receipt
                  ? `${receipt.footprintStats.redundantReadKeysPurged} Keys Purged`
                  : "Consolidation Ready"}
              </p>
            </div>
          </div>

          {/* Sales List Table */}
          {salesList.length > 0 && (
            <div className="max-h-52 overflow-y-auto rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-950">
              <table className="w-full text-left text-xs">
                <caption className="sr-only">Queued sales for bulk logging</caption>
                <thead className="bg-slate-50 dark:bg-zinc-900 border-b border-slate-200 dark:border-zinc-800 text-zinc-500 uppercase font-semibold">
                  <tr>
                    <th className="p-2.5">ID</th>
                    <th className="p-2.5">Affiliate</th>
                    <th className="p-2.5">Amount</th>
                    <th className="p-2.5">Ref</th>
                    <th className="p-2.5 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-zinc-900">
                  {salesList.map((sale) => (
                    <tr key={sale.id} className="hover:bg-slate-50/50 dark:hover:bg-zinc-900/40">
                      <td className="p-2.5 font-mono text-zinc-500">{sale.id}</td>
                      <td className="p-2.5 font-mono text-zinc-800 dark:text-zinc-200">
                        {sale.affiliateAddress.slice(0, 6)}...{sale.affiliateAddress.slice(-6)}
                      </td>
                      <td className="p-2.5 font-bold text-indigo-600 dark:text-indigo-400">
                        {sale.saleAmountXlm} XLM
                      </td>
                      <td className="p-2.5 text-zinc-500">{sale.customerRef || "-"}</td>
                      <td className="p-2.5 text-right">
                        <button
                          type="button"
                          onClick={() => handleRemoveSale(sale.id)}
                          disabled={isProcessing}
                          aria-label={`Remove sale ${sale.id}`}
                          className="text-zinc-400 hover:text-rose-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5 ml-auto" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* LIVE BATCH PROGRESS BAR */}
          {(isProcessing || progress) && (
            <div className="space-y-4 p-5 rounded-2xl bg-indigo-50/70 dark:bg-indigo-950/20 border border-indigo-100 dark:border-indigo-900/40">
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center space-x-2 font-medium text-zinc-900 dark:text-white">
                  {isProcessing && <RefreshCw className="w-4 h-4 text-indigo-600 motion-safe:animate-spin" />}
                  <span>
                    Batch {progress?.currentBatchIndex || 1} of {progress?.totalBatches || chunks.length}
                  </span>
                  <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-indigo-200/60 dark:bg-indigo-900/60 text-indigo-800 dark:text-indigo-300 uppercase tracking-wider">
                    {progress?.currentStatus.replace("_", " ")}
                  </span>
                </div>
                <span className="font-bold text-indigo-600 dark:text-indigo-400">
                  {progressPercent}% Complete
                </span>
              </div>

              {/* Animated Progress Track */}
              <div
                role="progressbar"
                aria-label="Batch execution progress"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={progressPercent}
                className="w-full bg-slate-200 dark:bg-zinc-800 rounded-full h-3 overflow-hidden"
              >
                <div
                  className="bg-indigo-600 h-full rounded-full transition-all duration-300 ease-out shadow-sm"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>

              {progress?.message && (
                <p aria-live="polite" className="text-xs text-zinc-600 dark:text-zinc-400 font-medium">
                  {progress.message}
                </p>
              )}

              {/* LIVE TRANSACTION HASH CONFIRMATIONS */}
              {progress?.currentTxHash && (
                <div className="mt-3 p-3 rounded-xl bg-white dark:bg-zinc-900 border border-indigo-100 dark:border-indigo-900/50 flex items-center justify-between">
                  <div className="flex items-center space-x-2 min-w-0">
                    <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                    <span className="text-xs font-mono text-zinc-700 dark:text-zinc-300 truncate">
                      Tx: {progress.currentTxHash}
                    </span>
                  </div>
                  <div className="flex items-center space-x-2 ml-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleCopyHash(progress.currentTxHash!)}
                      aria-label="Copy current transaction hash"
                      className="p-1 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
                    >
                      {copiedHash === progress.currentTxHash ? (
                        <Check className="w-4 h-4 text-emerald-500" />
                      ) : (
                        <Copy className="w-4 h-4" />
                      )}
                    </button>
                    <a
                      href={`${STELLAR_CONFIG.explorerUrl}/tx/${progress.currentTxHash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label="View current transaction on Stellar Explorer"
                      className="p-1 text-indigo-600 hover:text-indigo-700 dark:text-indigo-400"
                    >
                      <ExternalLink className="w-4 h-4" />
                    </a>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* FINAL BATCH SUMMARY RECEIPT */}
          {receipt && (() => {
            const receiptState: "ok" | "partial" | "failed" =
              receipt.failedCount === 0
                ? "ok"
                : receipt.confirmedCount > 0
                ? "partial"
                : "failed";

            const containerStyle =
              receiptState === "ok"
                ? "bg-emerald-50/60 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800/40"
                : receiptState === "partial"
                ? "bg-amber-50/60 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800/40"
                : "bg-rose-50/60 dark:bg-rose-950/20 border-rose-200 dark:border-rose-800/40";

            const headerStyle =
              receiptState === "ok"
                ? "text-emerald-800 dark:text-emerald-300"
                : receiptState === "partial"
                ? "text-amber-800 dark:text-amber-300"
                : "text-rose-800 dark:text-rose-300";

            const badgeStyle =
              receiptState === "ok"
                ? "bg-emerald-100 dark:bg-emerald-900/50 text-emerald-800 dark:text-emerald-200"
                : receiptState === "partial"
                ? "bg-amber-100 dark:bg-amber-900/50 text-amber-800 dark:text-amber-200"
                : "bg-rose-100 dark:bg-rose-900/50 text-rose-800 dark:text-rose-200";

            const headerText =
              receiptState === "ok"
                ? "Bulk Execution Verified on Ledger"
                : receiptState === "partial"
                ? "Bulk Execution Completed with Partial Errors"
                : "Bulk Execution Failed";

            const HeaderIcon =
              receiptState === "ok"
                ? CheckCircle2
                : receiptState === "partial"
                ? AlertTriangle
                : XCircle;

            const iconColor =
              receiptState === "ok"
                ? "text-emerald-600"
                : receiptState === "partial"
                ? "text-amber-600"
                : "text-rose-600";

            return (
              <div className={`p-5 rounded-2xl ${containerStyle} border space-y-4`}>
                <div className="flex items-center justify-between">
                  <div className={`flex items-center space-x-2 ${headerStyle} font-bold`}>
                    <HeaderIcon className={`w-5 h-5 ${iconColor}`} />
                    <span>{headerText}</span>
                  </div>
                  <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${badgeStyle}`}>
                    {receipt.confirmedCount} / {receipt.totalSalesCount} Confirmed
                  </span>
                </div>

              {/* Footprint Optimization Statistics */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs pt-1">
                <div className="p-2.5 rounded-lg bg-white/80 dark:bg-zinc-900/80 border border-emerald-100 dark:border-emerald-900/30">
                  <span className="text-zinc-500 dark:text-zinc-400">Consolidated Read Keys:</span>
                  <p className="font-bold text-zinc-800 dark:text-zinc-200 text-sm">
                    {receipt.footprintStats.consolidatedReadOnlyCount}
                  </p>
                </div>
                <div className="p-2.5 rounded-lg bg-white/80 dark:bg-zinc-900/80 border border-emerald-100 dark:border-emerald-900/30">
                  <span className="text-zinc-500 dark:text-zinc-400">Redundant Keys Purged:</span>
                  <p className="font-bold text-emerald-600 dark:text-emerald-400 text-sm">
                    {receipt.footprintStats.redundantReadKeysPurged}
                  </p>
                </div>
                <div className="p-2.5 rounded-lg bg-white/80 dark:bg-zinc-900/80 border border-emerald-100 dark:border-emerald-900/30 col-span-2 sm:col-span-1">
                  <span className="text-zinc-500 dark:text-zinc-400">Envelopes Submitted:</span>
                  <p className="font-bold text-indigo-600 dark:text-indigo-400 text-sm">
                    {receipt.batchesExecuted}
                  </p>
                </div>
              </div>

              {/* Failed Items List if any */}
              {receipt.failedCount > 0 && (
                <div className="space-y-2 pt-2 border-t border-amber-200/60 dark:border-amber-800/40">
                  <span className="text-xs font-bold text-rose-700 dark:text-rose-400 uppercase tracking-wider">
                    Failed Sales ({receipt.failedCount})
                  </span>
                  <div className="space-y-1.5 max-h-36 overflow-y-auto">
                    {receipt.itemizedResults
                      .filter((r) => r.status === "failed")
                      .map((f) => (
                        <div
                          key={f.saleId}
                          className="p-2 rounded-lg bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/40 text-xs flex justify-between items-center"
                        >
                          <span className="font-mono font-medium text-rose-900 dark:text-rose-200">
                            {f.saleId}: {f.affiliateAddress.slice(0, 6)}...{f.affiliateAddress.slice(-4)}
                          </span>
                          <span className="text-rose-600 dark:text-rose-400 text-[11px] font-normal">
                            {f.error || "Simulation reverted"}
                          </span>
                        </div>
                      ))}
                  </div>
                </div>
              )}

              {/* Confirmed Transaction Hashes */}
              {receipt.transactionHashes.length > 0 && (
                <div className="space-y-2 pt-2">
                  <span className="text-xs font-bold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider">
                    Confirmed Transaction Envelopes ({receipt.transactionHashes.length})
                  </span>
                  {receipt.transactionHashes.map((hash, idx) => (
                    <div
                      key={hash}
                      className="flex items-center justify-between p-2.5 rounded-xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 text-xs font-mono"
                    >
                      <div className="flex items-center space-x-2 truncate">
                        <span className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-zinc-800 font-sans font-bold text-zinc-600 dark:text-zinc-400">
                          Batch #{idx + 1}
                        </span>
                        <span className="truncate text-zinc-800 dark:text-zinc-200">{hash}</span>
                      </div>
                      <div className="flex items-center space-x-2 shrink-0 ml-2">
                        <button
                          type="button"
                          onClick={() => handleCopyHash(hash)}
                          aria-label={`Copy transaction hash for batch ${idx + 1}`}
                          className="p-1 text-zinc-400 hover:text-zinc-600"
                        >
                          {copiedHash === hash ? (
                            <Check className="w-4 h-4 text-emerald-500" />
                          ) : (
                            <Copy className="w-4 h-4" />
                          )}
                        </button>
                        <a
                          href={`${STELLAR_CONFIG.explorerUrl}/tx/${hash}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label={`View batch ${idx + 1} transaction on Stellar Explorer`}
                          className="p-1 text-indigo-600 hover:text-indigo-700 dark:text-indigo-400"
                        >
                          <ExternalLink className="w-4 h-4" />
                        </a>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })()}

          {/* Action Button */}
          <div className="pt-2">
            <Button
              type="button"
              disabled={isProcessing || salesList.length === 0 || !userAddress || !connectorType}
              onClick={handleStartBatchExecution}
              className="w-full h-14 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-base shadow-lg rounded-xl transition-all"
            >
              {isProcessing ? (
                <div className="flex items-center space-x-2">
                  <RefreshCw className="w-5 h-5 motion-safe:animate-spin" />
                  <span>Processing Batches with Footprint Consolidation...</span>
                </div>
              ) : !userAddress || !connectorType ? (
                <div className="flex items-center space-x-2">
                  <Zap className="w-5 h-5" />
                  <span>Connect Wallet to Execute Bulk Log</span>
                </div>
              ) : (
                <div className="flex items-center space-x-2">
                  <Zap className="w-5 h-5" />
                  <span>
                    Execute Bulk Log ({salesList.length} Sales in {chunks.length} Envelopes)
                  </span>
                </div>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
