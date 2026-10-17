import { useState, useEffect } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import {
  TrendingUp,
  TrendingDown,
  Minus,
  Users,
  DollarSign,
  ArrowRight,
  CheckCircle2,
  BarChart3,
} from "lucide-react";
import {
  fetchAffiliateConversionData,
  type ActiveLinkAnalytics,
  type ConversionAnalyticsSummary,
} from "../../utils/api";

interface AffiliateOverviewProps {
  onNavigateTab?: (tab: string) => void;
}

export const AffiliateOverview: React.FC<AffiliateOverviewProps> = ({ onNavigateTab }) => {
  const [conversionData, setConversionData] = useState<{
    links: ActiveLinkAnalytics[];
    summary: ConversionAnalyticsSummary;
  } | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchAffiliateConversionData()
      .then((data) => {
        setConversionData(data);
      })
      .catch((err) => {
        console.error("Failed to load conversion data:", err);
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, []);

  const overallCVR = conversionData?.summary.overallCVR ?? 0;
  const cvrTrendDelta = conversionData?.summary.cvrTrendDelta ?? 0;
  const cvrTrendDirection = conversionData?.summary.cvrTrendDirection ?? "neutral";

  const stats: Array<{
    title: string;
    value: string;
    change?: string;
    trend?: "up" | "down" | "neutral";
    icon: any;
  }> = [
    {
      title: "Total Earnings",
      value: isLoading
        ? "Loading..."
        : conversionData
          ? `${conversionData.summary.totalEarnedXlm.toLocaleString()} XLM`
          : "0 XLM",
      icon: DollarSign,
    },
    {
      title: "Active Campaigns",
      value: isLoading
        ? "..."
        : conversionData
          ? `${conversionData.summary.activeLinksCount}`
          : "0",
      icon: Users,
    },
    {
      title: "Conversion Rate (CVR)",
      value: isLoading ? "..." : `${overallCVR.toFixed(2)}%`,
      change: isLoading
        ? "Loading..."
        : `${cvrTrendDelta >= 0 ? "+" : ""}${cvrTrendDelta.toFixed(2)}% vs benchmark`,
      trend: cvrTrendDirection,
      icon: TrendingUp,
    },
  ];

  const recentPayouts = [
    {
      campaign: "Tech Gadgets Pro",
      amount: "$1,250",
      date: "2 days ago",
      status: "Completed",
    },
    {
      campaign: "Web3 Masterclass",
      amount: "$890",
      date: "1 week ago",
      status: "Completed",
    },
    {
      campaign: "Crypto Tools",
      amount: "$2,150",
      date: "2 weeks ago",
      status: "Completed",
    },
  ];

  return (
    <div className="space-y-8 font-sans">
      {/* Header */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center bg-white dark:bg-zinc-900/50 p-6 md:p-8 rounded-3xl border border-slate-200 dark:border-zinc-800 shadow-sm">
        <div>
          <h1 className="text-2xl md:text-3xl font-extrabold text-zinc-900 dark:text-white tracking-tight">
            Affiliate Dashboard
          </h1>
          <p className="text-zinc-500 dark:text-zinc-400 mt-2 font-medium">
            Track your performance, real-time conversion rates, and maximize your on-chain earnings.
          </p>
        </div>
        <Button
          onClick={() => onNavigateTab?.("performance")}
          className="mt-6 lg:mt-0 bg-zinc-900 hover:bg-zinc-800 dark:bg-indigo-600 dark:hover:bg-indigo-500 text-white rounded-full px-6 h-12 font-semibold shadow-md transition-all gap-2"
        >
          <BarChart3 className="w-5 h-5" />
          View CVR Analytics
        </Button>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {stats.map((stat, index) => {
          const IconComponent = stat.icon;
          return (
            <Card
              key={index}
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
                    {stat.change && (
                      <div className="flex items-center gap-1 mt-1">
                        {stat.trend === "up" && (
                          <TrendingUp className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                        )}
                        {stat.trend === "down" && (
                          <TrendingDown className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400" />
                        )}
                        {stat.trend === "neutral" && (
                          <Minus className="w-3.5 h-3.5 text-slate-500 dark:text-zinc-400" />
                        )}
                        <p
                          className={`text-xs font-semibold ${
                            stat.trend === "up"
                              ? "text-emerald-600 dark:text-emerald-400"
                              : stat.trend === "down"
                                ? "text-rose-600 dark:text-rose-400"
                                : "text-indigo-600 dark:text-indigo-400"
                          }`}
                        >
                          {stat.change}
                        </p>
                      </div>
                    )}
                  </div>
                  <div className="w-10 h-10 bg-slate-100 dark:bg-zinc-800 rounded-xl flex items-center justify-center border border-slate-200 dark:border-zinc-700 shrink-0">
                    <IconComponent className="w-5 h-5 text-zinc-900 dark:text-indigo-400" />
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Real-Time Active Links CVR Snapshot */}
      {conversionData && (
        <Card className="border border-slate-200 dark:border-zinc-800 shadow-sm rounded-3xl bg-white dark:bg-zinc-900/50">
          <CardHeader className="border-b border-slate-100 dark:border-zinc-800/50 pb-4">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
              <div>
                <CardTitle className="text-lg font-bold text-zinc-900 dark:text-white">
                  Active Referral Links & Click-to-Sale Ratios (CVR)
                </CardTitle>
                <CardDescription className="text-zinc-500 dark:text-zinc-400 text-xs">
                  Live synced with backend conversion data
                </CardDescription>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onNavigateTab?.("performance")}
                className="text-indigo-600 dark:text-indigo-400 text-xs font-bold gap-1 p-0 hover:bg-transparent"
              >
                <span>Full Analytics</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="pt-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {conversionData.links.map((link) => (
                <div
                  key={link.id}
                  className="p-4 rounded-2xl bg-slate-50 dark:bg-zinc-950/50 border border-slate-100 dark:border-zinc-800/60 space-y-2 hover:border-indigo-200 dark:hover:border-indigo-500/30 transition-all"
                >
                  <div className="flex justify-between items-start">
                    <div className="font-bold text-xs text-zinc-900 dark:text-white truncate max-w-[140px]">
                      {link.campaignName}
                    </div>
                    <span
                      className={`inline-flex items-center gap-1 text-[10px] font-extrabold px-2 py-0.5 rounded-full ${
                        link.trendDirection === "up"
                          ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400"
                          : link.trendDirection === "down"
                            ? "bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-400"
                            : "bg-slate-200 text-slate-700 dark:bg-zinc-800 dark:text-zinc-400"
                      }`}
                    >
                      {link.trendDirection === "up" && <TrendingUp className="w-2.5 h-2.5" />}
                      {link.trendDirection === "down" && <TrendingDown className="w-2.5 h-2.5" />}
                      {link.trendDirection === "neutral" && <Minus className="w-2.5 h-2.5" />}
                      {link.trendDelta >= 0 ? `+${link.trendDelta}%` : `${link.trendDelta}%`}
                    </span>
                  </div>

                  <div className="flex items-baseline justify-between pt-1">
                    <div>
                      <span className="text-[10px] uppercase font-bold text-zinc-400">CVR</span>
                      <p className="text-xl font-mono font-black text-indigo-600 dark:text-indigo-400">
                        {link.conversionRate.toFixed(2)}%
                      </p>
                    </div>
                    <div className="text-right">
                      <span className="text-[10px] text-zinc-400">Sales/Clicks</span>
                      <p className="text-xs font-mono font-bold text-zinc-700 dark:text-zinc-300">
                        {link.conversions} / {link.clicks}
                      </p>
                    </div>
                  </div>

                  {/* Progress bar */}
                  <div className="w-full h-1.5 rounded-full bg-slate-200 dark:bg-zinc-800 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-indigo-600 dark:bg-indigo-500"
                      style={{ width: `${Math.min(100, (link.conversionRate / 8) * 100)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Two Column Layout */}
      <div className="grid lg:grid-cols-2 gap-8">
        {/* Recent Payouts */}
        <Card className="border border-slate-200 dark:border-zinc-800 shadow-sm rounded-2xl bg-white dark:bg-zinc-900/50">
          <CardHeader className="border-b border-slate-100 dark:border-zinc-800/50 pb-4">
            <CardTitle className="text-lg font-bold text-zinc-900 dark:text-white">
              Recent Payouts
            </CardTitle>
            <CardDescription className="text-zinc-500 dark:text-zinc-400">
              Your latest commission payments
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-6">
            <div className="space-y-4">
              {recentPayouts.map((payout, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between p-4 bg-slate-50 dark:bg-zinc-950/50 border border-slate-100 dark:border-zinc-800/50 rounded-xl hover:border-slate-200 dark:hover:border-zinc-700 transition-colors"
                >
                  <div className="flex items-center space-x-3">
                    <div className="w-10 h-10 bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-100 dark:border-indigo-500/20 rounded-xl flex items-center justify-center shrink-0">
                      <DollarSign className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                    </div>
                    <div>
                      <div className="font-bold text-sm text-zinc-900 dark:text-white">
                        {payout.campaign}
                      </div>
                      <div className="text-xs font-medium text-zinc-400 dark:text-zinc-500 mt-0.5">
                        {payout.date}
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-bold text-sm text-zinc-900 dark:text-white">
                      {payout.amount}
                    </div>
                    <div className="flex items-center justify-end gap-1 mt-1">
                      <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                      <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wide">
                        {payout.status}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <Button
              variant="ghost"
              onClick={() => onNavigateTab?.("claim-payouts")}
              className="w-full mt-6 text-indigo-600 dark:text-indigo-400 font-semibold hover:bg-slate-50 dark:hover:bg-zinc-900/50"
            >
              <span>View All Payouts</span>
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </CardContent>
        </Card>

        {/* Performance Tips */}
        <Card className="border border-slate-200 dark:border-zinc-800 shadow-sm rounded-2xl bg-white dark:bg-zinc-900/50">
          <CardHeader className="border-b border-slate-100 dark:border-zinc-800/50 pb-4">
            <CardTitle className="text-lg font-bold text-zinc-900 dark:text-white">
              Performance Tips
            </CardTitle>
            <CardDescription className="text-zinc-500 dark:text-zinc-400">
              Boost your affiliate earnings
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-6">
            <div className="space-y-4">
              {[
                {
                  tip: "Optimize your content for higher conversions (target > 5% CVR)",
                  impact: "High",
                },
                { tip: "Join trending campaigns early to capture early volume", impact: "Medium" },
                {
                  tip: "Use multiple promotion channels with tailored referral links",
                  impact: "High",
                },
                {
                  tip: "Engage with your audience regularly on social media",
                  impact: "Medium",
                },
              ].map((item, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between p-4 bg-slate-50 dark:bg-zinc-950/50 border border-slate-100 dark:border-zinc-800/50 rounded-xl"
                >
                  <div className="text-sm font-medium text-zinc-700 dark:text-zinc-300 pr-4">
                    {item.tip}
                  </div>
                  <span
                    className={`shrink-0 text-[10px] uppercase tracking-wider font-bold px-3 py-1 rounded-full ${
                      item.impact === "High"
                        ? "bg-indigo-100 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-400"
                        : "bg-slate-200 text-slate-600 dark:bg-zinc-800 dark:text-zinc-400"
                    }`}
                  >
                    {item.impact}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions */}
      <Card className="border border-slate-200 dark:border-zinc-800 shadow-sm rounded-2xl bg-white dark:bg-zinc-900/50">
        <CardHeader className="border-b border-slate-100 dark:border-zinc-800/50 pb-4">
          <CardTitle className="text-lg font-bold text-zinc-900 dark:text-white">
            Quick Actions
          </CardTitle>
          <CardDescription className="text-zinc-500 dark:text-zinc-400">
            Get started quickly
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[
              {
                label: "Join New Campaign",
                description: "Discover high-paying campaigns",
                icon: Users,
                tab: "join-campaign",
              },
              {
                label: "Track Performance",
                description: "View CVR analytics and insights",
                icon: TrendingUp,
                tab: "performance",
              },
              {
                label: "Withdraw Earnings",
                description: "Claim your commissions",
                icon: DollarSign,
                tab: "claim-payouts",
              },
            ].map((action, index) => {
              const IconComponent = action.icon;
              return (
                <Button
                  key={index}
                  variant="outline"
                  onClick={() => onNavigateTab?.(action.tab)}
                  className="h-24 flex-col gap-3 rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 hover:bg-slate-50 dark:hover:bg-zinc-800 hover:border-slate-300 dark:hover:border-zinc-700 transition-all group"
                >
                  <IconComponent className="w-6 h-6 text-zinc-400 dark:text-zinc-500 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors" />
                  <div className="text-center">
                    <div className="text-sm font-bold text-zinc-700 dark:text-zinc-300">
                      {action.label}
                    </div>
                    <div className="text-[10px] font-medium text-zinc-400 dark:text-zinc-500 mt-0.5">
                      {action.description}
                    </div>
                  </div>
                </Button>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
