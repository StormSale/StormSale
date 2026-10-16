import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import {
  Shield,
  TrendingUp,
  CheckCircle2,
  Clock,
  FileSearch,
  AlertTriangle,
  BarChart3,
  Flag,
  ShieldAlert,
  Send,
} from "lucide-react";
import { useState } from "react";

interface AuditorOverviewProps {
  onTabChange?: (tab: string) => void;
}

export const AuditorOverview: React.FC<AuditorOverviewProps> = ({ onTabChange }) => {
  const [reportedAnomalies, setReportedAnomalies] = useState<string[]>([]);

  const handleReportAnomaly = (id: string) => {
    setReportedAnomalies((prev) =>
      prev.includes(id) ? prev : [...prev, id]
    );
  };

  const stats = [
    { title: "Audits Completed", value: "47", change: "+5 this month", icon: CheckCircle2 },
    { title: "Active Requests", value: "3", change: "Pending review", icon: Clock },
    { title: "Success Rate", value: "98%", change: "+1.2% vs last month", icon: TrendingUp },
    { title: "Avg. Response Time", value: "2.3h", change: "–0.4h improved", icon: BarChart3 },
  ];

  const recentAudits = [
    { saleId: "1042", campaign: "Tech Gadgets Pro", status: "Verified", timestamp: "2 hours ago" },
    { saleId: "988", campaign: "Web3 Masterclass", status: "Verified", timestamp: "1 day ago" },
    { saleId: "776", campaign: "Crypto Tools Suite", status: "Denied", timestamp: "3 days ago" },
    { saleId: "654", campaign: "DeFi Starter Pack", status: "Verified", timestamp: "1 week ago" },
  ];

  const pendingRequests = [
    { saleId: "1100", campaign: "Summer Sale 2024", requestedBy: "GB12...34CD", urgency: "High" },
    { saleId: "1089", campaign: "NFT Drop Alpha", requestedBy: "GC78...90GH", urgency: "Medium" },
    { saleId: "1075", campaign: "DeFi Starter Pack", requestedBy: "GD34...56IJ", urgency: "Low" },
  ];

  const anomalies = [
    {
      id: "anomaly-1042",
      saleId: "1042",
      campaign: "Tech Gadgets Pro",
      type: "Wash Trading",
      severity: "High",
      detail: "12 rapid self-matched claims within 4 minutes from 3 linked wallets.",
      detectedAt: "18 min ago",
    },
    {
      id: "anomaly-988",
      saleId: "988",
      campaign: "Web3 Masterclass",
      type: "Rapid Claim",
      severity: "Medium",
      detail: "Claim velocity 6.4x above campaign baseline over the last hour.",
      detectedAt: "1 hour ago",
    },
    {
      id: "anomaly-776",
      saleId: "776",
      campaign: "Crypto Tools Suite",
      type: "Sybil Cluster",
      severity: "High",
      detail: "9 claimant addresses share a common funding source and nonce pattern.",
      detectedAt: "5 hours ago",
    },
  ];

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center bg-white dark:bg-zinc-900/50 p-6 md:p-8 rounded-3xl border border-slate-200 dark:border-zinc-800 shadow-sm">
        <div>
          <h1 className="text-2xl md:text-3xl font-extrabold text-zinc-900 dark:text-white tracking-tight">
            Auditor Dashboard
          </h1>
          <p className="text-zinc-500 dark:text-zinc-400 mt-2 font-medium">
            Oversee encrypted sale data access and maintain on-chain compliance.
          </p>
        </div>
        <div className="flex items-center gap-2 mt-6 lg:mt-0 px-4 py-2 bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-100 dark:border-indigo-500/20 rounded-full">
          <Shield className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
          <span className="text-sm font-bold text-indigo-700 dark:text-indigo-300">
            NIST/ISO Compliant
          </span>
        </div>
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

      {/* Anomaly Detection */}
      <Card className="border border-red-200 dark:border-red-500/30 shadow-sm rounded-2xl bg-white dark:bg-zinc-900/50">
        <CardHeader className="border-b border-red-100 dark:border-red-500/20 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-red-50 dark:bg-red-500/10 border border-red-100 dark:border-red-500/20 rounded-xl flex items-center justify-center shrink-0">
              <ShieldAlert className="w-5 h-5 text-red-600 dark:text-red-400" />
            </div>
            <div>
              <CardTitle className="text-lg font-bold text-zinc-900 dark:text-white">
                Suspicious Activity &amp; Anomaly Detection
              </CardTitle>
              <CardDescription className="text-zinc-500 dark:text-zinc-400">
                Wash-trading and rapid-claim patterns flagged by the detection engine
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-6">
          <div className="space-y-4">
            {anomalies.map((anomaly) => {
              const isReported = reportedAnomalies.includes(anomaly.id);
              return (
                <div
                  key={anomaly.id}
                  className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-4 bg-red-50/50 dark:bg-red-500/5 border border-red-100 dark:border-red-500/20 rounded-xl"
                >
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 bg-red-100 dark:bg-red-500/20 border border-red-200 dark:border-red-500/30 rounded-xl flex items-center justify-center shrink-0">
                      <AlertTriangle className="w-5 h-5 text-red-600 dark:text-red-400" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-sm text-zinc-900 dark:text-white">
                          {anomaly.campaign}
                        </span>
                        <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-400">
                          <Flag className="w-3 h-3" />
                          Red Flag
                        </span>
                        <span
                          className={`text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-full ${
                            anomaly.severity === "High"
                              ? "bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-400"
                              : "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400"
                          }`}
                        >
                          {anomaly.severity}
                        </span>
                      </div>
                      <div className="text-xs font-mono font-medium text-zinc-400 dark:text-zinc-500 mt-1">
                        {anomaly.type} · Sale #{anomaly.saleId} · {anomaly.detectedAt}
                      </div>
                      <p className="text-xs font-medium text-zinc-600 dark:text-zinc-400 mt-2">
                        {anomaly.detail}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 self-end md:self-center">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => onTabChange?.("verify")}
                      className="h-8 px-3 text-xs rounded-lg font-semibold border-slate-200 dark:border-zinc-700"
                    >
                      Inspect
                    </Button>
                    <Button
                      size="sm"
                      disabled={isReported}
                      onClick={() => handleReportAnomaly(anomaly.id)}
                      className={`h-8 px-3 text-xs rounded-lg font-semibold transition-colors ${
                        isReported
                          ? "bg-emerald-600 hover:bg-emerald-600 text-white cursor-default"
                          : "bg-red-600 hover:bg-red-500 text-white"
                      }`}
                    >
                      {isReported ? (
                        <>
                          <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                          Reported
                        </>
                      ) : (
                        <>
                          <Send className="w-3.5 h-3.5 mr-1" />
                          Report
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Two column */}
      <div className="grid lg:grid-cols-2 gap-8">
        {/* Recent Audit History */}
        <Card className="border border-slate-200 dark:border-zinc-800 shadow-sm rounded-2xl bg-white dark:bg-zinc-900/50">
          <CardHeader className="border-b border-slate-100 dark:border-zinc-800/50 pb-4">
            <CardTitle className="text-lg font-bold text-zinc-900 dark:text-white">
              Recent Audits
            </CardTitle>
            <CardDescription className="text-zinc-500 dark:text-zinc-400">
              Latest access verifications
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-6">
            <div className="space-y-4">
              {recentAudits.map((audit, i) => (
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
                      onClick={() => onTabChange?.("verify")}
                      className="h-7 px-3 text-xs bg-zinc-900 hover:bg-zinc-800 dark:bg-indigo-600 dark:hover:bg-indigo-500 text-white rounded-lg font-semibold transition-colors"
                    >
                      Review
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
