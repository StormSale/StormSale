import { useState, useMemo, useEffect, useRef, type ComponentType } from "react";
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
  Calendar,
  ShieldCheck,
  FileSpreadsheet,
  Printer,
  ChevronDown,
  ChevronUp,
  Flag,
  ShieldAlert,
  X,
} from "lucide-react";
import { Soc2EvidenceExport } from "./Soc2EvidenceExport";
import {
  buildSignedAuditReport,
  exportComplianceToCSV,
  generateBrandedPDFHtml,
  printOrSavePDF,
  downloadFile,
  DEFAULT_COMPLIANCE_STANDARDS,
  DEFAULT_AUDIT_RECORDS,
  type ComplianceExportOptions,
} from "../../lib/complianceExport";
import { computeAuditDigest, type AuditDigestResult } from "../../lib/crypto.worker";

const anomalyFlags = [
  {
    id: "flag-001",
    severity: "High",
    pattern: "Wash Trading",
    campaign: "Campaign #4821",
    description:
      "Circular buy/sell pattern detected across 14 wallets within a 6-hour window. Volume inflated by ~340%.",
    detectedAt: "2026-05-17 09:42 UTC",
  },
  {
    id: "flag-002",
    severity: "Medium",
    pattern: "Rapid Claim",
    campaign: "Campaign #3190",
    description:
      "38 claims executed from a single cluster within 90 seconds, exceeding the 5-claim/hour threshold.",
    detectedAt: "2026-05-16 22:15 UTC",
  },
  {
    id: "flag-003",
    severity: "High",
    pattern: "Sybil Cluster",
    campaign: "Campaign #5077",
    description:
      "Wallet graph analysis links 22 claimant addresses to a shared funding source and identical gas patterns.",
    detectedAt: "2026-05-15 14:03 UTC",
  },
];

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

  // Off-main-thread cryptographic digest state (AES/SHA work runs in crypto.worker.ts)
  const [workerDigest, setWorkerDigest] = useState<AuditDigestResult | null>(null);
  const [digestPending, setDigestPending] = useState(false);
  const [digestError, setDigestError] = useState<string | null>(null);
  const digestRequestId = useRef(0);

  // Anomaly reporting state
  const [reportedFlags, setReportedFlags] = useState<Record<string, boolean>>({});
  const [dismissedFlags, setDismissedFlags] = useState<Record<string, boolean>>({});

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

  // Offload digest computation to the background crypto web worker so the UI
  // stays at 60fps during audits. Falls back gracefully if the worker fails.
  useEffect(() => {
    const requestId = ++digestRequestId.current;
    setDigestPending(true);
    setDigestError(null);

    computeAuditDigest({
      reportId: currentReport.reportId,
      dateRange: currentReport.dateRange,
      standards: currentReport.standards,
      metrics: currentReport.metrics,
    })
      .then((result) => {
        if (digestRequestId.current !== requestId) return;
        setWorkerDigest(result);
        setDigestPending(false);
      })
      .catch((err: unknown) => {
        if (digestRequestId.current !== requestId) return;
        setDigestError(err instanceof Error ? err.message : "Digest worker failed");
        setDigestPending(false);
      });
  }, [currentReport]);

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
  const handleExportPDF = () => {
    const html = generateBrandedPDFHtml(currentReport);
    printOrSavePDF(html);
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
            onClick={handleExportPDF}
            className="h-10 rounded-xl bg-zinc-900 dark:bg-indigo-600 text-white font-bold text-xs shadow-md hover:bg-zinc-800 dark:hover:bg-indigo-500 transition-all"
          >
            <Printer className="w-4 h-4 mr-1.5" />
            Export Signed PDF
          </Button>
        </div>
      </div>

      {/* Anomaly detection summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="border border-slate-200 dark:border-zinc-800 rounded-2xl bg-white dark:bg-zinc-900/80 relative overflow-hidden">
          <div className="absolute top-0 left-0 w-1 h-full bg-rose-500" />
          <CardContent className="p-6">
            <div className="text-3xl font-extrabold text-zinc-900 dark:text-white">
              {anomalyFlags.filter((f) => f.severity === "High").length}
            </div>
            <div className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mt-2">
              High Severity Flags
            </div>
          </CardContent>
        </Card>
        <Card className="border border-slate-200 dark:border-zinc-800 rounded-2xl bg-white dark:bg-zinc-900/80 relative overflow-hidden">
          <div className="absolute top-0 left-0 w-1 h-full bg-amber-500" />
          <CardContent className="p-6">
            <div className="text-3xl font-extrabold text-zinc-900 dark:text-white">
              {anomalyFlags.filter((f) => f.severity === "Medium").length}
            </div>
            <div className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mt-2">
              Medium Severity Flags
            </div>
          </CardContent>
        </Card>
        <Card className="border border-slate-200 dark:border-zinc-800 rounded-2xl bg-white dark:bg-zinc-900/80 relative overflow-hidden">
          <div className="absolute top-0 left-0 w-1 h-full bg-indigo-500" />
          <CardContent className="p-6">
            <div className="text-3xl font-extrabold text-zinc-900 dark:text-white">
              {Object.keys(reportedFlags).length}
            </div>
            <div className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mt-2">
              Reported Anomalies
            </div>
          </CardContent>
        </Card>
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
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};
