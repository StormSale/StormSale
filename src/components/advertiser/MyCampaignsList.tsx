import { useState } from "react";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import {
  Plus,
  Users,
  BarChart3,
  TrendingUp,
  Eye,
  Pause,
  Play,
  Settings,
  Search,
  Shield,
} from "lucide-react";
import { Input } from "../../components/ui/input";

type CampaignStatus = "Active" | "Paused" | "Completed";

interface Campaign {
  id: string;
  name: string;
  status: CampaignStatus;
  commissionRate: number;
  clearingPeriod: string;
  totalSales: number;
  totalRevenue: string;
  totalCommissions: string;
  affiliates: number;
  createdAt: string;
  contractAddress: string;
}

const mockCampaigns: Campaign[] = [
  {
    id: "1",
    name: "Tech Gadgets Pro",
    status: "Active",
    commissionRate: 10,
    clearingPeriod: "14 Days",
    totalSales: 124,
    totalRevenue: "$24,800",
    totalCommissions: "$2,480",
    affiliates: 12,
    createdAt: "2026-04-01",
    contractAddress: "CA7Q...1234",
  },
  {
    id: "2",
    name: "Web3 Masterclass",
    status: "Active",
    commissionRate: 15,
    clearingPeriod: "7 Days",
    totalSales: 89,
    totalRevenue: "$44,500",
    totalCommissions: "$6,675",
    affiliates: 8,
    createdAt: "2026-04-15",
    contractAddress: "CB9E...5678",
  },
  {
    id: "3",
    name: "Crypto Tools Suite",
    status: "Paused",
    commissionRate: 12,
    clearingPeriod: "30 Days",
    totalSales: 67,
    totalRevenue: "$33,500",
    totalCommissions: "$4,020",
    affiliates: 6,
    createdAt: "2026-03-20",
    contractAddress: "CC2K...9012",
  },
  {
    id: "4",
    name: "DeFi Starter Pack",
    status: "Completed",
    commissionRate: 8,
    clearingPeriod: "14 Days",
    totalSales: 45,
    totalRevenue: "$22,500",
    totalCommissions: "$1,800",
    affiliates: 5,
    createdAt: "2026-02-10",
    contractAddress: "CD4M...3456",
  },
];

const statusConfig: Record<CampaignStatus, { badge: string; dot: string }> = {
  Active: {
    badge: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400",
    dot: "bg-emerald-500",
  },
  Paused: {
    badge: "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400",
    dot: "bg-amber-500",
  },
  Completed: {
    badge: "bg-slate-200 text-slate-600 dark:bg-zinc-800 dark:text-zinc-400",
    dot: "bg-slate-400 dark:bg-zinc-500",
  },
};

