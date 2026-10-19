import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { BarChart3, TrendingUp, Users, DollarSign, Eye, Download, Calendar } from "lucide-react";
import { CohortVisualizer } from "./CohortVisualizer";

export const CampaignAnalytics = () => {
  const campaignStats = [
    {
      name: "Tech Gadgets Pro",
      sales: 124,
      revenue: 24800,
      commissions: 2480,
      affiliates: 12,
    },
    {
      name: "Web3 Masterclass",
      sales: 89,
      revenue: 44500,
      commissions: 4450,
      affiliates: 8,
    },
    {
      name: "Crypto Tools Suite",
      sales: 67,
      revenue: 33500,
      commissions: 3350,
      affiliates: 6,
    },
    {
      name: "DeFi Starter Pack",
      sales: 45,
      revenue: 22500,
      commissions: 2250,
      affiliates: 5,
    },
  ];

  const performanceMetrics = [
    {
      label: "Total Revenue",
      value: "$125,300",
      change: "+18%",
      icon: DollarSign,
    },
    { label: "Total Sales", value: "325", change: "+12%", icon: TrendingUp },
    { label: "Active Affiliates", value: "31", change: "+5", icon: Users },
    {
      label: "Conversion Rate",
      value: "4.2%",
      change: "+0.8%",
      icon: BarChart3,
    },
  ];

  const topAffiliates = [
    {
      name: "Alex Johnson",
      sales: 45,
      commission: "$4,500",
      performance: "Excellent",
    },
    {
      name: "Sarah Miller",
      sales: 38,
      commission: "$3,800",
      performance: "Excellent",
    },
    { name: "Mike Chen", sales: 32, commission: "$3,200", performance: "Good" },
    {
      name: "Emily Davis",
      sales: 28,
      commission: "$2,800",
      performance: "Good",
    },
  ];

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center bg-white dark:bg-zinc-900/50 p-6 md:p-8 rounded-3xl border border-slate-200 dark:border-zinc-800 shadow-sm">
        <div>
          <h1 className="text-2xl md:text-3xl font-extrabold text-zinc-900 dark:text-white tracking-tight">
            Campaign Analytics
          </h1>
          <p className="text-zinc-500 dark:text-zinc-400 mt-2 font-medium">
            Track performance, monitor revenue, and optimize your affiliate campaigns
          </p>
        </div>
        <div className="flex space-x-3 mt-6 lg:mt-0">
          <Button
            variant="outline"
            className="h-12 border-slate-200 dark:border-zinc-800 hover:bg-slate-50 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 rounded-xl"
          >
            <Calendar className="w-4 h-4 mr-2" />
            Last 30 Days
          </Button>
          <Button className="h-12 bg-zinc-900 hover:bg-zinc-800 dark:bg-indigo-600 dark:hover:bg-indigo-500 text-white rounded-xl shadow-md transition-all">
            <Download className="w-4 h-4 mr-2" />
            Export
          </Button>
        </div>
      </div>

      {/* Performance Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {performanceMetrics.map((metric, index) => {
          const IconComponent = metric.icon;
          return (
            <Card
              key={index}
              className="bg-white dark:bg-zinc-900/80 shadow-sm border border-slate-200 dark:border-zinc-800 hover:shadow-md transition-shadow rounded-2xl"
            >
              <CardContent className="p-6">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                      {metric.label}
                    </p>
                    <p className="text-2xl font-extrabold text-zinc-900 dark:text-white mt-2 mb-1">
                      {metric.value}
                    </p>
                    <p className="text-xs font-medium text-indigo-600 dark:text-indigo-400">
                      {metric.change}
                    </p>
                  </div>
                  <div className="w-10 h-10 bg-slate-100 dark:bg-zinc-800 rounded-xl flex items-center justify-center border border-slate-200 dark:border-zinc-700">
                    <IconComponent className="w-5 h-5 text-zinc-900 dark:text-indigo-400" />
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Two Column Layout */}
      <div className="grid lg:grid-cols-2 gap-8">
        {/* Campaign Performance */}
        <Card className="border border-slate-200 dark:border-zinc-800 shadow-sm rounded-2xl bg-white dark:bg-zinc-900/50">
          <CardHeader className="border-b border-slate-100 dark:border-zinc-800/50 pb-4">
            <CardTitle className="text-lg font-bold text-zinc-900 dark:text-white">
              Campaign Performance
            </CardTitle>
            <CardDescription className="text-zinc-500 dark:text-zinc-400">
              Revenue and sales across all your campaigns
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-6">
            <div className="space-y-4">
              {campaignStats.map((campaign, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between p-4 bg-slate-50 dark:bg-zinc-950/50 border border-slate-100 dark:border-zinc-800/50 rounded-xl hover:border-slate-200 dark:hover:border-zinc-700 transition-colors"
                >
                  <div className="flex items-center space-x-4">
                    <div className="w-10 h-10 bg-indigo-50 dark:bg-indigo-500/10 rounded-xl flex items-center justify-center border border-indigo-100 dark:border-indigo-500/20">
                      <BarChart3 className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                    </div>
                    <div>
                      <div className="font-bold text-sm text-zinc-900 dark:text-white">
                        {campaign.name}
                      </div>
                      <div className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mt-1">
                        {campaign.affiliates} affiliates • {campaign.sales} sales
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-bold text-sm text-zinc-900 dark:text-white">
                      ${campaign.revenue.toLocaleString()}
                    </div>
                    <div className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mt-1">
                      ${campaign.commissions.toLocaleString()} comms
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Top Performers */}
        <Card className="border border-slate-200 dark:border-zinc-800 shadow-sm rounded-2xl bg-white dark:bg-zinc-900/50">
          <CardHeader className="border-b border-slate-100 dark:border-zinc-800/50 pb-4">
            <CardTitle className="text-lg font-bold text-zinc-900 dark:text-white">
              Top Affiliates
            </CardTitle>
            <CardDescription className="text-zinc-500 dark:text-zinc-400">
              Your highest performing affiliates
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-6">
            <div className="space-y-4">
              {topAffiliates.map((affiliate, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between p-4 bg-slate-50 dark:bg-zinc-950/50 border border-slate-100 dark:border-zinc-800/50 rounded-xl hover:border-slate-200 dark:hover:border-zinc-700 transition-colors"
                >
                  <div className="flex items-center space-x-3">
                    <div className="w-10 h-10 bg-zinc-900 dark:bg-indigo-600 rounded-full flex items-center justify-center text-white font-bold text-sm shadow-sm">
                      {affiliate.name
                        .split(" ")
                        .map((n) => n[0])
                        .join("")}
                    </div>
                    <div>
                      <div className="font-bold text-sm text-zinc-900 dark:text-white">
                        {affiliate.name}
                      </div>
                      <div className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mt-1">
                        {affiliate.sales} sales
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-bold text-sm text-zinc-900 dark:text-white mb-1">
                      {affiliate.commission}
                    </div>
                    <div
                      className={`text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-full inline-block ${
                        affiliate.performance === "Excellent"
                          ? "bg-indigo-100 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-400"
                          : "bg-slate-200 text-slate-700 dark:bg-zinc-800 dark:text-zinc-300"
                      }`}
                    >
                      {affiliate.performance}
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <Button
              variant="ghost"
              className="w-full mt-6 text-indigo-600 dark:text-indigo-400 font-semibold hover:bg-slate-50 dark:hover:bg-zinc-900/50"
            >
              View All Affiliates
              <Eye className="w-4 h-4 ml-2" />
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Cohort Retention & Customer LTV Heatmap */}
      <CohortVisualizer />

      {/* Quick Insights */}
      <div className="grid md:grid-cols-3 gap-6">
        <Card className="border border-slate-200 dark:border-zinc-800 shadow-sm bg-white dark:bg-zinc-900/80 rounded-2xl relative overflow-hidden">
          <div className="absolute top-0 left-0 w-1 h-full bg-indigo-500"></div>
          <CardContent className="p-6">
            <div className="text-3xl font-extrabold text-zinc-900 dark:text-white mb-2">32%</div>
            <div className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
              Above Industry Average Conv. Rate
            </div>
          </CardContent>
        </Card>

        <Card className="border border-slate-200 dark:border-zinc-800 shadow-sm bg-white dark:bg-zinc-900/80 rounded-2xl relative overflow-hidden">
          <div className="absolute top-0 left-0 w-1 h-full bg-violet-500"></div>
          <CardContent className="p-6">
            <div className="text-3xl font-extrabold text-zinc-900 dark:text-white mb-2">18%</div>
            <div className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
              MoM Affiliate Growth
            </div>
          </CardContent>
        </Card>

        <Card className="border border-slate-200 dark:border-zinc-800 shadow-sm bg-white dark:bg-zinc-900/80 rounded-2xl relative overflow-hidden">
          <div className="absolute top-0 left-0 w-1 h-full bg-emerald-500"></div>
          <CardContent className="p-6">
            <div className="text-3xl font-extrabold text-zinc-900 dark:text-white mb-2">94%</div>
            <div className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
              Quarterly Retention Rate
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
