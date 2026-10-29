import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import {
  TrendingUp,
  DollarSign,
  Clock,
  ArrowUpRight,
  ExternalLink,
  CheckCircle2,
  Sparkles,
  Layers,
} from "lucide-react";
import { STELLAR_CONFIG } from "../../config/stellar";

type Timeframe = "7D" | "30D" | "90D" | "1Y";
type Metric = "earnings" | "conversions";

interface TrendPoint {
  label: string;
  earnings: number;
  conversions: number;
}

const mockChartData: Record<Timeframe, TrendPoint[]> = {
  "7D": [
    { label: "Mon", earnings: 140, conversions: 12 },
    { label: "Tue", earnings: 220, conversions: 18 },
    { label: "Wed", earnings: 190, conversions: 15 },
    { label: "Thu", earnings: 340, conversions: 28 },
    { label: "Fri", earnings: 410, conversions: 32 },
    { label: "Sat", earnings: 290, conversions: 24 },
    { label: "Sun", earnings: 480, conversions: 38 },
  ],
  "30D": [
    { label: "Week 1", earnings: 1200, conversions: 95 },
    { label: "Week 2", earnings: 1850, conversions: 142 },
    { label: "Week 3", earnings: 2400, conversions: 188 },
    { label: "Week 4", earnings: 3100, conversions: 230 },
  ],
  "90D": [
    { label: "Jan", earnings: 3400, conversions: 260 },
    { label: "Feb", earnings: 4200, conversions: 310 },
    { label: "Mar", earnings: 5247, conversions: 405 },
  ],
  "1Y": [
    { label: "Q1", earnings: 8500, conversions: 650 },
    { label: "Q2", earnings: 11200, conversions: 840 },
    { label: "Q3", earnings: 13900, conversions: 1020 },
    { label: "Q4", earnings: 16847, conversions: 1280 },
  ],
};

const historicalPayoutLedger = [
  {
    id: "tx-1",
    campaign: "Tech Gadgets Pro",
    token: "USDC",
    amount: "1,250.00",
    clearingStatus: "Cleared & Settled",
    daysLeft: 0,
    txHash: "4a9b2c8e1f5d6a7b3c2e1f4a9b8c7d6e5f4a3b2c1d0e9f8a7b6c5d4e3f2a1b0c",
    date: "2026-10-12",
  },
  {
    id: "tx-2",
    campaign: "Web3 Masterclass",
    token: "USDC",
    amount: "890.00",
    clearingStatus: "Clearing Escrow",
    daysLeft: 3,
    txHash: "8f7e6d5c4b3a2f1e0d9c8b7a6f5e4d3c2b1a0f9e8d7c6b5a4f3e2d1c0b9a8f7e",
    date: "2026-10-14",
  },
  {
    id: "tx-3",
    campaign: "Crypto Tools Suite",
    token: "XLM",
    amount: "3,200.00",
    clearingStatus: "Clearing Escrow",
    daysLeft: 6,
    txHash: "1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b",
    date: "2026-10-15",
  },
  {
    id: "tx-4",
    campaign: "DeFi Starter Pack",
    token: "EURC",
    amount: "650.00",
    clearingStatus: "Cleared & Settled",
    daysLeft: 0,
    txHash: "9e8d7c6b5a4f3e2d1c0b9a8f7e6d5c4b3a2f1e0d9c8b7a6f5e4d3c2b1a0f9e8d",
    date: "2026-10-08",
  },
];