export const MyCampaignsList = () => {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<CampaignStatus | "All">("All");

  const filtered = mockCampaigns.filter((c) => {
    const matchSearch = c.name.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === "All" || c.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const totalRevenue = mockCampaigns.reduce(
    (acc, c) => acc + parseInt(c.totalRevenue.replace(/\D/g, "")),
    0,
  );
  const totalCommissions = mockCampaigns.reduce(
    (acc, c) => acc + parseInt(c.totalCommissions.replace(/\D/g, "")),
    0,
  );

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center bg-white dark:bg-zinc-900/50 p-6 md:p-8 rounded-3xl border border-slate-200 dark:border-zinc-800 shadow-sm">
        <div>
          <h1 className="text-2xl md:text-3xl font-extrabold text-zinc-900 dark:text-white tracking-tight">
            My Campaigns
          </h1>
          <p className="text-zinc-500 dark:text-zinc-400 mt-2 font-medium">
            Manage and monitor all your affiliate campaign contracts.
          </p>
        </div>
        <Button className="mt-6 lg:mt-0 bg-zinc-900 hover:bg-zinc-800 dark:bg-indigo-600 dark:hover:bg-indigo-500 text-white rounded-full px-6 h-12 font-semibold shadow-md transition-all">
          <Plus className="w-5 h-5 mr-2" />
          Create Campaign
        </Button>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Total Campaigns", value: String(mockCampaigns.length), icon: Shield },
          {
            label: "Active",
            value: String(mockCampaigns.filter((c) => c.status === "Active").length),
            icon: Play,
          },
          { label: "Total Revenue", value: `$${totalRevenue.toLocaleString()}`, icon: TrendingUp },
          {
            label: "Total Commissions",
            value: `$${totalCommissions.toLocaleString()}`,
            icon: BarChart3,
          },
        ].map((s, i) => {
          const Icon = s.icon;
          return (
            <Card
              key={i}
              className="bg-white dark:bg-zinc-900/80 border border-slate-200 dark:border-zinc-800 rounded-2xl shadow-sm"
            >
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                      {s.label}
                    </p>
                    <p className="text-xl font-extrabold text-zinc-900 dark:text-white mt-1">
                      {s.value}
                    </p>
                  </div>
                  <div className="w-9 h-9 bg-slate-100 dark:bg-zinc-800 rounded-xl flex items-center justify-center border border-slate-200 dark:border-zinc-700">
                    <Icon className="w-4 h-4 text-zinc-900 dark:text-indigo-400" />
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search campaigns..."
            className="h-12 pl-10 rounded-xl border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white"
          />
        </div>
        <div className="flex gap-2">
          {(["All", "Active", "Paused", "Completed"] as const).map((s) => (
            <Button
              key={s}
              size="sm"
              onClick={() => setStatusFilter(s)}
              className={`h-12 rounded-xl px-4 font-semibold transition-all ${
                statusFilter === s
                  ? "bg-zinc-900 dark:bg-indigo-600 text-white shadow-md"
                  : "bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-slate-50 dark:hover:bg-zinc-800"
              }`}
            >
              {s}
            </Button>
          ))}
        </div>
      </div>

      {/* Campaign cards */}
      {filtered.length === 0 ? (
        <Card className="border border-slate-200 dark:border-zinc-800 shadow-sm rounded-2xl bg-white dark:bg-zinc-900/50">
          <CardContent className="py-20 text-center">
            <div className="w-20 h-20 bg-slate-100 dark:bg-zinc-800 rounded-full flex items-center justify-center mx-auto mb-6">
              <Users className="w-10 h-10 text-zinc-400 dark:text-zinc-500" />
            </div>
            <h3 className="text-xl font-bold text-zinc-900 dark:text-white mb-2">
              No campaigns found
            </h3>
            <p className="text-zinc-500 dark:text-zinc-400 mb-8">
              Try adjusting your search or filter.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {filtered.map((campaign) => {
            const cfg = statusConfig[campaign.status];
            return (
              <Card
                key={campaign.id}
                className="group border border-slate-200 dark:border-zinc-800 shadow-sm bg-white dark:bg-zinc-900/80 rounded-3xl hover:shadow-md transition-all"
              >
                <CardHeader className="pt-6 px-6 pb-4 border-b border-slate-100 dark:border-zinc-800/50">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 bg-zinc-900 dark:bg-indigo-600 rounded-xl flex items-center justify-center shadow-md group-hover:scale-105 transition-transform">
                        <Shield className="w-6 h-6 text-white" />
                      </div>
                      <div>
                        <CardTitle className="text-lg font-bold text-zinc-900 dark:text-white leading-tight">
                          {campaign.name}
                        </CardTitle>
                        <div className="font-mono text-[10px] text-zinc-400 dark:text-zinc-500 mt-0.5">
                          {campaign.contractAddress}
                        </div>
                      </div>
                    </div>
                    <span
                      className={`inline-flex items-center gap-1.5 text-[10px] uppercase tracking-wider font-bold px-3 py-1.5 rounded-full shrink-0 ${cfg.badge}`}
                    >
                      <div className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
                      {campaign.status}
                    </span>
                  </div>
                </CardHeader>

                <CardContent className="px-6 pt-5 pb-6">
                  {/* Metrics grid */}
                  <div className="grid grid-cols-3 gap-4 mb-6">
                    {[
                      { label: "Sales", value: campaign.totalSales, icon: BarChart3 },
                      { label: "Revenue", value: campaign.totalRevenue, icon: TrendingUp },
                      { label: "Affiliates", value: campaign.affiliates, icon: Users },
                    ].map((m, i) => {
                      const Icon = m.icon;
                      return (
                        <div
                          key={i}
                          className="bg-slate-50 dark:bg-zinc-950/50 rounded-xl p-3 text-center border border-slate-100 dark:border-zinc-800/50"
                        >
                          <Icon className="w-4 h-4 text-zinc-400 dark:text-zinc-500 mx-auto mb-1" />
                          <div className="font-extrabold text-sm text-zinc-900 dark:text-white">
                            {m.value}
                          </div>
                          <div className="text-[10px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                            {m.label}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Details row */}
                  <div className="flex items-center gap-4 text-xs font-semibold text-zinc-500 dark:text-zinc-400 mb-5">
                    <span className="flex items-center gap-1">
                      <TrendingUp className="w-3.5 h-3.5" />
                      {campaign.commissionRate}% commission
                    </span>
                    <span>·</span>
                    <span>{campaign.clearingPeriod} clearing</span>
                    <span>·</span>
                    <span>Since {campaign.createdAt}</span>
                  </div>

                  {/* Actions */}
                  <div className="flex gap-3">
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1 h-10 rounded-xl border border-slate-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 font-semibold hover:bg-slate-50 dark:hover:bg-zinc-800"
                    >
                      <Eye className="w-4 h-4 mr-2" />
                      View
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-10 w-10 rounded-xl border border-slate-200 dark:border-zinc-800 p-0 hover:bg-slate-50 dark:hover:bg-zinc-800"
                    >
                      {campaign.status === "Active" ? (
                        <Pause className="w-4 h-4 text-zinc-600 dark:text-zinc-400" />
                      ) : campaign.status === "Paused" ? (
                        <Play className="w-4 h-4 text-zinc-600 dark:text-zinc-400" />
                      ) : (
                        <Settings className="w-4 h-4 text-zinc-600 dark:text-zinc-400" />
                      )}
                    </Button>
                    <Button
                      size="sm"
                      className="flex-1 h-10 rounded-xl bg-zinc-900 hover:bg-zinc-800 dark:bg-indigo-600 dark:hover:bg-indigo-500 text-white font-semibold shadow-sm"
                    >
                      <BarChart3 className="w-4 h-4 mr-2" />
                      Analytics
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
};
