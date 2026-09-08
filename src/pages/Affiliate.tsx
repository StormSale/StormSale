import { useState } from "react";
import { Sidebar } from "../components/shared/Sidebar";
import { JoinCampaignButton } from "../components/affiliate/JoinCampaignButton";
import { SalesList } from "../components/affiliate/SalesList";
import { ClaimPayouts } from "../components/affiliate/ClaimPayouts";
import { AffiliateOverview } from "../components/affiliate/AffiliateOverview";
import { Users, TrendingUp, DollarSign, BarChart3, Shield, LayoutDashboard } from "lucide-react";
import { NotificationProvider } from "../context/NotificationContext";
import { motion, AnimatePresence } from "framer-motion";

interface AffiliateProps {
  onBack: () => void;
}

const AffiliateContent: React.FC<AffiliateProps> = ({ onBack }) => {
  const [activeTab, setActiveTab] = useState("overview");

  const tabs = [
    { id: "overview", label: "Dashboard Overview", icon: LayoutDashboard },
    { id: "join-campaign", label: "Join Campaign", icon: Users },
    { id: "my-sales", label: "My Sales & Commissions", icon: DollarSign },
    { id: "claim-payouts", label: "Claim Payouts", icon: TrendingUp },
    { id: "performance", label: "Performance Analytics", icon: BarChart3 },
    { id: "security", label: "Security Settings", icon: Shield },
  ];

  const renderContent = () => {
    switch (activeTab) {
      case "join-campaign":
        return <JoinCampaignButton />;
      case "my-sales":
        return <SalesList />;
      case "claim-payouts":
        return <ClaimPayouts />;
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

export const Affiliate: React.FC<AffiliateProps> = (props) => (
  <NotificationProvider>
    <AffiliateContent {...props} />
  </NotificationProvider>
);
