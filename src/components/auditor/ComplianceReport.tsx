import React, { useState } from "react";
import type { ComponentType } from "react";
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
import { useNotification } from "../../context/NotificationContext";
import { exportFullCompliancePack } from "../../utils/complianceNist";
import {
  FileCheck,
  AlertTriangle,
  CheckCircle2,
  Download,
  Clock,
  Lock,
  ShieldCheck,
  Layers,
} from "lucide-react";

interface ComplianceItem {
  standard: string;
  category: string;
  status: "Compliant" | "Review Needed";
  lastChecked: string;
  details: string;
}

const complianceItems: ComplianceItem[] = [
  {
    standard: "NIST SP 800-53 Rev. 5",
    category: "Access Control (AC) & Audit (AU)",
    status: "Compliant",
    lastChecked: "2026-05-16",
    details:
      "All audit access operations use cryptographic key verification before granting data access. Full AC-3, AC-6, AU-3, and SC-8 controls verified.",
  },
  {
    standard: "ISO/IEC 27001",
    category: "Information Security Management",
    status: "Compliant",
    lastChecked: "2026-05-14",
    details: "Sale data encryption meets AES-256 standard. Wrapped keys are stored on-chain.",
  },
  {
    standard: "GDPR Article 32",
    category: "Security of Processing",
    status: "Review Needed",
    lastChecked: "2026-05-10",
    details:
      "Customer PII handling policy pending review. Encryption is implemented but documented controls need update.",
  },
  {
    standard: "SOC 2 Type II",
    category: "Availability & Confidentiality",
    status: "Compliant",
    lastChecked: "2026-05-12",
    details: "Platform uptime 99.9%. All sensitive data flows through encrypted channels.",
  },
  {
    standard: "FIPS 140-2",
    category: "Cryptographic Module Validation",
    status: "Compliant",
    lastChecked: "2026-05-15",
    details:
      "AES-GCM encryption with validated key derivation functions in use across all campaigns.",
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
};

export const ComplianceReport: React.FC = () => {
  const [activeSubTab, setActiveSubTab] = useState<"nist" | "overview">("nist");
  const { userAddress } = useWeb3();
  const { showNotification } = useNotification();
  const [isExporting, setIsExporting] = useState(false);

  const compliantCount = complianceItems.filter((c) => c.status === "Compliant").length;
  const reviewCount = complianceItems.filter((c) => c.status === "Review Needed").length;

  const handleQuickExport = async () => {
    setIsExporting(true);
    try {
      const activeAuditor =
        userAddress || "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5";
      await exportFullCompliancePack(activeAuditor);
      showNotification({
        type: "success",
        title: "Compliance Pack Exported",
        message: "Generated and downloaded formal NIST SP 800-53 PDF & JSON audit pack.",
      });
    } catch {
      showNotification({
        type: "error",
        title: "Export Failed",
        message: "Failed to generate compliance export pack.",
      });
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="space-y-6 w-full" id="compliance-report-view">
      {/* Top Header & Sub-Tab Switcher */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2">
        <div className="flex items-center gap-2 p-1 bg-slate-100 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-2xl w-fit">
          <button
            id="subtab-nist-scorecard"
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

          <button
            id="subtab-regulatory-overview"
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
        </div>

        {activeSubTab === "overview" && (
          <Button
            id="btn-overview-export-pack"
            onClick={handleQuickExport}
            disabled={isExporting}
            className="h-10 rounded-xl bg-zinc-900 dark:bg-indigo-600 text-white font-semibold shadow-sm text-xs px-4"
          >
            <Download className="w-4 h-4 mr-2" />
            {isExporting ? "Generating Pack..." : "Export Compliance Pack"}
          </Button>
        )}
      </div>

      {/* Main View Content */}
      {activeSubTab === "nist" ? (
        <NistScorecard />
      ) : (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-3xl font-extrabold text-zinc-900 dark:text-white tracking-tight">
                Regulatory Standards Overview
              </h2>
              <p className="text-zinc-500 dark:text-zinc-400 mt-2 font-medium">
                Security & regulatory framework compliance status across active campaigns
              </p>
            </div>
          </div>

          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card className="border border-slate-200 dark:border-zinc-800 rounded-2xl bg-white dark:bg-zinc-900/80 relative overflow-hidden">
              <div className="absolute top-0 left-0 w-1 h-full bg-emerald-500" />
              <CardContent className="p-6">
                <div className="text-3xl font-extrabold text-zinc-900 dark:text-white">
                  {compliantCount}/{complianceItems.length}
                </div>
                <div className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mt-2">
                  Standards Compliant
                </div>
              </CardContent>
            </Card>
            <Card className="border border-slate-200 dark:border-zinc-800 rounded-2xl bg-white dark:bg-zinc-900/80 relative overflow-hidden">
              <div className="absolute top-0 left-0 w-1 h-full bg-amber-500" />
              <CardContent className="p-6">
                <div className="text-3xl font-extrabold text-zinc-900 dark:text-white">
                  {reviewCount}
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
                  AES-256-GCM
                </div>
                <div className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mt-2">
                  Encryption Standard
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Compliance items */}
          <Card className="border border-slate-200 dark:border-zinc-800 shadow-sm bg-white dark:bg-zinc-900/50 rounded-3xl">
            <CardHeader className="pt-8 px-8 pb-6 border-b border-slate-100 dark:border-zinc-800/50">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-zinc-900 dark:bg-indigo-600 rounded-xl flex items-center justify-center shadow-md">
                  <FileCheck className="w-6 h-6 text-white" />
                </div>
                <div>
                  <CardTitle className="text-lg font-bold text-zinc-900 dark:text-white">
                    Regulatory Standards
                  </CardTitle>
                  <CardDescription className="text-zinc-500 dark:text-zinc-400 mt-1">
                    Compliance status for active security frameworks
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="divide-y divide-slate-100 dark:divide-zinc-800/50">
                {complianceItems.map((item, i) => {
                  const cfg = statusMap[item.status];
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

          {/* Bottom notice */}
          <Card className="border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/50 rounded-2xl">
            <CardContent className="p-6">
              <div className="flex items-start gap-4">
                <Lock className="w-5 h-5 text-indigo-600 dark:text-indigo-400 mt-0.5 shrink-0" />
                <div>
                  <p className="font-bold text-zinc-900 dark:text-white text-sm">
                    Audit Immutability
                  </p>
                  <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mt-1 leading-relaxed">
                    All compliance audit actions are immutably recorded on the Stellar network.
                    Timestamps, access grants and denial logs cannot be altered after they are
                    written.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
};
