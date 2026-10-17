import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { TrendingUp, Users, DollarSign, Target, Zap, ArrowRight, CheckCircle2, Globe2, Calendar, Filter } from "lucide-react";
import { useMemo, useState } from "react";

export const AffiliateOverview = () => {
  const [dateRange, setDateRange] = useState<"7d" | "30d" | "90d">("30d");
  const [selectedCampaign, setSelectedCampaign] = useState<string>("all");

  const geoData = [
    { iso: "US", country: "United States", clicks: 4820, conversions: 168, x: 22, y: 38, r: 26 },
    { iso: "GB", country: "United Kingdom", clicks: 2140, conversions: 82, x: 47, y: 31, r: 16 },
    { iso: "DE", country: "Germany", clicks: 1890, conversions: 71, x: 51, y: 33, r: 15 },
    { iso: "IN", country: "India", clicks: 3120, conversions: 94, x: 68, y: 48, r: 20 },
    { iso: "BR", country: "Brazil", clicks: 1560, conversions: 48, x: 33, y: 66, r: 14 },
    { iso: "CA", country: "Canada", clicks: 1240, conversions: 51, x: 20, y: 30, r: 12 },
    { iso: "AU", country: "Australia", clicks: 980, conversions: 33, x: 82, y: 72, r: 11 },
    { iso: "JP", country: "Japan", clicks: 870, conversions: 29, x: 84, y: 38, r: 10 },
  ];

  const rangeMultiplier = dateRange === "7d" ? 0.25 : dateRange === "90d" ? 2.6 : 1;
  const campaignMultiplier = selectedCampaign === "all" ? 1 : 0.55;

  const scaledGeo = useMemo(
    () =>
      geoData.map((g) => ({
        ...g,
        clicks: Math.round(g.clicks * rangeMultiplier * campaignMultiplier),
        conversions: Math.round(g.conversions * rangeMultiplier * campaignMultiplier),
      })),
    [rangeMultiplier, campaignMultiplier]
  );

  const topCountries = useMemo(
    () =>
      [...scaledGeo]
        .sort((a, b) => b.clicks - a.clicks)
        .slice(0, 5)
        .map((g) => ({
          ...g,
          conversionPct: g.clicks > 0 ? (g.conversions / g.clicks) * 100 : 0,
        })),
    [scaledGeo]
  );

  const maxClicks = useMemo(
    () => Math.max(...scaledGeo.map((g) => g.clicks), 1),
    [scaledGeo]
  );

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

      {/* Real-Time Click Stream Heatmap & Geolocation Visualizer */}
      <Card className="border border-slate-200 dark:border-zinc-800 shadow-sm rounded-2xl bg-white dark:bg-zinc-900/50">
        <CardHeader className="border-b border-slate-100 dark:border-zinc-800/50 pb-4">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <CardTitle className="text-lg font-bold text-zinc-900 dark:text-white flex items-center gap-2">
                <Globe2 className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                Click Stream Heatmap
              </CardTitle>
              <CardDescription className="text-zinc-500 dark:text-zinc-400">
                Aggregated clicks by country — no raw PII stored
              </CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1 bg-slate-100 dark:bg-zinc-800 rounded-full p-1">
                <Calendar className="w-4 h-4 ml-2 text-zinc-500 dark:text-zinc-400" />
                {(["7d", "30d", "90d"] as const).map((range) => (
                  <button
                    key={range}
                    onClick={() => setDateRange(range)}
                    className={`px-3 py-1.5 text-xs font-bold rounded-full transition-all ${
                      dateRange === range
                        ? "bg-white dark:bg-zinc-950 text-zinc-900 dark:text-white shadow-sm"
                        : "text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white"
                    }`}
                  >
                    {range}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-1 bg-slate-100 dark:bg-zinc-800 rounded-full p-1">
                <Filter className="w-4 h-4 ml-2 text-zinc-500 dark:text-zinc-400" />
                <select
                  value={selectedCampaign}
                  onChange={(e) => setSelectedCampaign(e.target.value)}
                  className="bg-transparent text-xs font-bold text-zinc-700 dark:text-zinc-300 pr-2 py-1.5 focus:outline-none cursor-pointer"
                >
                  <option value="all">All Campaigns</option>
                  <option value="tech">Tech Gadgets Pro</option>
                  <option value="web3">Web3 Masterclass</option>
                  <option value="crypto">Crypto Tools</option>
                </select>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-6">
          <div className="grid lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2">
              <div className="relative w-full aspect-[2/1] bg-slate-50 dark:bg-zinc-950/50 rounded-xl border border-slate-100 dark:border-zinc-800/50 overflow-hidden">
                <svg
                  viewBox="0 0 100 50"
                  className="w-full h-full"
                  role="img"
                  aria-label="World map heatmap of clicks by country"
                >
                  <defs>
                    <radialGradient id="heatGradient" cx="50%" cy="50%" r="50%">
                      <stop offset="0%" stopColor="#6366f1" stopOpacity="0.85" />
                      <stop offset="60%" stopColor="#818cf8" stopOpacity="0.35" />
                      <stop offset="100%" stopColor="#818cf8" stopOpacity="0" />
                    </radialGradient>
                  </defs>
                  <rect x="0" y="0" width="100" height="50" fill="transparent" />
                  {scaledGeo.map((g) => {
                    const intensity = g.clicks / maxClicks;
                    const radius = Math.max(2, g.r * 0.35 * (0.5 + intensity));
                    return (
                      <g key={g.iso} className="transition-all duration-700 ease-out">
                        <circle
                          cx={g.x}
                          cy={g.y * 0.5}
                          r={radius}
                          fill="url(#heatGradient)"
                          className="transition-all duration-700 ease-out"
                        >
                          <title>{`${g.country} (${g.iso}): ${g.clicks.toLocaleString()} clicks, ${g.conversions.toLocaleString()} conversions`}</title>
                        </circle>
                        <circle
                          cx={g.x}
                          cy={g.y * 0.5}
                          r={Math.max(0.6, radius * 0.18)}
                          fill="#4f46e5"
                          className="transition-all duration-700 ease-out"
                        >
                          <title>{`${g.country} (${g.iso}): ${g.clicks.toLocaleString()} clicks`}</title>
                        </circle>
                      </g>
                    );
                  })}
                </svg>
              </div>
              <p className="text-[11px] font-medium text-zinc-400 dark:text-zinc-500 mt-3">
                Hover a cluster to view click volume. Data is aggregated by ISO country code only.
              </p>
            </div>
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mb-4">
                Top 5 Countries
              </h3>
              <div className="space-y-3">
                {topCountries.map((c, index) => (
                  <div
                    key={c.iso}
                    className="flex items-center justify-between p-3 bg-slate-50 dark:bg-zinc-950/50 border border-slate-100 dark:border-zinc-800/50 rounded-xl transition-all duration-500"
                  >
                    <div className="flex items-center gap-3">
                      <span className="w-6 h-6 flex items-center justify-center rounded-full bg-indigo-100 dark:bg-indigo-500/20 text-[10px] font-bold text-indigo-700 dark:text-indigo-400">
                        {index + 1}
                      </span>
                      <div>
                        <div className="text-sm font-bold text-zinc-900 dark:text-white">
                          {c.country}
                        </div>
                        <div className="text-[10px] font-medium text-zinc-400 dark:text-zinc-500">
                          {c.clicks.toLocaleString()} clicks
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-bold text-emerald-600 dark:text-emerald-400">
                        {c.conversionPct.toFixed(1)}%
                      </div>
                      <div className="text-[10px] font-medium text-zinc-400 dark:text-zinc-500">
                        conv. rate
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
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
              },
              {
                label: "Track Performance",
                description: "View analytics and insights",
                icon: TrendingUp,
              },
              {
                label: "Withdraw Earnings",
                description: "Claim your commissions",
                icon: DollarSign,
              },
            ].map((action, index) => {
              const IconComponent = action.icon;
              return (
                <Button
                  key={index}
                  variant="outline"
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
