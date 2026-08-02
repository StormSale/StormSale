import { useState } from "react";
import { Button } from "../components/ui/button";
import { Sidebar } from "../components/shared/Sidebar";
import { CreateCampaignForm } from "../components/advertiser/CreateCampaignForm";
import { LogSaleForm } from "../components/advertiser/LogSaleForm";
import { GrantAccessForm } from "../components/advertiser/GrantAccessForm";
import { CampaignAnalytics } from "../components/advertiser/CampaignAnalytics";
import { MyCampaignsList } from "../components/advertiser/MyCampaignsList";
import { NotificationProvider } from "../context/NotificationContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import {
  ArrowRight,
  Plus,
  BarChart3,
  Shield,
  Users,
  Eye,
  TrendingUp,
  Megaphone,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface AdvertiserProps {
  onBack: () => void;
}

const AdvertiserContent: React.FC<AdvertiserProps> = ({ onBack }) => {
  const [activeTab, setActiveTab] = useState("overview");

  const tabs = [
    { id: "overview", label: "Dashboard Overview", icon: BarChart3 },
    { id: "create-campaign", label: "Create Campaign", icon: Plus },
    { id: "my-campaigns", label: "My Campaigns", icon: Users },
    { id: "log-sale", label: "Log Encrypted Sale", icon: Shield },
    { id: "grant-access", label: "Grant Audit Access", icon: Eye },
    { id: "analytics", label: "Campaign Analytics", icon: BarChart3 },
  ];

  const renderContent = () => {
    switch (activeTab) {
      case "create-campaign":
        return <CreateCampaignForm />;
      case "log-sale":
        return <LogSaleForm />;
      case "grant-access":
        return <GrantAccessForm />;
      case "analytics":
        return <CampaignAnalytics />;
      case "overview":
        return <AdvertiserOverview onTabChange={setActiveTab} />;
      case "my-campaigns":
        return <MyCampaignsList />;
      default:
        return <AdvertiserOverview onTabChange={setActiveTab} />;
    }
  };

  return (
    <div className="flex min-h-[calc(100-65px)] bg-slate-50 dark:bg-zinc-950 font-sans selection:bg-indigo-500/30">
      <Sidebar
        activeTab={activeTab}
        onTabChange={setActiveTab}
        tabs={tabs}
        onBack={onBack}
        roleName="Advertiser Pro"
      />

      {/* Main Content Area */}
      <div className="flex-1 p-4 lg:p-8 lg:overflow-y-auto">
        <div className="max-w-6xl mx-auto">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.3 }}
            >
              {renderContent()}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
};

export const Advertiser: React.FC<AdvertiserProps> = (props) => (
  <NotificationProvider>
    <AdvertiserContent {...props} />
  </NotificationProvider>
);

// Additional Components for Advertiser Dashboard
interface AdvertiserOverviewProps {
  onTabChange: (tab: string) => void;
}

