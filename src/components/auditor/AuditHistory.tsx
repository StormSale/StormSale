import type { ComponentType } from "react";
import { useMemo, useState } from "react";
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
  Download,
  Eye,
  GitFork,
  Search,
} from "lucide-react";
import { getExportAuditHistory } from "../../lib/auditor/exportService";
import { readAuditLedger } from "../../lib/auditLedger";

type AuditStatus = "Verified" | "Denied" | "Pending";

interface AuditHistoryProps {
  onTabChange?: (tab: string) => void;
  onViewMerkleProof?: (saleId: string, campaign: string) => void;
}

interface AuditRecord {
  saleId: string;
  campaign: string;
  campaignAddress: string;
  walletAddress?: string;
  status: AuditStatus;
  timestamp: string;
  notes: string;
}

const AUDIT_ROW_HEIGHT = 96;
const AUDIT_VIEWPORT_HEIGHT = 480;
const AUDIT_OVERSCAN = 6;

const ALL_AUDIT_RECORDS: AuditRecord[] = [
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

export const AuditHistory: React.FC<AuditHistoryProps> = ({
  onTabChange,
  onViewMerkleProof,
}) => {
  const { org } = useAuditorTenancy();
  const [walletFilter, setWalletFilter] = useState("");
  const [scrollState, setScrollState] = useState({ orgId: org.id, top: 0 });
  const scrollTop = scrollState.orgId === org.id ? scrollState.top : 0;
  // Tenant boundary: the trail only ever shows this organization's sales.
  const auditRecords = useMemo(() => recordsScopedToOrg(org.id, ALL_AUDIT_RECORDS), [org.id]);
  const dynamicRecords = useMemo<AuditRecord[]>(() => {
    const ledgerRecords = recordsScopedToOrg(org.id, readAuditLedger()).map((event) => ({
      saleId: event.saleId,
      campaign: `Platform audit: ${event.action.replaceAll("_", " ")}`,
      campaignAddress: event.campaignAddress,
      walletAddress: event.auditorPublicKey,
      status: (event.action === "access_denied" || event.action === "key_revoked"
        ? "Denied"
        : "Verified") as AuditStatus,
      timestamp: event.timestamp.slice(0, 16).replace("T", " "),
      notes: event.detail || `Ledger event #${event.sequence}`,
    }));

    return [
      ...ledgerRecords,
      ...getExportAuditHistory().map((evt) => ({
        saleId: `SOC2-${evt.id.slice(0, 6)}`,
        campaign: `SOC 2 Evidence Pack (${evt.filename})`,
        campaignAddress: evt.exporterAddress,
        walletAddress: evt.exporterAddress,
        status: "Verified" as AuditStatus,
        timestamp: evt.timestamp.slice(0, 16).replace("T", " "),
        notes: `Root: ${evt.rootDigest.slice(0, 12)}... (${evt.totalFiles} files bundled)`,
      })),
      ...auditRecords,
    ];
  }, [auditRecords, org.id]);
  const filteredRecords = useMemo(() => {
    const needle = walletFilter.trim().toUpperCase();
    return needle
      ? dynamicRecords.filter((record) => record.walletAddress?.toUpperCase().includes(needle))
      : dynamicRecords;
  }, [dynamicRecords, walletFilter]);

  const verified = filteredRecords.filter((r) => r.status === "Verified").length;
  const denied = filteredRecords.filter((r) => r.status === "Denied").length;
  const pending = filteredRecords.filter((r) => r.status === "Pending").length;
  const firstVisible = Math.max(0, Math.floor(scrollTop / AUDIT_ROW_HEIGHT) - AUDIT_OVERSCAN);
  const visibleCount = Math.ceil(AUDIT_VIEWPORT_HEIGHT / AUDIT_ROW_HEIGHT) + AUDIT_OVERSCAN * 2;
  const visibleRecords = filteredRecords.slice(firstVisible, firstVisible + visibleCount);
  const topSpacerHeight = firstVisible * AUDIT_ROW_HEIGHT;
  const bottomSpacerHeight = Math.max(
    0,
    (filteredRecords.length - firstVisible - visibleRecords.length) * AUDIT_ROW_HEIGHT,
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-extrabold text-zinc-900 dark:text-white tracking-tight">
            Audit History
          </h2>
          <p className="text-zinc-500 dark:text-zinc-400 mt-2 font-medium">
            Read-only trail for{" "}
            <span className="text-indigo-600 dark:text-indigo-400 font-bold">
              {org.name}
            </span>
          </p>
        </div>
        <div className="flex gap-3 items-center">
          <span className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-50 dark:bg-amber-500/10 border border-amber-100 dark:border-amber-500/20 text-[11px] font-bold text-amber-700 dark:text-amber-400">
            <Eye className="w-3.5 h-3.5" />
            Scoped: {auditRecords.length} of {ALL_AUDIT_RECORDS.length} records
          </span>
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
            {filteredRecords.length} of {dynamicRecords.length} entries shown for this organization
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="border-b border-slate-100 p-4 dark:border-zinc-800/50">
            <label htmlFor="audit-wallet-filter" className="sr-only">
              Filter audit records by wallet address
            </label>
            <div className="relative max-w-xl">
              <Search
                aria-hidden="true"
                className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400"
              />
              <input
                id="audit-wallet-filter"
                type="search"
                value={walletFilter}
                onChange={(event) => {
                  setWalletFilter(event.target.value);
                  setScrollState({ orgId: org.id, top: 0 });
                }}
                placeholder="Filter by wallet address"
                className="h-10 w-full rounded-xl border border-slate-200 bg-white pl-10 pr-3 text-sm text-zinc-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-zinc-700 dark:bg-zinc-950 dark:text-white"
              />
            </div>
          </div>
          {filteredRecords.length === 0 ? (
            <p className="px-8 py-10 text-center text-sm font-medium text-zinc-400 dark:text-zinc-500">
              {walletFilter
                ? "No audit records match this wallet address."
                : `No audit records exist within the ${org.shortName} scope.`}
            </p>
          ) : (
            <div
              role="table"
              aria-label="Platform audit records"
              onScroll={(event) =>
                setScrollState({ orgId: org.id, top: event.currentTarget.scrollTop })
              }
              className="divide-y divide-slate-100 overflow-y-auto dark:divide-zinc-800/50"
              style={{ height: AUDIT_VIEWPORT_HEIGHT }}
            >
              {topSpacerHeight > 0 && (
                <div role="presentation" aria-hidden="true" style={{ height: topSpacerHeight }} />
              )}
              {visibleRecords.map((record, index) => {
                const cfg = statusConfig[record.status];
                const StatusIcon = cfg.icon;
                return (
                  <div
                    key={`${record.saleId}-${record.walletAddress ?? record.campaign}-${index + firstVisible}`}
                    role="row"
                    className="flex h-24 items-center justify-between gap-4 overflow-hidden px-4 hover:bg-slate-50/50 dark:hover:bg-zinc-900/30 sm:px-8"
                  >
                    <div className="flex min-w-0 items-center gap-3 sm:gap-4">
                      <div
                        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                          record.status === "Verified"
                            ? "border border-indigo-100 bg-indigo-50 dark:border-indigo-500/20 dark:bg-indigo-500/10"
                            : record.status === "Denied"
                              ? "border border-red-100 bg-red-50 dark:border-red-500/20 dark:bg-red-500/10"
                              : "border border-amber-100 bg-amber-50 dark:border-amber-500/20 dark:bg-amber-500/10"
                        }`}
                      >
                        <StatusIcon
                          aria-hidden="true"
                          className={`w-5 h-5 ${
                            record.status === "Verified"
                              ? "text-indigo-600 dark:text-indigo-400"
                              : record.status === "Denied"
                                ? "text-red-500 dark:text-red-400"
                                : "text-amber-600 dark:text-amber-400"
                          }`}
                        />
                      </div>
                      <div className="min-w-0">
                        <div className="truncate text-sm font-bold text-zinc-900 dark:text-white">
                          {record.campaign}
                        </div>
                        <div className="truncate font-mono text-xs text-zinc-400 dark:text-zinc-500">
                          Sale #{record.saleId} · {record.campaignAddress}
                        </div>
                        <div className="truncate text-xs text-zinc-500 dark:text-zinc-400">
                          Wallet: {record.walletAddress ?? "Not recorded"} · {record.notes}
                        </div>
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <span
                        className={`inline-flex rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-wider ${cfg.badge}`}
                      >
                        {cfg.label}
                      </span>
                      <div className="text-xs font-medium text-zinc-400 dark:text-zinc-500">
                        {record.timestamp}
                      </div>
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
                          className="h-6 px-2 text-[10px] font-bold text-indigo-600 dark:text-indigo-400"
                        >
                          <GitFork className="w-3 h-3" />
                          Merkle Proof
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
              {bottomSpacerHeight > 0 && (
                <div role="presentation" aria-hidden="true" style={{ height: bottomSpacerHeight }} />
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
