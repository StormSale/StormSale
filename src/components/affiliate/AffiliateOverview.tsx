import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { TrendingUp, Users, DollarSign, Target, Zap, ArrowRight, CheckCircle2, Globe2, Calendar } from "lucide-react";
import { useMemo, useState } from "react";
import { ClickStreamHeatmap } from "./ClickStreamHeatmap";

export const AffiliateOverview = () => {
  const stats = [
    {
      title: "Total Earnings",
      value: "$12,847",
      change: "+18% this month",
      icon: DollarSign,
    },
    { title: "Active Campaigns", value: "8", change: "+2 this week", icon: Users },
    {
      title: "Conversion Rate",
      value: "3.2%",
      change: "+0.4% vs last month",
      icon: TrendingUp,
    },
    { title: "Monthly Goal", value: "85%", change: "On track", icon: Target },
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

  const [dateRange, setDateRange] = useState<"d7" | "30d" | "90d">("30d");
  const [campaignFilter, setCampaignFilter] = useState<string>("all");

  const campaignOptions = useMemo(
    () => [
      { id: "all", label: "All Campaigns" },
      { id: "tech-gadgets-pro", label: "Tech Gadgets Pro" },
      { id: "webs-masterclass", label: "Web3 Masterclass" },
      { id: "crypto-tools", label: "Crypto Tools" },
    ],
    []
  );

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center bg-white dark:bg-zinc-900/50 p-6 md:p-8 rounded-3xl border border-slate-200 dark:border-zinc-800 shadow-sm">
        <div>
          <h1 className="text-2xl md:text-3xl font-extrabold text-zinc-900 dark:text-white tracking-tight">
            Affiliate Dashboard
          </h1>
          <p className="text-zinc-500 dark:text-zinc-400 mt-2 font-medium">
            Track your performance and maximize your on-chain earnings.
          </p>
        </div>
        <Button className="mt-6 lg:mt-0 bg-zinc-900 hover:bg-zinc-800 dark:bg-indigo-600 dark:hover:bg-indigo-500 text-white rounded-full px-6 h-12 font-semibold shadow-md transition-all">
          <Zap className="w-5 h-5 mr-2" />
          Quick Start Guide
        </Button>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
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
                    <p className="text-xs font-medium text-indigo-600 dark:text-indigo-400">
                      {stat.change}
                    </p>
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

      {/* Real-Time Click Stream Heatmap */}
      <Card className="border border-slate-200 dark:border-zinc-800 shadow-sm rounded-2xl bg-white dark:bg-zinc-900/50">
        <CardHeader className="border-b border-slate-100 dark:border-zinc-800/50 pb-4">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <CardTitle className="text-lg font-bold text-zinc-900 dark:text-white flex items-center gap-2">
                <Globe2 className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                Click Stream Heatmap
              </CardTitle>
              <CardDescription className="text-zinc-500 dark:text-zinc-400">
                Geographic distribution of clicks and conversions (aggregated by country ISO)
              </CardDescription>
            </div>
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="flex items-center gap-1 bg-slate-100 dark:bg-zinc-800 rounded-full p-1">
                {(["7d", "30d", "90d"] as const).map((range) => (
                  <button
                    key={range}
                    onClick={() => setDateRange(range)}
                    className={`px-3 py-1.5 text-xs font-bold rounded-full transition-colors ${
                      dateRange === range
                        ? "bg-white dark:bg-zinc-950 text-indigo-600 dark:text-indigo-400 shadow-sm"
                        : "text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white"
                    }`}
                  >
                    {range === "7d" ? "7 Days" : range === "30d" ? "30 Days" : "90 Days"}
                  </button>
                ))}
              </div>
              <div className="relative">
                <Calendar className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" />
                <select
                  value={campaignFilter}
                  onChange={(e) => setCampaignFilter(e.target.value)}
                  className="pl-9 pr-8 h-9 text-xs font-semibold rounded-full border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 appearance-none cursor-pointer"
                >
                  {campaignOptions.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-6">
          <ClickStreamHeatmap dateRange={dateRange} campaignId={campaignFilter} />
        </CardContent>
      </Card>

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
              className="w-full mt-6 text-indigo-600 dark:text-indigo-400 font-semibold hover:bg-slate-50 dark:hover:bg-zinc-900/50"
            >
              View All Payouts
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
                  tip: "Optimize your content for higher conversions",
                  impact: "High",
                },
                { tip: "Join trending campaigns early", impact: "Medium" },
                { tip: "Use multiple promotion channels", impact: "High" },
                {
                  tip: "Engage with your audience regularly",
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
            Common affiliate tasks and shortcuts
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-6">
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { label: "Create Link", icon: Zap },
              { label: "View Reports", icon: TrendingUp },
              { label: "Manage Campaigns", icon: Target },
              { label: "Payout History", icon: DollarSign },
            ].map((action, index) => {
              const ActionIcon = action.icon;
              return (
                <Button
                  key={index}
                  variant="outline"
                  className="h-24 flex col items-center justify-center gap-2 rounded-xl border-slate-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-slate-50 dark:hover:bg-zinc-900/50"
                >
                  <ActionIcon className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                  <span className="text-xs font-semibold">{action.label}</span>
                </Button>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