const AdvertiserOverview: React.FC<AdvertiserOverviewProps> = ({ onTabChange }) => {
  return (
    <div className="space-y-8 pb-12">
      {/* Header - Command Center Style */}
      <div className="relative overflow-hidden bg-zinc-900 dark:bg-zinc-900 rounded-[2.5rem] p-8 md:p-12 border border-zinc-800 shadow-2xl mb-8">
        <div className="absolute top-0 left-0 w-full h-full opacity-30 pointer-events-none">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-indigo-500/30 via-indigo-600/5 to-transparent blur-3xl rounded-full" />
        </div>

        <div className="relative z-10 flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6">
          <div>
            <div className="flex items-center space-x-3 mb-4">
              <div className="px-3 py-1 bg-indigo-500/20 border border-indigo-500/30 rounded-full text-indigo-400 text-xs font-bold uppercase tracking-wider flex items-center">
                <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 mr-2 animate-pulse" />
                Network Synced
              </div>
            </div>
            <h1 className="text-3xl md:text-5xl font-black text-white tracking-tight mb-2">
              Advertiser Command Center
            </h1>
            <p className="text-zinc-400 font-medium text-lg max-w-xl">
              Monitor your smart contracts, optimize ROI, and deploy new trustless affiliate
              campaigns.
            </p>
          </div>

          <Button
            onClick={() => onTabChange("create-campaign")}
            className="bg-indigo-600 hover:bg-indigo-500 text-white rounded-2xl px-8 h-14 text-lg font-bold shadow-lg shadow-indigo-500/25 transition-all transform hover:-translate-y-1"
          >
            <Plus className="w-5 h-5 mr-2" />
            New Smart Contract
          </Button>
        </div>
      </div>

      {/* Bento Grid Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        {/* Main Performance Card */}
        <Card className="md:col-span-2 bg-white/80 dark:bg-zinc-900/80 backdrop-blur-xl border border-slate-200 dark:border-zinc-800 rounded-[2rem] overflow-hidden shadow-sm hover:shadow-lg transition-all">
          <CardContent className="p-8 h-full flex flex-col justify-between">
            <div className="flex justify-between items-start mb-12">
              <div>
                <p className="text-sm font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-1">
                  Total Network ROI
                </p>
                <p className="text-5xl font-black text-zinc-900 dark:text-white">
                  $124,500<span className="text-2xl text-zinc-400">.00</span>
                </p>
              </div>
              <div className="w-12 h-12 bg-indigo-50 dark:bg-indigo-500/10 rounded-2xl flex items-center justify-center border border-indigo-100 dark:border-indigo-500/20">
                <TrendingUp className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
              </div>
            </div>

            {/* Mock Chart Area */}
            <div className="relative h-32 w-full flex items-end justify-between gap-2 mt-4">
              {/* Simple mock bar chart */}
              {[30, 45, 25, 60, 40, 75, 55, 90, 65, 80, 100, 85].map((height, i) => (
                <div
                  key={i}
                  className="w-full bg-indigo-100 dark:bg-indigo-900/30 rounded-t-sm relative group cursor-pointer transition-all hover:bg-indigo-500 dark:hover:bg-indigo-500"
                  style={{ height: `${height}%` }}
                ></div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Stacked Small Cards */}
        <div className="flex flex-col gap-6">
          <Card className="flex-1 bg-white/80 dark:bg-zinc-900/80 backdrop-blur-xl border border-slate-200 dark:border-zinc-800 rounded-[2rem] shadow-sm hover:shadow-lg transition-all group">
            <CardContent className="p-6 h-full flex flex-col justify-center">
              <div className="flex items-center space-x-4">
                <div className="w-12 h-12 bg-emerald-50 dark:bg-emerald-500/10 rounded-2xl flex items-center justify-center border border-emerald-100 dark:border-emerald-500/20 group-hover:scale-110 transition-transform">
                  <Megaphone className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
                </div>
                <div>
                  <p className="text-sm font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                    Active Campaigns
                  </p>
                  <div className="flex items-baseline space-x-2">
                    <p className="text-3xl font-black text-zinc-900 dark:text-white">12</p>
                    <span className="text-xs font-bold text-emerald-500">+2 new</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="flex-1 bg-white/80 dark:bg-zinc-900/80 backdrop-blur-xl border border-slate-200 dark:border-zinc-800 rounded-[2rem] shadow-sm hover:shadow-lg transition-all group">
            <CardContent className="p-6 h-full flex flex-col justify-center">
              <div className="flex items-center space-x-4">
                <div className="w-12 h-12 bg-amber-50 dark:bg-amber-500/10 rounded-2xl flex items-center justify-center border border-amber-100 dark:border-amber-500/20 group-hover:scale-110 transition-transform">
                  <Users className="w-6 h-6 text-amber-600 dark:text-amber-400" />
                </div>
                <div>
                  <p className="text-sm font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                    Active Affiliates
                  </p>
                  <div className="flex items-baseline space-x-2">
                    <p className="text-3xl font-black text-zinc-900 dark:text-white">89</p>
                    <span className="text-xs font-bold text-amber-500">Global</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Two Column Layout */}
      <div className="grid lg:grid-cols-2 gap-8">
        {/* On-Chain Event Ledger */}
        <Card className="border border-slate-200 dark:border-zinc-800 shadow-sm rounded-[2rem] bg-white/50 dark:bg-zinc-900/30 backdrop-blur-md">
          <CardHeader className="border-b border-slate-100 dark:border-zinc-800/50 p-6 md:p-8">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-xl font-bold text-zinc-900 dark:text-white">
                  Event Ledger
                </CardTitle>
                <CardDescription className="text-zinc-500 dark:text-zinc-400 mt-1">
                  Verified on-chain contract interactions
                </CardDescription>
              </div>
              <Shield className="w-6 h-6 text-indigo-500" />
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-slate-100 dark:divide-zinc-800/50">
              {[
                {
                  action: "Commission Escrowed",
                  hash: "0x8f...3a9c",
                  amount: "450 XLM",
                  status: "Settled",
                  statusColor:
                    "text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10",
                  time: "2 mins ago",
                },
                {
                  action: "Sale Logged (Encrypted)",
                  hash: "0x4b...1e2d",
                  amount: "1,200 XLM",
                  status: "Pending",
                  statusColor:
                    "text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-500/10",
                  time: "15 mins ago",
                },
                {
                  action: "Contract Deployed",
                  hash: "0x9a...7f4b",
                  amount: "—",
                  status: "Confirmed",
                  statusColor:
                    "text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-500/10",
                  time: "3 hours ago",
                },
              ].map((activity, index) => (
                <div
                  key={index}
                  className="p-6 hover:bg-slate-50 dark:hover:bg-zinc-900/50 transition-colors group cursor-pointer"
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="font-bold text-zinc-900 dark:text-white flex items-center">
                      {activity.action}
                    </div>
                    <div className="font-mono font-bold text-zinc-900 dark:text-white">
                      {activity.amount}
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-xs font-medium">
                    <div className="flex items-center space-x-3 text-zinc-500 dark:text-zinc-400">
                      <span className="font-mono bg-slate-100 dark:bg-zinc-800 px-2 py-0.5 rounded-md text-[10px]">
                        Tx: {activity.hash}
                      </span>
                      <span>{activity.time}</span>
                    </div>
                    <span
                      className={`px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider ${activity.statusColor}`}
                    >
                      {activity.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
            <div className="p-4 border-t border-slate-100 dark:border-zinc-800/50">
              <Button
                variant="ghost"
                className="w-full text-indigo-600 dark:text-indigo-400 font-bold hover:bg-slate-50 dark:hover:bg-zinc-900/50 rounded-xl h-12"
              >
                View Explorer <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Quick Actions */}
        <Card className="border border-slate-200 dark:border-zinc-800 shadow-sm rounded-[2rem] bg-white/50 dark:bg-zinc-900/30 backdrop-blur-md">
          <CardHeader className="border-b border-slate-100 dark:border-zinc-800/50 p-6 md:p-8">
            <CardTitle className="text-xl font-bold text-zinc-900 dark:text-white">
              Quick Execution
            </CardTitle>
            <CardDescription className="text-zinc-500 dark:text-zinc-400 mt-1">
              Jump straight to smart contract deployments
            </CardDescription>
          </CardHeader>
          <CardContent className="p-6 md:p-8">
            <div className="grid grid-cols-2 gap-4">
              {[
                {
                  label: "Create Campaign",
                  icon: Plus,
                  action: "create-campaign",
                  hoverBg: "group-hover:bg-indigo-500/10",
                  hoverText: "group-hover:text-indigo-500",
                  hoverBorder: "hover:border-indigo-500/30",
                },
                {
                  label: "Log Sale",
                  icon: Shield,
                  action: "log-sale",
                  hoverBg: "group-hover:bg-emerald-500/10",
                  hoverText: "group-hover:text-emerald-500",
                  hoverBorder: "hover:border-emerald-500/30",
                },
                {
                  label: "View Analytics",
                  icon: BarChart3,
                  action: "analytics",
                  hoverBg: "group-hover:bg-sky-500/10",
                  hoverText: "group-hover:text-sky-500",
                  hoverBorder: "hover:border-sky-500/30",
                },
                {
                  label: "Grant Access",
                  icon: Eye,
                  action: "grant-access",
                  hoverBg: "group-hover:bg-amber-500/10",
                  hoverText: "group-hover:text-amber-500",
                  hoverBorder: "hover:border-amber-500/30",
                },
              ].map((action, index) => {
                const IconComponent = action.icon;
                return (
                  <Button
                    key={index}
                    variant="outline"
                    className={`h-32 flex-col gap-4 rounded-2xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 hover:bg-slate-50 dark:hover:bg-zinc-800/80 ${action.hoverBorder} transition-all group shadow-sm hover:shadow-md`}
                    onClick={() => onTabChange(action.action)}
                  >
                    <div
                      className={`w-12 h-12 bg-slate-100 dark:bg-zinc-800 rounded-xl flex items-center justify-center transition-colors ${action.hoverBg}`}
                    >
                      <IconComponent
                        className={`w-6 h-6 text-zinc-500 transition-colors ${action.hoverText}`}
                      />
                    </div>
                    <span className="text-sm font-bold text-zinc-700 dark:text-zinc-300">
                      {action.label}
                    </span>
                  </Button>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
