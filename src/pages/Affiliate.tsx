import { useState } from "react";
import { Sidebar } from "../components/shared/Sidebar";
import { ThemeToggle } from "../components/shared/ThemeToggle";
import { JoinCampaignButton } from "../components/affiliate/JoinCampaignButton";
import { SalesList } from "../components/affiliate/SalesList";
import { ClaimPayouts } from "../components/affiliate/ClaimPayouts";
import { AffiliateOverview } from "../components/affiliate/AffiliateOverview";
import { AffiliateSettings } from "../components/affiliate/AffiliateSettings";
import { Users, TrendingUp, DollarSign, Shield, LayoutDashboard, Sliders, Globe } from "lucide-react";
import type { FC } from "react";
import { NotificationProvider } from "../context/NotificationContext";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "../components/ui/button";
import { ClickHeatmap } from "../components/affiliate/ClickHeatmap";

interface AffiliateProps {
  onBack: () => void;
}

const AffiliateContent: FC<AffiliateProps> = ({ onBack }) => {
  const [activeTab, setActiveTab] = useState("overview");

  const tabs = [
    { id: "overview", label: "Dashboard Overview", icon: LayoutDashboard },
    { id: "heatmap", label: "Click Heatmap", icon: Globe },
    { id: "join-campaign", label: "Join Campaign", icon: Users },
    { id: "my-sales", label: "My Sales & Commissions", icon: DollarSign },
    { id: "claim-payouts", label: "Claim Payouts", icon: TrendingUp },
    { id: "settings", label: "Personalized Settings", icon: Sliders },
    { id: "security", label: "Security & Keys", icon: Shield },
  ];

  const renderContent = () => {
    switch (activeTab) {
      case "join-campaign":
        return <JoinCampaignButton />;
      case "my-sales":
        return <SalesList />;
      case "claim-payouts":
        return <ClaimPayouts />;
      case "settings":
        return <AffiliateSettings />;
      case "heatmap":
        return <ClickHeatmap />;
      case "overview":
        return <AffiliateOverview />;
      default:
        return <AffiliateOverview />;
    }
  };

  return (
    <div className="flex flex-col lg:flex-row min-h-screen bg-slate-50 dark:bg-zinc-950 font-sans selection:bg-indigo-500/30">
      <Sidebar
        activeTab={activeTab}
        onTabChange={setActiveTab}
        tabs={tabs}
        onBack={onBack}
        roleName="Affiliate Pro"
      />

      {/* Main Content Area */}
      <div className="flex-1 p-4 lg:p-8 lg:overflow-y-auto">
        <div className="max-w-6xl mx-auto space-y-6">
          {/* Header Bar with Persistent Theme Toggle & Settings Navigation */}
          <div className="flex items-center justify-between pb-4 border-b border-slate-200 dark:border-zinc-800">
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
                Affiliate Pro Portal
              </span>
              <h2 className="text-xl font-bold text-zinc-900 dark:text-white capitalize">
                {tabs.find((t) => t.id === activeTab)?.label || "Dashboard Overview"}
              </h2>
            </div>
            <div className="flex items-center space-x-3">
              <ThemeToggle />
              <Button
                variant={activeTab === "settings" ? "default" : "outline"}
                size="sm"
                onClick={() => setActiveTab("settings")}
                aria-label="Preferences"
                className="rounded-xl h-10 px-4 font-semibold text-xs flex items-center space-x-1.5 border border-slate-200 dark:border-zinc-800"
              >
                <Sliders className="w-4 h-4" />
                <span className="hidden sm:inline">Preferences</span>
              </Button>
            </div>
          </div>

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

export const Affiliate: FC<AffiliateProps> = (props) => (
  <NotificationProvider>
    <AffiliateContent {...props} />
  </NotificationProvider>
);
