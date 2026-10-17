import { useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
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
  Search,
} from "lucide-react";

interface AuditorOverviewProps {
  onTabChange?: (tab: string) => void;
}

export const AuditorOverview: React.FC<AuditorOverviewProps> = ({ onTabChange }) => {
  const [walletFilter, setWalletFilter] = useState("");
  const ledgerScrollRef = useRef<HTMLDivElement>(null);

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

  const ledger = useMemo(() => {
    const wallets = [
      "GB12...34CD",
      "GC78...90GH",
      "GD34...56IJ",
      "GA90...12KL",
      "GE56...78MN",
    ];
    const campaigns = [
      "Tech Gadgets Pro",
      "Web3 Masterclass",
      "Crypto Tools Suite",
      "DeFi Starter Pack",
      "Summer Sale 2024",
      "NFT Drop Alpha",
    ];
    const statuses = ["Verified", "Denied", "Pending"];
    return Array.from({ length: 5000 }, (_, i) => ({
      id: `TX-${(100000 + i).toString()}`,
      saleId: String(1000 + i),
      campaign: campaigns[i % campaigns.length],
      wallet: wallets[i % wallets.length],
      amount: ((i * 37) % 9000) + 100,
      status: statuses[i % statuses.length],
      timestamp: `${(i % 24) + 1}h ago`,
    }));
  }, []);

  const filteredLedger = useMemo(() => {
    const q = walletFilter.trim().toLowerCase();
    if (!q) return ledger;
    return ledger.filter((row) => row.wallet.toLowerCase().includes(q));
  }, [ledger, walletFilter]);

  const rowVirtualizer = useVirtualizer({
    count: filteredLedger.length,
    getScrollElement: () => ledgerScrollRef.current,
    estimateSize: () => 64,
    overscan: 10,
  });

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

      {/* Global Platform Ledger */}
      <Card className="border border-slate-200 dark:border-zinc-800 shadow-sm rounded-2xl bg-white dark:bg-zinc-900/50">
        <CardHeader className="border-b border-slate-100 dark:border-zinc-800/50 pb-4">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <CardTitle className="text-lg font-bold text-zinc-900 dark:text-white">
                Global Platform Ledger
              </CardTitle>
              <CardDescription className="text-zinc-500 dark:text-zinc-400">
                {filteredLedger.length.toLocaleString()} transactions
              </CardDescription>
            </div>
            <div className="relative w-full md:w-72">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
              <input
                type="text"
                value={walletFilter}
                onChange={(e) => setWalletFilter(e.target.value)}
                placeholder="Filter by wallet..."
                className="w-full pl-9 pr-3 py-2 text-sm rounded-lg bg-slate-50 dark:bg-zinc-950/50 border border-slate-200 dark:border-zinc-800 text-zinc-900 dark:text-white placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-6">
          <div className="grid grid-cols-12 gap-3 px-4 pb-3 text-[10px] uppercase tracking-wider font-bold text-zinc-500 dark:text-zinc-400 border-b border-slate-100 dark:border-zinc-800/50">
            <div className="col-span-3">Transaction</div>
            <div className="col-span-3">Campaign</div>
            <div className="col-span-3">Wallet</div>
            <div className="col-span-1 text-right">Amount</div>
            <div className="col-span-2 text-right">Status</div>
          </div>
          <div
            ref={ledgerScrollRef}
            className="h-[420px] overflow-auto mt-2"
          >
            <div
              style={{
                height: `${rowVirtualizer.getTotalSize()}px`,
                width: "100%",
                position: "relative",
              }}
            >
              {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                const row = filteredLedger[virtualRow.index];
                return (
                  <div
                    key={row.id}
                    className="absolute top-0 left-0 w-full grid grid-cols-12 gap-3 px-4 items-center border-b border-slate-100 dark:border-zinc-800/50 hover:bg-slate-50 dark:hover:bg-zinc-950/50 transition-colors"
                    style={{
                      height: `${virtualRow.size}px`,
                      transform: `translateY(${virtualRow.start}px)`,
                    }}
                  >
                    <div className="col-span-3">
                      <div className="font-mono text-xs font-bold text-zinc-900 dark:text-white">
                        {row.id}
                      </div>
                      <div className="text-[10px] text-zinc-400 dark:text-zinc-500">
                        Sale #{row.saleId} · {row.timestamp}
                      </div>
                    </div>
                    <div className="col-span-3 text-sm font-medium text-zinc-700 dark:text-zinc-300 truncate">
                      {row.campaign}
                    </div>
                    <div className="col-span-3 font-mono text-xs text-zinc-500 dark:text-zinc-400 truncate">
                      {row.wallet}
                    </div>
                    <div className="col-span-1 text-right text-sm font-bold text-zinc-900 dark:text-white">
                      ${row.amount}
                    </div>
                    <div className="col-span-2 text-right">
                      <span
                        className={`inline-flex text-[10px] uppercase tracking-wider font-bold px-2 py-1 rounded-full ${
                          row.status === "Verified"
                            ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400"
                            : row.status === "Denied"
                              ? "bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-400"
                              : "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400"
                        }`}
                      >
                        {row.status}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
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
                      className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${ audit.status === "Verified" ? "bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-100 dark:border-indigo-500/20" : "bg-red-50 dark:bg-red-500/10 border border-red-100 dark:border-red-500/20" }`}
                    >
                      {audit.status === "Verified" ? (
                        <CheckCircle2 className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                      ) : (
                        <AlertTriangle className="w-5 h-5 text-red-600 dark:text-red-400" />
                      )}
                    </div>
                    <div>
                      <p className="text-sm font-bold text-zinc-900 dark:text-white">
                        {audit.campaign}
                      </p>
                      <p className="text-xs text-zinc-500 dark:text-zinc-400">
                        Sale #{audit.saleId} · {audit.timestamp}
                      </p>
                    </div>
                  </div>
                  <span
                    className={`text-xs font-bold uppercase tracking-wider ${audit.status === "Verified" ? "text-indigo-600 dark:text-indigo-400" : "text-red-600 dark:text-red-400"}`}
                  >
                    {audit.status}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Pending Requests */}
        <Card className="border border-slate-200 dark:border-zinc-800 shadow-sm rounded-2xl bg-white dark:bg-zinc-900/50">
          <CardHeader className="border-b border-slate-100 dark:border-zinc-800/50 pb-4">
            <CardTitle className="text-lg font-bold text-zinc-900 dark:text-white">
              Pending Requests
            </CardTitle>
            <CardDescription className="text-zinc-500 dark:text-zinc-400">
              Awaiting your review
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-6">
            <div className="space-y-4">
              {pendingRequests.map((req, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between p-4 bg-slate-50 dark:bg-zinc-950/50 border border-slate-100 dark:border-zinc-800/50 rounded-xl hover:border-slate-200 dark:hover:border-zinc-700 transition-colors"
                >
                  <div className="flex items-center space-x-3">
                    <div className="w-10 h-10 bg-amber-50 dark:bg-amber-500/10 border border-amber-100 dark:border-amber-500/20 rounded-xl flex items-center justify-center shrink-0">
                      <Clock className="w-5 h-5 text-amber-600 dark:text-amber-400" />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-zinc-900 dark:text-white">
                        {req.campaign}
                      </p>
                      <p className="text-xs text-zinc-500 dark:text-zinc-400">
                        Sale #{req.saleId} · {req.requestedBy}
                      </p>
                    </div>
                  </div>
                  <span
                    className={`text-xs font-bold uppercase tracking-wider ${req.urgency === "High" ? "text-red-600 dark:text-red-400" : req.urgency === "Medium" ? "text-amber-600 dark:text-amber-400" : "text-zinc-500 dark:text-zinc-400"}`}
                  >
                    {req.urgency}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
