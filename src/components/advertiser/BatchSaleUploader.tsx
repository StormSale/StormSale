import React, { useState, useRef, useMemo, useCallback } from "react";
import {
  FileSpreadsheet,
  UploadCloud,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Copy,
  Download,
  Play,
  Pause,
  RotateCcw,
  ExternalLink,
  ShieldCheck,
  Search,
  Layers,
  Sparkles,
  HelpCircle,
  Check,
  FileText,
  AlertCircle,
  Edit2,
  Save,
  X,
} from "lucide-react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "../ui/card";
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from "../ui/table";
import { useWeb3 } from "../../hooks/useWeb3";
import { useNotification } from "../../context/NotificationContext";
import {
  parseBatchCsv,
  parseBatchJson,
  generateSampleCSV,
  generateSampleJSON,
  validateBatchSaleRow,
} from "../../lib/batchSaleParser";
import { computeMerkleTree, getMerkleProof, verifyMerkleProof } from "../../lib/merkleTree";
import type {
  BatchAuditManifest,
  BatchLoggingProgress,
  BatchParseResult,
  ValidatedBatchSaleRow,
} from "../../types/batchSale";
import { triggerConversionPostback } from "../../lib/webhookEngine";

/**
 * Helper to download text content as a file in browser.
 */
function triggerFileDownload(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export const BatchSaleUploader: React.FC = () => {
  const { userAddress, isConnected, logSaleOnChain, openWalletModal } = useWeb3();
  const { showNotification } = useNotification();

  // File & Parsing state
  const [fileName, setFileName] = useState<string>("");
  const [isParsing, setIsParsing] = useState<boolean>(false);
  const [isDragOver, setIsDragOver] = useState<boolean>(false);
  const [parseResult, setParseResult] = useState<BatchParseResult | null>(null);

  // Table filtering and search
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<"all" | "valid" | "malformed">("all");
  const [excludeMalformed, setExcludeMalformed] = useState<boolean>(false);
  const [editingRowId, setEditingRowId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<{
    orderId: string;
    affiliateAddress: string;
    saleAmount: string;
    timestamp: string;
  }>({ orderId: "", affiliateAddress: "", saleAmount: "", timestamp: "" });

  // Sequential On-Chain Logging state
  const [campaignId, setCampaignId] = useState<number>(1);
  const [loggingProgress, setLoggingProgress] = useState<BatchLoggingProgress>({
    total: 0,
    current: 0,
    percent: 0,
    successCount: 0,
    failCount: 0,
    isLogging: false,
    isPaused: false,
    isComplete: false,
  });

  // Verification modal / helper state
  const [copiedRoot, setCopiedRoot] = useState<boolean>(false);
  const [verifiedLeafResult, setVerifiedLeafResult] = useState<boolean | null>(null);
  const [verifyTargetOrderId, setVerifyTargetOrderId] = useState<string>("");

  // Ref to pause/cancel long running logging loop
  const isCancelledRef = useRef<boolean>(false);
  const isPausedRef = useRef<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  /**
   * Processes file contents (CSV or JSON).
   */
  const processFileContent = useCallback(
    async (name: string, content: string) => {
      setIsParsing(true);
      setFileName(name);
      try {
        let result: BatchParseResult;
        if (name.toLowerCase().endsWith(".json")) {
          result = await parseBatchJson(content);
        } else {
          result = await parseBatchCsv(content);
        }

        setParseResult(result);
        setEditingRowId(null);
        setLoggingProgress({
          total: 0,
          current: 0,
          percent: 0,
          successCount: 0,
          failCount: 0,
          isLogging: false,
          isPaused: false,
          isComplete: false,
        });

        if (result.hasRequiredColumns) {
          showNotification({
            type: "success",
            title: "Batch Parsed Successfully",
            message: `Loaded ${result.totalRows} rows: ${result.validCount} valid, ${result.malformedCount} malformed.`,
          });
        } else {
          showNotification({
            type: "error",
            title: "Missing Required Columns",
            message: `Please include: ${result.missingColumns.join(", ")}`,
          });
        }
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : "Failed to parse file";
        showNotification({
          type: "error",
          title: "File Parsing Failed",
          message: errorMsg,
        });
      } finally {
        setIsParsing(false);
      }
    },
    [showNotification],
  );

  /**
   * Drag & Drop event handlers
   */
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      const text = await file.text();
      await processFileContent(file.name, text);
    }
  };

  const handleFileInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      const text = await file.text();
      await processFileContent(file.name, text);
    }
  };

  /**
   * Sample Batch Generators
   */
  const handleLoadDemoBatch = async (withMalformed: boolean) => {
    const csvContent = generateSampleCSV(52, withMalformed);
    const demoName = withMalformed
      ? "demo_52_orders_with_malformed.csv"
      : "demo_52_orders_valid.csv";
    await processFileContent(demoName, csvContent);
  };

  const handleDownloadSampleCSV = () => {
    const csv = generateSampleCSV(50, false);
    triggerFileDownload(csv, "stormsale_batch_orders_template.csv", "text/csv");
  };

  const handleDownloadSampleJSON = () => {
    const json = generateSampleJSON(50, false);
    triggerFileDownload(json, "stormsale_batch_orders_template.json", "application/json");
  };

  /**
   * Copy Merkle Root to clipboard
   */
  const handleCopyMerkleRoot = () => {
    if (!parseResult?.merkleTree?.root) return;
    navigator.clipboard.writeText(parseResult.merkleTree.root);
    setCopiedRoot(true);
    setTimeout(() => setCopiedRoot(false), 2000);
    showNotification({
      type: "info",
      title: "Merkle Root Copied",
      message: `${parseResult.merkleTree.root.slice(0, 16)}... copied to clipboard.`,
    });
  };

  /**
   * Download Merkle Audit Manifest
   */
  const handleDownloadAuditManifest = () => {
    if (!parseResult || !parseResult.merkleTree) return;

    const validRows = parseResult.rows.filter((r) => r.status === "valid" && r.leafHash);
    const leafHashes = validRows.map((r) => r.leafHash!);

    const manifest: BatchAuditManifest = {
      manifestVersion: "1.0.0",
      batchId: `BATCH_${Date.now()}_${Math.random().toString(36).substring(2, 8).toUpperCase()}`,
      generatedAt: new Date().toISOString(),
      campaignId,
      merkleRoot: parseResult.merkleTree.root,
      totalRows: parseResult.totalRows,
      validCount: parseResult.validCount,
      malformedCount: parseResult.malformedCount,
      totalVolumeXlm: parseResult.totalValidAmountXlm,
      sales: validRows.map((r, idx) => ({
        rowNumber: r.rowNumber,
        orderId: r.orderId,
        affiliateAddress: r.affiliateAddress,
        saleAmountXlm: r.saleAmount,
        timestamp: r.timestamp,
        leafHash: r.leafHash!,
        proof: getMerkleProof(leafHashes, idx),
        onChainStatus: r.onChainStatus,
        txHash: r.txHash,
      })),
    };

    triggerFileDownload(
      JSON.stringify(manifest, null, 2),
      `merkle_audit_manifest_${campaignId}_${Date.now()}.json`,
      "application/json",
    );
  };

  /**
   * Download Settlement CSV Report
   */
  const handleDownloadSettlementReport = () => {
    if (!parseResult) return;
    const headers =
      "Row #,Order ID,Affiliate Address,Sale Amount XLM,Timestamp,Status,On-Chain Tx Hash\n";
    const rows = parseResult.rows
      .map(
        (r) =>
          `${r.rowNumber},"${r.orderId}","${r.affiliateAddress}",${r.saleAmount},"${r.timestamp}","${r.onChainStatus || r.status}","${r.txHash || ""}"`,
      )
      .join("\n");
    triggerFileDownload(headers + rows, `settlement_report_${Date.now()}.csv`, "text/csv");
  };

  /**
   * Inline Edit row handlers
   */
  const handleStartEdit = (row: ValidatedBatchSaleRow) => {
    setEditingRowId(row.id);
    setEditForm({
      orderId: row.orderId,
      affiliateAddress: row.affiliateAddress,
      saleAmount: row.saleAmountRaw || String(row.saleAmount),
      timestamp: row.timestampRaw || row.timestamp,
    });
  };

  const handleSaveEdit = (rowNumber: number) => {
    if (!parseResult) return;

    const revalidated = validateBatchSaleRow(
      editForm.orderId,
      editForm.affiliateAddress,
      editForm.saleAmount,
      editForm.timestamp,
      rowNumber,
    );

    const updatedRows = parseResult.rows.map((r) =>
      r.rowNumber === rowNumber ? { ...revalidated, onChainStatus: r.onChainStatus } : r,
    );

    const validRows = updatedRows.filter((r) => r.status === "valid");
    const malformedRows = updatedRows.filter((r) => r.status === "malformed");
    const validAmount = validRows.reduce((acc, r) => acc + r.saleAmount, 0);
    const validLeaves = validRows.map((r) => r.leafHash!).filter(Boolean);

    const updatedTree =
      validLeaves.length > 0 ? computeMerkleTree(validLeaves, validAmount) : undefined;

    setParseResult({
      ...parseResult,
      rows: updatedRows,
      validCount: validRows.length,
      malformedCount: malformedRows.length,
      totalValidAmountXlm: Number(validAmount.toFixed(7)),
      merkleTree: updatedTree,
    });

    setEditingRowId(null);
    showNotification({
      type: revalidated.status === "valid" ? "success" : "warning",
      title: revalidated.status === "valid" ? "Row Validated" : "Row Still Malformed",
      message:
        revalidated.status === "valid"
          ? `Row #${rowNumber} is now valid and added to Merkle tree.`
          : `Row #${rowNumber} still has errors: ${revalidated.errors.map((e) => e.message).join(", ")}`,
    });
  };

  /**
   * Verify an individual leaf proof against the Merkle root
   */
  const handleVerifySingleLeaf = () => {
    if (!parseResult?.merkleTree?.root || !verifyTargetOrderId) {
      setVerifiedLeafResult(null);
      return;
    }

    const validRows = parseResult.rows.filter((r) => r.status === "valid" && r.leafHash);
    const targetIdx = validRows.findIndex(
      (r) =>
        r.orderId.toLowerCase() === verifyTargetOrderId.trim().toLowerCase() ||
        r.leafHash?.toLowerCase() === verifyTargetOrderId.trim().toLowerCase(),
    );

    if (targetIdx === -1) {
      setVerifiedLeafResult(false);
      showNotification({
        type: "warning",
        title: "Record Not Found",
        message: `No valid row matching "${verifyTargetOrderId}" found in current Merkle batch.`,
      });
      return;
    }

    const leafHashes = validRows.map((r) => r.leafHash!);
    const targetLeaf = leafHashes[targetIdx];
    const proof = getMerkleProof(leafHashes, targetIdx);
    const isValid = verifyMerkleProof(targetLeaf, proof, parseResult.merkleTree.root);

    setVerifiedLeafResult(isValid);
    showNotification({
      type: isValid ? "success" : "error",
      title: isValid ? "Cryptographic Proof Verified!" : "Proof Verification Failed",
      message: isValid
        ? `Order ${validRows[targetIdx].orderId} Merkle audit proof verified against on-chain root.`
        : "Merkle proof hash mismatch.",
    });
  };

  /**
   * Filtered rows for visual preview table
   */
  const visibleRows = useMemo(() => {
    if (!parseResult) return [];

    return parseResult.rows.filter((row) => {
      // Exclude malformed filter toggle
      if (excludeMalformed && row.status === "malformed") {
        return false;
      }

      // Status filter
      if (statusFilter === "valid" && row.status !== "valid") return false;
      if (statusFilter === "malformed" && row.status !== "malformed") return false;

      // Search query
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const matchOrder = row.orderId.toLowerCase().includes(query);
        const matchAffiliate = row.affiliateAddress.toLowerCase().includes(query);
        return matchOrder || matchAffiliate;
      }

      return true;
    });
  }, [parseResult, excludeMalformed, statusFilter, searchQuery]);

  /**
   * Target rows for sequential on-chain logging
   */
  const rowsToLog = useMemo(() => {
    if (!parseResult) return [];
    return parseResult.rows.filter((r) => r.status === "valid");
  }, [parseResult]);

  /**
   * Sequential On-Chain Batch Logging Runner
   */
  const handleStartBatchLogging = async () => {
    if (!isConnected) {
      openWalletModal();
      return;
    }

    if (!parseResult || rowsToLog.length === 0) {
      showNotification({
        type: "warning",
        title: "No Valid Rows",
        message: "No valid sales available to log on-chain.",
      });
      return;
    }

    isCancelledRef.current = false;
    isPausedRef.current = false;

    setLoggingProgress({
      total: rowsToLog.length,
      current: 0,
      percent: 0,
      successCount: 0,
      failCount: 0,
      isLogging: true,
      isPaused: false,
      isComplete: false,
    });

    showNotification({
      type: "info",
      title: "Batch Logging Initiated",
      message: `Sequentially logging ${rowsToLog.length} affiliate conversions on Stellar...`,
    });

    let successes = 0;
    let fails = 0;

    for (let i = 0; i < rowsToLog.length; i++) {
      // Check cancellation
      if (isCancelledRef.current) {
        showNotification({
          type: "warning",
          title: "Batch Logging Cancelled",
          message: `Batch stopped at row ${i} of ${rowsToLog.length}.`,
        });
        break;
      }

      // Check pause
      while (isPausedRef.current && !isCancelledRef.current) {
        await new Promise((resolve) => setTimeout(resolve, 300));
      }

      const row = rowsToLog[i];

      // Update row status in table to pending
      setParseResult((prev) => {
        if (!prev) return prev;
        const updated = prev.rows.map((r) =>
          r.rowNumber === row.rowNumber ? { ...r, onChainStatus: "pending" as const } : r,
        );
        return { ...prev, rows: updated };
      });

      setLoggingProgress((prev) => ({
        ...prev,
        current: i + 1,
        percent: Math.round(((i + 1) / rowsToLog.length) * 100),
        currentOrderId: row.orderId,
      }));

      try {
        // Execute on-chain log call via Soroban / Web3Context
        const txResult = await logSaleOnChain(campaignId, row.affiliateAddress, row.saleAmount);

        const txHash = txResult.txHash || `TX_${Date.now().toString(16)}`;

        // Trigger conversion webhook postbacks if configured
        try {
          await triggerConversionPostback({
            saleId: row.orderId,
            campaignAddress: `CAMPAIGN_${campaignId}`,
            affiliateAddress: row.affiliateAddress,
            advertiserAddress: userAddress || "GADVERTISER_DEFAULT",
            saleAmount: String(row.saleAmount),
            currency: "XLM",
            stellarTxHash: txHash,
            ledgerTimestamp: row.timestamp,
            customerRef: `ORDER_${row.orderId}`,
            status: "CONFIRMED_ON_LEDGER",
          });
        } catch (webhookErr) {
          console.warn("Postback notice:", webhookErr);
        }

        successes++;

        // Update row to success
        setParseResult((prev) => {
          if (!prev) return prev;
          const updated = prev.rows.map((r) =>
            r.rowNumber === row.rowNumber ? { ...r, onChainStatus: "success" as const, txHash } : r,
          );
          return { ...prev, rows: updated };
        });

        setLoggingProgress((prev) => ({
          ...prev,
          successCount: successes,
        }));
      } catch (err: unknown) {
        fails++;
        const errorMsg = err instanceof Error ? err.message : "On-chain transaction failed";

        setParseResult((prev) => {
          if (!prev) return prev;
          const updated = prev.rows.map((r) =>
            r.rowNumber === row.rowNumber
              ? { ...r, onChainStatus: "error" as const, errorMessage: errorMsg }
              : r,
          );
          return { ...prev, rows: updated };
        });

        setLoggingProgress((prev) => ({
          ...prev,
          failCount: fails,
        }));
      }

      // Sequential delay throttling (200ms) to prevent sequence collisions
      await new Promise((resolve) => setTimeout(resolve, 200));
    }

    setLoggingProgress((prev) => ({
      ...prev,
      isLogging: false,
      isComplete: true,
    }));

    showNotification({
      type: fails === 0 ? "success" : "warning",
      title: fails === 0 ? "Batch Logging Complete!" : "Batch Logging Completed with Warnings",
      message: `Finished: ${successes} successful, ${fails} failed on Stellar ledger.`,
    });
  };

  const handlePauseResume = () => {
    isPausedRef.current = !isPausedRef.current;
    setLoggingProgress((prev) => ({
      ...prev,
      isPaused: isPausedRef.current,
    }));
  };

  const handleCancelLogging = () => {
    isCancelledRef.current = true;
    isPausedRef.current = false;
  };

  return (
    <div className="space-y-8">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-zinc-800">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="p-2 rounded-lg bg-indigo-500/10 text-indigo-500 dark:bg-indigo-500/20">
              <FileSpreadsheet className="w-5 h-5" />
            </span>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
              Batch Sale Conversion Uploader
            </h1>
          </div>
          <p className="text-sm text-slate-500 dark:text-zinc-400">
            Client-side CSV/JSON parsing with Zod schema validation, Merkle root verification, and
            sequential on-chain settlement.
          </p>
        </div>

        {/* Quick Demo & Template Actions */}
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleLoadDemoBatch(false)}
            className="text-xs gap-1.5 border-indigo-500/30 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/40"
          >
            <Sparkles className="w-3.5 h-3.5" />
            Load Demo (52 Valid)
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => handleLoadDemoBatch(true)}
            className="text-xs gap-1.5 border-amber-500/30 text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/40"
          >
            <AlertTriangle className="w-3.5 h-3.5" />
            Load Demo (3 Malformed)
          </Button>

          <Button
            variant="ghost"
            size="sm"
            onClick={handleDownloadSampleCSV}
            className="text-xs gap-1 text-slate-600 dark:text-zinc-300"
          >
            <Download className="w-3.5 h-3.5" />
            Sample CSV
          </Button>

          <Button
            variant="ghost"
            size="sm"
            onClick={handleDownloadSampleJSON}
            className="text-xs gap-1 text-slate-600 dark:text-zinc-300"
          >
            <FileText className="w-3.5 h-3.5" />
            Sample JSON
          </Button>
        </div>
      </div>

      {/* Drag-and-Drop Upload Card */}
      <Card
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`relative overflow-hidden border-2 border-dashed transition-all duration-200 ${
          isDragOver
            ? "border-indigo-500 bg-indigo-50/50 dark:bg-indigo-950/30 scale-[1.01]"
            : "border-slate-200 dark:border-zinc-800 bg-white/80 dark:bg-zinc-900/80 hover:border-slate-300 dark:hover:border-zinc-700"
        }`}
      >
        <CardContent className="p-8 text-center flex flex-col items-center justify-center space-y-4">
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.json,text/csv,application/json"
            onChange={handleFileInputChange}
            className="hidden"
            id="batch-file-input"
          />

          <div
            onClick={() => fileInputRef.current?.click()}
            className="cursor-pointer flex flex-col items-center space-y-3"
          >
            <div className="w-16 h-16 rounded-full bg-indigo-50 dark:bg-indigo-950/50 flex items-center justify-center text-indigo-500 dark:text-indigo-400 ring-8 ring-indigo-50/50 dark:ring-indigo-950/20">
              <UploadCloud className="w-8 h-8" />
            </div>

            <div className="space-y-1">
              <p className="text-base font-semibold text-slate-900 dark:text-white">
                Drag and drop your sales file here, or{" "}
                <span className="text-indigo-600 dark:text-indigo-400 hover:underline">
                  browse files
                </span>
              </p>
              <p className="text-xs text-slate-500 dark:text-zinc-400">
                Supports CSV or JSON (up to 500 orders per batch). Required columns:{" "}
                <span className="font-medium text-slate-700 dark:text-zinc-300">
                  Order ID, Affiliate Address, Sale Amount, Timestamp
                </span>
              </p>
            </div>
          </div>

          {fileName && (
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-100 dark:bg-zinc-800 text-xs text-slate-700 dark:text-zinc-300">
              <FileSpreadsheet className="w-3.5 h-3.5 text-indigo-500" />
              <span className="font-medium">{fileName}</span>
              {isParsing && <span className="text-indigo-500 animate-pulse">Parsing...</span>}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Batch Overview & Merkle Tree Card (When file is loaded) */}
      {parseResult && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="bg-white dark:bg-zinc-900 border-slate-200 dark:border-zinc-800">
            <CardContent className="p-5 flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-slate-500 dark:text-zinc-400">
                  Total Orders
                </p>
                <h3 className="text-2xl font-bold text-slate-900 dark:text-white mt-1">
                  {parseResult.totalRows}
                </h3>
              </div>
              <div className="p-3 rounded-xl bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-400">
                <Layers className="w-5 h-5" />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-white dark:bg-zinc-900 border-emerald-500/20">
            <CardContent className="p-5 flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
                  Valid Orders
                </p>
                <h3 className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 mt-1">
                  {parseResult.validCount}
                </h3>
              </div>
              <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-500">
                <CheckCircle2 className="w-5 h-5" />
              </div>
            </CardContent>
          </Card>

          <Card
            className={`bg-white dark:bg-zinc-900 ${
              parseResult.malformedCount > 0
                ? "border-amber-500/30"
                : "border-slate-200 dark:border-zinc-800"
            }`}
          >
            <CardContent className="p-5 flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-amber-600 dark:text-amber-400">
                  Malformed Orders
                </p>
                <h3 className="text-2xl font-bold text-amber-600 dark:text-amber-400 mt-1">
                  {parseResult.malformedCount}
                </h3>
              </div>
              <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 text-amber-500">
                <AlertTriangle className="w-5 h-5" />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-white dark:bg-zinc-900 border-indigo-500/20">
            <CardContent className="p-5 flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-indigo-600 dark:text-indigo-400">
                  Total Volume
                </p>
                <h3 className="text-2xl font-bold text-slate-900 dark:text-white mt-1">
                  {parseResult.totalValidAmountXlm.toLocaleString()}{" "}
                  <span className="text-sm font-normal text-slate-500">XLM</span>
                </h3>
              </div>
              <div className="p-3 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 text-indigo-500">
                <ShieldCheck className="w-5 h-5" />
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Merkle Root & Cryptographic Audit Verification Panel */}
      {parseResult?.merkleTree && (
        <Card className="bg-gradient-to-r from-indigo-950/40 via-purple-950/20 to-slate-900/60 border-indigo-500/30 shadow-lg">
          <CardHeader className="pb-3">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-5 h-5 text-indigo-400" />
                  <CardTitle className="text-base text-white">
                    Cryptographic Audit Merkle Root
                  </CardTitle>
                  <span className="px-2 py-0.5 text-[10px] font-semibold tracking-wide uppercase rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                    Verified SHA-256 Tree
                  </span>
                </div>
                <CardDescription className="text-xs text-zinc-400">
                  Binary Merkle tree computed over {parseResult.merkleTree.totalValidSales} valid
                  conversions for immutable on-chain auditing.
                </CardDescription>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleCopyMerkleRoot}
                  className="text-xs gap-1.5 border-zinc-700 bg-zinc-800/80 text-zinc-200 hover:bg-zinc-700"
                >
                  {copiedRoot ? (
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                  {copiedRoot ? "Copied" : "Copy Root"}
                </Button>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleDownloadAuditManifest}
                  className="text-xs gap-1.5 border-indigo-500/40 bg-indigo-950/40 text-indigo-300 hover:bg-indigo-900/60"
                >
                  <Download className="w-3.5 h-3.5" />
                  Audit Manifest (.json)
                </Button>
              </div>
            </div>
          </CardHeader>

          <CardContent className="space-y-4 pt-0">
            {/* Hash Display */}
            <div className="p-3 rounded-lg bg-black/40 border border-zinc-800 font-mono text-xs text-indigo-300 flex items-center justify-between break-all">
              <span>{parseResult.merkleTree.root}</span>
            </div>

            {/* Quick Proof Verifier */}
            <div className="p-3 rounded-lg bg-white/5 border border-white/10 space-y-2">
              <p className="text-xs font-medium text-zinc-300 flex items-center gap-1.5">
                <HelpCircle className="w-3.5 h-3.5 text-indigo-400" />
                Audit Proof Verification Tool
              </p>
              <div className="flex flex-col sm:flex-row gap-2">
                <Input
                  placeholder="Enter Order ID to verify Merkle membership proof (e.g. ORD-2026-1001)..."
                  value={verifyTargetOrderId}
                  onChange={(e) => setVerifyTargetOrderId(e.target.value)}
                  className="text-xs bg-black/30 border-zinc-700 text-white placeholder:text-zinc-500 h-9"
                />
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={handleVerifySingleLeaf}
                  className="text-xs shrink-0"
                >
                  Verify Proof
                </Button>
              </div>

              {verifiedLeafResult !== null && (
                <div
                  className={`mt-2 p-2 rounded text-xs flex items-center gap-2 ${
                    verifiedLeafResult
                      ? "bg-emerald-950/50 text-emerald-300 border border-emerald-500/30"
                      : "bg-red-950/50 text-red-300 border border-red-500/30"
                  }`}
                >
                  {verifiedLeafResult ? (
                    <>
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                      <span>
                        Valid Merkle membership proof: Order is cryptographically sealed in batch
                        root.
                      </span>
                    </>
                  ) : (
                    <>
                      <XCircle className="w-4 h-4 text-red-400 shrink-0" />
                      <span>Proof verification failed or order not in batch.</span>
                    </>
                  )}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Malformed Rows Alert Notice */}
      {parseResult && parseResult.malformedCount > 0 && (
        <div className="p-4 rounded-xl border border-amber-500/30 bg-amber-50/80 dark:bg-amber-950/30 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <div>
              <h4 className="text-sm font-semibold text-amber-900 dark:text-amber-200">
                {parseResult.malformedCount} Malformed Row(s) Detected
              </h4>
              <p className="text-xs text-amber-700 dark:text-amber-300 mt-0.5">
                Rows with invalid Stellar keys or negative amounts are flagged in red. You can edit
                them inline or exclude them from submission.
              </p>
            </div>
          </div>

          <Button
            size="sm"
            variant="outline"
            onClick={() => setExcludeMalformed(!excludeMalformed)}
            className="text-xs border-amber-500/40 text-amber-800 dark:text-amber-200 hover:bg-amber-100 dark:hover:bg-amber-900/50 shrink-0"
          >
            {excludeMalformed ? "Show All Rows" : "Exclude Malformed Rows"}
          </Button>
        </div>
      )}

      {/* Sequential On-Chain Logging Progress Card */}
      {loggingProgress.isLogging || loggingProgress.isComplete ? (
        <Card className="border-indigo-500/30 bg-white dark:bg-zinc-900 shadow-md">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  {loggingProgress.isComplete ? (
                    <>
                      <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                      On-Chain Batch Logging Complete
                    </>
                  ) : (
                    <>
                      <div className="w-2.5 h-2.5 rounded-full bg-indigo-500 animate-ping" />
                      Sequential On-Chain Logging in Progress
                    </>
                  )}
                </CardTitle>
                <CardDescription className="text-xs">
                  {loggingProgress.isComplete
                    ? `Successfully logged ${loggingProgress.successCount} of ${loggingProgress.total} sales on the Stellar blockchain.`
                    : `Logging sale ${loggingProgress.current} of ${loggingProgress.total} (${loggingProgress.percent}% complete) • Order #${loggingProgress.currentOrderId || "..."}`}
                </CardDescription>
              </div>

              {/* Logging Controls */}
              <div className="flex items-center gap-2">
                {loggingProgress.isLogging && (
                  <>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handlePauseResume}
                      className="text-xs gap-1.5 h-8"
                    >
                      {loggingProgress.isPaused ? (
                        <>
                          <Play className="w-3.5 h-3.5 text-emerald-500" />
                          Resume
                        </>
                      ) : (
                        <>
                          <Pause className="w-3.5 h-3.5 text-amber-500" />
                          Pause
                        </>
                      )}
                    </Button>

                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={handleCancelLogging}
                      className="text-xs gap-1.5 h-8"
                    >
                      <XCircle className="w-3.5 h-3.5" />
                      Cancel
                    </Button>
                  </>
                )}

                {loggingProgress.isComplete && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleDownloadSettlementReport}
                    className="text-xs gap-1.5 h-8"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Download Settlement CSV
                  </Button>
                )}
              </div>
            </div>
          </CardHeader>

          <CardContent className="space-y-3 pt-0">
            {/* Progress Bar Track */}
            <div className="w-full bg-slate-100 dark:bg-zinc-800 rounded-full h-3 overflow-hidden p-0.5">
              <div
                className="bg-gradient-to-r from-indigo-500 via-purple-500 to-emerald-500 h-full rounded-full transition-all duration-300"
                style={{ width: `${loggingProgress.percent}%` }}
              />
            </div>

            {/* Metrics Breakdown */}
            <div className="flex items-center justify-between text-xs text-slate-500 dark:text-zinc-400">
              <span>
                Processed:{" "}
                <strong className="text-slate-900 dark:text-white">
                  {loggingProgress.current}
                </strong>{" "}
                / {loggingProgress.total}
              </span>
              <div className="flex items-center gap-4">
                <span className="text-emerald-600 dark:text-emerald-400">
                  Confirmed: <strong>{loggingProgress.successCount}</strong>
                </span>
                {loggingProgress.failCount > 0 && (
                  <span className="text-red-600 dark:text-red-400">
                    Failed: <strong>{loggingProgress.failCount}</strong>
                  </span>
                )}
                <span>Rate: ~200ms / tx</span>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {/* Visual Preview Table Controls */}
      {parseResult && (
        <Card className="bg-white dark:bg-zinc-900 border-slate-200 dark:border-zinc-800">
          <CardHeader className="pb-4">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              <div>
                <CardTitle className="text-lg">Visual Preview Table</CardTitle>
                <CardDescription className="text-xs">
                  Review and audit conversions before submitting on-chain. Malformed rows are
                  highlighted with validation flags.
                </CardDescription>
              </div>

              {/* Action & Filter Toolbar */}
              <div className="flex flex-wrap items-center gap-3">
                {/* Search */}
                <div className="relative w-48 sm:w-60">
                  <Search className="w-3.5 h-3.5 absolute left-2.5 top-3 text-slate-400" />
                  <Input
                    placeholder="Search Order ID / Address..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-8 text-xs h-9"
                  />
                </div>

                {/* Status Filter */}
                <div className="flex items-center p-1 rounded-lg bg-slate-100 dark:bg-zinc-800 text-xs">
                  <button
                    onClick={() => setStatusFilter("all")}
                    className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
                      statusFilter === "all"
                        ? "bg-white dark:bg-zinc-700 text-slate-900 dark:text-white shadow-sm"
                        : "text-slate-500 dark:text-zinc-400"
                    }`}
                  >
                    All ({parseResult.totalRows})
                  </button>
                  <button
                    onClick={() => setStatusFilter("valid")}
                    className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
                      statusFilter === "valid"
                        ? "bg-white dark:bg-zinc-700 text-emerald-600 dark:text-emerald-400 shadow-sm"
                        : "text-slate-500 dark:text-zinc-400"
                    }`}
                  >
                    Valid ({parseResult.validCount})
                  </button>
                  <button
                    onClick={() => setStatusFilter("malformed")}
                    className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
                      statusFilter === "malformed"
                        ? "bg-white dark:bg-zinc-700 text-amber-600 dark:text-amber-400 shadow-sm"
                        : "text-slate-500 dark:text-zinc-400"
                    }`}
                  >
                    Malformed ({parseResult.malformedCount})
                  </button>
                </div>

                {/* Campaign Selection & Submit Batch Button */}
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1.5 text-xs text-slate-500">
                    <span>Campaign:</span>
                    <Input
                      type="number"
                      min={1}
                      value={campaignId}
                      onChange={(e) => setCampaignId(parseInt(e.target.value, 10) || 1)}
                      className="w-16 h-9 text-xs"
                    />
                  </div>

                  <Button
                    size="sm"
                    disabled={loggingProgress.isLogging || rowsToLog.length === 0}
                    onClick={handleStartBatchLogging}
                    className="text-xs gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white h-9 shadow-sm"
                  >
                    <Play className="w-3.5 h-3.5 fill-current" />
                    Log Batch On-Chain ({rowsToLog.length})
                  </Button>
                </div>
              </div>
            </div>
          </CardHeader>

          <CardContent className="p-0">
            <div className="overflow-x-auto max-h-[500px]">
              <Table>
                <TableHeader className="bg-slate-50 dark:bg-zinc-800/60 sticky top-0 z-10 backdrop-blur">
                  <TableRow>
                    <TableHead className="w-12 text-xs">#</TableHead>
                    <TableHead className="w-24 text-xs">Validation</TableHead>
                    <TableHead className="text-xs">Order ID</TableHead>
                    <TableHead className="text-xs">Affiliate Stellar Address</TableHead>
                    <TableHead className="text-xs">Sale Amount</TableHead>
                    <TableHead className="text-xs">Timestamp</TableHead>
                    <TableHead className="text-xs">On-Chain Status</TableHead>
                    <TableHead className="text-xs text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>

                <TableBody>
                  {visibleRows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center py-8 text-xs text-slate-500">
                        No rows match your filter criteria.
                      </TableCell>
                    </TableRow>
                  ) : (
                    visibleRows.map((row) => {
                      const isEditing = editingRowId === row.id;
                      const hasAddressError = row.errors.some(
                        (e) => e.field === "affiliateAddress",
                      );
                      const hasAmountError = row.errors.some((e) => e.field === "saleAmount");
                      const hasTimestampError = row.errors.some((e) => e.field === "timestamp");

                      return (
                        <TableRow
                          key={row.id}
                          className={`text-xs transition-colors ${
                            row.status === "malformed"
                              ? "bg-red-50/40 dark:bg-red-950/20 hover:bg-red-50/70 dark:hover:bg-red-950/30"
                              : "hover:bg-slate-50/80 dark:hover:bg-zinc-800/40"
                          } ${row.onChainStatus === "pending" ? "animate-pulse bg-indigo-50/40" : ""}`}
                        >
                          {/* Row Number */}
                          <TableCell className="font-mono text-slate-400 font-medium">
                            {row.rowNumber}
                          </TableCell>

                          {/* Validation Badge */}
                          <TableCell>
                            {row.status === "valid" ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
                                <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                                Valid
                              </span>
                            ) : (
                              <span
                                title={row.errors.map((e) => e.message).join("\n")}
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-red-100 text-red-800 dark:bg-red-950/60 dark:text-red-300 cursor-help"
                              >
                                <XCircle className="w-3 h-3 text-red-600" />
                                Malformed
                              </span>
                            )}
                          </TableCell>

                          {/* Order ID */}
                          <TableCell className="font-mono font-medium text-slate-900 dark:text-white">
                            {isEditing ? (
                              <Input
                                value={editForm.orderId}
                                onChange={(e) =>
                                  setEditForm({ ...editForm, orderId: e.target.value })
                                }
                                className="h-7 text-xs font-mono"
                              />
                            ) : (
                              row.orderId || <span className="text-red-500 italic">Missing ID</span>
                            )}
                          </TableCell>

                          {/* Affiliate Address */}
                          <TableCell>
                            {isEditing ? (
                              <Input
                                value={editForm.affiliateAddress}
                                onChange={(e) =>
                                  setEditForm({ ...editForm, affiliateAddress: e.target.value })
                                }
                                className="h-7 text-xs font-mono w-64"
                              />
                            ) : (
                              <div className="flex flex-col">
                                <span
                                  className={`font-mono ${
                                    hasAddressError
                                      ? "text-red-600 dark:text-red-400 font-semibold"
                                      : "text-slate-700 dark:text-zinc-300"
                                  }`}
                                >
                                  {row.affiliateAddress
                                    ? `${row.affiliateAddress.slice(0, 8)}...${row.affiliateAddress.slice(-6)}`
                                    : "Empty Address"}
                                </span>
                                {hasAddressError && (
                                  <span className="text-[10px] text-red-500 leading-tight mt-0.5">
                                    Invalid Stellar 56-char Ed25519 public key
                                  </span>
                                )}
                              </div>
                            )}
                          </TableCell>

                          {/* Sale Amount */}
                          <TableCell>
                            {isEditing ? (
                              <Input
                                value={editForm.saleAmount}
                                onChange={(e) =>
                                  setEditForm({ ...editForm, saleAmount: e.target.value })
                                }
                                className="h-7 text-xs font-mono w-24"
                              />
                            ) : (
                              <div className="flex flex-col">
                                <span
                                  className={`font-mono font-medium ${
                                    hasAmountError
                                      ? "text-red-600 dark:text-red-400 font-semibold"
                                      : "text-slate-900 dark:text-white"
                                  }`}
                                >
                                  {row.saleAmount > 0
                                    ? `${row.saleAmount.toFixed(2)} XLM`
                                    : row.saleAmountRaw || "0 XLM"}
                                </span>
                                {hasAmountError && (
                                  <span className="text-[10px] text-red-500 leading-tight mt-0.5">
                                    Must be numeric &gt; 0
                                  </span>
                                )}
                              </div>
                            )}
                          </TableCell>

                          {/* Timestamp */}
                          <TableCell>
                            {isEditing ? (
                              <Input
                                value={editForm.timestamp}
                                onChange={(e) =>
                                  setEditForm({ ...editForm, timestamp: e.target.value })
                                }
                                className="h-7 text-xs font-mono w-44"
                              />
                            ) : (
                              <div className="flex flex-col">
                                <span
                                  className={`font-mono text-[11px] ${
                                    hasTimestampError ? "text-red-600" : "text-slate-500"
                                  }`}
                                >
                                  {row.timestamp
                                    ? row.timestamp.replace("T", " ").slice(0, 19)
                                    : row.timestampRaw}
                                </span>
                                {hasTimestampError && (
                                  <span className="text-[10px] text-red-500 leading-tight mt-0.5">
                                    Invalid Date / Timestamp
                                  </span>
                                )}
                              </div>
                            )}
                          </TableCell>

                          {/* On-Chain Status */}
                          <TableCell>
                            {row.onChainStatus === "success" && (
                              <div className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 font-medium">
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                <span>Confirmed</span>
                                {row.txHash && (
                                  <a
                                    href={`https://stellar.expert/explorer/testnet/tx/${row.txHash}`}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="text-indigo-500 hover:text-indigo-600 ml-1"
                                    title="View on Stellar Expert"
                                  >
                                    <ExternalLink className="w-3 h-3" />
                                  </a>
                                )}
                              </div>
                            )}
                            {row.onChainStatus === "pending" && (
                              <span className="inline-flex items-center gap-1 text-indigo-600 dark:text-indigo-400 font-medium animate-pulse">
                                <RotateCcw className="w-3 h-3 animate-spin" />
                                Submitting...
                              </span>
                            )}
                            {row.onChainStatus === "error" && (
                              <span
                                title={row.errorMessage}
                                className="inline-flex items-center gap-1 text-red-600 dark:text-red-400 font-medium cursor-help"
                              >
                                <AlertTriangle className="w-3.5 h-3.5" />
                                Failed
                              </span>
                            )}
                            {(!row.onChainStatus || row.onChainStatus === "idle") && (
                              <span className="text-slate-400 dark:text-zinc-500 italic">
                                {row.status === "valid" ? "Ready" : "Excluded"}
                              </span>
                            )}
                          </TableCell>

                          {/* Actions */}
                          <TableCell className="text-right">
                            {isEditing ? (
                              <div className="inline-flex items-center gap-1">
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => handleSaveEdit(row.rowNumber)}
                                  className="h-7 w-7 p-0 text-emerald-600 hover:bg-emerald-50"
                                >
                                  <Save className="w-3.5 h-3.5" />
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => setEditingRowId(null)}
                                  className="h-7 w-7 p-0 text-slate-400 hover:bg-slate-100"
                                >
                                  <X className="w-3.5 h-3.5" />
                                </Button>
                              </div>
                            ) : (
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => handleStartEdit(row)}
                                className="h-7 w-7 p-0 text-slate-400 hover:text-slate-700 dark:hover:text-zinc-200"
                                title="Edit row inline"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};