export const AffiliatePerformanceCharts = () => {
  const [timeframe, setTimeframe] = useState<Timeframe>("7D");
  const [metric, setMetric] = useState<Metric>("earnings");
  const [hoveredPoint, setHoveredPoint] = useState<TrendPoint | null>(null);

  const points = mockChartData[timeframe];
  const maxValue = Math.max(...points.map((p) => p[metric]));

  return (
    <div className="space-y-8">
      {/* Real-time Total Balance Widgets (Issue #48 Acceptance Criteria) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {/* Available to Claim */}
        <Card className="bg-gradient-to-br from-indigo-900 via-indigo-950 to-zinc-950 border border-indigo-700/40 text-white rounded-3xl shadow-xl overflow-hidden relative">
          <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/10 rounded-full blur-2xl" />
          <CardContent className="p-6 relative z-10 flex flex-col justify-between h-full">
            <div>
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-bold uppercase tracking-wider text-indigo-300">
                  Available Balance
                </span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-400/30">
                  Instant Claim
                </span>
              </div>
              <div className="text-3xl font-black tracking-tight">
                $3,420<span className="text-xl text-indigo-300 font-semibold">.00</span>
              </div>
              <div className="text-xs text-indigo-200/80 mt-1">
                ≈ 3,420 USDC ready for on-chain withdrawal
              </div>
            </div>
            <div className="mt-4 pt-4 border-t border-indigo-800/40 flex items-center justify-between text-xs">
              <span className="text-emerald-400 font-bold flex items-center">
                <ArrowUpRight className="w-3.5 h-3.5 mr-0.5" /> +24% this week
              </span>
              <span className="text-zinc-400">Zero gas fee</span>
            </div>
          </CardContent>
        </Card>

        {/* Pending Clearing Escrow */}
        <Card className="bg-white/80 dark:bg-zinc-900/80 backdrop-blur-xl border border-slate-200 dark:border-zinc-800 rounded-3xl shadow-sm hover:shadow-md transition-all">
          <CardContent className="p-6 flex flex-col justify-between h-full">
            <div>
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                  Pending Clearing
                </span>
                <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
              </div>
              <div className="text-3xl font-black text-zinc-900 dark:text-white tracking-tight">
                $1,850<span className="text-xl text-zinc-400 font-semibold">.00</span>
              </div>
              <div className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                Locked in 7–14 day fraud dispute escrow
              </div>
            </div>
            <div className="mt-4 pt-4 border-t border-slate-100 dark:border-zinc-800 flex items-center justify-between text-xs">
              <span className="text-amber-600 dark:text-amber-400 font-semibold flex items-center">
                <Clock className="w-3.5 h-3.5 mr-1" /> Next unlock in 3 days
              </span>
              <span className="text-zinc-400">2 campaigns</span>
            </div>
          </CardContent>
        </Card>

        {/* Lifetime Earnings */}
        <Card className="bg-white/80 dark:bg-zinc-900/80 backdrop-blur-xl border border-slate-200 dark:border-zinc-800 rounded-3xl shadow-sm hover:shadow-md transition-all">
          <CardContent className="p-6 flex flex-col justify-between h-full">
            <div>
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                  Total Lifetime Earnings
                </span>
                <DollarSign className="w-4 h-4 text-emerald-500" />
              </div>
              <div className="text-3xl font-black text-zinc-900 dark:text-white tracking-tight">
                $12,847<span className="text-xl text-zinc-400 font-semibold">.00</span>
              </div>
              <div className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                Settled across 18 marketing contracts
              </div>
            </div>
            <div className="mt-4 pt-4 border-t border-slate-100 dark:border-zinc-800 flex items-center justify-between text-xs">
              <span className="text-emerald-600 dark:text-emerald-400 font-bold flex items-center">
                <ArrowUpRight className="w-3.5 h-3.5 mr-0.5" /> +18.4% MoM
              </span>
              <span className="text-zinc-400">All-time record</span>
            </div>
          </CardContent>
        </Card>

        {/* Performance Conversion Rate */}
        <Card className="bg-white/80 dark:bg-zinc-900/80 backdrop-blur-xl border border-slate-200 dark:border-zinc-800 rounded-3xl shadow-sm hover:shadow-md transition-all">
          <CardContent className="p-6 flex flex-col justify-between h-full">
            <div>
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                  Conversion Rate (CVR)
                </span>
                <TrendingUp className="w-4 h-4 text-indigo-500" />
              </div>
              <div className="text-3xl font-black text-zinc-900 dark:text-white tracking-tight">
                3.4<span className="text-xl text-zinc-400 font-semibold">%</span>
              </div>
              <div className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                1,420 unique clicks → 48 sales
              </div>
            </div>
            <div className="mt-4 pt-4 border-t border-slate-100 dark:border-zinc-800 flex items-center justify-between text-xs">
              <span className="text-emerald-600 dark:text-emerald-400 font-bold">+0.6% vs avg</span>
              <span className="text-zinc-400">High efficiency</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Interactive Performance Trend Chart (Issue #48 Acceptance Criteria) */}
      <Card className="border border-slate-200 dark:border-zinc-800 rounded-3xl bg-white dark:bg-zinc-900/60 shadow-sm overflow-hidden">
        <CardHeader className="p-6 sm:p-8 border-b border-slate-100 dark:border-zinc-800/60 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center space-x-2">
              <Sparkles className="w-4 h-4 text-indigo-500" />
              <CardTitle className="text-xl font-bold text-zinc-900 dark:text-white">
                Affiliate Performance Trends
              </CardTitle>
            </div>
            <CardDescription className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
              Interactive visualization of on-chain commissions and referral conversion velocity
            </CardDescription>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Metric Switcher */}
            <div className="flex bg-slate-100 dark:bg-zinc-800/70 p-1 rounded-xl">
              <button
                onClick={() => setMetric("earnings")}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  metric === "earnings"
                    ? "bg-white dark:bg-zinc-900 text-indigo-600 dark:text-indigo-400 shadow-xs"
                    : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white"
                }`}
              >
                Earnings ($)
              </button>
              <button
                onClick={() => setMetric("conversions")}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  metric === "conversions"
                    ? "bg-white dark:bg-zinc-900 text-indigo-600 dark:text-indigo-400 shadow-xs"
                    : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white"
                }`}
              >
                Conversions
              </button>
            </div>

            {/* Timeframe Switcher */}
            <div className="flex bg-slate-100 dark:bg-zinc-800/70 p-1 rounded-xl">
              {(["7D", "30D", "90D", "1Y"] as Timeframe[]).map((tf) => (
                <button
                  key={tf}
                  onClick={() => setTimeframe(tf)}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    timeframe === tf
                      ? "bg-indigo-600 text-white shadow-xs"
                      : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white"
                  }`}
                >
                  {tf}
                </button>
              ))}
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-6 sm:p-8">
          {/* Active Hover / Metric Callout */}
          <div className="mb-6 flex items-center justify-between">
            <div>
              <span className="text-xs uppercase font-bold text-zinc-400">
                {hoveredPoint ? hoveredPoint.label : `Selected Period (${timeframe})`}
              </span>
              <div className="text-2xl font-black text-zinc-900 dark:text-white">
                {metric === "earnings"
                  ? `$${(hoveredPoint ? hoveredPoint.earnings : points.reduce((a, b) => a + b.earnings, 0)).toLocaleString()}`
                  : `${hoveredPoint ? hoveredPoint.conversions : points.reduce((a, b) => a + b.conversions, 0)} Conversions`}
              </div>
            </div>
            <div className="text-xs text-zinc-400 font-medium">
              Hover over bars to inspect daily datapoints
            </div>
          </div>

          {/* SVG Interactive Bar Chart */}
          <div className="relative h-60 w-full flex items-end justify-between gap-3 pt-6 border-b border-slate-100 dark:border-zinc-800">
            {points.map((point, index) => {
              const val = point[metric];
              const heightPercent = Math.max(12, Math.round((val / maxValue) * 100));

              return (
                <div
                  key={index}
                  tabIndex={0}
                  role="button"
                  aria-label={`${point.label}: ${metric === "earnings" ? `$${point.earnings}` : `${point.conversions} sales`}`}
                  onMouseEnter={() => setHoveredPoint(point)}
                  onMouseLeave={() => setHoveredPoint(null)}
                  onFocus={() => setHoveredPoint(point)}
                  onBlur={() => setHoveredPoint(null)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setHoveredPoint(point);
                    }
                  }}
                  className="flex-1 flex flex-col items-center h-full justify-end group cursor-pointer focus:outline-hidden focus-visible:ring-2 focus-visible:ring-indigo-500 rounded-t-xl"
                >
                  {/* Tooltip on hover / focus */}
                  <div
                    className={`transition-opacity mb-2 px-2 py-1 rounded bg-zinc-900 text-white text-[11px] font-mono font-bold shadow-lg pointer-events-none whitespace-nowrap ${
                      hoveredPoint === point
                        ? "opacity-100"
                        : "opacity-0 group-hover:opacity-100 group-focus:opacity-100"
                    }`}
                  >
                    {metric === "earnings" ? `$${point.earnings}` : `${point.conversions} sales`}
                  </div>

                  {/* Animated Bar */}
                  <div
                    style={{ height: `${heightPercent}%` }}
                    className={`w-full max-w-[48px] rounded-t-xl transition-all duration-300 ${
                      hoveredPoint === point
                        ? "bg-indigo-500 shadow-lg shadow-indigo-500/40"
                        : "bg-indigo-600/70 hover:bg-indigo-500/90 dark:bg-indigo-500/60 dark:hover:bg-indigo-400"
                    }`}
                  />
                  <span className="mt-3 text-xs font-bold text-zinc-500 dark:text-zinc-400">
                    {point.label}
                  </span>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Historical Payout Ledger Table */}
      <Card className="border border-slate-200 dark:border-zinc-800 rounded-3xl bg-white dark:bg-zinc-900/60 shadow-sm overflow-hidden">
        <CardHeader className="p-6 sm:p-8 border-b border-slate-100 dark:border-zinc-800/60 flex items-center justify-between">
          <div>
            <CardTitle className="text-xl font-bold text-zinc-900 dark:text-white flex items-center gap-2">
              <Layers className="w-5 h-5 text-indigo-500" />
              Historical Payout & Clearing Ledger
            </CardTitle>
            <CardDescription className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
              Auditable on-chain commission distribution and escrow settlement records
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 dark:bg-zinc-950/50 border-b border-slate-200 dark:border-zinc-800 text-zinc-500 font-bold uppercase tracking-wider">
                <tr>
                  <th className="py-4 px-6">Campaign</th>
                  <th className="py-4 px-6">Amount</th>
                  <th className="py-4 px-6">Status</th>
                  <th className="py-4 px-6">Dispute Escrow</th>
                  <th className="py-4 px-6">Date</th>
                  <th className="py-4 px-6 text-right">Stellar Explorer</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-zinc-800/50">
                {historicalPayoutLedger.map((item) => (
                  <tr
                    key={item.id}
                    className="hover:bg-slate-50/50 dark:hover:bg-zinc-950/40 transition-colors"
                  >
                    <td className="py-4 px-6 font-bold text-zinc-900 dark:text-white">
                      {item.campaign}
                    </td>
                    <td className="py-4 px-6 font-mono font-bold text-zinc-800 dark:text-zinc-200">
                      {item.amount} {item.token}
                    </td>
                    <td className="py-4 px-6">
                      {item.daysLeft === 0 ? (
                        <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400">
                          <CheckCircle2 className="w-3 h-3 mr-1" />
                          {item.clearingStatus}
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-bold bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400">
                          <Clock className="w-3 h-3 mr-1" />
                          {item.clearingStatus}
                        </span>
                      )}
                    </td>
                    <td className="py-4 px-6 text-zinc-500 dark:text-zinc-400">
                      {item.daysLeft === 0 ? "Unlocked" : `${item.daysLeft} days remaining`}
                    </td>
                    <td className="py-4 px-6 text-zinc-500 dark:text-zinc-400">{item.date}</td>
                    <td className="py-4 px-6 text-right">
                      <a
                        href={`${STELLAR_CONFIG.explorerUrl}/tx/${item.txHash.replace(/^0x/, "")}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center text-indigo-600 dark:text-indigo-400 hover:underline font-mono"
                      >
                        {item.txHash.replace(/^0x/, "").slice(0, 8)}...{item.txHash.replace(/^0x/, "").slice(-6)}
                        <ExternalLink className="w-3 h-3 ml-1" />
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
