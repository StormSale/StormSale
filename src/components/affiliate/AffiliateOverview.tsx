import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { TrendingUp, Users, DollarSign, Target, Zap, ArrowRight, CheckCircle2, Globe, Calendar, Filter } from "lucide-react";
import { useMemo, useState } from "react";

type GeoClick = {
  country: string;
  iso: string;
  clicks: number;
  conversions: number;
  x: number;
  y: number;
};

const GEO_DATA: GeoClick[] = [
  { country: "United States", iso: "US", clicks: 4820, conversions: 168, x: 22, y: 38 },
  { country: "United Kingdom", iso: "GB", clicks: 2140, conversions: 92, x: 46, y: 30 },
  { country: "Germany", iso: "DE", clicks: 1890, conversions: 74, x: 51, y: 32 },
  { country: "India", iso: "IN", clicks: 3260, conversions: 121, x: 68, y: 48 },
  { country: "Brazil", iso: "BR", clicks: 1540, conversions: 58, x: 33, y: 66 },
  { country: "Canada", iso: "CA", clicks: 1120, conversions: 47, x: 20, y: 28 },
  { country: "Australia", iso: "AU", clicks: 980, conversions: 39, x: 82, y: 72 },
  { country: "Japan", iso: "JP", clicks: 760, conversions: 31, x: 84, y: 38 },
  { country: "France", iso: "FR", clicks: 1340, conversions: 52, x: 47, y: 34 },
  { country: "Nigeria", iso: "NG", clicks: 620, conversions: 22, x: 50, y: 55 },
];

const DATE_RANGES = ["7d", "30d", "90d", "All"] as const;
type DateRange = (typeof DATE_RANGES)[number];

const RANGE_MULTIPLIER: Record<DateRange, number> = {
  "7d": 0.25,
  "30d": 1,
  "90d": 2.4,
  All: 3.6,
};

const CAMPAIGNS = ["All Campaigns", "Tech Gadgets Pro", "Web3 Masterclass", "Crypto Tools"] as const;
type Campaign = (typeof CAMPAIGNS)[number];

const CAMPAIGN_MULTIPLIER: Record<Campaign, number> = {
  "All Campaigns": 1,
  "Tech Gadgets Pro": 0.42,
  "Web3 Masterclass": 0.31,
  "Crypto Tools": 0.27,
};

