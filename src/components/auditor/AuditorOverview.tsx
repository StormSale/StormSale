import { useRef, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { useAuditorTenancy } from "../../context/AuditorTenancyContext";
import { ORG_DASHBOARD_METRICS, recordsScopedToOrg } from "../../lib/auditorTenancy";
import {
  BlockRangeError,
  normalizeLedgerRange,
  queryContractEventsInRange,
  recordInLedgerRange,
  resolveDateToLedger,
  type LedgerRange,
} from "../../lib/auditor/blockRange";
import { MasterDecryptionPortal } from "./MasterDecryptionPortal";
import { SolvencyHUD } from "./SolvencyHUD";
import {
  Shield,
  TrendingUp,
  CheckCircle2,
  Clock,
  FileSearch,
  AlertTriangle,
  BarChart3,
  Flag,
  Send,
  KeyRound,
  Lock,
  CalendarDays,
  Hash,
  Loader2,
  RotateCcw,
  Search,
} from "lucide-react";

interface AuditorOverviewProps {
  onTabChange?: (tab: string) => void;
}

const ALL_RECENT_AUDITS = [
  {
    saleId: "1042",
    campaign: "Tech Gadgets Pro",
    status: "Verified",
    timestamp: "2 hours ago",
    blockNumber: 6_204_200,
  },
  {
    saleId: "988",
    campaign: "Web3 Masterclass",
    status: "Verified",
    timestamp: "1 day ago",
    blockNumber: 6_204_100,
  },
  {
    saleId: "776",
    campaign: "Crypto Tools Suite",
    status: "Denied",
    timestamp: "3 days ago",
    blockNumber: 6_203_800,
  },
  {
    saleId: "654",
    campaign: "DeFi Starter Pack",
    status: "Verified",
    timestamp: "1 week ago",
    blockNumber: 6_203_500,
  },
];

const ALL_PENDING_REQUESTS = [
  {
    saleId: "1100",
    campaign: "Summer Sale 2024",
    requestedBy: "GB12...34CD",
    urgency: "High",
    blockNumber: 6_204_400,
  },
  {
    saleId: "1089",
    campaign: "NFT Drop Alpha",
    requestedBy: "GC78...90GH",
    urgency: "Medium",
    blockNumber: 6_204_300,
  },
  {
    saleId: "1075",
    campaign: "DeFi Starter Pack",
    requestedBy: "GD34...56IJ",
    urgency: "Low",
    blockNumber: 6_203_900,
  },
];

export const AuditorOverview: React.FC<AuditorOverviewProps> = ({ onTabChange }) => {
  const [reportedAnomalies, setReportedAnomalies] = useState<string[]>([]);

  const handleReportAnomaly = (saleId: string) => {
    setReportedAnomalies((prev) => (prev.includes(saleId) ? prev : [...prev, saleId]));
  };

  const { org, cachedKeyIds, provisionDemoKey, lockSessionKeys } = useAuditorTenancy();
  const [ledgerRange, setLedgerRange] = useState<LedgerRange | null>(null);
  const [fromBlockInput, setFromBlockInput] = useState("");
  const [toBlockInput, setToBlockInput] = useState("");
  const [jumpDate, setJumpDate] = useState("");
  const [rangeError, setRangeError] = useState<string | null>(null);
  const [queryPending, setQueryPending] = useState(false);
  const [queryResult, setQueryResult] = useState<string | null>(null);
  const requestSequence = useRef(0);

  const applyLedgerRange = async (fromBlock: number, toBlock: number) => {
    let normalized: LedgerRange;
    try {
      normalized = normalizeLedgerRange(fromBlock, toBlock);
    } catch (error) {
      setRangeError(error instanceof BlockRangeError ? error.message : "Invalid block range.");
      return;
    }

    const requestId = ++requestSequence.current;
    setRangeError(null);
    setLedgerRange(normalized);
    setFromBlockInput(String(normalized.fromBlock));
    setToBlockInput(String(normalized.toBlock));
    setQueryPending(true);
    setQueryResult(null);
    try {
      const events = await queryContractEventsInRange(normalized);
      if (requestId !== requestSequence.current) return;
      const latestBlock = events.at(-1)?.ledger;
      setQueryResult(
        `${events.length} contract event${events.length === 1 ? "" : "s"} found${
          latestBlock ? ` through block #${latestBlock.toLocaleString()}` : ""
        }.`,
      );
    } catch {
      if (requestId !== requestSequence.current) return;
      setQueryResult(
        "Live chain lookup is unavailable; the block filter still applies to dashboard records.",
      );
    } finally {
      if (requestId === requestSequence.current) setQueryPending(false);
    }
  };

  const handleJumpToDate = async () => {
    if (!jumpDate) {
      setRangeError("Choose a date to jump to its first available ledger.");
      return;
    }
    const requestId = ++requestSequence.current;
    setRangeError(null);
    setQueryPending(true);
    setQueryResult(null);
    try {
      const block = await resolveDateToLedger(jumpDate);
      if (requestId !== requestSequence.current) return;
      await applyLedgerRange(block, block);
    } catch {
      if (requestId !== requestSequence.current) return;
      setQueryPending(false);
      setRangeError("Unable to resolve that date from the ledger. Try a block range instead.");
    }
  };

  const resetRange = () => {
    requestSequence.current += 1;
    setLedgerRange(null);
    setFromBlockInput("");
    setToBlockInput("");
    setJumpDate("");
    setRangeError(null);
    setQueryPending(false);
    setQueryResult(null);
  };

  // Every surface below is scoped to the selected organization (Issue #189).
  const metrics = ORG_DASHBOARD_METRICS[org.id] ?? ORG_DASHBOARD_METRICS["northwind-assurance"];
  const recentAudits = recordsScopedToOrg(org.id, ALL_RECENT_AUDITS).filter((record) =>
    recordInLedgerRange(record.blockNumber, ledgerRange),
  );
  const pendingRequests = recordsScopedToOrg(org.id, ALL_PENDING_REQUESTS).filter((record) =>
    recordInLedgerRange(record.blockNumber, ledgerRange),
  );

  const stats = [
    {
      title: "Audits Completed",
      value: metrics.auditsCompleted,
      change: metrics.completedChange,
      icon: CheckCircle2,
    },
    {
      title: "Active Requests",
      value: String(pendingRequests.length),
      change: "Pending review",
      icon: Clock,
    },
    {
      title: "Success Rate",
      value: metrics.successRate,
      change: metrics.successChange,
      icon: TrendingUp,
    },
    {
      title: "Avg. Response Time",
      value: metrics.avgResponseTime,
      change: metrics.responseChange,
      icon: BarChart3,
    },
  ];

  const anomalies = recordsScopedToOrg(org.id, [
    {
      saleId: "1100",
      blockNumber: 6_204_400,
      campaign: "Summer Sale 2024",
      type: "Wash Trading",
      severity: "High",
      detail: "Circular wallet transfers detected across 6 addresses within 12 minutes.",
    },
    {
      saleId: "1089",
      blockNumber: 6_204_300,
      campaign: "NFT Drop Alpha",
      type: "Rapid Claims",
      severity: "Medium",
      detail: "14 claims from a single cluster within a 90-second window.",
    },
    {
      saleId: "776",
      blockNumber: 6_203_800,
      campaign: "Crypto Tools Suite",
      type: "Wash Trading",
      severity: "High",
      detail: "Repeated buy/sell cycles between two linked wallets.",
    },
  ]).filter((anomaly) => recordInLedgerRange(anomaly.blockNumber, ledgerRange));

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center bg-white dark:bg-zinc-900/50 p-6 md:p-8 rounded-3xl border border-slate-200 dark:border-zinc-800 shadow-sm">
        <div>
          <h1 className="text-2xl md:text-3xl font-extrabold text-zinc-900 dark:text-white tracking-tight">
            Auditor Dashboard
          </h1>
          <p className="text-zinc-500 dark:text-zinc-400 mt-2 font-medium">
            Read-only view of{" "}
            <span className="text-indigo-600 dark:text-indigo-400 font-bold">{org.name}</span> —
            encrypted sale data access and on-chain compliance.
          </p>
        </div>
        <div className="flex items-center gap-2 mt-6 lg:mt-0 px-4 py-2 bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-100 dark:border-indigo-500/20 rounded-full">
          <Shield className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
          <span className="text-sm font-bold text-indigo-700 dark:text-indigo-300">
            NIST/ISO Compliant
          </span>
        </div>
      </div>

      <Card className="border border-slate-200 dark:border-zinc-800 shadow-sm rounded-2xl bg-white dark:bg-zinc-900/50">
        <CardHeader className="pb-4">
          <CardTitle className="text-lg font-bold flex items-center gap-2">
            <Hash className="w-5 h-5 text-indigo-500" />
            Block-range Navigation
          </CardTitle>
          <CardDescription>
            Filter dashboard records and query contract events in ranges of up to 10,000 blocks.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <form
            className="grid gap-4 lg:grid-cols-[1fr_1fr_1.4fr_auto_auto] lg:items-end"
            onSubmit={(event) => {
              event.preventDefault();
              void applyLedgerRange(Number(fromBlockInput), Number(toBlockInput));
            }}
          >
            <label className="space-y-1.5 text-xs font-bold text-zinc-600 dark:text-zinc-300">
              From block
              <input
                type="number"
                min="1"
                step="1"
                required
                value={fromBlockInput}
                onChange={(event) => setFromBlockInput(event.target.value)}
                className="h-10 w-full rounded-xl border border-slate-200 dark:border-zinc-700 bg-transparent px-3 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </label>
            <label className="space-y-1.5 text-xs font-bold text-zinc-600 dark:text-zinc-300">
              To block
              <input
                type="number"
                min="1"
                step="1"
                required
                value={toBlockInput}
                onChange={(event) => setToBlockInput(event.target.value)}
                className="h-10 w-full rounded-xl border border-slate-200 dark:border-zinc-700 bg-transparent px-3 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </label>
            <label className="space-y-1.5 text-xs font-bold text-zinc-600 dark:text-zinc-300">
              Jump to date (UTC)
              <input
                type="date"
                value={jumpDate}
                onChange={(event) => setJumpDate(event.target.value)}
                className="h-10 w-full rounded-xl border border-slate-200 dark:border-zinc-700 bg-transparent px-3 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </label>
            <Button type="submit" disabled={queryPending} className="h-10 rounded-xl">
              {queryPending ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Search className="w-4 h-4 mr-2" />
              )}
              Apply range
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => void handleJumpToDate()}
              disabled={queryPending || !jumpDate}
              className="h-10 rounded-xl"
            >
              <CalendarDays className="w-4 h-4 mr-2" />
              Jump
            </Button>
          </form>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400" aria-live="polite">
              {ledgerRange
                ? `Showing block #${ledgerRange.fromBlock.toLocaleString()} through #${ledgerRange.toBlock.toLocaleString()}.`
                : "All block ranges are currently visible."}
              {queryResult ? ` ${queryResult}` : ""}
            </p>
            {ledgerRange && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={resetRange}
                className="h-8 rounded-lg text-xs"
              >
                <RotateCcw className="w-3.5 h-3.5 mr-1.5" />
                Reset range
              </Button>
            )}
          </div>
          {rangeError && (
            <p role="alert" className="text-sm font-medium text-red-600 dark:text-red-400">
              {rangeError}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Real-Time Protocol Solvency Proof & TVL Oracle (#81) */}
      <SolvencyHUD />

      {/* Suspicious Activity & Anomaly Detection */}
      <Card className="border border-red-200 dark:border-red-500/30 shadow-sm rounded-2xl bg-white dark:bg-zinc-900/50">
        <CardHeader className="border-b border-red-100 dark:border-red-500/20 pb-4">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-red-500 dark:text-red-400" />
            <CardTitle className="text-lg font-bold text-zinc-900 dark:text-white">
              Suspicious Activity & Anomaly Detection
            </CardTitle>
          </div>
          <CardDescription className="text-zinc-500 dark:text-zinc-400">
            Flagged wash-trading and rapid-claim patterns requiring review
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-6">
          <div className="space-y-4">
            {anomalies.length === 0 && (
              <p className="py-6 text-center text-sm text-zinc-500 dark:text-zinc-400">
                No anomalies fall within this block range.
              </p>
            )}
            {anomalies.map((anomaly) => {
              const isReported = reportedAnomalies.includes(anomaly.saleId);
              return (
                <div
                  key={anomaly.saleId}
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 bg-red-50/50 dark:bg-red-500/5 border border-red-100 dark:border-red-500/20 rounded-xl"
                >
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 bg-red-100 dark:bg-red-500/20 border border-red-200 dark:border-red-500/30 rounded-xl flex items-center justify-center shrink-0">
                      <Flag className="w-5 h-5 text-red-600 dark:text-red-400" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-sm text-zinc-900 dark:text-white">
                          {anomaly.campaign}
                        </span>
                        <span
                          className={`inline-flex text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-full ${
                            anomaly.severity === "High"
                              ? "bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-400"
                              : "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400"
                          }`}
                        >
                          {anomaly.severity} Risk
                        </span>
                        <span className="inline-flex text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-full bg-slate-200 text-slate-600 dark:bg-zinc-800 dark:text-zinc-400">
                          {anomaly.type}
                        </span>
                      </div>
                      <div className="text-xs font-mono font-medium text-zinc-400 dark:text-zinc-500 mt-1">
                        Sale #{anomaly.saleId} · Block #{anomaly.blockNumber.toLocaleString()}
                      </div>
                      <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-1 max-w-md">
                        {anomaly.detail}
                      </p>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    onClick={() => handleReportAnomaly(anomaly.saleId)}
                    disabled={isReported}
                    className={`h-8 px-3 text-xs rounded-lg font-semibold transition-colors shrink-0 ${
                      isReported
                        ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400 cursor-default"
                        : "bg-red-600 hover:bg-red-500 text-white"
                    }`}
                  >
                    {isReported ? (
                      <>
                        <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />
                        Reported
                      </>
                    ) : (
                      <>
                        <Send className="w-3.5 h-3.5 mr-1.5" />
                        Report Anomaly
                      </>
                    )}
                  </Button>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

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

      {/* Merkle Tree Proof Visualizer Banner */}
      <div className="relative overflow-hidden bg-gradient-to-r from-indigo-900 via-indigo-950 to-zinc-900 border border-indigo-500/30 rounded-3xl p-6 md:p-8 text-white shadow-xl">
        <div className="absolute right-0 top-0 w-96 h-96 bg-gradient-to-bl from-emerald-500/15 via-indigo-500/20 to-transparent rounded-full blur-3xl pointer-events-none" />
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6 relative z-10">
          <div className="space-y-2 max-w-2xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              Cryptographic Audit Engine
            </div>
            <h2 className="text-xl md:text-2xl font-extrabold tracking-tight">
              Interactive Merkle Tree Proof Explorer
            </h2>
            <p className="text-zinc-300 text-sm leading-relaxed">
              Verify batch-settled conversion ledger logs against Soroban on-chain roots. Inspect
              individual conversion leaves, trace Merkle verification paths highlighted in green,
              and test transaction hashes.
            </p>
          </div>
          <Button
            onClick={() => onTabChange?.("merkle")}
            className="h-12 px-6 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-sm shadow-lg shadow-indigo-600/30 transition-all shrink-0 hover:scale-105"
          >
            Launch Visualizer
          </Button>
        </div>
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
              Latest access verifications
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-6">
            <div className="space-y-4">
              {recentAudits.length === 0 && (
                <p className="py-6 text-center text-sm text-zinc-500 dark:text-zinc-400">
                  No recent audits fall within this block range.
                </p>
              )}
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
                        Sale #{audit.saleId} · Block #{audit.blockNumber.toLocaleString()}
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
              {pendingRequests.length === 0 && (
                <p className="py-6 text-center text-sm text-zinc-500 dark:text-zinc-400">
                  No pending requests fall within this block range.
                </p>
              )}
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
                        {req.requestedBy} · Sale #{req.saleId} · Block #
                        {req.blockNumber.toLocaleString()}
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

      {/* Authorized Master Decryption Portal (Issue #58) */}
      <MasterDecryptionPortal />

      {/* Session decryption keys — cleared automatically on tenant switch */}
      <Card className="border border-slate-200 dark:border-zinc-800 shadow-sm rounded-2xl bg-white dark:bg-zinc-900/50">
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-bold text-zinc-900 dark:text-white flex items-center gap-2">
            <KeyRound className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
            Session Decryption Keys
          </CardTitle>
          <CardDescription className="text-xs text-zinc-500 dark:text-zinc-400">
            Keys are cached in memory for {org.shortName} only and wiped the moment you switch
            organizations.
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-2 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="text-xs font-mono text-zinc-500 dark:text-zinc-400 min-h-5">
            {cachedKeyIds.length === 0
              ? "No decryption keys unlocked for this tenant."
              : cachedKeyIds.join(" · ")}
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={provisionDemoKey}
              className="h-8 px-3 text-xs bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-semibold"
            >
              Unlock demo key
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={lockSessionKeys}
              disabled={cachedKeyIds.length === 0}
              className="h-8 px-3 text-xs rounded-lg font-semibold border-slate-200 dark:border-zinc-800"
            >
              <Lock className="w-3.5 h-3.5 mr-1.5" />
              Lock all
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
