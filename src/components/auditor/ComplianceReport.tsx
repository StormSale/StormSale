import { useState, useMemo, type ComponentType } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import {
  FileCheck,
  AlertTriangle,
  CheckCircle2,
  Download,
  Clock,
  Lock,
  Share2,
  KeyRound,
  Copy,
  Check,
  Calendar,
  ShieldCheck,
  FileSpreadsheet,
  Printer,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { Soc2EvidenceExport } from "./Soc2EvidenceExport";
import {
  buildSignedAuditReport,
  exportComplianceToCSV,
  generateBrandedPDFHtml,
  printOrSavePDf,
  downloadFile,
  DEFAULT_COMPLIANCE_STANDARDS,
  DEFAULT_AUDIT_RECORDS,
  type ComplianceExportOptions,
} from "../../lib/complianceExport";

const statusMap: Record<string, { badge: string; icon: ComponentType<{ className?: string }> }> = {
  Compliant: {
    badge: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400",
    icon: CheckCircle2,
  },
  "Review Needed": {
    badge: "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400",
    icon: AlertTriangle,
  },
  "Non-Compliant": {
    badge: "bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-400",
    icon: AlertTriangle,
  },
};

const EXPIRY_OPTIONS = [
  { label: "1 hour", hours: 1 },
  { label: "24 hours", hours: 24 },
  { label: "7 days", hours: 168 },
];

const generateShareToken = () => {
  const bytes = new Uint8Array(16);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
};

const generatePassphrase = () => {
  const words = ["audit", "vault", "cipher", "stellar", "ledger", "secure", "proof", "key"];
  const pick = () => words[Math.floor(Math.random() * words.length)];
  return `${pick()}-${pick()}-${generateShareToken().slice(0, 6)}`;
};

export const ComplianceReport = () => {
  // Batch Export & Date Range State
  const [startDate, setStartDate] = useState("2026-05-01");
  const [endDate, setEndDate] = useState("2026-05-31");
  const [statusFilter, setStatusFilter] = useState<"ALL" | "Compliant" | "Review Needed">("ALL");
  const [showBatchExportPanel, setShowBatchExportPanel] = useState(false);
  const [lastExportedSignature, setLastExportedSignature] = useState<{
    digest: string;
    cert: string;
    time: string;
  } | null>(null);

  // Active Audit Report object derived from current selections
  const currentReport = useMemo(() => {
    const opts: ComplianceExportOptions = {
      startDate,
      endDate,
      statusFilter,
      auditorName: "Independent Protocol Auditor",
      auditorAddress: "GAUDITOR_STELLAR_REGULATORY_SIGNER",
    };
    return buildSignedAuditReport(opts, DEFAULT_COMPLIANCE_STANDARDS, DEFAULT_AUDIT_RECORDS);
  }, [startDate, endDate, statusFilter]);

  const compliant = currentReport.standards.filter((c) => c.status === "Compliant").length;
  const review = currentReport.standards.filter((c) => c.status === "Review Needed").length;

  // Preset Date Range Helper
  const applyPreset = (preset: "last7" | "last30" | "mayAudit" | "allTime") => {
    if (preset === "last7") {
      setStartDate("2026-05-09");
      setEndDate("2026-05-16");
    } else if (preset === "last30") {
      setStartDate("2026-04-16");
      setEndDate("2026-05-16");
    } else if (preset === "mayAudit") {
      setStartDate("2026-05-01");
      setEndDate("2026-05-31");
    } else if (preset === "allTime") {
      setStartDate("2026-01-01");
      setEndDate("2026-12-31");
    }
  };

  // Generate Branded PDF Action
  const handleExportPDF2 = () => {
    const html = generateBrandedPDFHtml(currentReport);
    printOrSavePDf(html);
    setLastExportedSignature({
      digest: currentReport.cryptoSignature.digestHash,
      cert: currentReport.cryptoSignature.signatureCert,
      time: new Date().toLocaleTimeString(),
    });
  };

  // Generate Batch CSV Action
  const handleExportCSV = () => {
    const csv = exportComplianceToCSV(currentReport);
    downloadFile(
      csv,
      `compliance-audit-batch-${currentReport.dateRange.start}-to-${currentReport.dateRange.end}.csv`,
      "text/csv;charset=utf-8;",
    );
    setLastExportedSignature({
      digest: currentReport.cryptoSignature.digestHash,
      cert: currentReport.cryptoSignature.signatureCert,
      time: new Date().toLocaleTimeString(),
    });
  };

  const [expiryHours, setExpiryHours] = useState(24);
  const [shareLink, setShareLink] = useState<string | null>(null);
  const [passphrase, setPassphrase] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<Date | null>(null);
  const [copied, setCopied] = useState(false);

  const handleGenerateLink = () => {
    const token = generateShareToken();
    const expiry = new Date(Date.now() + expiryHours * 60 * 60 * 1000);
    setShareLink(`${window.location.origin}/auditor/shared/${token}`);
    setPassphrase(generatePassphrase());
    setExpiresAt(expiry);
    setCopied(false);
  };

  const handleCopy = async () => {
    if (!shareLink) return;
    try {
      await navigator.clipboard.writeText(shareLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header and Quick Action Buttons */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-extrabold text-zinc-900 dark:text-white tracking-tight">
            Compliance Report & Export Suite
          </h2>
          <p className="text-zinc-500 dark:text-zinc-400 mt-2 font-medium">
            Security & regulatory compliance status with signed batch PDF and CSV audit exports
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <Button
            variant="outline"
            onClick={() => setShowBatchExportPanel(!showBatchExportPanel)}
            className="h-10 rounded-xl border-slate-200 dark:border-zinc-800 text-xs font-bold"
          >
            <Calendar className="w-4 h-4 mr-1.5 text-indigo-500" />
            Date-Range Batch Export
            {showBatchExportPanel ? (
              <ChevronUp className="w-3.5 h-3.5 ml-1.5" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5 ml-1.5" />
            )}
          </Button>

          <Button
            onClick={handleExportCSV}
            variant="outline"
            className="h-10 rounded-xl border-slate-200 dark:border-zinc-800 text-xs font-bold hover:bg-slate-50 dark:hover:bg-zinc-800"
          >
            <FileSpreadsheet className="w-4 h-4 mr-1.5 text-emerald-500" />
            Export CSV
          </Button>

          <Button
            onClick={handleExportPDF2}
            className="h-10 rounded-xl bg-zinc-900 dark:bg-indigo-600 text-white font-bold text-xs shadow-md hover:bg-zinc-800 dark:hover:bg-indigo-500 transition-all"
          >
            <Printer className="w-4 h-4 mr-1.5" />
            Export Signed PDF
          </Button>
        </div>
      </div>

      {/* Date-Range Batch Export Drawer / Configuration Panel */}
      {showBatchExportPanel && (
        <Card className="border border-indigo-200 dark:border-indigo-900/60 shadow-md rounded-3xl bg-indigo-50/30 dark:bg-indigo-950/20">
          <CardHeader className="pb-4 pt-6 px-6 sm:px-8 border-b border-indigo-100 dark:border-indigo-900/40">
            <div className="flex items-center space-x-3">
              <div className="w-9 h-9 rounded-xl bg-indigo-600 text-white flex items-center justify-center shadow-sm">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <div>
                <CardTitle className="text-lg font-bold text-zinc-900 dark:text-white">
                  Regulatory Audit Export Controls
                </CardTitle>
                <CardDescription className="text-zinc-500 dark:text-zinc-400 text-xs">
                  Configure custom audit date boundaries and cryptographic digital seal parameters
                </CardDescription>
              </div>
            </div>
          </CardHeader>

          <CardContent className="p-6 sm:p-8 space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Start Date */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-zinc-700 dark:text-zinc-300">
                  Start Date:
                </label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full h-10 px-3 rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-xs font-semibold text-zinc-800 dark:text-zinc-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              {/* End Date */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-zinc-700 dark:text-zinc-300">
                  End Date:
                </label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full h-10 px-3 rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-xs font-semibold text-zinc-800 dark:text-zinc-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              {/* Status Filter */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-zinc-700 dark:text-zinc-300">
                  Standards Filter:
                </label>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as any)}
                  className="w-full h-10 px-3 rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-xs font-semibold text-zinc-800 dark:text-zinc-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="ALL">All Standards ({DEFAULT_COMPLIANCE_STANDARDS.length})</option>
                  <option value="Compliant">Compliant Only</option>
                  <option value="Review Needed">Reviews Needed Only</option>
                </select>
              </div>

              {/* Quick Presets */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-zinc-700 dark:text-zinc-300">
                  Quick Ranges:
                </label>
                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={() => applyPreset("last7")}
                    className="px-2.5 py-2 text-[11px] font-bold rounded-lg bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 hover:border-indigo-400"
                  >
                    7D
                  </button>
                  <button
                    type="button"
                    onClick={() => applyPreset("last30")}
                    className="px-2.5 py-2 text-[11px] font-bold rounded-lg bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 hover:border-indigo-400"
                  >
                    30D
                  </button>
                  <button
                    type="button"
                    onClick={() => applyPreset("mayAudit")}
                    className="px-2.5 py-2 text-[11px] font-bold rounded-lg bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 hover:border-indigo-400"
                  >
                    May
                  </button>
                  <button
                    type="button"
                    onClick={() => applyPreset("allTime")}
                    className="px-2.5 py-2 text-[11px] font-bold rounded-lg bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 hover:border-indigo-400"
                  >
                    All
                  </button>
                </div>
              </div>
            </div>

            {/* Signature Status */}
            {lastExportedSignature && (
              <div className="rounded-xl border border-emerald-200 dark:border-emerald-900/40 bg-emerald-50 dark:bg-emerald-950/20 p-4">
                <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-400 text-xs font-bold">
                  <CheckCircle2 className="w-4 h-4" />
                  Last export signed at {lastExportedSignature.time}
                </div>
                <div className="mt-2 text-[11px] font-mono text-zinc-600 dark:text-zinc-400 break-all">
                  digest: {lastExportedSignature.digest}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="rounded-3xl border border-slate-200 dark:border-zinc-800">
          <CardContent className="p-6 flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-emerald-100 dark:bg-emerald-500/20 flex items-center justify-center">
              <CheckCircle2 className="w-5 h-5 text-emerald-600" />
            </div>
            <div>
              <p className="text-2xl font-extrabold text-zinc-900 dark:text-white">{compliant}</p>
              <p className="text-xs font-bold text-zinc-500 dark:text-zinc-400">Compliant</p>
            </div>
          </CardContent>
        </Card>
        <Card className="rounded-3xl border border-slate-200 dark:border-zinc-800">
          <CardContent className="p-6 flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-amber-100 dark:bg-amber-500/20 flex items-center justify-center">
              <AlertTriangle className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <p className="text-2xl font-extrabold text-zinc-900 dark:text-white">{review}</p>
              <p className="text-xs font-bold text-zinc-500 dark:text-zinc-400">Review Needed</p>
            </div>
          </CardContent>
        </Card>
        <Card className="rounded-3xl border border-slate-200 dark:border-zinc-800">
          <CardContent className="p-6 flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-indigo-100 dark:bg-indigo-500/20 flex items-center justify-center">
              <FileCheck className="w-5 h-5 text-indigo-600" />
            </div>
            <div>
              <p className="text-2xl font-extrabold text-zinc-900 dark:text-white">{currentReport.standards.length}</p>
              <p className="text-xs font-bold text-zinc-500 dark:text-zinc-400">Total Standards</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Share / Expiry-Locked Link Panel */}
      <Card className="rounded-3xl border border-slate-200 dark:border-zinc-800">
        <CardHeader className="pb-4 pt-6 px-6 sm:px-8 border-b border-slate-100 dark:border-zinc-800">
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 rounded-xl bg-zinc-900 dark:bg-indigo-600 text-white flex items-center justify-center shadow-sm">
              <Share2 className="w-5 h-5" />
            </div>
            <div>
              <CardTitle className="text-lg font-bold text-zinc-900 dark:text-white">
                Expiry-Locked Sharing
              </CardTitle>
              <CardDescription className="text-zinc-500 dark:text-zinc-400 text-xs">
                Generate a passphrase-protected share link that expires automatically
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-6 sm:p-8 space-y-5">
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-zinc-700 dark:text-zinc-300">
                Link Expiry:
              </label>
              <select
                value={expiryHours}
                onChange={(e) => setExpiryHours(Number(e.target.value))}
                className="h-10 px-3 rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-xs font-semibold text-zinc-800 dark:text-zinc-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                {EXPIRY_OPTIONS.map((opt) => (
                  <option key={opt.hours} value={opt.hours}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
            <Button
              onClick={handleGenerateLink}
              className="h-10 rounded-xl bg-zinc-900 dark:bg-indigo-600 text-white font-bold text-xs shadow-md hover:bg-zinc-800 dark:hover:bg-indigo-500 transition-all"
            >
              <KeyRound className="w-4 h-4 mr-1.5" />
              Generate Secure Share Link
            </Button>
          </div>

          {shareLink && (
            <div className="space-y-3">
              <div className="rounded-xl border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-900/50 p-3 flex items-center gap-2">
                <Lock className="w-4 h-4 text-zinc-500 flex-shrink-0" />
                <span className="text-xs font-mono text-zinc-700 dark:text-zinc-300 truncate flex-1">
                  {shareLink}
                </span>
                <Button
                  onClick={handleCopy}
                  variant="outline"
                  className="h-8 rounded-lg text-xs font-bold flex-shrink-0"
                >
                  {copied ? (
                    <>
                      <Check className="w-3.5 h-3.5 mr-1 text-emerald-500" />
                      Copied
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5 mr-1" />
                      Copy
                    </>
                  )}
                </Button>
              </div>

              {passphrase && (
                <div className="rounded-xl border border-amber-200 dark:border-amber-900/40 bg-amber-50 dark:bg-amber-950/20 p-3">
                  <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400 text-xs font-bold">
                    <KeyRound className="w-4 h-4" />
                    Share passphrase (share separately):
                  </div>
                  <div className="mt-1 text-sm font-mono font-bold text-zinc-800 dark:text-zinc-200">
                    {passphrase}
                  </div>
                </div>
              )}

              {expiresAt && (
                <div className="flex items-center gap-2 text-xs font-semibold text-zinc-500 dark:text-zinc-400">
                  <Clock className="w-4 h-4" />
                  Expires at {expiresAt.toLocaleString()}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Soc2 Evidence Export */}
      <Soc2EvidenceExport />
    </div>
  );
};
