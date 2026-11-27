import React, { useState, useRef, useMemo, useCallback } from "react";
import {
  FileSpreadsheet,
  UploadCloud,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Search,
  Edit2,
  Save,
  X,
  RefreshCw,
  Layers,
  ArrowRight,
} from "lucide-react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "../ui/card";
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from "../ui/table";
import {
  parseBulkCampaignCsv,
  validateCampaignRow,
  generateSampleCampaignCsv,
} from "../../lib/bulkCampaignParser";
import type { BulkCampaignRow, BulkCampaignParseResult } from "../../types/bulkCampaign";

export interface BulkCampaignCsvUploaderProps {
  onBatchSubmit?: (validCampaigns: BulkCampaignRow[]) => void;
  initialContent?: string;
}

export const BulkCampaignCsvUploader: React.FC<BulkCampaignCsvUploaderProps> = ({
  onBatchSubmit,
  initialContent,
}) => {
  const [fileName, setFileName] = useState<string>("");
  const [isParsing, setIsParsing] = useState<boolean>(false);
  const [isDragOver, setIsDragOver] = useState<boolean>(false);
  const [parseResult, setParseResult] = useState<BulkCampaignParseResult | null>(null);

  // Table filtering and search
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<"all" | "valid" | "malformed">("all");

  // Inline editing state
  const [editingRowId, setEditingRowId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<{
    name: string;
    url: string;
    budget: string;
    payoutRate: string;
    clearingPeriod: string;
  }>({ name: "", url: "", budget: "", payoutRate: "", clearingPeriod: "" });

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  /**
   * Processes CSV string into validated rows.
   */
  const processCsvText = useCallback(async (content: string, name = "uploaded-campaigns.csv") => {
    setIsParsing(true);
    setFileName(name);
    setEditingRowId(null);
    setEditForm({ name: "", url: "", budget: "", payoutRate: "", clearingPeriod: "" });
    try {
      const result = await parseBulkCampaignCsv(content, { useWorker: true });
      setParseResult(result);
    } catch (err: unknown) {
      setParseResult({
        rows: [],
        totalRows: 0,
        validCount: 0,
        malformedCount: 0,
        totalBudgetXlm: 0,
        hasRequiredHeaders: false,
        missingHeaders: [],
        headerMapping: {},
        errorCallout: `CSV Processing failed: ${err instanceof Error ? err.message : String(err)}`,
      });
    } finally {
      setIsParsing(false);
    }
  }, []);

  // Initialize with initial content if provided
  React.useEffect(() => {
    if (initialContent) {
      queueMicrotask(() => {
        void processCsvText(initialContent, "initial-test.csv");
      });
    }
  }, [initialContent, processCsvText]);

  const readFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result;
      if (typeof text === "string") {
        void processCsvText(text, file.name);
      }
    };
    reader.onerror = () => {
      setParseResult({
        rows: [],
        totalRows: 0,
        validCount: 0,
        malformedCount: 0,
        totalBudgetXlm: 0,
        hasRequiredHeaders: false,
        missingHeaders: [],
        headerMapping: {},
        errorCallout: `Failed to read file "${file.name}". Please check file permissions and try again.`,
      });
    };
    reader.readAsText(file);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      readFile(file);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      readFile(file);
    }
  };

  /**
   * Starts inline editing for a specific row.
   */
  const startEditing = (row: BulkCampaignRow) => {
    setEditingRowId(row.id);
    setEditForm({
      name: row.nameRaw || row.name,
      url: row.urlRaw || row.url,
      budget: row.budgetRaw || String(row.budget),
      payoutRate: row.payoutRateRaw || String(row.payoutRate),
      clearingPeriod: row.clearingPeriodRaw || String(row.clearingPeriod),
    });
  };

  const cancelEditing = () => {
    setEditingRowId(null);
  };

  /**
   * Saves and immediately re-validates the edited row in place.
   */
  const saveEditing = (row: BulkCampaignRow) => {
    if (!parseResult) return;

    const updatedRow = validateCampaignRow(
      {
        name: editForm.name,
        url: editForm.url,
        budget: editForm.budget,
        payoutRate: editForm.payoutRate,
        clearingPeriod: editForm.clearingPeriod,
      },
      row.rowNumber,
      row.id,
    );

    const updatedRows = parseResult.rows.map((r) => (r.id === row.id ? updatedRow : r));
    const validCount = updatedRows.filter((r) => r.status === "valid").length;
    const malformedCount = updatedRows.filter((r) => r.status === "malformed").length;
    const totalBudgetXlm = updatedRows
      .filter((r) => r.status === "valid")
      .reduce((sum, r) => sum + r.budget, 0);

    setParseResult({
      ...parseResult,
      rows: updatedRows,
      validCount,
      malformedCount,
      totalBudgetXlm: Number(totalBudgetXlm.toFixed(4)),
    });

    setEditingRowId(null);
  };

  // Filter and search rows for display
  const filteredRows = useMemo(() => {
    if (!parseResult) return [];
    return parseResult.rows.filter((row) => {
      // Status filter
      if (statusFilter === "valid" && row.status !== "valid") return false;
      if (statusFilter === "malformed" && row.status !== "malformed") return false;

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchesName = row.name.toLowerCase().includes(q);
        const matchesUrl = row.url.toLowerCase().includes(q);
        if (!matchesName && !matchesUrl) return false;
      }
      return true;
    });
  }, [parseResult, statusFilter, searchQuery]);

  const loadSampleData = (withErrors: boolean) => {
    const csv = generateSampleCampaignCsv(8, withErrors);
    processCsvText(
      csv,
      withErrors ? "sample-campaigns-with-errors.csv" : "sample-campaigns-valid.csv",
    );
  };

  return (
    <div className="w-full space-y-6" data-testid="bulk-campaign-uploader">
      {/* Upload Zone */}
      <Card className="border border-border/60 shadow-sm bg-card">
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <CardTitle className="text-xl flex items-center gap-2">
                <FileSpreadsheet className="h-5 w-5 text-indigo-500" />
                B2B Bulk Campaign CSV Upload
              </CardTitle>
              <CardDescription>
                Upload a CSV file containing enterprise affiliate campaigns. Columns:{" "}
                <code className="text-xs bg-muted px-1 py-0.5 rounded font-mono">
                  name, url, budget, payout_rate, clearing_period
                </code>
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => loadSampleData(false)}
                className="text-xs"
              >
                Sample Valid CSV
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => loadSampleData(true)}
                className="text-xs text-amber-500 hover:text-amber-600"
              >
                Sample CSV With Errors
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent>
          <div
            role="button"
            tabIndex={0}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                fileInputRef.current?.click();
              }
            }}
            className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${
              isDragOver
                ? "border-indigo-500 bg-indigo-50/10"
                : "border-border/70 hover:border-indigo-400/80 bg-muted/20"
            }`}
            data-testid="drop-zone"
          >
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              accept=".csv,text/csv"
              className="hidden"
              data-testid="csv-file-input"
            />
            <div className="flex flex-col items-center justify-center space-y-3">
              <div className="p-3 bg-indigo-500/10 text-indigo-500 rounded-full">
                <UploadCloud className="h-8 w-8" />
              </div>
              <div className="space-y-1">
                <p className="font-medium text-sm">
                  {fileName ? (
                    <span className="text-indigo-400 font-semibold">{fileName}</span>
                  ) : (
                    "Click to upload or drag and drop your campaign CSV"
                  )}
                </p>
                <p className="text-xs text-muted-foreground">
                  Supports 1,000+ campaign rows parsed asynchronously via Web Worker
                </p>
              </div>
              {isParsing && (
                <div className="flex items-center gap-2 text-xs text-indigo-400">
                  <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                  Parsing CSV rows in background...
                </div>
              )}
            </div>
          </div>

          {/* Actionable Header / File Error Callout */}
          {parseResult?.errorCallout && (
            <div
              className="mt-4 p-4 rounded-lg bg-red-500/10 border border-red-500/30 flex items-start gap-3"
              data-testid="error-callout"
              role="alert"
            >
              <XCircle className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
              <div className="space-y-1 text-sm">
                <p className="font-semibold text-red-400">CSV Structure Error</p>
                <p className="text-muted-foreground text-xs leading-relaxed">
                  {parseResult.errorCallout}
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Preview Table & Metrics */}
      {parseResult && parseResult.hasRequiredHeaders && (
        <Card className="border border-border/60 shadow-sm bg-card" data-testid="preview-section">
          <CardHeader className="pb-4">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              {/* Summary Stats */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 w-full md:w-auto">
                <div className="p-3 bg-muted/40 rounded-lg border border-border/40 text-center">
                  <p className="text-xs text-muted-foreground">Total Rows</p>
                  <p className="text-lg font-bold" data-testid="stat-total">
                    {parseResult.totalRows}
                  </p>
                </div>
                <div className="p-3 bg-emerald-500/10 rounded-lg border border-emerald-500/20 text-center">
                  <p className="text-xs text-emerald-400 font-medium">Valid</p>
                  <p className="text-lg font-bold text-emerald-400" data-testid="stat-valid">
                    {parseResult.validCount}
                  </p>
                </div>
                <div className="p-3 bg-red-500/10 rounded-lg border border-red-500/20 text-center">
                  <p className="text-xs text-red-400 font-medium">Flagged Errors</p>
                  <p className="text-lg font-bold text-red-400" data-testid="stat-malformed">
                    {parseResult.malformedCount}
                  </p>
                </div>
                <div className="p-3 bg-indigo-500/10 rounded-lg border border-indigo-500/20 text-center">
                  <p className="text-xs text-indigo-400 font-medium">Total Budget</p>
                  <p className="text-lg font-bold text-indigo-400" data-testid="stat-budget">
                    {parseResult.totalBudgetXlm} XLM
                  </p>
                </div>
              </div>

              {/* Submit Batch Action */}
              <div className="flex items-center gap-3">
                <Button
                  type="button"
                  disabled={parseResult.malformedCount > 0 || parseResult.validCount === 0}
                  onClick={() =>
                    onBatchSubmit?.(parseResult.rows.filter((r) => r.status === "valid"))
                  }
                  className="bg-indigo-600 hover:bg-indigo-700 text-white font-medium"
                  data-testid="submit-batch-btn"
                >
                  <Layers className="h-4 w-4 mr-2" />
                  Submit {parseResult.validCount} Campaigns
                  <ArrowRight className="h-4 w-4 ml-1.5" />
                </Button>
              </div>
            </div>

            {/* Filter Pills & Search */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pt-3 border-t border-border/40 mt-4">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setStatusFilter("all")}
                  className={`text-xs px-3 py-1.5 rounded-full font-medium transition-colors ${
                    statusFilter === "all"
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground hover:bg-muted/80"
                  }`}
                  data-testid="filter-all"
                >
                  All ({parseResult.totalRows})
                </button>
                <button
                  type="button"
                  onClick={() => setStatusFilter("valid")}
                  className={`text-xs px-3 py-1.5 rounded-full font-medium transition-colors ${
                    statusFilter === "valid"
                      ? "bg-emerald-600 text-white"
                      : "bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20"
                  }`}
                  data-testid="filter-valid"
                >
                  Valid Only ({parseResult.validCount})
                </button>
                <button
                  type="button"
                  onClick={() => setStatusFilter("malformed")}
                  className={`text-xs px-3 py-1.5 rounded-full font-medium transition-colors ${
                    statusFilter === "malformed"
                      ? "bg-red-600 text-white"
                      : "bg-red-500/10 text-red-400 hover:bg-red-500/20"
                  }`}
                  data-testid="filter-errors"
                >
                  Errors Only ({parseResult.malformedCount})
                </button>
              </div>

              <div className="relative w-full sm:w-64">
                <Search className="h-4 w-4 absolute left-2.5 top-2.5 text-muted-foreground" />
                <Input
                  type="text"
                  placeholder="Filter by name or URL..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-8 text-xs h-9"
                  data-testid="search-input"
                />
              </div>
            </div>
          </CardHeader>

          <CardContent className="p-0">
            <div className="overflow-x-auto border-t border-border/50">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/30">
                    <TableHead className="w-12 text-center text-xs">#</TableHead>
                    <TableHead className="text-xs">Campaign Name</TableHead>
                    <TableHead className="text-xs">Destination URL</TableHead>
                    <TableHead className="text-xs">Budget (XLM)</TableHead>
                    <TableHead className="text-xs">Payout Rate</TableHead>
                    <TableHead className="text-xs text-center">Status</TableHead>
                    <TableHead className="w-24 text-right text-xs">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredRows.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={7}
                        className="text-center py-8 text-muted-foreground text-sm"
                      >
                        No campaign rows found matching the current filters.
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredRows.map((row) => {
                      const isEditing = editingRowId === row.id;
                      const hasNameError = row.errors.some((e) => e.field === "name");
                      const hasUrlError = row.errors.some((e) => e.field === "url");
                      const hasBudgetError = row.errors.some((e) => e.field === "budget");
                      const hasPayoutError = row.errors.some((e) => e.field === "payoutRate");

                      const urlErrorMessage = row.errors.find((e) => e.field === "url")?.message;
                      const budgetErrorMessage = row.errors.find(
                        (e) => e.field === "budget",
                      )?.message;
                      const payoutErrorMessage = row.errors.find(
                        (e) => e.field === "payoutRate",
                      )?.message;

                      return (
                        <TableRow
                          key={row.id}
                          className={`transition-colors ${
                            row.status === "malformed"
                              ? "bg-red-500/5 hover:bg-red-500/10"
                              : "hover:bg-muted/40"
                          }`}
                          data-testid={`row-${row.rowNumber}`}
                        >
                          <TableCell className="text-center font-mono text-xs text-muted-foreground">
                            {row.rowNumber}
                          </TableCell>

                          {/* Campaign Name Cell */}
                          <TableCell className="text-xs font-medium">
                            {isEditing ? (
                              <Input
                                value={editForm.name}
                                onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                                className={`text-xs h-8 ${hasNameError ? "border-red-500" : ""}`}
                                data-testid={`edit-name-${row.rowNumber}`}
                              />
                            ) : (
                              <div>
                                <span className={hasNameError ? "text-red-400 font-bold" : ""}>
                                  {row.name || <em className="text-muted-foreground">Empty</em>}
                                </span>
                              </div>
                            )}
                          </TableCell>

                          {/* Destination URL Cell */}
                          <TableCell className="text-xs">
                            {isEditing ? (
                              <Input
                                value={editForm.url}
                                onChange={(e) => setEditForm({ ...editForm, url: e.target.value })}
                                className={`text-xs h-8 ${hasUrlError ? "border-red-500" : ""}`}
                                data-testid={`edit-url-${row.rowNumber}`}
                              />
                            ) : (
                              <div className="space-y-1">
                                <span
                                  className={`truncate block max-w-xs ${
                                    hasUrlError
                                      ? "text-red-400 font-mono font-semibold bg-red-500/10 px-1 py-0.5 rounded border border-red-500/30"
                                      : "text-muted-foreground"
                                  }`}
                                  data-testid={`cell-url-${row.rowNumber}`}
                                >
                                  {row.url || (
                                    <em className="text-muted-foreground">Missing URL</em>
                                  )}
                                </span>
                                {hasUrlError && urlErrorMessage && (
                                  <span className="text-[10px] text-red-400 flex items-center gap-1">
                                    <AlertTriangle className="h-3 w-3" />
                                    {urlErrorMessage}
                                  </span>
                                )}
                              </div>
                            )}
                          </TableCell>

                          {/* Budget Cell */}
                          <TableCell className="text-xs">
                            {isEditing ? (
                              <Input
                                value={editForm.budget}
                                onChange={(e) =>
                                  setEditForm({ ...editForm, budget: e.target.value })
                                }
                                className={`text-xs h-8 w-28 ${hasBudgetError ? "border-red-500" : ""}`}
                                data-testid={`edit-budget-${row.rowNumber}`}
                              />
                            ) : (
                              <div className="space-y-1">
                                <span
                                  className={`font-mono ${
                                    hasBudgetError
                                      ? "text-red-400 font-bold bg-red-500/10 px-1.5 py-0.5 rounded border border-red-500/30 inline-block"
                                      : ""
                                  }`}
                                  data-testid={`cell-budget-${row.rowNumber}`}
                                >
                                  {row.budgetRaw || row.budget} XLM
                                </span>
                                {hasBudgetError && budgetErrorMessage && (
                                  <span className="text-[10px] text-red-400 flex items-center gap-1">
                                    <AlertTriangle className="h-3 w-3" />
                                    {budgetErrorMessage}
                                  </span>
                                )}
                              </div>
                            )}
                          </TableCell>

                          {/* Payout Rate Cell */}
                          <TableCell className="text-xs">
                            {isEditing ? (
                              <Input
                                value={editForm.payoutRate}
                                onChange={(e) =>
                                  setEditForm({ ...editForm, payoutRate: e.target.value })
                                }
                                className={`text-xs h-8 w-24 ${hasPayoutError ? "border-red-500" : ""}`}
                                data-testid={`edit-payout-${row.rowNumber}`}
                              />
                            ) : (
                              <div className="space-y-1">
                                <span
                                  className={`font-mono ${
                                    hasPayoutError
                                      ? "text-red-400 font-bold bg-red-500/10 px-1.5 py-0.5 rounded border border-red-500/30 inline-block"
                                      : ""
                                  }`}
                                  data-testid={`cell-payout-${row.rowNumber}`}
                                >
                                  {row.payoutRateRaw || `${row.payoutRate}%`}
                                </span>
                                {hasPayoutError && payoutErrorMessage && (
                                  <span className="text-[10px] text-red-400 flex items-center gap-1">
                                    <AlertTriangle className="h-3 w-3" />
                                    {payoutErrorMessage}
                                  </span>
                                )}
                              </div>
                            )}
                          </TableCell>

                          {/* Status Badge */}
                          <TableCell className="text-center">
                            {row.status === "valid" ? (
                              <span
                                className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full"
                                data-testid={`status-badge-${row.rowNumber}`}
                              >
                                <CheckCircle2 className="h-3 w-3" />
                                Valid
                              </span>
                            ) : (
                              <span
                                className="inline-flex items-center gap-1 text-[11px] font-medium text-red-400 bg-red-500/10 px-2 py-0.5 rounded-full"
                                data-testid={`status-badge-${row.rowNumber}`}
                              >
                                <XCircle className="h-3 w-3" />
                                Error ({row.errors.length})
                              </span>
                            )}
                          </TableCell>

                          {/* Action Button: Inline Edit / Save / Cancel */}
                          <TableCell className="text-right">
                            {isEditing ? (
                              <div className="flex items-center justify-end gap-1">
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => saveEditing(row)}
                                  className="h-7 w-7 p-0 text-emerald-400 hover:text-emerald-300"
                                  data-testid={`save-btn-${row.rowNumber}`}
                                  title="Save in-place changes"
                                >
                                  <Save className="h-3.5 w-3.5" />
                                </Button>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="ghost"
                                  onClick={cancelEditing}
                                  className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                                  data-testid={`cancel-btn-${row.rowNumber}`}
                                  title="Cancel edit"
                                >
                                  <X className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            ) : (
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                onClick={() => startEditing(row)}
                                className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
                                data-testid={`edit-btn-${row.rowNumber}`}
                              >
                                <Edit2 className="h-3 w-3 mr-1" />
                                Edit
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
