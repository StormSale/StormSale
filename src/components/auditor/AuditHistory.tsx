import { useState, type ComponentType } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { useAuditorTenancy } from "../../context/AuditorTenancyContext";
import { recordsScopedToOrg } from "../../lib/auditorTenancy";
import {
  CheckCircle2,
  AlertTriangle,
  Clock,
  FileText,
  Download,
  Filter,
  Eye,
  GitFork,
  History,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { getExportAuditHistory } from "../../lib/auditor/exportService";

type AuditStatus = "Verified" | "Denied" | "Pending";
type StepStatus = "complete" | "current" | "denied";

interface AuditHistoryProps {
  onTabChange?: (tab: string) => void;
  onViewMerkleProof?: (saleId: string, campaign: string) => void;
}

interface AuditLifecycleStep {
  eventId: string;
  title: string;
  timestamp: string;
  blockNumber?: number;
  actor: string;
  detail: string;
  status: StepStatus;
}

interface AuditRecord {
  saleId: string;
  campaign: string;
  campaignAddress: string;
  status: AuditStatus;
  timestamp: string;
  blockNumber?: number;
  notes: string;
  steps?: AuditLifecycleStep[];
}

const ALL_AUDIT_RECORDS: AuditRecord[] = [
  {
    saleId: "1042",
    campaign: "Tech Gadgets Pro",
    campaignAddress: "CA7Q...1234",
    status: "Verified",
    timestamp: "2026-05-16 08:12",
    blockNumber: 6_204_200,
    notes: "Full decryption performed",
  },
  {
    saleId: "988",
    campaign: "Web3 Masterclass",
    campaignAddress: "CB9E...5678",
    status: "Verified",
    timestamp: "2026-05-15 14:30",
    blockNumber: 6_204_100,
    notes: "Compliance check passed",
  },
  {
    saleId: "776",
    campaign: "Crypto Tools Suite",
    campaignAddress: "CC2K...9012",
    status: "Denied",
    timestamp: "2026-05-13 10:05",
    blockNumber: 6_203_800,
    notes: "Key not authorized by advertiser",
  },
  {
    saleId: "654",
    campaign: "DeFi Starter Pack",
    campaignAddress: "CD4M...3456",
    status: "Verified",
    timestamp: "2026-05-10 17:45",
    blockNumber: 6_203_500,
    notes: "Regulatory audit complete",
  },
  {
    saleId: "512",
    campaign: "NFT Drop Alpha",
    campaignAddress: "CE6P...7890",
    status: "Pending",
    timestamp: "2026-05-09 09:20",
    blockNumber: 6_202_900,
    notes: "Awaiting advertiser approval",
  },
  {
    saleId: "489",
    campaign: "Summer Sale 2024",
    campaignAddress: "CF8R...2345",
    status: "Verified",
    timestamp: "2026-05-07 13:10",
    blockNumber: 6_202_400,
    notes: "Standard audit review",
  },
];

function timestampBefore(timestamp: string, minutes: number): string {
  const date = new Date(`${timestamp.replace(" ", "T")}Z`);
  return new Date(date.getTime() - minutes * 60_000).toISOString().slice(0, 19).replace("T", " ");
}

function buildLifecycleSteps(record: AuditRecord): AuditLifecycleStep[] {
  if (!record.blockNumber) {
    return [
      {
        eventId: `${record.saleId}-export`,
        title: "Evidence pack exported",
        timestamp: record.timestamp,
        actor: "Authorized auditor",
        detail: record.notes,
        status: "complete",
      },
    ];
  }

  const decisionStatus: StepStatus =
    record.status === "Verified" ? "complete" : record.status === "Denied" ? "denied" : "current";
  const steps: AuditLifecycleStep[] = [
    {
      eventId: `${record.saleId}-created`,
      title: "Campaign registered",
      timestamp: timestampBefore(record.timestamp, 180),
      blockNumber: record.blockNumber - 30,
      actor: "Advertiser",
      detail: `Campaign contract ${record.campaignAddress} registered with encrypted sale terms.`,
      status: "complete",
    },
    {
      eventId: `${record.saleId}-funded`,
      title: "Escrow funded",
      timestamp: timestampBefore(record.timestamp, 120),
      blockNumber: record.blockNumber - 20,
      actor: "Campaign escrow contract",
      detail: "Budget locked and commission settlement rules activated.",
      status: "complete",
    },
    {
      eventId: `${record.saleId}-requested`,
      title: "Read-only access requested",
      timestamp: timestampBefore(record.timestamp, 60),
      blockNumber: record.blockNumber - 10,
      actor: "Auditor",
      detail: `Audit scope requested for sale #${record.saleId}; no wallet signing rights granted.`,
      status: "complete",
    },
    {
      eventId: `${record.saleId}-decision`,
      title:
        record.status === "Verified"
          ? "Audit verified"
          : record.status === "Denied"
            ? "Access denied"
            : "Advertiser approval pending",
      timestamp: record.timestamp,
      blockNumber: record.blockNumber,
      actor: record.status === "Pending" ? "Advertiser" : "Audit policy engine",
      detail: record.notes,
      status: decisionStatus,
    },
  ];

  if (record.status === "Verified") {
    steps.push({
      eventId: `${record.saleId}-sealed`,
      title: "Evidence receipt sealed",
      timestamp: timestampBefore(record.timestamp, -5),
      blockNumber: record.blockNumber + 2,
      actor: "Audit trail",
      detail: "Decision metadata sealed with the campaign audit receipt for later verification.",
      status: "complete",
    });
  }
  return steps;
}

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

const stepStyles: Record<StepStatus, { marker: string; label: string }> = {
  complete: {
    marker: "border-emerald-500 bg-emerald-500 text-white",
    label: "text-emerald-600 dark:text-emerald-400",
  },
  current: {
    marker: "border-amber-500 bg-amber-100 text-amber-600 dark:bg-amber-500/20 dark:text-amber-400",
    label: "text-amber-600 dark:text-amber-400",
  },
  denied: {
    marker: "border-red-500 bg-red-500 text-white",
    label: "text-red-600 dark:text-red-400",
  },
};

export const AuditHistory: React.FC<AuditHistoryProps> = ({ onTabChange, onViewMerkleProof }) => {
  const { org } = useAuditorTenancy();
  const [expandedSaleId, setExpandedSaleId] = useState<string | null>(null);
  const auditRecords = recordsScopedToOrg(org.id, ALL_AUDIT_RECORDS);
  const dynamicRecords: AuditRecord[] = [
    ...getExportAuditHistory().map((evt) => ({
      saleId: `SOC2-${evt.id.slice(0, 6)}`,
      campaign: `SOC 2 Evidence Pack (${evt.filename})`,
      campaignAddress: evt.exporterAddress,
      status: "Verified" as AuditStatus,
      timestamp: evt.timestamp.slice(0, 16).replace("T", " "),
      notes: `Root: ${evt.rootDigest.slice(0, 12)}... (${evt.totalFiles} files bundled)`,
    })),
    ...auditRecords,
  ];

  const verified = dynamicRecords.filter((record) => record.status === "Verified").length;
  const denied = dynamicRecords.filter((record) => record.status === "Denied").length;
  const pending = dynamicRecords.filter((record) => record.status === "Pending").length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-extrabold text-zinc-900 dark:text-white tracking-tight">
            Audit History
          </h2>
          <p className="text-zinc-500 dark:text-zinc-400 mt-2 font-medium">
            Read-only trail for{" "}
            <span className="text-indigo-600 dark:text-indigo-400 font-bold">{org.name}</span>
          </p>
        </div>
        <div className="flex gap-3 items-center">
          <span className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-50 dark:bg-amber-500/10 border border-amber-100 dark:border-amber-500/20 text-[11px] font-bold text-amber-700 dark:text-amber-400">
            <Eye className="w-3.5 h-3.5" />
            Scoped: {auditRecords.length} of {ALL_AUDIT_RECORDS.length} campaign records
          </span>
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

      <Card className="border border-slate-200 dark:border-zinc-800 shadow-sm bg-white dark:bg-zinc-900/50 rounded-3xl">
        <CardHeader className="pt-8 px-8 pb-6 border-b border-slate-100 dark:border-zinc-800/50">
          <CardTitle className="text-lg font-bold text-zinc-900 dark:text-white">
            Campaign Audit Lifecycles
          </CardTitle>
          <CardDescription className="text-zinc-500 dark:text-zinc-400">
            Expand a campaign to inspect each block-referenced decision and its metadata.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="divide-y divide-slate-100 dark:divide-zinc-800/50">
            {dynamicRecords.length === 0 && (
              <p className="px-8 py-10 text-sm font-medium text-zinc-400 dark:text-zinc-500 text-center">
                No audit records exist within the {org.shortName} scope.
              </p>
            )}
            {dynamicRecords.map((record) => {
              const cfg = statusConfig[record.status];
              const StatusIcon = cfg.icon;
              const expanded = expandedSaleId === record.saleId;
              const timelineId = `audit-timeline-${record.saleId}`;
              const steps = record.steps ?? buildLifecycleSteps(record);
              return (
                <div key={record.saleId}>
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 px-8 py-5 hover:bg-slate-50/50 dark:hover:bg-zinc-900/30 transition-colors">
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
                          {record.blockNumber
                            ? ` · Block #${record.blockNumber.toLocaleString()}`
                            : ""}
                        </div>
                        <div className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mt-1 flex items-center gap-1">
                          <FileText className="w-3 h-3" />
                          {record.notes}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 sm:flex-col sm:items-end">
                      <span
                        className={`inline-flex text-[10px] uppercase tracking-wider font-bold px-3 py-1 rounded-full ${cfg.badge}`}
                      >
                        {cfg.label}
                      </span>
                      <div className="text-xs font-medium text-zinc-400 dark:text-zinc-500">
                        {record.timestamp} UTC
                      </div>
                      <div className="flex items-center gap-2">
                        {record.status === "Verified" && (onViewMerkleProof || onTabChange) && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              if (onViewMerkleProof) {
                                onViewMerkleProof(record.saleId, record.campaign);
                              } else if (onTabChange) {
                                onTabChange("merkle");
                              }
                            }}
                            className="h-6 px-2 text-[10px] font-bold text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 flex items-center gap-1"
                          >
                            <GitFork className="w-3 h-3" />
                            Merkle Proof
                          </Button>
                        )}
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          aria-expanded={expanded}
                          aria-controls={timelineId}
                          onClick={() => setExpandedSaleId(expanded ? null : record.saleId)}
                          className="h-6 px-2 text-[10px] font-bold text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 flex items-center gap-1"
                        >
                          <History className="w-3 h-3" />
                          {expanded ? "Hide timeline" : "View timeline"}
                          {expanded ? (
                            <ChevronUp className="w-3 h-3" />
                          ) : (
                            <ChevronDown className="w-3 h-3" />
                          )}
                        </Button>
                      </div>
                    </div>
                  </div>
                  {expanded && (
                    <div
                      id={timelineId}
                      className="px-8 py-6 bg-slate-50/70 dark:bg-zinc-950/40 border-t border-slate-100 dark:border-zinc-800/50"
                    >
                      <ol className="space-y-0">
                        {steps.map((step, index) => (
                          <li key={step.eventId} className="relative flex gap-4 pb-6 last:pb-0">
                            {index < steps.length - 1 && (
                              <span
                                aria-hidden="true"
                                className="absolute left-3 top-6 h-full w-px bg-slate-200 dark:bg-zinc-700"
                              />
                            )}
                            <span
                              aria-hidden="true"
                              className={`relative z-10 mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 text-[10px] font-bold ${stepStyles[step.status].marker}`}
                            >
                              {index + 1}
                            </span>
                            <div className="min-w-0 flex-1 rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/70 p-4">
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <h4 className="text-sm font-bold text-zinc-900 dark:text-white">
                                  {step.title}
                                </h4>
                                <span
                                  className={`text-[10px] font-bold uppercase tracking-wider ${stepStyles[step.status].label}`}
                                >
                                  {step.status}
                                </span>
                              </div>
                              <p className="mt-1 text-xs leading-relaxed text-zinc-600 dark:text-zinc-400">
                                {step.detail}
                              </p>
                              <dl className="mt-3 grid gap-3 text-[11px] sm:grid-cols-2 lg:grid-cols-4">
                                <div>
                                  <dt className="font-bold uppercase tracking-wider text-zinc-400">
                                    Block
                                  </dt>
                                  <dd className="mt-0.5 font-mono text-zinc-700 dark:text-zinc-300">
                                    {step.blockNumber
                                      ? `#${step.blockNumber.toLocaleString()}`
                                      : "Off-chain export"}
                                  </dd>
                                </div>
                                <div>
                                  <dt className="font-bold uppercase tracking-wider text-zinc-400">
                                    Timestamp
                                  </dt>
                                  <dd className="mt-0.5 font-mono text-zinc-700 dark:text-zinc-300">
                                    {step.timestamp} UTC
                                  </dd>
                                </div>
                                <div>
                                  <dt className="font-bold uppercase tracking-wider text-zinc-400">
                                    Actor
                                  </dt>
                                  <dd className="mt-0.5 text-zinc-700 dark:text-zinc-300">
                                    {step.actor}
                                  </dd>
                                </div>
                                <div>
                                  <dt className="font-bold uppercase tracking-wider text-zinc-400">
                                    Event ID
                                  </dt>
                                  <dd className="mt-0.5 font-mono text-zinc-700 dark:text-zinc-300">
                                    {step.eventId}
                                  </dd>
                                </div>
                              </dl>
                            </div>
                          </li>
                        ))}
                      </ol>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
