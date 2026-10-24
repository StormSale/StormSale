import { Sidebar } from "../components/shared/Sidebar";
import { ThemeToggle } from "../components/shared/ThemeToggle";
import { JoinCampaignButton } from "../components/affiliate/JoinCampaignButton";
import { SalesList } from "../components/affiliate/SalesList";
import { ClaimPayouts } from "../components/affiliate/ClaimPayouts";
import { AffiliateOverview } from "../components/affiliate/AffiliateOverview";
import { TelegramCampaignBrowser } from "../components/affiliate/TelegramCampaignBrowser";
import { CustomLinksManager } from "../components/affiliate/CustomLinksManager";
import { CampaignApplication } from "../components/affiliate/CampaignApplication";
import {
  Users,
  TrendingUp,
  DollarSign,
  Shield,
  LayoutDashboard,
  Send,
  Sliders,
  Link2,
} from "lucide-react";
import { NotificationProvider } from "../context/NotificationContext";
import { usePreference } from "../hooks/usePreference";
import { motion, AnimatePresence } from "framer-motion";
import { isTelegramMiniApp } from "../lib/telegram";
import { AffiliateSettings } from "../components/affiliate/AffiliateSettings";
import { Button } from "../components/ui/button";

interface AffiliateProps {
  onBack: () => void;
}

const AFFILIATE_TABS = [
  "overview",
  "telegram-browser",
  "custom-links",
  "join-campaign",
  "my-sales",
  "claim-payouts",
  "settings",
  "security",
  "apply-links",
] as const;
type AffiliateTab = (typeof AFFILIATE_TABS)[number];

const AffiliateContent: React.FC<AffiliateProps> = ({ onBack }) => {
  const [activeTab, setActiveTab] = usePreference<AffiliateTab>(
    "stormsale.affiliate.tab",
    isTelegramMiniApp() ? "telegram-browser" : "overview",
    (v) => AFFILIATE_TABS.includes(v as AffiliateTab),
  );

  const tabs = [
    { id: "overview", label: "Dashboard Overview", icon: LayoutDashboard },
    { id: "telegram-browser", label: "Telegram Campaigns", icon: Send },
    { id: "custom-links", label: "Custom Short Links", icon: Link2 },
    { id: "join-campaign", label: "Join Campaign", icon: Users },
    { id: "apply-links", label: "Apply & Tracking Links", icon: Link2 },
    { id: "my-sales", label: "My Sales & Commissions", icon: DollarSign },
    { id: "claim-payouts", label: "Claim Payouts", icon: TrendingUp },
    { id: "settings", label: "Personalized Settings", icon: Sliders },
    { id: "security", label: "Security & Keys", icon: Shield },
  ];

  const renderContent = () => {
    switch (activeTab) {
      case "telegram-browser":
        return <TelegramCampaignBrowser />;
      case "custom-links":
        return <CustomLinksManager />;
      case "join-campaign":
        return <JoinCampaignButton />;
      case "apply-links":
        return <CampaignApplication />;
      case "my-sales":
        return <SalesList />;
      case "claim-payouts":
        return <ClaimPayouts />;
      case "settings":
        return <AffiliateSettings />;
      case "overview":
        return <AffiliateOverview onNavigate={setActiveTab} />;
      default:
        return <AffiliateOverview onNavigate={setActiveTab} />;
    }
  };

  return (
    <div className="flex flex-col lg:flex-row min-h-screen bg-slate-50 dark:bg-zinc-950 font-sans selection:bg-indigo-500/30">
      <Sidebar
        activeTab={activeTab}
        onTabChange={(tab) => setActiveTab(tab as AffiliateTab)}
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

export const Affiliate: React.FC<AffiliateProps> = (props) => (
  <NotificationProvider>
    <AffiliateContent {...props} />
  </NotificationProvider>
);
