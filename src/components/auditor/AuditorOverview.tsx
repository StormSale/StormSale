import React, { useState, useEffect } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { MasterDecryptionPortal } from "./MasterDecryptionPortal";
import {
  getDecryptionAuditLogs,
  AUDIT_LOG_EVENT,
} from "../../lib/masterDecryptionService";
import type { DecryptionAuditLogEntry } from "../../types/masterDecryption";
import {
  Shield,
  TrendingUp,
  CheckCircle2,
  Clock,
  FileSearch,
  AlertTriangle,
  BarChart3,
  Unlock,
} from "lucide-react";

interface AuditorOverviewProps {
  onTabChange?: (tab: string) => void;
}

export const AuditorOverview: React.FC<AuditorOverviewProps> = ({ onTabChange }) => {
  const [selectedSaleForPortal, setSelectedSaleForPortal] = useState<string>("1042");
  const [auditLogs, setAuditLogs] = useState<DecryptionAuditLogEntry[]>([]);

  useEffect(() => {
    setAuditLogs(getDecryptionAuditLogs());

    const handleUpdate = () => {
      setAuditLogs(getDecryptionAuditLogs());
    };

    window.addEventListener(AUDIT_LOG_EVENT, handleUpdate);
    return () => window.removeEventListener(AUDIT_LOG_EVENT, handleUpdate);
  }, []);

  const totalAuditsCount = 47 + auditLogs.length;

  const stats = [
    {
      title: "Audits Completed",
      value: String(totalAuditsCount),
      change: `+${auditLogs.length} decrypted live`,
      icon: CheckCircle2,
    },
    { title: "Active Requests", value: "3", change: "Pending review", icon: Clock },
    { title: "Success Rate", value: "98%", change: "+1.2% vs last month", icon: TrendingUp },
    { title: "Avg. Response Time", value: "2.3h", change: "–0.4h improved", icon: BarChart3 },
  ];

  // Merge live decrypted logs with base recent audits
  const baseRecentAudits = [
    { saleId: "1042", campaign: "Tech Gadgets Pro", status: "Verified", timestamp: "2 hours ago" },
    { saleId: "988", campaign: "Web3 Masterclass", status: "Verified", timestamp: "1 day ago" },
    { saleId: "776", campaign: "Crypto Tools Suite", status: "Denied", timestamp: "3 days ago" },
    { saleId: "654", campaign: "DeFi Starter Pack", status: "Verified", timestamp: "1 week ago" },
  ];

  const dynamicRecentAudits = [
    ...auditLogs.slice(0, 3).map((log) => ({
      saleId: log.saleId.replace("#", ""),
      campaign: log.campaign,
      status: log.status,
      timestamp: new Date(log.timestamp).toLocaleTimeString(),
    })),
    ...baseRecentAudits,
  ].slice(0, 5);

  const pendingRequests = [
    { saleId: "1100", campaign: "Summer Sale 2024", requestedBy: "GB12...34CD", urgency: "High" },
    { saleId: "1089", campaign: "NFT Drop Alpha", requestedBy: "GC78...90GH", urgency: "Medium" },
    { saleId: "1075", campaign: "DeFi Starter Pack", requestedBy: "GD34...56IJ", urgency: "Low" },
  ];

  const handleReviewSale = (saleIdToReview: string) => {
    setSelectedSaleForPortal(saleIdToReview);
    const portalElement = document.getElementById("master-decryption-portal");
    if (portalElement) {
      portalElement.scrollIntoView({ behavior: "smooth" });
    }
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center bg-white dark:bg-zinc-900/50 p-6 md:p-8 rounded-3xl border border-slate-200 dark:border-zinc-800 shadow-sm">
        <div>
          <h1 className="text-2xl md:text-3xl font-extrabold text-zinc-900 dark:text-white tracking-tight">
            Auditor Dashboard
          </h1>
          <p className="text-zinc-500 dark:text-zinc-400 mt-2 font-medium">
            Oversee encrypted sale data access, execute authorized master decryptions, and maintain on-chain compliance.
          </p>
        </div>
        <div className="flex items-center gap-2 mt-6 lg:mt-0 px-4 py-2 bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-100 dark:border-indigo-500/20 rounded-full">
          <Shield className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
          <span className="text-sm font-bold text-indigo-700 dark:text-indigo-300">
            NIST/ISO Compliant
          </span>
        </div>
      </div>

      {/* Authorized Master Decryption Portal Anchor */}
      <div id="master-decryption-portal">
        <MasterDecryptionPortal
          initialSaleId={selectedSaleForPortal}
          onAuditLogged={(newLog) => {
            setAuditLogs((prev) => [newLog, ...prev.filter((l) => l.id !== newLog.id)]);
          }}
        />
      </div>

      {/* Zero-Knowledge Privacy Clearance Banner */}
      <div className="p-6 rounded-3xl bg-gradient-to-r from-indigo-900/10 via-purple-900/10 to-indigo-950/10 dark:from-indigo-950/40 dark:via-purple-950/30 dark:to-zinc-900/80 border border-indigo-200/60 dark:border-indigo-800/50 shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="space-y-1">
          <div className="flex items-center space-x-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
              Zero-Knowledge Verification
            </span>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-300">
              Bulletproofs WASM &lt; 500ms
            </span>
          </div>
          <h3 className="text-lg font-bold text-zinc-900 dark:text-white">
            Verify Private Sale Range ($10 – $5,000)
          </h3>
          <p className="text-xs text-zinc-600 dark:text-zinc-400 max-w-xl">
            Cryptographically certify that customer transactions stay within approved thresholds
            without decrypting sensitive transaction data.
          </p>
        </div>
        <Button
          onClick={() => onTabChange?.("zk-range")}
          className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-2xl h-11 px-5 text-xs shadow-md shrink-0 flex items-center gap-2"
        >
          <Shield className="w-4 h-4" />
          <span>Launch ZK Verifier</span>
        </Button>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {stats.map((stat, i) => {
          const Icon = stat.icon;
          return (
            <Card
              key={i}
              className="bg-white dark:bg-zinc-900/80 shadow-sm border border-slate-200 dark:border-zinc-800 hover:shadow-md transition-shadow rounded-2xl"
            >
              <CardContent className="p-6">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                      {stat.title}
                    </p>
                    <p className="text-2xl font-extrabold text-zinc-900 dark:text-white mt-2 mb-1">
                      {stat.value}
                    </p>
                    <p className="text-xs font-medium text-indigo-600 dark:text-indigo-400">
                      {stat.change}
                    </p>
                  </div>
                  <div className="w-10 h-10 bg-slate-100 dark:bg-zinc-800 rounded-xl flex items-center justify-center border border-slate-200 dark:border-zinc-700 shrink-0">
                    <Icon className="w-5 h-5 text-zinc-900 dark:text-indigo-400" />
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Two column */}
      <div className="grid lg:grid-cols-2 gap-8">
        {/* Recent Audit History */}
        <Card className="border border-slate-200 dark:border-zinc-800 shadow-sm rounded-2xl bg-white dark:bg-zinc-900/50">
          <CardHeader className="border-b border-slate-100 dark:border-zinc-800/50 pb-4">
            <CardTitle className="text-lg font-bold text-zinc-900 dark:text-white">
              Recent Audits
            </CardTitle>
            <CardDescription className="text-zinc-500 dark:text-zinc-400">
              Latest access verifications & decryptions
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-6">
            <div className="space-y-4">
              {dynamicRecentAudits.map((audit, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between p-4 bg-slate-50 dark:bg-zinc-950/50 border border-slate-100 dark:border-zinc-800/50 rounded-xl hover:border-slate-200 dark:hover:border-zinc-700 transition-colors"
                >
                  <div className="flex items-center space-x-3">
                    <div
                      className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                        audit.status === "Verified"
                          ? "bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-100 dark:border-indigo-500/20"
                          : "bg-red-50 dark:bg-red-500/10 border border-red-100 dark:border-red-500/20"
                      }`}
                    >
                      {audit.status === "Verified" ? (
                        <CheckCircle2 className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                      ) : (
                        <AlertTriangle className="w-5 h-5 text-red-500 dark:text-red-400" />
                      )}
                    </div>
                    <div>
                      <div className="font-bold text-sm text-zinc-900 dark:text-white">
                        {audit.campaign}
                      </div>
                      <div className="text-xs font-mono font-medium text-zinc-400 dark:text-zinc-500 mt-0.5">
                        Sale #{audit.saleId}
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <span
                      className={`inline-flex text-[10px] uppercase tracking-wider font-bold px-2 py-1 rounded-full ${
                        audit.status === "Verified"
                          ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400"
                          : "bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-400"
                      }`}
                    >
                      {audit.status}
                    </span>
                    <div className="text-xs font-medium text-zinc-400 dark:text-zinc-500 mt-1">
                      {audit.timestamp}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Pending Access Requests */}
        <Card className="border border-slate-200 dark:border-zinc-800 shadow-sm rounded-2xl bg-white dark:bg-zinc-900/50">
          <CardHeader className="border-b border-slate-100 dark:border-zinc-800/50 pb-4">
            <CardTitle className="text-lg font-bold text-zinc-900 dark:text-white">
              Pending Requests
            </CardTitle>
            <CardDescription className="text-zinc-500 dark:text-zinc-400">
              Audit access requests awaiting review
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-6">
            <div className="space-y-4">
              {pendingRequests.map((req, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between p-4 bg-slate-50 dark:bg-zinc-950/50 border border-slate-100 dark:border-zinc-800/50 rounded-xl"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-amber-50 dark:bg-amber-500/10 border border-amber-100 dark:border-amber-500/20 rounded-xl flex items-center justify-center shrink-0">
                      <FileSearch className="w-5 h-5 text-amber-600 dark:text-amber-400" />
                    </div>
                    <div>
                      <div className="font-bold text-sm text-zinc-900 dark:text-white">
                        {req.campaign}
                      </div>
                      <div className="text-xs font-mono text-zinc-400 dark:text-zinc-500 mt-0.5">
                        {req.requestedBy} · Sale #{req.saleId}
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <span
                      className={`text-[10px] uppercase tracking-wider font-bold px-2 py-1 rounded-full ${
                        req.urgency === "High"
                          ? "bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-400"
                          : req.urgency === "Medium"
                            ? "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400"
                            : "bg-slate-200 text-slate-600 dark:bg-zinc-800 dark:text-zinc-400"
                      }`}
                    >
                      {req.urgency}
                    </span>
                    <Button
                      size="sm"
                      onClick={() => handleReviewSale(req.saleId)}
                      className="h-7 px-3 text-xs bg-zinc-900 hover:bg-zinc-800 dark:bg-indigo-600 dark:hover:bg-indigo-500 text-white rounded-lg font-semibold transition-colors flex items-center gap-1"
                    >
                      <span>Decrypt</span>
                      <Unlock className="w-3 h-3" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

