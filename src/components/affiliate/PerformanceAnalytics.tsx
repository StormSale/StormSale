import { useState, useEffect, useCallback, useRef } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../../components/ui/table";
import {
  TrendingUp,
  TrendingDown,
  Minus,
  RefreshCw,
  Copy,
  Check,
  MousePointerClick,
  Target,
  DollarSign,
  Activity,
  Zap,
  CheckCircle2,
} from "lucide-react";
import {
  fetchAffiliateConversionData,
  recordLinkClick,
  recordLinkConversion,
  type ActiveLinkAnalytics,
  type ConversionAnalyticsSummary,
} from "../../utils/api";
import { useNotification } from "../../context/NotificationContext";
import { useWeb3 } from "../../context/Web3Context";

const getErrorMessage = (err: unknown, fallback: string): string => {
  return err instanceof Error && err.message ? err.message : fallback;
};

export const PerformanceAnalytics = () => {
  const { showNotification } = useNotification();
  const { userAddress } = useWeb3();
  const [links, setLinks] = useState<ActiveLinkAnalytics[]>([]);
  const [summary, setSummary] = useState<ConversionAnalyticsSummary | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [fetchStatus, setFetchStatus] = useState<"synced" | "offline">("offline");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [timeRange, setTimeRange] = useState<"24h" | "7d" | "30d" | "all">("7d");
  const [simulatingId, setSimulatingId] = useState<string | null>(null);

  const activeRangeRef = useRef(timeRange);

  useEffect(() => {
    activeRangeRef.current = timeRange;
  }, [timeRange]);

  const loadData = useCallback(
    async (showToast = false, range: "24h" | "7d" | "30d" | "all" = timeRange) => {
      setIsSyncing(true);
      try {
        const data = await fetchAffiliateConversionData(userAddress || undefined, range);
        // Discard results for an obsolete time range
        if (activeRangeRef.current !== range) {
          return;
        }
        setLinks(data.links);
        setSummary(data.summary);
        setFetchStatus("synced");
        if (showToast) {
          showNotification({
            type: "success",
            title: "Analytics Synced",
            message: "Real-time conversion and CVR metrics synchronized with backend.",
          });
        }
      } catch (error: unknown) {
        console.error("Failed to sync conversion data:", error);
        setFetchStatus("offline");
        if (showToast) {
          showNotification({
            type: "error",
            title: "Sync Failed",
            message: getErrorMessage(
              error,
              "Failed to synchronize conversion and CVR metrics with backend.",
            ),
          });
        }
      } finally {
        if (activeRangeRef.current === range) {
          setIsSyncing(false);
        }
      }
    },
    [showNotification, timeRange, userAddress],
  );

  useEffect(() => {
    let isMounted = true;
    void Promise.resolve().then(async () => {
      if (!isMounted) return;
      await loadData(false, timeRange);
    });
    // Real-time polling every 30 seconds
    const interval = setInterval(() => {
      void loadData(false, timeRange);
    }, 30000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [loadData, timeRange]);

  const handleCopyLink = async (linkId: string, url: string) => {
    try {
      if (!navigator.clipboard?.writeText) {
        throw new Error("Clipboard API not available in current environment");
      }
      await navigator.clipboard.writeText(url);
      setCopiedId(linkId);
      showNotification({
        type: "info",
        title: "Link Copied",
        message: "Referral link copied to clipboard.",
      });
      setTimeout(() => setCopiedId(null), 2000);
    } catch (err: unknown) {
      showNotification({
        type: "error",
        title: "Copy Failed",
        message: getErrorMessage(err, "Could not copy link to clipboard."),
      });
    }
  };

  const handleSimulateClick = async (linkId: string) => {
    setSimulatingId(linkId);
    try {
      const currentRange = activeRangeRef.current;
      const updated = await recordLinkClick(linkId, currentRange, userAddress || undefined);
      setLinks((prev) => prev.map((l) => (l.id === linkId ? updated : l)));
      // Refresh summary for the currently active range
      const data = await fetchAffiliateConversionData(userAddress || undefined, currentRange);
      if (activeRangeRef.current === currentRange) {
        setSummary(data.summary);
      }
      showNotification({
        type: "info",
        title: "Click Recorded",
        message: `New click tracked for ${updated.campaignName}. CVR updated to ${updated.conversionRate}%.`,
      });
    } catch (error: unknown) {
      console.error("Error recording click:", error);
      showNotification({
        type: "error",
        title: "Recording Click Failed",
        message: getErrorMessage(error, "Failed to record click."),
      });
    } finally {
      setSimulatingId(null);
    }
  };

  const handleSimulateSale = async (linkId: string) => {
    setSimulatingId(linkId);
    try {
      const currentRange = activeRangeRef.current;
      const updated = await recordLinkConversion(linkId, 100, currentRange, userAddress || undefined);
      setLinks((prev) => prev.map((l) => (l.id === linkId ? updated : l)));
      const data = await fetchAffiliateConversionData(userAddress || undefined, currentRange);
      if (activeRangeRef.current === currentRange) {
        setSummary(data.summary);
      }
      showNotification({
        type: "success",
        title: "Conversion Recorded!",
        message: `Sale registered for ${updated.campaignName}! CVR rose to ${updated.conversionRate}%.`,
        confetti: true,
      });
    } catch (error: unknown) {
      console.error("Error recording sale:", error);
      showNotification({
        type: "error",
        title: "Recording Sale Failed",
        message: getErrorMessage(error, "Failed to record conversion."),
      });
    } finally {
      setSimulatingId(null);
    }
  };

  const renderTrendBadge = (
    delta: number,
    direction: "up" | "down" | "neutral",
    showLabel = true,
  ) => {
    if (direction === "up") {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400">
          <TrendingUp className="w-3.5 h-3.5" />
          <span>+{delta.toFixed(1)}%</span>
          {showLabel && <span className="opacity-75 font-medium text-[10px]">vs prev</span>}
        </span>
      );
    }
    if (direction === "down") {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-400">
          <TrendingDown className="w-3.5 h-3.5" />
          <span>{delta.toFixed(1)}%</span>
          {showLabel && <span className="opacity-75 font-medium text-[10px]">vs prev</span>}
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-700 dark:bg-zinc-800 dark:text-zinc-400">
        <Minus className="w-3.5 h-3.5" />
        <span>0.0%</span>
        {showLabel && <span className="opacity-75 font-medium text-[10px]">steady</span>}
      </span>
    );
  };

  return (
    <div className="space-y-8 font-sans">
      {/* Header with Live Sync Status */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center bg-white dark:bg-zinc-900/50 p-6 md:p-8 rounded-3xl border border-slate-200 dark:border-zinc-800 shadow-sm gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl md:text-3xl font-extrabold text-zinc-900 dark:text-white tracking-tight">
              Real-Time CVR & Conversion Analytics
            </h1>
            {fetchStatus === "synced" ? (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300">
                <span className="w-2 h-2 rounded-full bg-emerald-500 motion-safe:animate-pulse" />
                Live Synced
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-400">
                <span className="w-2 h-2 rounded-full bg-zinc-400" />
                Offline / Stale
              </span>
            )}
          </div>
          <p className="text-zinc-500 dark:text-zinc-400 mt-2 font-medium">
            Track active referral link performance, click-to-sale ratios, and automated conversion
            trends.
          </p>
        </div>

        <div className="flex items-center gap-3 w-full lg:w-auto justify-between lg:justify-end">
          <div className="flex bg-slate-100 dark:bg-zinc-800 p-1 rounded-xl">
            {(["24h", "7d", "30d", "all"] as const).map((range) => (
              <button
                key={range}
                onClick={() => setTimeRange(range)}
                className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${
                  timeRange === range
                    ? "bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white shadow-sm"
                    : "text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-300"
                }`}
              >
                {range.toUpperCase()}
              </button>
            ))}
          </div>

          <Button
            onClick={() => loadData(true)}
            disabled={isSyncing}
            variant="outline"
            className="rounded-xl border-slate-200 dark:border-zinc-800 font-semibold gap-2 h-10 shadow-sm"
          >
            <RefreshCw className={`w-4 h-4 ${isSyncing ? "animate-spin text-indigo-600" : ""}`} />
            <span>{isSyncing ? "Syncing..." : "Sync Backend"}</span>
          </Button>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {/* Average CVR Card */}
        <Card className="bg-white dark:bg-zinc-900/80 shadow-sm border border-slate-200 dark:border-zinc-800 rounded-2xl relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-indigo-500 to-emerald-500" />
          <CardContent className="p-6">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                  Overall Conversion Rate
                </p>
                <div className="flex items-baseline gap-2 mt-2 mb-1">
                  <span className="text-3xl font-black text-zinc-900 dark:text-white">
                    {summary ? `${summary.overallCVR}%` : "0.0%"}
                  </span>
                </div>
                <div className="mt-2">
                  {summary &&
                    renderTrendBadge(summary.cvrTrendDelta, summary.cvrTrendDirection, true)}
                </div>
              </div>
              <div className="w-11 h-11 bg-indigo-50 dark:bg-indigo-500/10 rounded-2xl flex items-center justify-center border border-indigo-100 dark:border-indigo-500/20 text-indigo-600 dark:text-indigo-400">
                <Activity className="w-5 h-5" />
              </div>
            </div>
            <p className="text-[11px] text-zinc-400 dark:text-zinc-500 mt-4 font-medium">
              Click-to-sale ratio across all active links
            </p>
          </CardContent>
        </Card>

        {/* Total Clicks */}
        <Card className="bg-white dark:bg-zinc-900/80 shadow-sm border border-slate-200 dark:border-zinc-800 rounded-2xl">
          <CardContent className="p-6">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                  Total Tracked Clicks
                </p>
                <p className="text-3xl font-black text-zinc-900 dark:text-white mt-2 mb-1">
                  {summary ? summary.totalClicks.toLocaleString() : "0"}
                </p>
              </div>
              <div className="w-11 h-11 bg-blue-50 dark:bg-blue-500/10 rounded-2xl flex items-center justify-center border border-blue-100 dark:border-blue-500/20 text-blue-600 dark:text-blue-400">
                <MousePointerClick className="w-5 h-5" />
              </div>
            </div>
            <p className="text-[11px] text-zinc-400 dark:text-zinc-500 mt-4 font-medium">
              Verified inbound referral visits
            </p>
          </CardContent>
        </Card>

        {/* Total Conversions / Sales */}
        <Card className="bg-white dark:bg-zinc-900/80 shadow-sm border border-slate-200 dark:border-zinc-800 rounded-2xl">
          <CardContent className="p-6">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                  Total Conversions
                </p>
                <p className="text-3xl font-black text-zinc-900 dark:text-white mt-2 mb-1">
                  {summary ? summary.totalConversions.toLocaleString() : "0"}
                </p>
              </div>
              <div className="w-11 h-11 bg-emerald-50 dark:bg-emerald-500/10 rounded-2xl flex items-center justify-center border border-emerald-100 dark:border-emerald-500/20 text-emerald-600 dark:text-emerald-400">
                <Target className="w-5 h-5" />
              </div>
            </div>
            <p className="text-[11px] text-zinc-400 dark:text-zinc-500 mt-4 font-medium">
              On-chain settled purchase events
            </p>
          </CardContent>
        </Card>

        {/* Total Commissions Earned */}
        <Card className="bg-white dark:bg-zinc-900/80 shadow-sm border border-slate-200 dark:border-zinc-800 rounded-2xl">
          <CardContent className="p-6">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                  Commissions Earned
                </p>
                <p className="text-3xl font-black text-zinc-900 dark:text-white mt-2 mb-1">
                  {summary ? `${summary.totalEarnedXlm.toLocaleString()} XLM` : "0 XLM"}
                </p>
              </div>
              <div className="w-11 h-11 bg-amber-50 dark:bg-amber-500/10 rounded-2xl flex items-center justify-center border border-amber-100 dark:border-amber-500/20 text-amber-600 dark:text-amber-400">
                <DollarSign className="w-5 h-5" />
              </div>
            </div>
            <p className="text-[11px] text-zinc-400 dark:text-zinc-500 mt-4 font-medium">
              Claimable upon clearing period end
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Conversion Funnel & Calculation Explainer */}
      <Card className="border border-slate-200 dark:border-zinc-800 shadow-sm bg-white dark:bg-zinc-900/50 rounded-3xl">
        <CardHeader className="pt-6 px-6 pb-4 border-b border-slate-100 dark:border-zinc-800/60">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
            <div>
              <CardTitle className="text-lg font-bold text-zinc-900 dark:text-white">
                Click-to-Sale Conversion Ratio (CVR) Formula
              </CardTitle>
              <CardDescription className="text-xs text-zinc-500 dark:text-zinc-400">
                Formula: CVR = (Total Conversions ÷ Total Clicks) × 100%
              </CardDescription>
            </div>
            <div className="text-xs font-mono font-bold px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200">
              Synced: {summary ? summary.lastSynced : "Just now"}
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-center">
            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-zinc-950/50 border border-slate-100 dark:border-zinc-800/50 text-center">
              <span className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">
                1. Total Clicks
              </span>
              <p className="text-2xl font-black text-zinc-900 dark:text-white mt-1">
                {summary ? summary.totalClicks.toLocaleString() : "0"}
              </p>
              <span className="text-[10px] text-zinc-400">Unique referral traffic</span>
            </div>

            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-zinc-950/50 border border-slate-100 dark:border-zinc-800/50 text-center">
              <span className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">
                2. Successful Conversions
              </span>
              <p className="text-2xl font-black text-emerald-600 dark:text-emerald-400 mt-1">
                {summary ? summary.totalConversions.toLocaleString() : "0"}
              </p>
              <span className="text-[10px] text-zinc-400">On-chain logged sales</span>
            </div>

            <div className="p-4 rounded-2xl bg-gradient-to-br from-indigo-50 to-purple-50 dark:from-indigo-950/30 dark:to-purple-950/30 border border-indigo-100 dark:border-indigo-500/20 text-center">
              <span className="text-xs font-bold text-indigo-700 dark:text-indigo-300">
                3. Calculated CVR Percentage
              </span>
              <p className="text-2xl font-black text-indigo-600 dark:text-indigo-400 mt-1">
                {summary ? `${summary.overallCVR}%` : "0.0%"}
              </p>
              <span className="text-[10px] text-indigo-500 dark:text-indigo-300 font-semibold">
                Rounds to 2 decimal places
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Active Links Real-Time Table */}
      <Card className="border border-slate-200 dark:border-zinc-800 shadow-sm bg-white dark:bg-zinc-900/50 rounded-3xl">
        <CardHeader className="pt-8 px-8 pb-6 border-b border-slate-100 dark:border-zinc-800/50">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <CardTitle className="text-2xl font-bold text-zinc-900 dark:text-white">
                Active Links & Click-to-Sale Ratios
              </CardTitle>
              <CardDescription className="text-zinc-500 dark:text-zinc-400 mt-1">
                Real-time CVR breakdown and performance tracking per referral campaign
              </CardDescription>
            </div>
            <div className="text-xs text-zinc-400 dark:text-zinc-500 font-medium">
              Showing {links.length} active affiliate links
            </div>
          </div>
        </CardHeader>
        <CardContent className="px-8 pb-8 pt-6">
          <div className="overflow-x-auto rounded-xl border border-slate-100 dark:border-zinc-800/50">
            <Table>
              <TableHeader>
                <TableRow className="border-b border-slate-100 dark:border-zinc-800/50 bg-slate-50 dark:bg-zinc-950/50">
                  <TableHead className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 py-4 pl-6">
                    Campaign & Link
                  </TableHead>
                  <TableHead className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 py-4">
                    Clicks
                  </TableHead>
                  <TableHead className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 py-4">
                    Sales
                  </TableHead>
                  <TableHead className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 py-4">
                    CVR (Click-to-Sale)
                  </TableHead>
                  <TableHead className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 py-4">
                    Trend Indicator
                  </TableHead>
                  <TableHead className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 py-4">
                    Earned
                  </TableHead>
                  {import.meta.env.DEV && (
                    <TableHead className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 py-4 pr-6 text-right">
                      Real-time Test / Action
                    </TableHead>
                  )}
                </TableRow>
              </TableHeader>
              <TableBody>
                {links.map((link) => (
                  <TableRow
                    key={link.id}
                    className="border-b border-slate-50 dark:border-zinc-900 hover:bg-slate-50/50 dark:hover:bg-zinc-900/30 transition-colors"
                  >
                    <TableCell className="py-4 pl-6">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-sm text-zinc-900 dark:text-white">
                            {link.campaignName}
                          </span>
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-400">
                            {link.status}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 text-xs text-zinc-400 dark:text-zinc-500">
                          <span className="font-mono truncate max-w-[220px]">{link.linkUrl}</span>
                          <button
                            onClick={() => handleCopyLink(link.id, link.linkUrl)}
                            className="p-1 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors rounded"
                            title="Copy referral link"
                          >
                            {copiedId === link.id ? (
                              <Check className="w-3.5 h-3.5 text-emerald-500" />
                            ) : (
                              <Copy className="w-3.5 h-3.5" />
                            )}
                          </button>
                        </div>
                      </div>
                    </TableCell>

                    <TableCell className="font-mono font-semibold text-zinc-700 dark:text-zinc-300 py-4">
                      {link.clicks.toLocaleString()}
                    </TableCell>

                    <TableCell className="font-mono font-bold text-emerald-600 dark:text-emerald-400 py-4">
                      {link.conversions.toLocaleString()}
                    </TableCell>

                    <TableCell className="py-4">
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-extrabold text-sm text-zinc-900 dark:text-white font-mono">
                            {link.conversionRate.toFixed(2)}%
                          </span>
                          <span className="text-[10px] text-zinc-400 font-medium">
                            {link.conversions}/{link.clicks}
                          </span>
                        </div>
                        {/* Progress Bar Gauge */}
                        <div className="w-28 h-2 rounded-full bg-slate-100 dark:bg-zinc-800 overflow-hidden">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-emerald-500 transition-all duration-500"
                            style={{
                              width: `${Math.min(100, (link.conversionRate / 10) * 100)}%`,
                            }}
                          />
                        </div>
                      </div>
                    </TableCell>

                    <TableCell className="py-4">
                      {renderTrendBadge(link.trendDelta, link.trendDirection, true)}
                    </TableCell>

                    <TableCell className="font-bold text-indigo-600 dark:text-indigo-400 py-4 font-mono">
                      {link.commissionEarnedXlm.toLocaleString()} XLM
                    </TableCell>

                    {import.meta.env.DEV && (
                      <TableCell className="py-4 pr-6 text-right">
                        <div className="inline-flex items-center gap-1.5 justify-end">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleSimulateClick(link.id)}
                            disabled={simulatingId === link.id}
                            className="h-8 px-2.5 text-xs rounded-lg font-medium border-slate-200 dark:border-zinc-800 hover:bg-slate-100 dark:hover:bg-zinc-800"
                            title="Simulate click event to test real-time CVR recalculation"
                          >
                            <Zap className="w-3 h-3 text-amber-500 mr-1" />
                            +Click
                          </Button>

                          <Button
                            size="sm"
                            onClick={() => handleSimulateSale(link.id)}
                            disabled={simulatingId === link.id}
                            className="h-8 px-2.5 text-xs rounded-lg font-bold bg-zinc-900 hover:bg-zinc-800 dark:bg-indigo-600 dark:hover:bg-indigo-500 text-white shadow-sm"
                            title="Simulate sale event to trigger conversion and toast alert"
                          >
                            <CheckCircle2 className="w-3 h-3 mr-1" />
                            +Sale
                          </Button>
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
