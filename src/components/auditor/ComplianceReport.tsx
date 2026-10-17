import type { ComponentType } from "react";
import { useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { FileCheck, AlertTriangle, CheckCircle2, Download, Clock, Lock, Flag, ShieldAlert, X } from "lucide-react";

const complianceItems = [
  {
    standard: "NIST SP 800-53",
    category: "Access Control (AC)",
    status: "Compliant",
    lastChecked: "2026-05-16",
    details:
      "All audit access operations use cryptographic key verification before granting data access.",
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
};

export const ComplianceReport = () => {
  const compliant = complianceItems.filter((c) => c.status === "Compliant").length;
  const review = complianceItems.filter((c) => c.status === "Review Needed").length;
  const [reportedFlags, setReportedFlags] = useState<Record<string, boolean>>({});
  const [dismissedFlags, setDismissedFlags] = useState<Record<string, boolean>>({});

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-extrabold text-zinc-900 dark:text-white tracking-tight">
            Compliance Report
          </h2>
          <p className="text-zinc-500 dark:text-zinc-400 mt-2 font-medium">
            Security & regulatory compliance status for active campaigns
          </p>
        </div>
        <Button className="h-10 rounded-xl bg-zinc-900 dark:bg-indigo-600 text-white font-semibold shadow-sm">
          <Download className="w-4 h-4 mr-2" />
          Export PDF Report
        </Button>
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

      {/* Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="border border-slate-200 dark:border-zinc-800 rounded-2xl bg-white dark:bg-zinc-900/80 relative overflow-hidden">
          <div className="absolute top-0 left-0 w-1 h-full bg-emerald-500" />
          <CardContent className="p-6">
            <div className="text-3xl font-extrabold text-zinc-900 dark:text-white">
              {compliant}/{complianceItems.length}
            </div>
            <div className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mt-2">
              Standards Compliant
            </div>
          </CardContent>
        </Card>
        <Card className="border border-slate-200 dark:border-zinc-800 rounded-2xl bg-white dark:bg-zinc-900/80 relative overflow-hidden">
          <div className="absolute top-0 left-0 w-1 h-full bg-amber-500" />
          <CardContent className="p-6">
            <div className="text-3xl font-extrabold text-zinc-900 dark:text-white">{review}</div>
            <div className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mt-2">
              Require Review
            </div>
          </CardContent>
        </Card>
        <Card className="border border-slate-200 dark:border-zinc-800 rounded-2xl bg-white dark:bg-zinc-900/80 relative overflow-hidden">
          <div className="absolute top-0 left-0 w-1 h-full bg-indigo-500" />
          <CardContent className="p-6">
            <div className="text-3xl font-extrabold text-zinc-900 dark:text-white">AES-256</div>
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
              const cfg = statusMap[item.status] ?? statusMap["Review Needed"];
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

      {/* Bottom notice */}
      <Card className="border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/50 rounded-2xl">
        <CardContent className="p-6">
          <div className="flex items-start gap-4">
            <Lock className="w-5 h-5 text-indigo-600 dark:text-indigo-400 mt-0.5 shrink-0" />
            <div>
              <p className="font-bold text-zinc-900 dark:text-white text-sm">Audit Immutability</p>
              <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mt-1 leading-relaxed">
                All compliance audit actions are immutably recorded on the Stellar network.
                Timestamps, access grants and denial logs cannot be altered after they are written.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