export const AffiliateOverview = () => {
  const [dateRange, setDateRange] = useState<DateRange>("30d");
  const [campaign, setCampaign] = useState<Campaign>("All Campaigns");

  const geoData = useMemo(() => {
    const scale = RANGE_MULTIPLIER[dateRange] * CAMPAIGN_MULTIPLIER[campaign];
    return GEO_DATA.map((g) => ({
      ...g,
      clicks: Math.round(g.clicks * scale),
      conversions: Math.round(g.conversions * scale),
    }));
  }, [dateRange, campaign]);

  const maxClicks = useMemo(
    () => Math.max(...geoData.map((g) => g.clicks), 1),
    [geoData]
  );

  const topCountries = useMemo(() => {
    return [...geoData]
      .sort((a, b) => b.clicks - a.clicks)
      .slice(0, 5)
      .map((g) => ({
        ...g,
        conversionRate: g.clicks > 0 ? (g.conversions / g.clicks) * 100 : 0,
      }));
  }, [geoData]);

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
      <div className="grid grid-cols-1 md:grid-cols-4 lg:grid-cols-4 gap-6">
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
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            <div>
              <CardTitle className="text-lg font-bold text-zinc-900 dark:text-white flex items-center gap-2">
                <Globe className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                Click Stream Heatmap
              </CardTitle>
              <CardDescription className="text-zinc-500 dark:text-zinc-400">
                Aggregated clicks by country ISO code — no raw PII stored
              </CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2 bg-slate-50 dark:bg-zinc-950/50 border border-slate-200 dark:border-zinc-800 rounded-full px-3 py-1.5">
                <Calendar className="w-4 h-4 text-zinc-400" />
                {DATE_RANGES.map((range) => (
                  <button
                    key={range}
                    onClick={() => setDateRange(range)}
                    className={`text-xs font-bold px-2.5 py-1 rounded-full transition-all duration-300 ${
                      dateRange === range
                        ? "bg-indigo-600 text-white shadow-sm"
                        : "text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white"
                    }`}
                  >
                    {range}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2 bg-slate-50 dark:bg-zinc-950/50 border border-slate-200 dark:border-zinc-800 rounded-full px-3 py-1.5">
                <Filter className="w-4 h-4 text-zinc-400" />
                <select
                  value={campaign}
                  onChange={(e) => setCampaign(e.target.value as Campaign)}
                  className="text-xs font-bold bg-transparent text-zinc-700 dark:text-zinc-300 outline-none cursor-pointer"
                >
                  {CAMPAIGNS.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-6">
          <div className="grid lg:grid-cols-3 gap-8">
            {/* SVG World Map */}
            <div className="lg:col-span-2">
              <div className="relative w-full aspect-[2/1] bg-slate-50 dark:bg-zinc-950/50 border border-slate-100 dark:border-zinc-800/50 rounded-2xl overflow-hidden">
                <svg
                  viewBox="0 0 100 80"
                  className="w-full h-full"
                  role="img"
                  aria-label="World map of click density"
                >
                  <defs>
                    <radialGradient id="heatGradient">
                      <stop offset="0%" stopColor="#6366f1" stopOpacity="0.9" />
                      <stop offset="70%" stopColor="#6366f1" stopOpacity="0.15" />
                      <stop offset="100%" stopColor="#6366f1" stopOpacity="0" />
                    </radialGradient>
                  </defs>
                  <rect width="100" height="80" fill="transparent" />
                  {geoData.map((g) => {
                    const radius = 2 + (g.clicks / maxClicks) * 10;
                    const opacity = 0.3 + (g.clicks / maxClicks) * 0.7;
                    return (
                      <g key={g.iso}>
                        <circle
                          cx={g.x}
                          cy={g.y}
                          r={radius + 4}
                          fill="url(#heatGradient)"
                          opacity={opacity * 0.5}
                        />
                        <circle
                          cx={g.x}
                          cy={g.y}
                          r={radius / 2}
                          fill="#6366f1"
                          opacity={opacity}
                          className="transition-all duration-500"
                        >
                          <title>{`${g.country} (${g.iso}): ${g.clicks} clicks, ${g.conversions} conversions`}</title>
                        </circle>
                      </g>
                    );
                  })}
                </svg>
              </div>
            </div>
            <div className="lg:col-span-1">
              <div className="space-y-3">
                <h3 className="text-sm font-bold text-zinc-900 dark:text-white">
                  Top 5 Countries
                </h3>
                {topCountries.map((c, i) => (
                  <div key={c.iso} className="flex items-center justify-between bg-slate-50 dark:bg-zinc-950/50 rounded-xl px-3 py-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-zinc-500">#{i + 1}</span>
                      <span className="text-sm font-medium text-zinc-900 dark:text-white">{c.country}</span>
                    </div>
                    <div className="text-right">
                      <p className="text-xs font-bold text-indigo-600">{c.conversionRate.toFixed(1)}%</p>
                      <p className="text-xs text-zinc-500">{c.clicks} clicks</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Recent Payouts */}
      <Card className="border border-slate-200 dark:border-zinc-800 shadow-sm rounded-2xl bg-white dark:bg-zinc-900/50">
        <CardHeader className="border-b border-slate-100 dark:border-zinc-800/50 pb-4">
          <CardTitle className="text-lg font-bold text-zinc-900 dark:text-white">
            Recent Payouts
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-6">
          <div className="space-y-3">
            {recentPayouts.map((payout, i) => (
              <div key={i} className="flex items-center justify-between py-2 border-b border-slate-100 dark:border-zinc-800/50 last:border-0">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-indigo-100 dark:bg-indigo-900/50 rounded-full flex items-center justify-center">
                    <CheckCircle2 className="w-4 h-4 text-indigo-600" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-zinc-900 dark:text-white">{payout.campaign}</p>
                    <p className="text-xs text-zinc-500">{payout.date}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold text-zinc-900 dark:text-white">{payout.amount}</p>
                  <p className="text-xs text-green-600">{payout.status}</p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
