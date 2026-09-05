import type { ComponentType } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { CheckCircle2, AlertTriangle, Clock, FileText, Download, Filter } from "lucide-react";

type AuditStatus = "Verified" | "Denied" | "Pending";

interface AuditRecord {
  saleId: string;
  campaign: string;
  campaignAddress: string;
  status: AuditStatus;
  timestamp: string;
  notes: string;
}

const auditRecords: AuditRecord[] = [
  {
    saleId: "1042",
    campaign: "Tech Gadgets Pro",
    campaignAddress: "CA7Q...1234",
    status: "Verified",
    timestamp: "2026-05-16 08:12",
    notes: "Full decryption performed",
  },
  {
    saleId: "988",
    campaign: "Web3 Masterclass",
    campaignAddress: "CB9E...5678",
    status: "Verified",
    timestamp: "2026-05-15 14:30",
    notes: "Compliance check passed",
  },
  {
    saleId: "776",
    campaign: "Crypto Tools Suite",
    campaignAddress: "CC2K...9012",
    status: "Denied",
    timestamp: "2026-05-13 10:05",
    notes: "Key not authorized by advertiser",
  },
  {
    saleId: "654",
    campaign: "DeFi Starter Pack",
    campaignAddress: "CD4M...3456",
    status: "Verified",
    timestamp: "2026-05-10 17:45",
    notes: "Regulatory audit complete",
  },
  {
    saleId: "512",
    campaign: "NFT Drop Alpha",
    campaignAddress: "CE6P...7890",
    status: "Pending",
    timestamp: "2026-05-09 09:20",
    notes: "Awaiting advertiser approval",
  },
  {
    saleId: "489",
    campaign: "Summer Sale 2024",
    campaignAddress: "CF8R...2345",
    status: "Verified",
    timestamp: "2026-05-07 13:10",
    notes: "Standard audit review",
  },
];

const statusConfig: Record<
  AuditStatus,
  { label: string; icon: ComponentType<{ className?: string }>; badge: string }
> = {
  Verified: {
    label: "Verified",
    icon: CheckCircle2,
    badge: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400",
  },
  Denied: {
    label: "Denied",
    icon: AlertTriangle,
    badge: "bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-400",
  },
  Pending: {
    label: "Pending",
    icon: Clock,
    badge: "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400",
  },
};

export const AuditHistory = () => {
  const verified = auditRecords.filter((r) => r.status === "Verified").length;
  const denied = auditRecords.filter((r) => r.status === "Denied").length;
  const pending = auditRecords.filter((r) => r.status === "Pending").length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-extrabold text-zinc-900 dark:text-white tracking-tight">
            Audit History
          </h2>
          <p className="text-zinc-500 dark:text-zinc-400 mt-2 font-medium">
            Full log of your on-chain audit activities
          </p>
        </div>
        <div className="flex gap-3">
          <Button
            variant="outline"
            className="h-10 rounded-xl border border-slate-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 font-semibold"
          >
            <Filter className="w-4 h-4 mr-2" />
            Filter
          </Button>
          <Button className="h-10 rounded-xl bg-zinc-900 dark:bg-indigo-600 text-white font-semibold shadow-sm">
            <Download className="w-4 h-4 mr-2" />
            Export CSV
          </Button>
        </div>
      </div>

      {/* Summary pills */}
      <div className="flex flex-wrap gap-3">
        <div className="flex items-center gap-2 px-4 py-2 bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-100 dark:border-emerald-500/20 rounded-full">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
          <span className="text-sm font-bold text-emerald-700 dark:text-emerald-400">
            {verified} Verified
          </span>
        </div>
        <div className="flex items-center gap-2 px-4 py-2 bg-red-50 dark:bg-red-500/10 border border-red-100 dark:border-red-500/20 rounded-full">
          <AlertTriangle className="w-4 h-4 text-red-500 dark:text-red-400" />
          <span className="text-sm font-bold text-red-700 dark:text-red-400">{denied} Denied</span>
        </div>
        <div className="flex items-center gap-2 px-4 py-2 bg-amber-50 dark:bg-amber-500/10 border border-amber-100 dark:border-amber-500/20 rounded-full">
          <Clock className="w-4 h-4 text-amber-600 dark:text-amber-400" />
          <span className="text-sm font-bold text-amber-700 dark:text-amber-400">
            {pending} Pending
          </span>
        </div>
      </div>

      {/* Records */}
      <Card className="border border-slate-200 dark:border-zinc-800 shadow-sm bg-white dark:bg-zinc-900/50 rounded-3xl">
        <CardHeader className="pt-8 px-8 pb-6 border-b border-slate-100 dark:border-zinc-800/50">
          <CardTitle className="text-lg font-bold text-zinc-900 dark:text-white">
            All Audit Records
          </CardTitle>
          <CardDescription className="text-zinc-500 dark:text-zinc-400">
            {auditRecords.length} total entries logged on-chain
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="divide-y divide-slate-100 dark:divide-zinc-800/50">
            {auditRecords.map((record, i) => {
              const cfg = statusConfig[record.status];
              const StatusIcon = cfg.icon;
              return (
                <div
                  key={i}
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 px-8 py-5 hover:bg-slate-50/50 dark:hover:bg-zinc-900/30 transition-colors"
                >
                  <div className="flex items-center gap-4">
                    <div
                      className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                        record.status === "Verified"
                          ? "bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-100 dark:border-indigo-500/20"
                          : record.status === "Denied"
                            ? "bg-red-50 dark:bg-red-500/10 border border-red-100 dark:border-red-500/20"
                            : "bg-amber-50 dark:bg-amber-500/10 border border-amber-100 dark:border-amber-500/20"
                      }`}
                    >
                      <StatusIcon
                        className={`w-5 h-5 ${
                          record.status === "Verified"
                            ? "text-indigo-600 dark:text-indigo-400"
                            : record.status === "Denied"
                              ? "text-red-500 dark:text-red-400"
                              : "text-amber-600 dark:text-amber-400"
                        }`}
                      />
                    </div>
                    <div>
                      <div className="font-bold text-sm text-zinc-900 dark:text-white">
                        {record.campaign}
                      </div>
                      <div className="text-xs font-mono text-zinc-400 dark:text-zinc-500 mt-0.5">
                        Sale #{record.saleId} · {record.campaignAddress}
                      </div>
                      <div className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mt-1 flex items-center gap-1">
                        <FileText className="w-3 h-3" />
                        {record.notes}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 sm:flex-col sm:items-end">
                    <span
                      className={`inline-flex text-[10px] uppercase tracking-wider font-bold px-3 py-1 rounded-full ${cfg.badge}`}
                    >
                      {cfg.label}
                    </span>
                    <div className="text-xs font-medium text-zinc-400 dark:text-zinc-500">
                      {record.timestamp}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
