import React, { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { Card, CardContent } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { useWeb3 } from "../../hooks/useWeb3";
import { useNotification } from "../../context/NotificationContext";
import {
  getStandardNistControls,
  fetchLiveNistControls,
  calculateScorecardSummary,
  exportFullCompliancePack,
  exportCompliancePdf,
  exportCompliancePackJson,
  generateCompliancePackJson,
} from "../../utils/complianceNist";
import type { NistControl, NistControlFamily } from "../../types/compliance";
import {
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  Download,
  FileText,
  FileCode,
  ExternalLink,
  RefreshCw,
  Search,
  Lock,
  Database,
  Key,
  Shield,
  Sparkles,
  Copy,
  Check,
} from "lucide-react";

export const NistScorecard: React.FC = () => {
  const { userAddress, network } = useWeb3();
  const { showNotification } = useNotification();

  const [controls, setControls] = useState<NistControl[]>(() => getStandardNistControls(network));
  const [isAuditing, setIsAuditing] = useState(false);
  const [selectedFamily, setSelectedFamily] = useState<"ALL" | NistControlFamily>("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [copiedSeal, setCopiedSeal] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  // Request sequence ref to discard stale out-of-order audit responses
  const requestSeqRef = useRef(0);

  const summary = useMemo(() => calculateScorecardSummary(controls), [controls]);

  // Handle re-running live compliance verification against Stellar Horizon / Soroban
  const handleRunAudit = useCallback(
    async (options: { silent?: boolean } = {}) => {
      const currentSeq = ++requestSeqRef.current;
      setIsAuditing(true);
      try {
        const { controls: freshControls, telemetry } = await fetchLiveNistControls(network);
        if (currentSeq !== requestSeqRef.current) return;
        setControls(freshControls);
        if (!options.silent) {
          const hasTxs = (telemetry.recentTransactions?.length ?? 0) > 0;
          if (!telemetry.isOnline) {
            showNotification({
              type: "warning",
              title: "Audit Completed with Warnings",
              message: `Soroban RPC endpoint unreachable for ${network || "Testnet"}. Dependent controls flagged for REVIEW.`,
            });
          } else if (!hasTxs) {
            showNotification({
              type: "warning",
              title: "Audit Completed - Review Required",
              message: `Ledger #${telemetry.latestLedger ?? "latest"} queried. No contract transactions found in current retention window on ${network || "Testnet"}. Dependent controls flagged for REVIEW.`,
            });
          } else {
            showNotification({
              type: "success",
              title: "On-Chain Audit Completed",
              message: `Live Stellar ${network || "Testnet"} ledger #${telemetry.latestLedger ?? "latest"} queried. Verified ${telemetry.recentTransactions!.length} contract authorization proofs and transactions.`,
            });
          }
        }
      } catch (err: unknown) {
        if (currentSeq !== requestSeqRef.current) return;
        if (!options.silent) {
          showNotification({
            type: "error",
            title: "Audit Verification Failed",
            message:
              err instanceof Error
                ? err.message
                : "Failed to query Soroban ledger state for compliance re-evaluation.",
          });
        }
      } finally {
        if (currentSeq === requestSeqRef.current) {
          setIsAuditing(false);
        }
      }
    },
    [network, showNotification],
  );

  // Trigger live on-chain audit on mount or network change
  useEffect(() => {
    const currentSeq = ++requestSeqRef.current;
    setIsAuditing(true);
    void fetchLiveNistControls(network)
      .then(({ controls: freshControls }) => {
        if (currentSeq === requestSeqRef.current) {
          setControls(freshControls);
        }
      })
      .catch(() => {
        if (currentSeq === requestSeqRef.current) {
          setControls(getStandardNistControls(network, { isOnline: false }));
        }
      })
      .finally(() => {
        if (currentSeq === requestSeqRef.current) {
          setIsAuditing(false);
        }
      });
  }, [network]);

  // 1-Click Export Pack (Both PDF and JSON)
  const handleExportFullPack = async () => {
    setIsExporting(true);
    try {
      const activeAuditor = userAddress || "Unattributed (Wallet Not Connected)";
      await exportFullCompliancePack(activeAuditor, controls, network);
      showNotification({
        type: "success",
        title: "1-Click Export Complete",
        message: "Downloaded formal NIST SP 800-53 compliance pack (PDF & JSON).",
      });
    } catch (err: unknown) {
      showNotification({
        type: "error",
        title: "Export Failed",
        message: err instanceof Error ? err.message : "Failed to generate compliance pack.",
      });
    } finally {
      setIsExporting(false);
    }
  };

  // Export PDF only
  const handleExportPdf = async () => {
    try {
      const activeAuditor = userAddress || "Unattributed (Wallet Not Connected)";
      const pack = await generateCompliancePackJson(activeAuditor, controls, network);
      exportCompliancePdf(pack);
      showNotification({
        type: "success",
        title: "PDF Report Exported",
        message: "Formal NIST SP 800-53 Scorecard PDF saved successfully.",
      });
    } catch (err: unknown) {
      showNotification({
        type: "error",
        title: "PDF Export Failed",
        message: err instanceof Error ? err.message : "Could not generate PDF report.",
      });
    }
  };

  // Export JSON only
  const handleExportJson = async () => {
    try {
      const activeAuditor = userAddress || "Unattributed (Wallet Not Connected)";
      const pack = await generateCompliancePackJson(activeAuditor, controls, network);
      exportCompliancePackJson(pack);
      showNotification({
        type: "success",
        title: "JSON Pack Exported",
        message: "Machine-readable NIST SP 800-53 compliance pack JSON saved.",
      });
    } catch (err: unknown) {
      showNotification({
        type: "error",
        title: "JSON Export Failed",
        message: err instanceof Error ? err.message : "Could not generate JSON export.",
      });
    }
  };

  // Filter controls
  const filteredControls = useMemo(() => {
    return controls.filter((ctrl) => {
      const matchesFamily = selectedFamily === "ALL" || ctrl.family === selectedFamily;
      const q = searchQuery.toLowerCase().trim();
      const matchesSearch =
        !q ||
        ctrl.id.toLowerCase().includes(q) ||
        ctrl.title.toLowerCase().includes(q) ||
        ctrl.nistDescription.toLowerCase().includes(q) ||
        ctrl.platformImplementation.toLowerCase().includes(q);
      return matchesFamily && matchesSearch;
    });
  }, [controls, selectedFamily, searchQuery]);

  // Copy integrity hash
  const handleCopySeal = async () => {
    try {
      await navigator.clipboard.writeText(summary.evaluationId);
      setCopiedSeal(true);
      setTimeout(() => setCopiedSeal(false), 2000);
      showNotification({
        type: "info",
        title: "Evaluation ID Copied",
        message: "Evaluation ID copied to clipboard.",
      });
    } catch {
      // fallback
    }
  };

  return (
    <div className="space-y-8 w-full" id="nist-scorecard-root">
      {/* Top Banner / Actions */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center bg-white dark:bg-zinc-900/60 p-6 md:p-8 rounded-3xl border border-slate-200 dark:border-zinc-800 shadow-sm gap-6">
        <div className="space-y-1.5">
          <div className="flex items-center space-x-2">
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider bg-indigo-100 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-300">
              <ShieldCheck className="w-3.5 h-3.5 mr-1" />
              NIST SP 800-53 Rev. 5
            </span>
            <span className="text-xs font-mono text-zinc-400 dark:text-zinc-500">
              Automated Control Scorecard
            </span>
          </div>
          <h1 className="text-2xl md:text-3xl font-black text-zinc-900 dark:text-white tracking-tight">
            Security Control Compliance Scorecard
          </h1>
          <p className="text-xs sm:text-sm text-zinc-500 dark:text-zinc-400 max-w-2xl font-medium">
            Automated verification of platform Access Control (AC-3, AC-6), Audit Trails (AU-3), and
            AES-GCM Cryptographic Protection (SC-8, SC-13) against the NIST catalog.
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto">
          <Button
            id="btn-run-live-audit"
            variant="outline"
            onClick={() => handleRunAudit()}
            disabled={isAuditing}
            className="h-11 rounded-2xl border-slate-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-200 font-semibold px-4"
          >
            <RefreshCw
              className={`w-4 h-4 mr-2 ${isAuditing ? "animate-spin text-indigo-500" : ""}`}
            />
            {isAuditing ? "Auditing Ledger..." : "Re-Verify Live"}
          </Button>

          <Button
            id="btn-export-pdf"
            variant="outline"
            onClick={handleExportPdf}
            className="h-11 rounded-2xl border-slate-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-200 font-semibold px-4"
          >
            <FileText className="w-4 h-4 mr-2 text-rose-500" />
            PDF
          </Button>

          <Button
            id="btn-export-json"
            variant="outline"
            onClick={handleExportJson}
            className="h-11 rounded-2xl border-slate-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-200 font-semibold px-4"
          >
            <FileCode className="w-4 h-4 mr-2 text-indigo-500" />
            JSON
          </Button>

          <Button
            id="btn-export-full-pack"
            onClick={handleExportFullPack}
            disabled={isExporting}
            className="h-11 rounded-2xl bg-zinc-900 hover:bg-zinc-800 dark:bg-indigo-600 dark:hover:bg-indigo-500 text-white font-bold px-5 shadow-lg shadow-indigo-500/10"
          >
            {isExporting ? (
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                <span>Exporting...</span>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Download className="w-4 h-4" />
                <span>1-Click Compliance Pack</span>
              </div>
            )}
          </Button>
        </div>
      </div>

      {/* Real-Time Telemetry & Score Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {/* Overall Score */}
        <Card className="border border-slate-200 dark:border-zinc-800 rounded-3xl bg-white dark:bg-zinc-900/70 relative overflow-hidden shadow-sm">
          <div
            className={`absolute top-0 left-0 w-1.5 h-full ${
              summary.complianceScorePercent === 100
                ? "bg-emerald-500"
                : summary.complianceScorePercent >= 70
                  ? "bg-amber-500"
                  : "bg-rose-500"
            }`}
          />
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                  Compliance Score
                </span>
                <div className="text-3xl font-black text-zinc-900 dark:text-white mt-1">
                  {summary.complianceScorePercent}%
                </div>
                <div
                  className={`text-xs font-semibold mt-1 flex items-center gap-1 ${
                    summary.complianceScorePercent === 100
                      ? "text-emerald-600 dark:text-emerald-400"
                      : summary.complianceScorePercent >= 70
                        ? "text-amber-600 dark:text-amber-400"
                        : "text-rose-600 dark:text-rose-400"
                  }`}
                >
                  {summary.complianceScorePercent === 100 ? (
                    <CheckCircle2 className="w-3.5 h-3.5" />
                  ) : (
                    <AlertTriangle className="w-3.5 h-3.5" />
                  )}
                  {summary.complianceScorePercent === 100
                    ? "Full Compliance Pass"
                    : summary.complianceScorePercent >= 70
                      ? "Partial Compliance / Review"
                      : "Compliance Action Required"}
                </div>
              </div>
              <div
                className={`w-12 h-12 rounded-2xl flex items-center justify-center border ${
                  summary.complianceScorePercent === 100
                    ? "bg-emerald-50 dark:bg-emerald-500/10 border-emerald-100 dark:border-emerald-500/20 text-emerald-600 dark:text-emerald-400"
                    : summary.complianceScorePercent >= 70
                      ? "bg-amber-50 dark:bg-amber-500/10 border-amber-100 dark:border-amber-500/20 text-amber-600 dark:text-amber-400"
                      : "bg-rose-50 dark:bg-rose-500/10 border-rose-100 dark:border-rose-500/20 text-rose-600 dark:text-rose-400"
                }`}
              >
                <ShieldCheck className="w-6 h-6" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Access Control (AC) */}
        <Card className="border border-slate-200 dark:border-zinc-800 rounded-3xl bg-white dark:bg-zinc-900/70 relative overflow-hidden shadow-sm">
          <div className="absolute top-0 left-0 w-1.5 h-full bg-indigo-500" />
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                  Access Control (AC)
                </span>
                <div className="text-3xl font-black text-zinc-900 dark:text-white mt-1">
                  {summary.familyScores.AC.passed}/{summary.familyScores.AC.total}
                </div>
                <div className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 mt-1">
                  AC-3, AC-6, AC-17 Enforced
                </div>
              </div>
              <div className="w-12 h-12 bg-indigo-50 dark:bg-indigo-500/10 rounded-2xl flex items-center justify-center border border-indigo-100 dark:border-indigo-500/20 text-indigo-600 dark:text-indigo-400">
                <Key className="w-6 h-6" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Audit & Accountability (AU) */}
        <Card className="border border-slate-200 dark:border-zinc-800 rounded-3xl bg-white dark:bg-zinc-900/70 relative overflow-hidden shadow-sm">
          <div className="absolute top-0 left-0 w-1.5 h-full bg-cyan-500" />
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                  Audit & Accountability (AU)
                </span>
                <div className="text-3xl font-black text-zinc-900 dark:text-white mt-1">
                  {summary.familyScores.AU.passed}/{summary.familyScores.AU.total}
                </div>
                <div className="text-xs font-semibold text-cyan-600 dark:text-cyan-400 mt-1">
                  AU-3 Immutable Ledger Trail
                </div>
              </div>
              <div className="w-12 h-12 bg-cyan-50 dark:bg-cyan-500/10 rounded-2xl flex items-center justify-center border border-cyan-100 dark:border-cyan-500/20 text-cyan-600 dark:text-cyan-400">
                <Database className="w-6 h-6" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* System & Comms (SC) */}
        <Card className="border border-slate-200 dark:border-zinc-800 rounded-3xl bg-white dark:bg-zinc-900/70 relative overflow-hidden shadow-sm">
          <div className="absolute top-0 left-0 w-1.5 h-full bg-violet-500" />
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                  Cryptographic Protection (SC)
                </span>
                <div className="text-3xl font-black text-zinc-900 dark:text-white mt-1">
                  {summary.familyScores.SC.passed}/{summary.familyScores.SC.total}
                </div>
                <div className="text-xs font-semibold text-violet-600 dark:text-violet-400 mt-1">
                  AES-256-GCM Authenticated
                </div>
              </div>
              <div className="w-12 h-12 bg-violet-50 dark:bg-violet-500/10 rounded-2xl flex items-center justify-center border border-violet-100 dark:border-violet-500/20 text-violet-600 dark:text-violet-400">
                <Lock className="w-6 h-6" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filter Bar & Evaluation Identity */}
      <div className="flex flex-col md:flex-row justify-between items-stretch md:items-center gap-4 bg-white dark:bg-zinc-900/50 p-4 rounded-2xl border border-slate-200 dark:border-zinc-800">
        {/* Family Tabs */}
        <div
          role="tablist"
          aria-label="Filter controls by family"
          className="flex flex-wrap items-center gap-1.5"
        >
          <button
            id="tab-family-all"
            role="tab"
            aria-selected={selectedFamily === "ALL"}
            aria-controls="nist-controls-list"
            onClick={() => setSelectedFamily("ALL")}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all ${
              selectedFamily === "ALL"
                ? "bg-zinc-900 dark:bg-indigo-600 text-white shadow-sm"
                : "bg-slate-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 hover:bg-slate-200 dark:hover:bg-zinc-700"
            }`}
          >
            All Families ({controls.length})
          </button>
          <button
            id="tab-family-ac"
            role="tab"
            aria-selected={selectedFamily === "AC"}
            aria-controls="nist-controls-list"
            onClick={() => setSelectedFamily("AC")}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all ${
              selectedFamily === "AC"
                ? "bg-indigo-600 text-white shadow-sm"
                : "bg-slate-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 hover:bg-slate-200 dark:hover:bg-zinc-700"
            }`}
          >
            Access Control (AC)
          </button>
          <button
            id="tab-family-au"
            role="tab"
            aria-selected={selectedFamily === "AU"}
            aria-controls="nist-controls-list"
            onClick={() => setSelectedFamily("AU")}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all ${
              selectedFamily === "AU"
                ? "bg-cyan-600 text-white shadow-sm"
                : "bg-slate-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 hover:bg-slate-200 dark:hover:bg-zinc-700"
            }`}
          >
            Audit Trail (AU)
          </button>
          <button
            id="tab-family-sc"
            role="tab"
            aria-selected={selectedFamily === "SC"}
            aria-controls="nist-controls-list"
            onClick={() => setSelectedFamily("SC")}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all ${
              selectedFamily === "SC"
                ? "bg-violet-600 text-white shadow-sm"
                : "bg-slate-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 hover:bg-slate-200 dark:hover:bg-zinc-700"
            }`}
          >
            System Protection (SC)
          </button>
        </div>

        {/* Search Input & Evaluation ID */}
        <div className="flex items-center gap-3">
          <div className="relative flex-1 md:w-64">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
            <Input
              id="input-scorecard-search"
              placeholder="Search controls..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-9 pl-9 text-xs rounded-xl border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-950"
            />
          </div>
          <button
            id="btn-copy-eval-id"
            onClick={handleCopySeal}
            title="Click to copy evaluation ID"
            className="flex items-center gap-1 px-2.5 py-1.5 bg-slate-100 dark:bg-zinc-800 hover:bg-slate-200 dark:hover:bg-zinc-700 text-zinc-600 dark:text-zinc-300 rounded-xl text-xs font-mono font-medium shrink-0 transition-colors"
          >
            {copiedSeal ? (
              <Check className="w-3.5 h-3.5 text-emerald-500" />
            ) : (
              <Copy className="w-3.5 h-3.5" />
            )}
            <span>{summary.evaluationId}</span>
          </button>
        </div>
      </div>

      {/* Control Cards List */}
      <div
        className="space-y-4"
        id="nist-controls-list"
        role="tabpanel"
        aria-labelledby={`tab-family-${selectedFamily.toLowerCase()}`}
      >
        {filteredControls.map((control) => {
          const familyColor =
            control.family === "AC"
              ? "text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-500/10 border-indigo-100 dark:border-indigo-500/20"
              : control.family === "AU"
                ? "text-cyan-600 dark:text-cyan-400 bg-cyan-50 dark:bg-cyan-500/10 border-cyan-100 dark:border-cyan-500/20"
                : "text-violet-600 dark:text-violet-400 bg-violet-50 dark:bg-violet-500/10 border-violet-100 dark:border-violet-500/20";

          return (
            <Card
              key={control.id}
              id={`control-card-${control.id.toLowerCase()}`}
              className="border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/50 rounded-3xl shadow-sm hover:border-slate-300 dark:hover:border-zinc-700 transition-all overflow-hidden"
            >
              <CardContent className="p-6 sm:p-7 space-y-5">
                {/* Control Header */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100 dark:border-zinc-800/60">
                  <div className="flex items-center gap-3">
                    <span
                      className={`text-xs font-mono font-black px-3 py-1 rounded-xl border ${familyColor}`}
                    >
                      NIST {control.id}
                    </span>
                    <div>
                      <h3 className="text-base sm:text-lg font-bold text-zinc-900 dark:text-white">
                        {control.title}
                      </h3>
                      <span className="text-xs font-medium text-zinc-400 dark:text-zinc-500">
                        {control.familyName} Family · Evaluated on Stellar {network || "Testnet"}
                      </span>
                    </div>
                  </div>

                  {/* Status Badge */}
                  <div className="flex items-center gap-2">
                    <span
                      className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${
                        control.status === "PASS"
                          ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400"
                          : control.status === "REVIEW"
                            ? "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400"
                            : "bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-400"
                      }`}
                    >
                      {control.status === "PASS" ? (
                        <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                      ) : (
                        <AlertTriangle className="w-3.5 h-3.5 mr-1" />
                      )}
                      {control.status}
                    </span>
                  </div>
                </div>

                {/* NIST Catalog Specification & Implementation Description */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                  {/* NIST Standard Spec */}
                  <div className="p-4 rounded-2xl bg-slate-50 dark:bg-zinc-950/60 border border-slate-100 dark:border-zinc-800/70 space-y-1.5">
                    <div className="font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider text-[10px]">
                      NIST SP 800-53 Catalog Specification
                    </div>
                    <p className="text-zinc-600 dark:text-zinc-300 leading-relaxed font-medium">
                      {control.nistDescription}
                    </p>
                  </div>

                  {/* StormSale Platform Implementation */}
                  <div className="p-4 rounded-2xl bg-indigo-50/40 dark:bg-indigo-950/20 border border-indigo-100/60 dark:border-indigo-900/30 space-y-1.5">
                    <div className="font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-wider text-[10px] flex items-center gap-1">
                      <Sparkles className="w-3 h-3" />
                      StormSale Protocol Implementation
                    </div>
                    <p className="text-zinc-700 dark:text-zinc-300 leading-relaxed font-medium">
                      {control.platformImplementation}
                    </p>
                  </div>
                </div>

                {/* Real-Time Evidence Metrics Grid */}
                <div className="space-y-2">
                  <div className="text-[11px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                    Live Evidence Metrics & Verification Tests
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {control.metrics.map((metric, idx) => (
                      <div
                        key={idx}
                        className="p-3 bg-slate-50 dark:bg-zinc-950/50 rounded-xl border border-slate-100 dark:border-zinc-800/60 flex flex-col justify-between"
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 truncate mr-2">
                            {metric.name}
                          </span>
                          <span
                            className={`text-[10px] font-bold px-1.5 py-0.2 rounded shrink-0 ${
                              metric.status === "PASS"
                                ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400"
                                : metric.status === "WARN"
                                  ? "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400"
                                  : "bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-400"
                            }`}
                          >
                            {metric.status}
                          </span>
                        </div>
                        <div className="text-sm font-mono font-bold text-zinc-900 dark:text-white mt-1">
                          {metric.value}
                        </div>
                        <div className="text-[10px] text-zinc-400 dark:text-zinc-500 mt-0.5 truncate">
                          {metric.description}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Verifiable On-Chain Embedded Evidence Links */}
                {control.evidenceLinks && control.evidenceLinks.length > 0 && (
                  <div className="pt-2 border-t border-slate-100 dark:border-zinc-800/50 flex flex-wrap items-center gap-3">
                    <span className="text-xs font-bold text-zinc-400 dark:text-zinc-500">
                      Verifiable On-Chain Proofs:
                    </span>
                    {control.evidenceLinks.map((link, idx) => (
                      <a
                        key={idx}
                        href={link.url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-slate-100 dark:bg-zinc-800 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 text-xs font-mono font-semibold text-indigo-600 dark:text-indigo-400 transition-colors border border-slate-200/60 dark:border-zinc-700/60"
                      >
                        <span>
                          {link.label}: {link.identifier.slice(0, 8)}...
                        </span>
                        <ExternalLink className="w-3 h-3 shrink-0" />
                      </a>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Audit Trail Non-Repudiation Footer Card */}
      <Card className="border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 rounded-3xl shadow-sm">
        <CardContent className="p-6 md:p-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-2xl bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-100 dark:border-indigo-500/20 flex items-center justify-center text-indigo-600 dark:text-indigo-400 shrink-0">
              <Shield className="w-6 h-6" />
            </div>
            <div>
              <h4 className="font-bold text-base text-zinc-900 dark:text-white">
                Cryptographic Audit Non-Repudiation
              </h4>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1 max-w-xl leading-relaxed font-medium">
                Under NIST SP 800-53 standards, every compliance verification is anchored to the
                Stellar blockchain. All export packages embed deterministic SHA-256 seals, contract
                bytecode hashes, and immutable transaction proofs.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <Button
              id="btn-footer-pack-export"
              onClick={handleExportFullPack}
              disabled={isExporting}
              className="h-10 rounded-xl bg-zinc-900 hover:bg-zinc-800 dark:bg-indigo-600 dark:hover:bg-indigo-500 text-white font-bold text-xs px-4"
            >
              <Download className="w-3.5 h-3.5 mr-1.5" />
              Download Audit Pack
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
