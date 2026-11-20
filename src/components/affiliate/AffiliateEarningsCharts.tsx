import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../ui/card";
import { Button } from "../ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../ui/table";
import {
  BarChart3,
  DollarSign,
  TrendingUp,
  Zap,
  Clock,
  ShieldCheck,
  Download,
  Search,
  RefreshCw,
  ExternalLink,
  CheckCircle2,
  Copy,
  Check,
  ArrowUpRight,
  Info,
} from "lucide-react";
import { useWeb3 } from "../../hooks/useWeb3";
import {
  fetchAffiliateEarningsReport,
  downloadPayoutHistoryCsv,
  type DailyEarningsItem,
  type MonthlyEarningsItem,
  type PayoutHistoryItem,
  type AffiliateBalanceSummary,
} from "../../lib/affiliateEarningsData";
import { motion, AnimatePresence } from "framer-motion";

export interface AffiliateEarningsChartsProps {
  onNavigateToClaim?: () => void;
  walletAddressOverride?: string;
}

type TimeframeView = "daily" | "monthly";
type MetricType = "commission" | "grossSales" | "conversions";
type CurrencyUnit = "XLM" | "USD";

export const AffiliateEarningsCharts: React.FC<AffiliateEarningsChartsProps> = ({
  onNavigateToClaim,
  walletAddressOverride,
}) => {
  const { userAddress: web3Address } = useWeb3();
  const walletAddress = walletAddressOverride || web3Address || "";

  // State
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [balances, setBalances] = useState<AffiliateBalanceSummary | null>(null);
  const [dailyData, setDailyData] = useState<DailyEarningsItem[]>([]);
  const [monthlyData, setMonthlyData] = useState<MonthlyEarningsItem[]>([]);
  const [payouts, setPayouts] = useState<PayoutHistoryItem[]>([]);
  const [source, setSource] = useState<"indexer" | "ledger_fallback">("indexer");

  // Filter & Display controls
  const [timeframe, setTimeframe] = useState<TimeframeView>("daily");
  const [dailyRangeDays, setDailyRangeDays] = useState<number>(14);
  const [monthlyRangeMonths, setMonthlyRangeMonths] = useState<number>(6);
  const [metric, setMetric] = useState<MetricType>("commission");
  const [currency, setCurrency] = useState<CurrencyUnit>("XLM");

  // Chart hover interaction
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  // Payout table search & filter
  const [payoutSearch, setPayoutSearch] = useState<string>("");
  const [copiedTxHash, setCopiedTxHash] = useState<string | null>(null);

  // Fetch report data
  const loadData = useCallback(async (isManualRefresh = false) => {
    if (isManualRefresh) setIsRefreshing(true);
    else setLoading(true);
    setError(null);

    try {
      const report = await fetchAffiliateEarningsReport(walletAddress);
      setBalances(report.balances);
      setDailyData(report.daily);
      setMonthlyData(report.monthly);
      setPayouts(report.payouts);
      setSource(report.source);
    } catch (err: unknown) {
      console.error("Failed to load earnings report:", err);
      setError(err instanceof Error ? err.message : "Failed to load earnings report");
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  }, [walletAddress]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleCopyTx = (txHash: string) => {
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(txHash);
      setCopiedTxHash(txHash);
      setTimeout(() => setCopiedTxHash(null), 2000);
    }
  };

  const handleExportCsv = () => {
    downloadPayoutHistoryCsv(filteredPayouts, `stormsale-payouts-${walletAddress.slice(-6) || "export"}.csv`);
  };

  // Active chart dataset
  const activeDataset = useMemo(() => {
    if (timeframe === "daily") {
      return dailyData.slice(-dailyRangeDays);
    }
    return monthlyData.slice(-monthlyRangeMonths);
  }, [timeframe, dailyData, monthlyData, dailyRangeDays, monthlyRangeMonths]);

  // Max value for chart scaling
  const maxMetricValue = useMemo(() => {
    if (activeDataset.length === 0) return 100;
    const values = activeDataset.map((d) => {
      if (metric === "conversions") return d.salesCount;
      if (metric === "grossSales") {
        return currency === "USD" ? d.grossSalesUsd : d.grossSalesXlm;
      }
      return currency === "USD" ? d.commissionUsd : d.commissionXlm;
    });
    const max = Math.max(...values, 0);
    return max > 0 ? max * 1.15 : 100; // 15% headroom for aesthetic spacing
  }, [activeDataset, metric, currency]);

  // Aggregate totals for the active chart range
  const rangeTotals = useMemo(() => {
    const totalCommission = activeDataset.reduce((sum, d) => sum + (currency === "USD" ? d.commissionUsd : d.commissionXlm), 0);
    const totalGross = activeDataset.reduce((sum, d) => sum + (currency === "USD" ? d.grossSalesUsd : d.grossSalesXlm), 0);
    const totalSales = activeDataset.reduce((sum, d) => sum + d.salesCount, 0);
    const avgConvRate = activeDataset.length > 0
      ? activeDataset.reduce((sum, d) => sum + d.conversionRate, 0) / activeDataset.length
      : 0;

    return {
      commission: Math.round(totalCommission * 100) / 100,
      gross: Math.round(totalGross * 100) / 100,
      sales: totalSales,
      convRate: Math.round(avgConvRate * 10) / 10,
    };
  }, [activeDataset, currency]);

  // Filtered payouts
  const filteredPayouts = useMemo(() => {
    if (!payoutSearch.trim()) return payouts;
    const q = payoutSearch.toLowerCase();
    return payouts.filter(
      (p) =>
        p.campaignName.toLowerCase().includes(q) ||
        p.txHash.toLowerCase().includes(q) ||
        String(p.campaignId).includes(q) ||
        p.asset.toLowerCase().includes(q),
    );
  }, [payouts, payoutSearch]);

  const activeHoverItem = hoveredIndex !== null && activeDataset[hoveredIndex] ? activeDataset[hoveredIndex] : null;

  // Format currency display
  const formatVal = (val: number, cur: CurrencyUnit | "count" = currency) => {
    if (cur === "count") {
      return val.toLocaleString();
    }
    if (cur === "USD") {
      return `$${val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }
    return `${val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} XLM`;
  };

  return (
    <div className="space-y-8 pb-12" data-testid="affiliate-earnings-charts-container">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-3xl font-extrabold text-zinc-900 dark:text-white tracking-tight">
              Earnings & Performance
            </h2>
            <span
              data-testid="live-escrow-badge"
              className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 flex items-center gap-1.5"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              {source === "indexer" ? "Live Escrow Sync: Active" : "Escrow Fallback Sync"}
            </span>
          </div>
          <p className="text-zinc-500 dark:text-zinc-400 mt-1.5 text-sm font-medium">
            Real-time on-chain revenue history, daily and monthly performance trajectories, and verified commission payouts.
          </p>
        </div>

        {/* Global Controls: Refresh & Currency */}
        <div className="flex items-center gap-2.5">
          <div className="bg-slate-100 dark:bg-zinc-900 p-1 rounded-xl border border-slate-200 dark:border-zinc-800 flex items-center">
            <button
              type="button"
              onClick={() => setCurrency("XLM")}
              aria-label="View in XLM"
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                currency === "XLM"
                  ? "bg-white dark:bg-zinc-800 text-indigo-600 dark:text-indigo-400 shadow-sm"
                  : "text-zinc-500 hover:text-zinc-900 dark:hover:text-white"
              }`}
            >
              XLM
            </button>
            <button
              type="button"
              onClick={() => setCurrency("USD")}
              aria-label="View in USD"
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                currency === "USD"
                  ? "bg-white dark:bg-zinc-800 text-indigo-600 dark:text-indigo-400 shadow-sm"
                  : "text-zinc-500 hover:text-zinc-900 dark:hover:text-white"
              }`}
            >
              USD
            </button>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={() => loadData(true)}
            disabled={isRefreshing}
            aria-label="Refresh earnings data"
            className="rounded-xl h-9 px-3.5 border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-xs font-semibold"
          >
            <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${isRefreshing ? "animate-spin" : ""}`} />
            {isRefreshing ? "Syncing..." : "Sync"}
          </Button>
        </div>
      </div>

      {/* Error Banner */}
      {error && (
        <div
          role="alert"
          className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-900 dark:text-amber-200 flex items-center justify-between text-xs"
        >
          <div className="flex items-center gap-2">
            <Info className="w-4 h-4 text-amber-500 shrink-0" />
            <span>Could not fetch fresh indexer data: {error}. Showing last verified ledger state.</span>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => loadData(true)}
            className="h-7 text-xs border-amber-500/30 text-amber-700 dark:text-amber-300 ml-4"
          >
            Retry
          </Button>
        </div>
      )}

      {/* Real-Time Total Balance Widgets (4 Cards) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5" data-testid="balance-widgets-grid">
        {/* Widget 1: Total Earnings */}
        <Card className="rounded-2xl border border-slate-200 dark:border-zinc-800 shadow-sm bg-white dark:bg-zinc-900/60 overflow-hidden relative">
          <CardContent className="p-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                  Total Earnings
                </p>
                <div className="flex items-baseline gap-1 mt-1.5">
                  <span className="text-2xl font-black text-zinc-900 dark:text-white" data-testid="stat-total-earnings">
                    {loading ? "..." : currency === "USD" ? `$${balances?.totalEarningsUsd.toFixed(2)}` : `${balances?.totalEarningsXlm.toFixed(2)}`}
                  </span>
                  <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400">
                    {currency}
                  </span>
                </div>
                <p className="text-xs font-medium text-emerald-600 dark:text-emerald-400 mt-1 flex items-center gap-1">
                  <TrendingUp className="w-3.5 h-3.5" />
                  +18.4% this month
                </p>
              </div>
              <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center border border-indigo-100 dark:border-indigo-500/20 shrink-0">
                <DollarSign className="w-5 h-5" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Widget 2: Withdrawable Matured Balance */}
        <Card className="rounded-2xl border border-emerald-200 dark:border-emerald-900/50 shadow-sm bg-gradient-to-br from-emerald-50/50 via-white to-white dark:from-emerald-950/20 dark:via-zinc-900/60 dark:to-zinc-900/60 overflow-hidden relative">
          <CardContent className="p-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
                  Withdrawable Balance
                </p>
                <div className="flex items-baseline gap-1 mt-1.5">
                  <span className="text-2xl font-black text-zinc-900 dark:text-white" data-testid="stat-withdrawable">
                    {loading ? "..." : currency === "USD" ? `$${balances?.withdrawableUsd.toFixed(2)}` : `${balances?.withdrawableXlm.toFixed(2)}`}
                  </span>
                  <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400">
                    {currency}
                  </span>
                </div>
                {onNavigateToClaim && (
                  <button
                    type="button"
                    onClick={onNavigateToClaim}
                    className="inline-flex items-center gap-1 text-xs font-bold text-emerald-600 dark:text-emerald-400 hover:underline mt-1"
                  >
                    Claim Matured Payouts
                    <ArrowUpRight className="w-3 h-3" />
                  </button>
                )}
              </div>
              <div className="w-10 h-10 rounded-xl bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 flex items-center justify-center border border-emerald-200 dark:border-emerald-500/30 shrink-0">
                <Zap className="w-5 h-5" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Widget 3: In Clearing Escrow */}
        <Card className="rounded-2xl border border-amber-200 dark:border-amber-900/50 shadow-sm bg-gradient-to-br from-amber-50/50 via-white to-white dark:from-amber-950/20 dark:via-zinc-900/60 dark:to-zinc-900/60 overflow-hidden relative">
          <CardContent className="p-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-400">
                  In Clearing Escrow
                </p>
                <div className="flex items-baseline gap-1 mt-1.5">
                  <span className="text-2xl font-black text-zinc-900 dark:text-white" data-testid="stat-in-clearing">
                    {loading ? "..." : currency === "USD" ? `$${balances?.inClearingUsd.toFixed(2)}` : `${balances?.inClearingXlm.toFixed(2)}`}
                  </span>
                  <span className="text-xs font-bold text-amber-600 dark:text-amber-400">
                    {currency}
                  </span>
                </div>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1 flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5 text-amber-500" />
                  Clearing period active (7-14d)
                </p>
              </div>
              <div className="w-10 h-10 rounded-xl bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-400 flex items-center justify-center border border-amber-200 dark:border-amber-500/30 shrink-0">
                <Clock className="w-5 h-5" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Widget 4: Total Paid Out */}
        <Card className="rounded-2xl border border-slate-200 dark:border-zinc-800 shadow-sm bg-white dark:bg-zinc-900/60 overflow-hidden relative">
          <CardContent className="p-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                  Total Settled Payouts
                </p>
                <div className="flex items-baseline gap-1 mt-1.5">
                  <span className="text-2xl font-black text-zinc-900 dark:text-white" data-testid="stat-total-payouts">
                    {loading ? "..." : currency === "USD" ? `$${balances?.totalPaidOutUsd.toFixed(2)}` : `${balances?.totalPaidOutXlm.toFixed(2)}`}
                  </span>
                  <span className="text-xs font-bold text-zinc-600 dark:text-zinc-300">
                    {currency}
                  </span>
                </div>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1 flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                  {balances?.payoutCount || 0} Successful Payouts
                </p>
              </div>
              <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 flex items-center justify-center border border-slate-200 dark:border-zinc-700 shrink-0">
                <ShieldCheck className="w-5 h-5" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Interactive Charts for Trending Performance */}
      <Card className="border border-slate-200 dark:border-zinc-800 shadow-sm rounded-3xl bg-white dark:bg-zinc-900/50 overflow-hidden">
        <CardHeader className="p-6 md:p-8 border-b border-slate-100 dark:border-zinc-800/60">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
            <div>
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-indigo-600 text-white flex items-center justify-center shadow-md shadow-indigo-600/20">
                  <BarChart3 className="w-5 h-5" />
                </div>
                <CardTitle className="text-xl font-bold text-zinc-900 dark:text-white">
                  Trending Performance Trajectory
                </CardTitle>
              </div>
              <CardDescription className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                Visualizing on-chain earnings, conversion volume, and gross sales trajectory across selected intervals.
              </CardDescription>
            </div>

            {/* Timeframe & Metric Toggles */}
            <div className="flex flex-wrap items-center gap-3">
              {/* Daily vs Monthly Switch */}
              <div className="bg-slate-100 dark:bg-zinc-900 p-1 rounded-xl border border-slate-200 dark:border-zinc-800 flex items-center">
                <button
                  type="button"
                  data-testid="toggle-timeframe-daily"
                  onClick={() => setTimeframe("daily")}
                  className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    timeframe === "daily"
                      ? "bg-indigo-600 text-white shadow-sm"
                      : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white"
                  }`}
                >
                  Daily
                </button>
                <button
                  type="button"
                  data-testid="toggle-timeframe-monthly"
                  onClick={() => setTimeframe("monthly")}
                  className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    timeframe === "monthly"
                      ? "bg-indigo-600 text-white shadow-sm"
                      : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white"
                  }`}
                >
                  Monthly
                </button>
              </div>

              {/* Metric Selector */}
              <select
                aria-label="Select Performance Metric"
                value={metric}
                onChange={(e) => setMetric(e.target.value as MetricType)}
                className="h-9 px-3 rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-xs font-bold text-zinc-800 dark:text-zinc-200 outline-none"
              >
                <option value="commission">Commissions Earned</option>
                <option value="grossSales">Gross Sales Volume</option>
                <option value="conversions">Conversions Count</option>
              </select>

              {/* Range Window Selector */}
              {timeframe === "daily" ? (
                <select
                  aria-label="Daily Range Window"
                  value={dailyRangeDays}
                  onChange={(e) => setDailyRangeDays(Number(e.target.value))}
                  className="h-9 px-3 rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-xs font-bold text-zinc-800 dark:text-zinc-200 outline-none"
                >
                  <option value={7}>Last 7 Days</option>
                  <option value={14}>Last 14 Days</option>
                  <option value={30}>Last 30 Days</option>
                </select>
              ) : (
                <select
                  aria-label="Monthly Range Window"
                  value={monthlyRangeMonths}
                  onChange={(e) => setMonthlyRangeMonths(Number(e.target.value))}
                  className="h-9 px-3 rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-xs font-bold text-zinc-800 dark:text-zinc-200 outline-none"
                >
                  <option value={6}>Last 6 Months</option>
                  <option value={12}>Last 12 Months</option>
                </select>
              )}
            </div>
          </div>

          {/* Quick Summary Strip for Current Chart Range */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-6 pt-6 border-t border-slate-100 dark:border-zinc-800/60">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                Period Commissions
              </span>
              <p className="text-lg font-black text-zinc-900 dark:text-white mt-0.5">
                {formatVal(rangeTotals.commission)}
              </p>
            </div>
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                Period Gross Volume
              </span>
              <p className="text-lg font-black text-zinc-900 dark:text-white mt-0.5">
                {formatVal(rangeTotals.gross)}
              </p>
            </div>
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                Total Conversions
              </span>
              <p className="text-lg font-black text-indigo-600 dark:text-indigo-400 mt-0.5">
                {rangeTotals.sales} Sales
              </p>
            </div>
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                Avg Conversion Rate
              </span>
              <p className="text-lg font-black text-emerald-600 dark:text-emerald-400 mt-0.5">
                {rangeTotals.convRate}%
              </p>
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-6 md:p-8">
          {loading ? (
            <div className="h-64 flex items-center justify-center">
              <div className="flex flex-col items-center gap-2">
                <RefreshCw className="w-8 h-8 text-indigo-500 animate-spin" />
                <p className="text-xs text-zinc-400 font-medium">Loading ledger analytics...</p>
              </div>
            </div>
          ) : activeDataset.length === 0 ? (
            <div className="h-64 flex flex-col items-center justify-center text-center p-6" data-testid="empty-chart-state">
              <BarChart3 className="w-12 h-12 text-zinc-300 dark:text-zinc-700 mb-3" />
              <p className="text-sm font-bold text-zinc-700 dark:text-zinc-300">No Performance Activity In This Window</p>
              <p className="text-xs text-zinc-400 mt-1 max-w-sm">
                Share tracking links across campaigns to drive conversions and generate on-chain commission volume.
              </p>
            </div>
          ) : (
            <div className="relative pt-4">
              {/* Interactive Tooltip Card Floating Above Active Item */}
              <AnimatePresence>
                {activeHoverItem && (
                  <motion.div
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 5 }}
                    className="p-3.5 rounded-xl bg-zinc-900 text-white shadow-xl border border-zinc-700/80 mb-6 flex flex-wrap items-center justify-between gap-4 text-xs font-mono"
                    data-testid="interactive-chart-tooltip"
                  >
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-indigo-500" />
                      <span className="font-bold text-sm text-indigo-300">{activeHoverItem.label}</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-4">
                      <div>
                        <span className="text-zinc-400 text-[10px] block">COMMISSION</span>
                        <span className="font-bold text-emerald-400">
                          {formatVal(currency === "USD" ? activeHoverItem.commissionUsd : activeHoverItem.commissionXlm)}
                        </span>
                      </div>
                      <div>
                        <span className="text-zinc-400 text-[10px] block">GROSS VOLUME</span>
                        <span className="font-bold text-white">
                          {formatVal(currency === "USD" ? activeHoverItem.grossSalesUsd : activeHoverItem.grossSalesXlm)}
                        </span>
                      </div>
                      <div>
                        <span className="text-zinc-400 text-[10px] block">CONVERSIONS</span>
                        <span className="font-bold text-indigo-300">{activeHoverItem.salesCount} Sales</span>
                      </div>
                      <div>
                        <span className="text-zinc-400 text-[10px] block">CONV. RATE</span>
                        <span className="font-bold text-cyan-400">{activeHoverItem.conversionRate}%</span>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Bar Chart Visualization Area */}
              <div
                className="grid gap-2 items-end h-56 pt-6 pb-2"
                style={{
                  gridTemplateColumns: `repeat(${activeDataset.length}, minmax(0, 1fr))`,
                }}
                data-testid="performance-bars-container"
              >
                {activeDataset.map((item, index) => {
                  const rawVal =
                    metric === "conversions"
                      ? item.salesCount
                      : metric === "grossSales"
                        ? currency === "USD" ? item.grossSalesUsd : item.grossSalesXlm
                        : currency === "USD" ? item.commissionUsd : item.commissionXlm;

                  const heightPercent = Math.max(8, Math.min(100, Math.round((rawVal / maxMetricValue) * 100)));
                  const isHovered = hoveredIndex === index;

                  return (
                    <div
                      key={item.label + index}
                      onMouseEnter={() => setHoveredIndex(index)}
                      onMouseLeave={() => setHoveredIndex(null)}
                      onFocus={() => setHoveredIndex(index)}
                      onBlur={() => setHoveredIndex(null)}
                      tabIndex={0}
                      role="button"
                      aria-label={`${item.label}: ${rawVal} ${metric}`}
                      className="group flex flex-col items-center h-full justify-end relative cursor-pointer outline-none"
                    >
                      {/* Bar Pillar */}
                      <div className="w-full max-w-[42px] flex items-end h-full">
                        <div
                          style={{ height: `${heightPercent}%` }}
                          className={`w-full rounded-t-xl transition-all duration-300 relative ${
                            isHovered
                              ? "bg-gradient-to-t from-indigo-600 via-indigo-500 to-sky-400 shadow-lg shadow-indigo-500/30"
                              : "bg-slate-200 dark:bg-zinc-800 hover:bg-indigo-300 dark:hover:bg-zinc-700"
                          }`}
                        >
                          {/* Top indicator dot */}
                          {rawVal > 0 && (
                            <div
                              className={`absolute -top-1.5 left-1/2 -translate-x-1/2 w-2.5 h-2.5 rounded-full border-2 border-white dark:border-zinc-900 transition-transform ${
                                isHovered ? "bg-sky-400 scale-125" : "bg-indigo-500"
                              }`}
                            />
                          )}
                        </div>
                      </div>

                      {/* X-Axis Label */}
                      <span
                        className={`text-[10px] mt-2 font-mono whitespace-nowrap truncate max-w-full text-center transition-colors ${
                          isHovered
                            ? "font-bold text-indigo-600 dark:text-indigo-400"
                            : "text-zinc-400 dark:text-zinc-500"
                        }`}
                      >
                        {item.label}
                      </span>
                    </div>
                  );
                })}
              </div>

              {/* Y-Axis Reference Markers */}
              <div className="flex items-center justify-between text-[10px] text-zinc-400 font-mono border-t border-slate-100 dark:border-zinc-800/80 pt-2 mt-2">
                <span>0 {metric === "conversions" ? "sales" : currency}</span>
                <span>{formatVal(Math.round(maxMetricValue * 0.5), metric === "conversions" ? "count" : currency)}</span>
                <span>{formatVal(Math.round(maxMetricValue), metric === "conversions" ? "count" : currency)} (Peak)</span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Payout History Section */}
      <Card className="border border-slate-200 dark:border-zinc-800 shadow-sm rounded-3xl bg-white dark:bg-zinc-900/50 overflow-hidden" data-testid="payout-history-card">
        <CardHeader className="p-6 md:p-8 border-b border-slate-100 dark:border-zinc-800/60">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-emerald-600 text-white flex items-center justify-center shadow-md shadow-emerald-600/20">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <CardTitle className="text-xl font-bold text-zinc-900 dark:text-white">
                  Commission Payout History
                </CardTitle>
              </div>
              <CardDescription className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                Verified on-chain claims and settlements executed via Soroban smart contracts.
              </CardDescription>
            </div>

            {/* Actions: Search & Export CSV */}
            <div className="flex flex-wrap items-center gap-2.5">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  placeholder="Filter campaigns / tx..."
                  aria-label="Filter payout history"
                  value={payoutSearch}
                  onChange={(e) => setPayoutSearch(e.target.value)}
                  className="h-9 pl-8 pr-3 rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-xs font-semibold text-zinc-900 dark:text-white placeholder:text-zinc-400 outline-none w-44 sm:w-56"
                />
              </div>

              <Button
                variant="outline"
                size="sm"
                onClick={handleExportCsv}
                disabled={filteredPayouts.length === 0}
                aria-label="Export Payout History as CSV"
                className="h-9 rounded-xl px-3.5 border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-xs font-semibold"
              >
                <Download className="w-3.5 h-3.5 mr-1.5" />
                Export CSV
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-b border-slate-100 dark:border-zinc-800/60 bg-slate-50/60 dark:bg-zinc-950/40">
                  <TableHead className="py-4 pl-6 text-xs font-bold uppercase tracking-wider text-zinc-500">
                    Payout Date (UTC)
                  </TableHead>
                  <TableHead className="py-4 text-xs font-bold uppercase tracking-wider text-zinc-500">
                    Campaign
                  </TableHead>
                  <TableHead className="py-4 text-xs font-bold uppercase tracking-wider text-zinc-500">
                    Amount
                  </TableHead>
                  <TableHead className="py-4 text-xs font-bold uppercase tracking-wider text-zinc-500">
                    Asset
                  </TableHead>
                  <TableHead className="py-4 text-xs font-bold uppercase tracking-wider text-zinc-500">
                    Status
                  </TableHead>
                  <TableHead className="py-4 pr-6 text-right text-xs font-bold uppercase tracking-wider text-zinc-500">
                    Transaction Hash
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredPayouts.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-12 text-zinc-400 text-xs font-medium">
                      {payoutSearch ? "No payouts match your search filter." : "No commission payouts settled yet."}
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredPayouts.map((payout) => {
                    const dateFormatted = new Date(payout.timestamp)
                      .toISOString()
                      .replace("T", " ")
                      .slice(0, 16);
                    const isCopied = copiedTxHash === payout.txHash;
                    const truncatedHash = `${payout.txHash.slice(0, 8)}...${payout.txHash.slice(-6)}`;

                    return (
                      <TableRow
                        key={payout.id}
                        className="border-b border-slate-50 dark:border-zinc-900 hover:bg-slate-50/60 dark:hover:bg-zinc-900/30 transition-colors"
                      >
                        <TableCell className="py-4 pl-6 text-xs font-mono font-medium text-zinc-600 dark:text-zinc-400">
                          {dateFormatted}
                        </TableCell>

                        <TableCell className="py-4">
                          <div className="font-bold text-sm text-zinc-900 dark:text-white">
                            {payout.campaignName}
                          </div>
                          <span className="text-[10px] font-mono text-zinc-400">
                            ID #{payout.campaignId}
                          </span>
                        </TableCell>

                        <TableCell className="py-4">
                          <div className="font-black text-sm text-zinc-900 dark:text-white font-mono">
                            {payout.amountXlm.toFixed(2)} XLM
                          </div>
                          <div className="text-[11px] text-zinc-400">
                            ≈ ${payout.amountUsd.toFixed(2)} USD
                          </div>
                        </TableCell>

                        <TableCell className="py-4">
                          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-slate-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 border border-slate-200 dark:border-zinc-700">
                            {payout.asset}
                          </span>
                        </TableCell>

                        <TableCell className="py-4">
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400">
                            <CheckCircle2 className="w-3 h-3" />
                            Settled
                          </span>
                        </TableCell>

                        <TableCell className="py-4 pr-6 text-right">
                          <div className="inline-flex items-center gap-1.5 font-mono text-xs">
                            <span className="text-zinc-500 dark:text-zinc-400">{truncatedHash}</span>
                            <button
                              type="button"
                              onClick={() => handleCopyTx(payout.txHash)}
                              aria-label="Copy transaction hash"
                              className="p-1 rounded-md text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors"
                            >
                              {isCopied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                            </button>
                            <a
                              href={`https://stellar.expert/explorer/testnet/tx/${payout.txHash}`}
                              target="_blank"
                              rel="noreferrer noopener"
                              aria-label="View on Stellar Expert"
                              className="p-1 rounded-md text-zinc-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors"
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                            </a>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
