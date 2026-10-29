import { useState, useMemo, type ComponentType } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { NistScorecard } from "./NistScorecard";
import { useWeb3 } from "../../hooks/useWeb3";
import { useNotification, type NotificationType } from "../../context/NotificationContext";
import { exportFullCompliancePack, fetchLiveNistControls } from "../../utils/complianceNist";
import {
  FileCheck,
  AlertTriangle,
  CheckCircle2,
  Download,
  Clock,
  Lock,
  Calendar,
  ShieldCheck,
  Layers,
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

export interface ComplianceReportProps {
  defaultTab?: "nist" | "overview";
}

export const ComplianceReport: React.FC<ComplianceReportProps> = ({ defaultTab = "overview" }) => {
  const [activeSubTab, setActiveSubTab] = useState<"nist" | "overview">(defaultTab);
  let userAddress: string | null = null;
  let network: string = "TESTNET";
  try {
    const web3 = useWeb3();
    userAddress = web3.userAddress;
    network = web3.network;
  } catch {
    // Graceful fallback when rendered outside Web3Provider
  }
  let showNotification: (notification: {
    type: NotificationType;
    title: string;
    message: string;
  }) => string | void = () => {};
  try {
    const notif = useNotification();
    if (notif?.showNotification) {
      showNotification = notif.showNotification;
    }
  } catch {
    // Graceful fallback when rendered outside NotificationProvider
  }
  const [isExporting, setIsExporting] = useState(false);

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
      auditorAddress: userAddress || "Unattributed (Wallet Not Connected)",
    };
    return buildSignedAuditReport(opts, DEFAULT_COMPLIANCE_STANDARDS, DEFAULT_AUDIT_RECORDS);
  }, [startDate, endDate, statusFilter, userAddress]);

  const compliant = currentReport.standards.filter((c) => c.status === "Compliant").length;
  const review = currentReport.standards.filter((c) => c.status === "Review Needed").length;

  const handleQuickExport = async () => {
    setIsExporting(true);
    try {
      const activeAuditor = userAddress || "Unattributed (Wallet Not Connected)";
      const { controls } = await fetchLiveNistControls(network);
      await exportFullCompliancePack(activeAuditor, controls, network);
      showNotification({
        type: "success",
        title: "Compliance Pack Exported",
        message: "Generated and downloaded formal NIST SP 800-53 PDF & JSON audit pack.",
      });
    } catch (err: unknown) {
      showNotification({
        type: "error",
        title: "Export Failed",
        message: err instanceof Error ? err.message : "Failed to generate compliance export pack.",
      });
    } finally {
      setIsExporting(false);
    }
  };

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
    <div className="space-y-6 w-full" id="compliance-report-view">
      {/* Top Header & Sub-Tab Switcher */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2">
        <div
          role="tablist"
          aria-label="Compliance report sections"
          className="flex items-center gap-2 p-1 bg-slate-100 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-2xl w-fit"
        >
          <button
            id="subtab-regulatory-overview"
            role="tab"
            aria-selected={activeSubTab === "overview"}
            aria-controls="panel-frameworks-overview"
            onClick={() => setActiveSubTab("overview")}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
              activeSubTab === "overview"
                ? "bg-white dark:bg-indigo-600 text-zinc-900 dark:text-white shadow-sm"
                : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white"
            }`}
          >
            <Layers className="w-4 h-4 text-zinc-400" />
            <span>Frameworks Overview</span>
          </button>

          <button
            id="subtab-nist-scorecard"
            role="tab"
            aria-selected={activeSubTab === "nist"}
            aria-controls="panel-nist-scorecard"
            onClick={() => setActiveSubTab("nist")}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
              activeSubTab === "nist"
                ? "bg-white dark:bg-indigo-600 text-zinc-900 dark:text-white shadow-sm"
                : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white"
            }`}
          >
            <ShieldCheck className="w-4 h-4 text-indigo-500 dark:text-indigo-200" />
            <span>NIST SP 800-53 Scorecard</span>
          </button>
        </div>

        {activeSubTab === "overview" && (
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

            <Button
              id="btn-overview-export-pack"
              onClick={handleQuickExport}
              disabled={isExporting}
              className="h-10 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold shadow-sm text-xs px-4"
            >
              <Download className="w-4 h-4 mr-2" />
              {isExporting ? "Generating..." : "Export Full NIST Pack"}
            </Button>
          </div>
        )}
      </div>

      {/* Main View Content */}
      <div
        id="panel-nist-scorecard"
        role="tabpanel"
        aria-labelledby="subtab-nist-scorecard"
        hidden={activeSubTab !== "nist"}
      >
        {activeSubTab === "nist" && <NistScorecard />}
      </div>

      <div
        id="panel-frameworks-overview"
        role="tabpanel"
        aria-labelledby="subtab-regulatory-overview"
        hidden={activeSubTab !== "overview"}
      >
        {activeSubTab === "overview" && (
          <div className="space-y-6">
            {/* Header and Quick Action Description */}
            <div>
              <h2 className="text-3xl font-extrabold text-zinc-900 dark:text-white tracking-tight">
                Compliance Report & Export Suite
              </h2>
              <p className="text-zinc-500 dark:text-zinc-400 mt-2 font-medium">
                Security & regulatory compliance status with signed batch PDF and CSV audit exports
              </p>
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
                        Configure custom audit date boundaries and cryptographic digital seal
                        parameters
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>

                <CardContent className="p-6 sm:p-8 space-y-6">
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    {/* Start Date */}
                    <div className="space-y-1.5">
                      <label htmlFor="compliance-export-start-date" className="text-xs font-bold text-zinc-700 dark:text-zinc-300">
                        Start Date:
                      </label>
                      <input
                        id="compliance-export-start-date"
                        type="date"
                        value={startDate}
                        onChange={(e) => setStartDate(e.target.value)}
                        className="w-full h-10 px-3 rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-xs font-semibold text-zinc-800 dark:text-zinc-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                    </div>

                    {/* End Date */}
                    <div className="space-y-1.5">
                      <label htmlFor="compliance-export-end-date" className="text-xs font-bold text-zinc-700 dark:text-zinc-300">
                        End Date:
                      </label>
                      <input
                        id="compliance-export-end-date"
                        type="date"
                        value={endDate}
                        onChange={(e) => setEndDate(e.target.value)}
                        className="w-full h-10 px-3 rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-xs font-semibold text-zinc-800 dark:text-zinc-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                    </div>

                    {/* Standards Filter */}
                    <div className="space-y-1.5">
                      <label htmlFor="compliance-export-status-filter" className="text-xs font-bold text-zinc-700 dark:text-zinc-300">
                        Standards Filter:
                      </label>
                      <select
                        id="compliance-export-status-filter"
                        value={statusFilter}
                        onChange={(e) =>
                          setStatusFilter(e.target.value as "ALL" | "Compliant" | "Review Needed")
                        }
                        className="w-full h-10 px-3 rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-xs font-semibold text-zinc-800 dark:text-zinc-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      >
                        <option value="ALL">All Standards (Full Batch)</option>
                        <option value="Compliant">Only Compliant</option>
                        <option value="Review Needed">Require Attention</option>
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
                          className="px-2.5 py-2 text-[11px] font-bold rounded-lg bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 hover:border-indigo-400 text-indigo-600 dark:text-indigo-400"
                        >
                          May '26
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

                  {/* Cryptographic Seal Preview */}
                  <div className="p-4 rounded-2xl bg-white dark:bg-zinc-900 border border-slate-200/80 dark:border-zinc-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs">
                    <div className="space-y-1">
                      <div className="flex items-center space-x-2">
                        <Lock className="w-3.5 h-3.5 text-indigo-500" />
                        <span className="font-bold text-zinc-900 dark:text-white">
                          Live Cryptographic Report Signature:
                        </span>
                        <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-indigo-50 dark:bg-indigo-950/80 text-indigo-700 dark:text-indigo-300 font-bold">
                          {currentReport.reportId}
                        </span>
                      </div>
                      <div className="font-mono text-[11px] text-zinc-500 dark:text-zinc-400 truncate max-w-xl">
                        SHA-256 Digest: {currentReport.cryptoSignature.digestHash}
                      </div>
                    </div>

                    <div className="flex items-center space-x-2">
                      <Button
                        size="sm"
                        onClick={handleExportPDF}
                        className="h-8 px-3 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold"
                      >
                        <Download className="w-3 h-3 mr-1" />
                        Download Signed PDF
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={handleExportCSV}
                        className="h-8 px-3 rounded-lg text-xs font-bold"
                      >
                        <Download className="w-3 h-3 mr-1" />
                        Download CSV
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Export Confirmation Toast / Banner if previously exported */}
            {lastExportedSignature && (
              <div className="p-3.5 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 flex items-center justify-between text-xs text-emerald-900 dark:text-emerald-300">
                <div className="flex items-center space-x-2 truncate">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                  <span>
                    Successfully exported signed report at {lastExportedSignature.time}! Digest:{" "}
                    <strong className="font-mono text-[11px]">
                      {lastExportedSignature.digest.slice(0, 16)}...
                    </strong>
                  </span>
                </div>
                <button
                  type="button"
                  aria-label="Dismiss export notice"
                  onClick={() => setLastExportedSignature(null)}
                  className="text-xs text-emerald-700 dark:text-emerald-400 hover:underline ml-2 shrink-0 font-bold"
                >
                  Dismiss
                </button>
              </div>
            )}

            {/* Summary KPI Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <Card className="border border-slate-200 dark:border-zinc-800 rounded-2xl bg-white dark:bg-zinc-900/80 relative overflow-hidden">
                <div className="absolute top-0 left-0 w-1 h-full bg-emerald-500" />
                <CardContent className="p-6">
                  <div className="text-3xl font-extrabold text-zinc-900 dark:text-white">
                    {compliant}/{currentReport.standards.length}
                  </div>
                  <div className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mt-2">
                    Standards Compliant ({currentReport.metrics.complianceScore}%)
                  </div>
                </CardContent>
              </Card>

              <Card className="border border-slate-200 dark:border-zinc-800 rounded-2xl bg-white dark:bg-zinc-900/80 relative overflow-hidden">
                <div className="absolute top-0 left-0 w-1 h-full bg-amber-500" />
                <CardContent className="p-6">
                  <div className="text-3xl font-extrabold text-zinc-900 dark:text-white">
                    {review}
                  </div>
                  <div className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mt-2">
                    Require Review
                  </div>
                </CardContent>
              </Card>

              <Card className="border border-slate-200 dark:border-zinc-800 rounded-2xl bg-white dark:bg-zinc-900/80 relative overflow-hidden">
                <div className="absolute top-0 left-0 w-1 h-full bg-indigo-500" />
                <CardContent className="p-6">
                  <div className="text-3xl font-extrabold text-zinc-900 dark:text-white">
                    {currentReport.metrics.totalAuditedSales}
                  </div>
                  <div className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mt-2">
                    Audited Ledger Records ({startDate} &rarr; {endDate})
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Automated SOC 2 Type II Evidence Packager */}
            <Soc2EvidenceExport />

            {/* Compliance Standards List */}
            <Card className="border border-slate-200 dark:border-zinc-800 shadow-sm bg-white dark:bg-zinc-900/50 rounded-3xl">
              <CardHeader className="pt-8 px-8 pb-6 border-b border-slate-100 dark:border-zinc-800/50">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 bg-zinc-900 dark:bg-indigo-600 rounded-xl flex items-center justify-center shadow-md">
                      <FileCheck className="w-6 h-6 text-white" />
                    </div>
                    <div>
                      <CardTitle className="text-lg font-bold text-zinc-900 dark:text-white">
                        Regulatory Standards Assessment
                      </CardTitle>
                      <CardDescription className="text-zinc-500 dark:text-zinc-400 mt-1">
                        Compliance evaluation across NIST, ISO/IEC, GDPR, SOC 2, and FIPS security
                        frameworks
                      </CardDescription>
                    </div>
                  </div>

                  <div className="text-right hidden sm:block">
                    <div className="text-xs text-zinc-400 font-mono">
                      Window: {startDate} to {endDate}
                    </div>
                  </div>
                </div>
              </CardHeader>

              <CardContent className="p-0">
                <div className="divide-y divide-slate-100 dark:divide-zinc-800/50">
                  {currentReport.standards.map((item, i) => {
                    const cfg = statusMap[item.status] || statusMap["Compliant"];
                    const StatusIcon = cfg.icon;
                    return (
                      <div
                        key={i}
                        className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 px-8 py-6 hover:bg-slate-50/50 dark:hover:bg-zinc-900/30 transition-colors"
                      >
                        <div className="flex items-start gap-4">
                          <div
                            className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                              item.status === "Compliant"
                                ? "bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-100 dark:border-emerald-500/20"
                                : "bg-amber-50 dark:bg-amber-500/10 border border-amber-100 dark:border-amber-500/20"
                            }`}
                          >
                            <StatusIcon
                              className={`w-5 h-5 ${
                                item.status === "Compliant"
                                  ? "text-emerald-600 dark:text-emerald-400"
                                  : "text-amber-600 dark:text-amber-400"
                              }`}
                            />
                          </div>
                          <div>
                            <div className="font-bold text-sm text-zinc-900 dark:text-white">
                              {item.standard}
                            </div>
                            <div className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 mt-0.5">
                              {item.category}
                            </div>
                            <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mt-2 leading-relaxed max-w-lg">
                              {item.details}
                            </p>
                          </div>
                        </div>

                        <div className="flex sm:flex-col items-center sm:items-end gap-2 shrink-0">
                          <span
                            className={`inline-flex text-[10px] uppercase tracking-wider font-bold px-3 py-1 rounded-full ${cfg.badge}`}
                          >
                            {item.status}
                          </span>
                          <div className="flex items-center gap-1 text-xs text-zinc-400 dark:text-zinc-500">
                            <Clock className="w-3 h-3" />
                            {item.lastChecked}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            {/* Anomaly flags */}
            <Card className="border border-rose-200 dark:border-rose-500/30 shadow-sm bg-white dark:bg-zinc-900/50 rounded-3xl">
              <CardHeader className="pt-8 px-8 pb-6 border-b border-slate-100 dark:border-zinc-800/50">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-rose-600 rounded-xl flex items-center justify-center shadow-md">
                    <ShieldAlert className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <CardTitle className="text-lg font-bold text-zinc-900 dark:text-white">
                      Suspicious Activity & Anomaly Detection
                    </CardTitle>
                    <CardDescription className="text-zinc-500 dark:text-zinc-400 mt-1">
                      Wash-trading and rapid-claim patterns flagged for review
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <div className="divide-y divide-slate-100 dark:divide-zinc-800/50">
                  {anomalyFlags
                    .filter((flag) => !dismissedFlags[flag.id])
                    .map((flag) => {
                      const isHigh = flag.severity === "High";
                      const reported = reportedFlags[flag.id];
                      return (
                        <div
                          key={flag.id}
                          className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 px-8 py-6 hover:bg-slate-50/50 dark:hover:bg-zinc-900/30 transition-colors"
                        >
                          <div className="flex items-start gap-4">
                            <div
                              className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                                isHigh
                                  ? "bg-rose-50 dark:bg-rose-500/10 border border-rose-100 dark:border-rose-500/20"
                                  : "bg-amber-50 dark:bg-amber-500/10 border border-amber-100 dark:border-amber-500/20"
                              }`}
                            >
                              <AlertTriangle
                                className={`w-5 h-5 ${
                                  isHigh
                                    ? "text-rose-600 dark:text-rose-400"
                                    : "text-amber-600 dark:text-amber-400"
                                }`}
                              />
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-sm text-zinc-900 dark:text-white">
                                  {flag.pattern}
                                </span>
                                <span
                                  className={`inline-flex items-center gap-1 text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-full ${
                                    isHigh
                                      ? "bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-400"
                                      : "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400"
                                  }`}
                                >
                                  <Flag className="w-3 h-3" />
                                  {flag.severity} Risk
                                </span>
                                {isHigh && (
                                  <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-full bg-rose-600 text-white animate-pulse">
                                    <ShieldAlert className="w-3 h-3" />
                                    Red Flag
                                  </span>
                                )}
                              </div>
                              <div className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 mt-0.5">
                                {flag.campaign}
                              </div>
                              <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mt-2 leading-relaxed max-w-lg">
                                {flag.description}
                              </p>
                              <div className="flex items-center gap-1 text-xs text-zinc-400 dark:text-zinc-500 mt-2">
                                <Clock className="w-3 h-3" />
                                {flag.detectedAt}
                              </div>
                            </div>
                          </div>
                          <div className="flex sm:flex-col items-center sm:items-end gap-2 shrink-0">
                            <Button
                              size="sm"
                              disabled={reported}
                              onClick={() =>
                                setReportedFlags((prev) => ({ ...prev, [flag.id]: true }))
                              }
                              className={`h-8 rounded-lg text-xs font-semibold ${
                                reported
                                  ? "bg-emerald-600 text-white"
                                  : "bg-rose-600 hover:bg-rose-700 text-white"
                              }`}
                            >
                              {reported ? (
                                <>
                                  <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />
                                  Reported
                                </>
                              ) : (
                                <>
                                  <Flag className="w-3.5 h-3.5 mr-1.5" />
                                  Report Anomaly
                                </>
                              )}
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() =>
                                setDismissedFlags((prev) => ({ ...prev, [flag.id]: true }))
                              }
                              className="h-8 rounded-lg text-xs font-semibold text-zinc-500 dark:text-zinc-400"
                            >
                              <X className="w-3.5 h-3.5 mr-1.5" />
                              Dismiss
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                </div>
              </CardContent>
            </Card>

            {/* Cryptographic Tamper-Evident Ledger Notice */}
            <Card className="border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/50 rounded-2xl">
              <CardContent className="p-6">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                  <div className="flex items-start gap-4">
                    <Lock className="w-5 h-5 text-indigo-600 dark:text-indigo-400 mt-0.5 shrink-0" />
                    <div>
                      <p className="font-bold text-zinc-900 dark:text-white text-sm">
                        Cryptographic Audit Immutability & Ledger Attestation
                      </p>
                      <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mt-1 leading-relaxed max-w-2xl">
                        Every compliance audit report and batch export is digitally hashed using
                        SHA-256 and immutably anchored to the Stellar ledger. Exported PDF/CSV
                        certificates can be independently verified.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center space-x-2 shrink-0">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleExportPDF}
                      className="rounded-xl border-slate-200 dark:border-zinc-800 text-xs font-bold"
                    >
                      <Printer className="w-3.5 h-3.5 mr-1.5" />
                      Print / Save PDF
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleExportCSV}
                      className="rounded-xl border-slate-200 dark:border-zinc-800 text-xs font-bold"
                    >
                      <Download className="w-3.5 h-3.5 mr-1.5" />
                      Batch CSV
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
};
