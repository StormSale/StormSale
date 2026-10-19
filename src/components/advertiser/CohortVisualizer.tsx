import React, { useState, useMemo, useEffect, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { Button } from "../ui/button";
import {
  calculateCohortRetention,
  calculatePartnerMetrics,
  exportCohortDataToCSV,
  downloadCSV,
  type CustomerConversion,
} from "../../lib/cohortAnalysis";
import { fetchConversions } from "../../utils/api";
import {
  Download,
  Filter,
  Users,
  DollarSign,
  TrendingUp,
  ShoppingBag,
  Sparkles,
  Layers,
  AlertCircle,
  RefreshCw,
} from "lucide-react";

interface CohortVisualizerProps {
  conversions?: CustomerConversion[];
}

export const CohortVisualizer: React.FC<CohortVisualizerProps> = ({
  conversions: initialConversions,
}) => {
  const [loadedConversions, setLoadedConversions] = useState<CustomerConversion[] | null>(
    initialConversions || null,
  );
  const [isLoading, setIsLoading] = useState<boolean>(!initialConversions);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    if (initialConversions) return;
    setIsLoading(true);
    setError(null);
    try {
      const data = await fetchConversions();
      setLoadedConversions(data);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to load conversion data";
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, [initialConversions]);

  useEffect(() => {
    if (!initialConversions) {
      void loadData();
    } else {
      setLoadedConversions(initialConversions);
      setIsLoading(false);
      setError(null);
    }
  }, [initialConversions, loadData]);

  const conversions = useMemo(
    () => initialConversions || loadedConversions || [],
    [initialConversions, loadedConversions],
  );

  // Filter States
  const [selectedCampaign, setSelectedCampaign] = useState<string>("all");
  const [selectedAffiliate, setSelectedAffiliate] = useState<string>("all");
  const [timeframe, setTimeframe] = useState<"monthly" | "weekly">("monthly");
  const [viewMetric, setViewMetric] = useState<"retention" | "ltv">("retention");

  // Extract unique campaign and affiliate lists for filter dropdowns
  const campaignOptions = useMemo(() => {
    const map = new Map<string, string>();
    conversions.forEach((c) => map.set(c.campaignId, c.campaignName));
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [conversions]);

  const affiliateOptions = useMemo(() => {
    const map = new Map<string, string>();
    conversions.forEach((c) => map.set(c.affiliateAddress, c.affiliateName));
    return Array.from(map.entries()).map(([address, name]) => ({
      address,
      name,
    }));
  }, [conversions]);

  // Compute cohorts and partner metrics based on active filters
  const cohorts = useMemo(() => {
    return calculateCohortRetention(conversions, {
      campaignId: selectedCampaign,
      affiliateAddress: selectedAffiliate,
      timeframe,
    });
  }, [conversions, selectedCampaign, selectedAffiliate, timeframe]);

  const partnerMetrics = useMemo(() => {
    return calculatePartnerMetrics(conversions, {
      campaignId: selectedCampaign,
      affiliateAddress: selectedAffiliate,
    });
  }, [conversions, selectedCampaign, selectedAffiliate]);

  // Aggregate stats across filtered cohorts
  const totals = useMemo(() => {
    const totalUsers = cohorts.reduce((acc, c) => acc + c.initialUsers, 0);
    const totalRevenue = cohorts.reduce((acc, c) => acc + c.totalCumulativeRevenue, 0);
    const overallLtv = totalUsers > 0 ? totalRevenue / totalUsers : 0;

    // Average 30, 60, 90 day retention for mature cohorts only
    const mature30 = cohorts.filter((c) => c.day30.days > 0 && c.day30.isMature);
    const avgDay30 =
      mature30.length > 0
        ? mature30.reduce((acc, c) => acc + c.day30.retentionRate, 0) / mature30.length
        : 0;

    const mature60 = cohorts.filter((c) => c.day60.days > 0 && c.day60.isMature);
    const avgDay60 =
      mature60.length > 0
        ? mature60.reduce((acc, c) => acc + c.day60.retentionRate, 0) / mature60.length
        : 0;

    const mature90 = cohorts.filter((c) => c.day90.days > 0 && c.day90.isMature);
    const avgDay90 =
      mature90.length > 0
        ? mature90.reduce((acc, c) => acc + c.day90.retentionRate, 0) / mature90.length
        : 0;

    return { totalUsers, totalRevenue, overallLtv, avgDay30, avgDay60, avgDay90 };
  }, [cohorts]);

  // Heatmap background color generator based on retention rate percentage
  const getRetentionColorClass = (rate: number) => {
    if (rate >= 40) return "bg-emerald-600 text-white font-black shadow-inner";
    if (rate >= 25) return "bg-emerald-500/80 text-white font-bold";
    if (rate >= 15) return "bg-emerald-500/40 text-emerald-950 dark:text-emerald-100 font-semibold";
    if (rate > 0) return "bg-emerald-500/20 text-emerald-900 dark:text-emerald-300 font-medium";
    return "bg-slate-100 dark:bg-zinc-800/40 text-zinc-400 font-normal";
  };

  // Heatmap background for LTV values
  const getLtvColorClass = (ltv: number, maxLtv: number) => {
    const ratio = maxLtv > 0 ? ltv / maxLtv : 0;
    if (ratio >= 0.75) return "bg-indigo-600 text-white font-black shadow-inner";
    if (ratio >= 0.5) return "bg-indigo-500/80 text-white font-bold";
    if (ratio >= 0.25) return "bg-indigo-500/40 text-indigo-950 dark:text-indigo-100 font-semibold";
    if (ratio > 0) return "bg-indigo-500/20 text-indigo-900 dark:text-indigo-300 font-medium";
    return "bg-slate-100 dark:bg-zinc-800/40 text-zinc-400 font-normal";
  };

  const maxLtvOverall = useMemo(() => {
    let max = 0;
    cohorts.forEach((c) => {
      if (c.totalLtv > max) max = c.totalLtv;
    });
    return max || 100;
  }, [cohorts]);

  const handleExportCSV = () => {
    const csv = exportCohortDataToCSV(cohorts, partnerMetrics);
    downloadCSV(csv, `advertiser-cohort-analysis-${timeframe}-${Date.now()}.csv`);
  };

  if (isLoading) {
    return (
      <Card className="border border-slate-200 dark:border-zinc-800 shadow-sm rounded-3xl bg-white dark:bg-zinc-900/50 p-12 text-center">
        <div className="flex flex-col items-center justify-center space-y-4">
          <div className="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm font-semibold text-zinc-600 dark:text-zinc-400">
            Loading cohort conversion data...
          </p>
        </div>
      </Card>
    );
  }

  if (error && conversions.length === 0) {
    return (
      <Card className="border border-red-200 dark:border-red-900/50 shadow-sm rounded-3xl bg-white dark:bg-zinc-900/50 p-8 text-center">
        <div className="flex flex-col items-center justify-center space-y-3 max-w-md mx-auto">
          <AlertCircle className="w-10 h-10 text-red-500" />
          <h3 className="text-base font-bold text-zinc-900 dark:text-white">
            Failed to Load Conversion Data
          </h3>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">{error}</p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void loadData()}
            className="mt-2 text-xs font-bold"
          >
            <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
            Retry
          </Button>
        </div>
      </Card>
    );
  }

  if (conversions.length === 0) {
    return (
      <Card className="border border-slate-200 dark:border-zinc-800 shadow-sm rounded-3xl bg-white dark:bg-zinc-900/50 p-12 text-center">
        <div className="flex flex-col items-center justify-center space-y-3 max-w-md mx-auto">
          <div className="w-12 h-12 rounded-2xl bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
            <Layers className="w-6 h-6" />
          </div>
          <CardTitle className="text-lg font-bold text-zinc-900 dark:text-white">
            No Conversion Data Available
          </CardTitle>
          <CardDescription className="text-xs text-zinc-500 dark:text-zinc-400">
            No conversions have been logged yet. Once sales and customer attributions are recorded
            by affiliates, cohort retention and LTV metrics will automatically appear here.
          </CardDescription>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Visualizer Header with Filter & Export Toolbar */}
      <Card className="border border-slate-200 dark:border-zinc-800 shadow-sm rounded-3xl bg-white dark:bg-zinc-900/50">
        <CardHeader className="pb-4 pt-6 px-6 sm:px-8 border-b border-slate-100 dark:border-zinc-800/60">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            <div>
              <div className="flex items-center space-x-2">
                <div className="w-8 h-8 rounded-lg bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
                  <Layers className="w-4 h-4" />
                </div>
                <CardTitle className="text-xl font-extrabold text-zinc-900 dark:text-white tracking-tight">
                  Cohort Retention & Customer LTV Visualizer
                </CardTitle>
              </div>
              <CardDescription className="text-zinc-500 dark:text-zinc-400 mt-1 text-xs">
                Track repeat purchase rates and cumulative Lifetime Value (LTV) across 30, 60, and
                90-day intervals
              </CardDescription>
            </div>

            <div className="flex flex-wrap items-center gap-2 sm:gap-3">
              {/* Metric Toggle: Retention % vs LTV $ */}
              <div className="flex items-center bg-slate-100 dark:bg-zinc-950 p-1 rounded-xl border border-slate-200/80 dark:border-zinc-800 text-xs">
                <button
                  type="button"
                  onClick={() => setViewMetric("retention")}
                  className={`px-3 py-1.5 rounded-lg font-bold transition-all ${
                    viewMetric === "retention"
                      ? "bg-white dark:bg-zinc-800 text-indigo-600 dark:text-indigo-400 shadow-sm"
                      : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white"
                  }`}
                >
                  Retention %
                </button>
                <button
                  type="button"
                  onClick={() => setViewMetric("ltv")}
                  className={`px-3 py-1.5 rounded-lg font-bold transition-all ${
                    viewMetric === "ltv"
                      ? "bg-white dark:bg-zinc-800 text-indigo-600 dark:text-indigo-400 shadow-sm"
                      : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white"
                  }`}
                >
                  Cumulative LTV ($)
                </button>
              </div>

              {/* Timeframe Toggle: Monthly vs Weekly */}
              <div className="flex items-center bg-slate-100 dark:bg-zinc-950 p-1 rounded-xl border border-slate-200/80 dark:border-zinc-800 text-xs">
                <button
                  type="button"
                  onClick={() => setTimeframe("monthly")}
                  className={`px-3 py-1.5 rounded-lg font-bold transition-all ${
                    timeframe === "monthly"
                      ? "bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white shadow-sm"
                      : "text-zinc-500 hover:text-zinc-900 dark:hover:text-white"
                  }`}
                >
                  Monthly
                </button>
                <button
                  type="button"
                  onClick={() => setTimeframe("weekly")}
                  className={`px-3 py-1.5 rounded-lg font-bold transition-all ${
                    timeframe === "weekly"
                      ? "bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white shadow-sm"
                      : "text-zinc-500 hover:text-zinc-900 dark:hover:text-white"
                  }`}
                >
                  Weekly
                </button>
              </div>

              {/* CSV Export Button */}
              <Button
                variant="outline"
                size="sm"
                onClick={handleExportCSV}
                className="h-9 px-3.5 rounded-xl border-slate-200 dark:border-zinc-800 hover:bg-slate-100 dark:hover:bg-zinc-800 text-xs font-bold"
              >
                <Download className="w-3.5 h-3.5 mr-1.5" />
                Export CSV
              </Button>
            </div>
          </div>

          {/* Filter Bar */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-4">
            <div className="flex items-center space-x-2">
              <Filter className="w-3.5 h-3.5 text-zinc-400 flex-shrink-0" />
              <label
                htmlFor="cohort-campaign-filter"
                className="text-xs font-semibold text-zinc-600 dark:text-zinc-300 flex-shrink-0"
              >
                Campaign:
              </label>
              <select
                id="cohort-campaign-filter"
                value={selectedCampaign}
                onChange={(e) => setSelectedCampaign(e.target.value)}
                className="w-full h-9 rounded-xl border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-950 px-3 text-xs font-semibold text-zinc-800 dark:text-zinc-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              >
                <option value="all">All Campaigns ({campaignOptions.length})</option>
                {campaignOptions.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center space-x-2">
              <Users className="w-3.5 h-3.5 text-zinc-400 flex-shrink-0" />
              <label
                htmlFor="cohort-affiliate-filter"
                className="text-xs font-semibold text-zinc-600 dark:text-zinc-300 flex-shrink-0"
              >
                Affiliate Wallet:
              </label>
              <select
                id="cohort-affiliate-filter"
                value={selectedAffiliate}
                onChange={(e) => setSelectedAffiliate(e.target.value)}
                className="w-full h-9 rounded-xl border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-950 px-3 text-xs font-semibold text-zinc-800 dark:text-zinc-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              >
                <option value="all">All Affiliates ({affiliateOptions.length})</option>
                {affiliateOptions.map((a) => (
                  <option key={a.address} value={a.address}>
                    {a.name} ({a.address.slice(0, 10)}...)
                  </option>
                ))}
              </select>
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-6 sm:p-8 space-y-6">
          {/* Executive Overview KPI Pills */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-zinc-950/60 border border-slate-100 dark:border-zinc-800">
              <div className="flex items-center justify-between text-xs font-semibold text-zinc-500 dark:text-zinc-400 mb-1">
                <span>Acquired Customers</span>
                <Users className="w-3.5 h-3.5 text-indigo-500" />
              </div>
              <div className="text-2xl font-black text-zinc-900 dark:text-white">
                {totals.totalUsers}
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-zinc-950/60 border border-slate-100 dark:border-zinc-800">
              <div className="flex items-center justify-between text-xs font-semibold text-zinc-500 dark:text-zinc-400 mb-1">
                <span>Average Customer LTV</span>
                <DollarSign className="w-3.5 h-3.5 text-emerald-500" />
              </div>
              <div className="text-2xl font-black text-zinc-900 dark:text-white">
                ${totals.overallLtv.toFixed(2)}
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-zinc-950/60 border border-slate-100 dark:border-zinc-800">
              <div className="flex items-center justify-between text-xs font-semibold text-zinc-500 dark:text-zinc-400 mb-1">
                <span>Avg 30-Day Retention</span>
                <TrendingUp className="w-3.5 h-3.5 text-indigo-500" />
              </div>
              <div className="text-2xl font-black text-zinc-900 dark:text-white">
                {totals.avgDay30.toFixed(1)}%
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-zinc-950/60 border border-slate-100 dark:border-zinc-800">
              <div className="flex items-center justify-between text-xs font-semibold text-zinc-500 dark:text-zinc-400 mb-1">
                <span>Avg 90-Day Retention</span>
                <Sparkles className="w-3.5 h-3.5 text-purple-500" />
              </div>
              <div className="text-2xl font-black text-zinc-900 dark:text-white">
                {totals.avgDay90.toFixed(1)}%
              </div>
            </div>
          </div>

          {/* Interactive Cohort Heatmap Table */}
          <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-zinc-800">
            <table className="w-full text-left border-collapse text-xs">
              <caption className="sr-only">Cohort retention and cumulative LTV by interval</caption>
              <thead>
                <tr className="bg-slate-100/80 dark:bg-zinc-950 border-b border-slate-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 uppercase font-extrabold tracking-wider">
                  <th className="py-3.5 px-4 font-bold">Cohort</th>
                  <th className="py-3.5 px-4 font-bold text-center">Users</th>
                  <th className="py-3.5 px-4 font-bold text-center">Day 0</th>
                  <th className="py-3.5 px-4 font-bold text-center">Day 30</th>
                  <th className="py-3.5 px-4 font-bold text-center">Day 60</th>
                  <th className="py-3.5 px-4 font-bold text-center">Day 90</th>
                  <th className="py-3.5 px-4 font-bold text-right">Total Revenue</th>
                  <th className="py-3.5 px-4 font-bold text-right">Average LTV</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-zinc-800/60 bg-white dark:bg-zinc-900/30">
                {cohorts.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="text-center py-10 text-zinc-400 font-medium">
                      No conversion cohorts found matching current filter selection.
                    </td>
                  </tr>
                ) : (
                  cohorts.map((cohort) => (
                    <tr
                      key={cohort.cohortId}
                      className="hover:bg-slate-50/80 dark:hover:bg-zinc-800/30 transition-colors"
                    >
                      <td className="py-3.5 px-4 font-bold text-zinc-900 dark:text-white">
                        {cohort.cohortLabel}
                      </td>

                      <td className="py-3.5 px-4 text-center font-semibold text-zinc-600 dark:text-zinc-300">
                        {cohort.initialUsers}
                      </td>

                      {/* Day 0 */}
                      <td className="p-2 text-center">
                        <div
                          className={`py-2 px-3 rounded-xl text-center ${
                            viewMetric === "retention"
                              ? getRetentionColorClass(100)
                              : getLtvColorClass(cohort.day0.avgLtv, maxLtvOverall)
                          }`}
                        >
                          {viewMetric === "retention"
                            ? "100%"
                            : `$${cohort.day0.avgLtv.toFixed(2)}`}
                        </div>
                      </td>

                      {/* Day 30 */}
                      <td className="p-2 text-center">
                        {cohort.day30.isMature ? (
                          <div
                            className={`py-2 px-3 rounded-xl text-center ${
                              viewMetric === "retention"
                                ? getRetentionColorClass(cohort.day30.retentionRate)
                                : getLtvColorClass(cohort.day30.avgLtv, maxLtvOverall)
                            }`}
                            title={`${cohort.day30.retainedUsers} users retained (${cohort.day30.repeatPurchases} repeat orders)`}
                          >
                            {viewMetric === "retention"
                              ? `${cohort.day30.retentionRate}%`
                              : `$${cohort.day30.avgLtv.toFixed(2)}`}
                          </div>
                        ) : (
                          <div
                            className="py-2 px-3 rounded-xl text-center bg-slate-100 dark:bg-zinc-800/40 text-zinc-400 font-normal"
                            title="Interval not yet mature (< 30 days elapsed)"
                          >
                            —
                          </div>
                        )}
                      </td>

                      {/* Day 60 */}
                      <td className="p-2 text-center">
                        {cohort.day60.isMature ? (
                          <div
                            className={`py-2 px-3 rounded-xl text-center ${
                              viewMetric === "retention"
                                ? getRetentionColorClass(cohort.day60.retentionRate)
                                : getLtvColorClass(cohort.day60.avgLtv, maxLtvOverall)
                            }`}
                            title={`${cohort.day60.retainedUsers} users retained (${cohort.day60.repeatPurchases} repeat orders)`}
                          >
                            {viewMetric === "retention"
                              ? `${cohort.day60.retentionRate}%`
                              : `$${cohort.day60.avgLtv.toFixed(2)}`}
                          </div>
                        ) : (
                          <div
                            className="py-2 px-3 rounded-xl text-center bg-slate-100 dark:bg-zinc-800/40 text-zinc-400 font-normal"
                            title="Interval not yet mature (< 60 days elapsed)"
                          >
                            —
                          </div>
                        )}
                      </td>

                      {/* Day 90 */}
                      <td className="p-2 text-center">
                        {cohort.day90.isMature ? (
                          <div
                            className={`py-2 px-3 rounded-xl text-center ${
                              viewMetric === "retention"
                                ? getRetentionColorClass(cohort.day90.retentionRate)
                                : getLtvColorClass(cohort.day90.avgLtv, maxLtvOverall)
                            }`}
                            title={`${cohort.day90.retainedUsers} users retained (${cohort.day90.repeatPurchases} repeat orders)`}
                          >
                            {viewMetric === "retention"
                              ? `${cohort.day90.retentionRate}%`
                              : `$${cohort.day90.avgLtv.toFixed(2)}`}
                          </div>
                        ) : (
                          <div
                            className="py-2 px-3 rounded-xl text-center bg-slate-100 dark:bg-zinc-800/40 text-zinc-400 font-normal"
                            title="Interval not yet mature (< 90 days elapsed)"
                          >
                            —
                          </div>
                        )}
                      </td>

                      <td className="py-3.5 px-4 text-right font-extrabold text-zinc-900 dark:text-white">
                        $
                        {cohort.totalCumulativeRevenue.toLocaleString(undefined, {
                          minimumFractionDigits: 2,
                        })}
                      </td>

                      <td className="py-3.5 px-4 text-right font-black text-indigo-600 dark:text-indigo-400">
                        ${cohort.totalLtv.toFixed(2)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Color Legend */}
          <div className="flex flex-wrap items-center justify-between gap-4 pt-2 text-xs text-zinc-500 dark:text-zinc-400">
            <div className="flex items-center space-x-3">
              <span className="font-semibold text-[11px] uppercase tracking-wider">
                Heatmap Intensity:
              </span>
              <div className="flex items-center space-x-1.5">
                <span className="w-5 h-3 rounded bg-slate-200 dark:bg-zinc-800" />
                <span className="text-[10px]">0%</span>
                <span className="w-5 h-3 rounded bg-emerald-500/20" />
                <span className="text-[10px]">1-15%</span>
                <span className="w-5 h-3 rounded bg-emerald-500/50" />
                <span className="text-[10px]">15-40%</span>
                <span className="w-5 h-3 rounded bg-emerald-600" />
                <span className="text-[10px] font-bold">&gt;40%</span>
              </div>
            </div>
            <span>Calculated from customer initial attribution timestamp</span>
          </div>
        </CardContent>
      </Card>

      {/* Partner Basket Size & Repeat Purchase Frequency Breakdown */}
      <Card className="border border-slate-200 dark:border-zinc-800 shadow-sm rounded-3xl bg-white dark:bg-zinc-900/50">
        <CardHeader className="pb-4 pt-6 px-6 sm:px-8 border-b border-slate-100 dark:border-zinc-800/60">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg font-bold text-zinc-900 dark:text-white flex items-center space-x-2">
                <ShoppingBag className="w-5 h-5 text-indigo-500" />
                <span>Affiliate Partner Basket Size & Repeat Transaction Breakdown</span>
              </CardTitle>
              <CardDescription className="text-zinc-500 dark:text-zinc-400 mt-1 text-xs">
                Detailed metrics measuring customer stickiness, average basket size, and total LTV
                per partner
              </CardDescription>
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-6 sm:p-8">
          {partnerMetrics.length === 0 ? (
            <div className="text-center py-8 text-zinc-400 text-xs font-medium">
              No partner cohort metrics available for selected filter.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {partnerMetrics.map((partner) => (
                <div
                  key={partner.affiliateAddress}
                  className="p-5 rounded-2xl bg-slate-50 dark:bg-zinc-950/60 border border-slate-200/80 dark:border-zinc-800 hover:border-indigo-400 dark:hover:border-indigo-600 transition-all space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <h4 className="font-extrabold text-sm text-zinc-900 dark:text-white">
                      {partner.affiliateName}
                    </h4>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-950/80 text-indigo-700 dark:text-indigo-300 font-bold">
                      {partner.totalConversions} sales
                    </span>
                  </div>

                  <div
                    className="text-[11px] font-mono text-zinc-400 truncate"
                    title={partner.affiliateAddress}
                  >
                    {partner.affiliateAddress}
                  </div>

                  <div className="space-y-2 pt-2 border-t border-slate-200/60 dark:border-zinc-800 text-xs">
                    <div className="flex justify-between items-center">
                      <span className="text-zinc-500 dark:text-zinc-400">Avg Basket Size:</span>
                      <strong className="text-zinc-900 dark:text-white font-black">
                        ${partner.averageBasketSize.toFixed(2)}
                      </strong>
                    </div>

                    <div className="flex justify-between items-center">
                      <span className="text-zinc-500 dark:text-zinc-400">Repeat Frequency:</span>
                      <strong className="text-emerald-600 dark:text-emerald-400 font-black">
                        {partner.repeatTransactionRate}%
                      </strong>
                    </div>

                    <div className="flex justify-between items-center">
                      <span className="text-zinc-500 dark:text-zinc-400">Customer LTV:</span>
                      <strong className="text-indigo-600 dark:text-indigo-400 font-black">
                        ${partner.averageLtv.toFixed(2)}
                      </strong>
                    </div>

                    <div className="flex justify-between items-center pt-1 border-t border-slate-200/40 dark:border-zinc-800/40">
                      <span className="text-zinc-500 dark:text-zinc-400">Total Revenue:</span>
                      <strong className="text-zinc-900 dark:text-white font-black">
                        $
                        {partner.totalRevenue.toLocaleString(undefined, {
                          minimumFractionDigits: 2,
                        })}
                      </strong>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
