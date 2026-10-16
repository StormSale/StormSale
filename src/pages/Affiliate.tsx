import { useState, useMemo } from "react";
import { Sidebar } from "../components/shared/Sidebar";
import { JoinCampaignButton } from "../components/affiliate/JoinCampaignButton";
import { SalesList } from "../components/affiliate/SalesList";
import { ClaimPayouts } from "../components/affiliate/ClaimPayouts";
import { AffiliateOverview } from "../components/affiliate/AffiliateOverview";
import { Users, TrendingUp, DollarSign, BarChart3, Shield, LayoutDashboard, Globe } from "lucide-react";
import { NotificationProvider } from "../context/NotificationContext";
import { motion, AnimatePresence } from "framer-motion";

interface AffiliateProps {
  onBack: () => void;
}

export interface ClickEvent {
  countryIso: string;
  countryName: string;
  clicks: number;
  conversions: number;
  campaignId: string;
  date: string;
}

export interface HeatmapData {
  iso: string;
  name: string;
  clicks: number;
  conversions: number;
  conversionRate: number;
}

const COUNTRY_COORDS: Record<string, { viewBox: string; path: string; name: string }> = {
  US: { name: "United States", viewBox: "0 0 100 100", path: "M20 20 L30 20 L30 30 L20 30 Z" },
  GB: { name: "United Kingdom", viewBox: "0 0 100 100", path: "M40 20 L50 20 L50 30 L40 30 Z" },
  DE: { name: "Germany", viewBox: "0 0 100 100", path: "M50 30 L60 30 L60 40 L50 40 Z" },
  FR: { name: "France", viewBox: "0 0 100 100", path: "M30 40 L40 40 L40 50 L30 50 Z" },
  IN: { name: "India", viewBox: "0 0 100 100", path: "M60 50 L70 50 L70 60 L60 60 Z" },
  BR: { name: "Brazil", viewBox: "0 0 100 100", path: "M20 60 L30 60 L30 70 L20 70 Z" },
  JR: { name: "Japan", viewBox: "0 0 100 100", path: "M80 40 L90 40 L90 50 L80 50 Z" },
  AU: { name: "Australia", viewBox: "0 0 100 100", path: "70 70 L80 70 L80 80 L70 80 Z" },
  CA: { name: "Canada", viewBox: "0 0 100 100", path: "10 10 L20 10 L20 20 L10 20 Z" },
  NG: { name: "Nigeria", viewBox: "0 0 100 100", path: "40 60 L50 60 L50 70 L40 70 Z" },
};

const campaigns = [
  { id: "all", name: "All Campaigns" },
  { id: "camp-1", name: "Summer Sale 2024" },
  { id: "camp-2", name: "Product Launch" },
  { id: "camp-3", name: "Holiday Promo" },
];

const generateClickData = (): ClickEvent[] => {
  const countries = Object.keys(COUNTRY_COORDS);
  const campaignsIds = ["camp-1", "camp-2", "camp-3"];
  const data = [] as ClickEvent[];
  const today = new Date();
  for (let d = 0; d < 30; d++) {
    const date = new Date(today);
    date.setDate(today.getDate() - d);
    const isoDate = date.toISOString().split("T")[0];
    countries.forEach((iso) => {
      campaignsIds.forEach((campaignId) => {
        const base = Math.floor(Math.random() * 500) + 50;
        const clicks = base + Math.floor(Math.random() * 200);
        const conversions = Math.floor(clicks * (0.02 + Math.random() * 0.08));
        data.push({
          countryIso: iso,
          countryName: COUNTRY_COORDS[iso].name,
          clicks,
          conversions,
          campaignId,
          date: isoDate,
        });
      });
    });
  }
  return data;
};

const clickDatabase = generateClickData();

const HeatmapVisualizer: React.FC = () => {
  const today = new Date();
  const monthAgo = new Date(today);
  monthAgo.setDate(today.getDate() - 30);
  const [startDate, setStartDate] = useState(monthAgo.toISOString().split("T")[0]);
  const [endDate, setEndDate] = useState(today.toISOString().split("T")[0]);
  const [selectedCampaign, setSelectedCampaign] = useState("all");
  const [hoveredCountry, setHoveredCountry] = useState<string | null>(null);

  const filteredData = useMemo(() => {
    return clickDatabase.filter(
      (e) =>
        e.date >= startDate &&
        e.date <= endDate &&
        (selectedCampaign === "all" || e.campaignId === selectedCampaign)
    );
  }, [startDate, endDate, selectedCampaign]);

  const heatmapData = useMemo(() => {
    const map = new Map<string, HeatmapData>();
    filteredData.forEach((e) => {
      const existing = map.get(e.countryIso);
      if (existing) {
        existing.clicks += e.clicks;
        existing.conversions += e.conversions;
      } else {
        map.set(e.countryIso, {
          iso: e.countryIso,
          name: e.countryName,
          clicks: e.clicks,
          conversions: e.conversions,
          conversionRate: 0,
        });
      }
    });
    const arr = Array.from(map.values());
    arr.forEach((d) => {
      d.conversionRate = d.clicks > 0 ? (d.conversions / d.clicks) * 100 : 0;
    });
    return arr.sort((a, b) => b.clicks - a.clicks);
  }, [filteredData]);

  const maxClicks = useMemo(() => Math.max(...heatmapData.map((d) => d.clicks), 1), [heatmapData]);
  const totalClicks = useMemo(() => heatmapData.reduce((s, d) => s + d.clicks, 0), [heatmapData]);
  const totalConversions = useMemo(() => heatmapData.reduce((s, d) => s + d.conversions, 0), [heatmapData]);
  const top5 = useMemo(() => heatmapData.slice(0, 5), [heatmapData]);

  const getColor = (ratio: number) => {
    const hue = (1 - ratio) * 240;
    return `hsl(${hue}, 85%, 55%)`;
  };

  const getRadius = (clicks: number) => {
    const ratio = clicks / maxClicks;
    return 6 + ratio * 18;
  };

  return (
    <div className="space-y-8">
      <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-sm border border-slate-200 dark:border-zinc-800 p-6 rounded-2xl">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-indigo-100 dark:bg-indigo-500/20">
              <Globe className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
                Real-Time Click Stream Heatmap
              </h3>
              <p className="text-sm text-slate-500 dark:text-zinc-400">
                Geolocation visualizer — clicks aggregated by country ISO code
              </p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-zinc-400 mb-1">
              Start Date
            </label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full rounded-lg border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 py-2 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-zinc-400 mb-1">
              End Date
            </label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full rounded-lg border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 py-2 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-zinc-400 mb-1">
              Campaign Link
            </label>
            <select
              value={selectedCampaign}
              onChange={(e) => setSelectedCampaign(e.target.value)}
              className="w-full rounded-lg border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 py-2 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              {campaigns.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
          <div className="bg-slate-50 dark:bg-zinc-800/50 rounded-lg p-4">
            <p className="text-xs text-slate-500 dark:text-zinc-400">Total Clicks</p>
            <p className="text-2xl font-bold text-slate-900 dark:text-white">
              {totalClicks.toLocaleString()}
            </p>
          </div>
          <div className="bg-slate-50 dark:bg-zinc-800/50 rounded-lg p-4">
            <p className="text-xs text-slate-500 dark:text-zinc-400">Total Conversions</p>
            <p className="text-2xl font-bold text-slate-900 dark:text-white">
              {totalConversions.toLocaleString()}
            </p>
          </div>
          <div className="bg-slate-50 dark:bg-zinc-800/50 rounded-lg p-4">
            <p className="text-xs text-slate-500 dark:text-zinc-400">Conversion Rate</p>
            <p className="text-2xl font-bold text-slate-900 dark:text-white">
              {totalClicks > 0
                ? ((totalConversions / totalClicks) * 100).toFixed(2)
                : "0.00"}
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white dark:bg-zinc-900 rounded-2xl border border-slate-200 dark:border-zinc-800 p-6">
          <h4 className="text-sm font-semibold text-slate-900 dark:text-white mb-4">
            Geographic Click Density Map
          </h4>
          <div className="relative w-full aspect-[2/1] overflow-hidden rounded-xl bg-slate-100 dark:bg-zinc-800/50">
            <svg
              viewBox="0 0 100 100"
              className="w-full h-full"
              preserveAspectRatio="xMidYMid meet"
            >
              <defs>
                <radialGradient id="heat-gradient">
                  <stop offset="0%" stopColor="#ef4444" stopOpacity="0.8" />
                  <stop offset="100%" stopColor="#ef4444" stopOpacity="0" />
                </radialGradient>
              </defs>
              <rect width="100" height="100" fill="transparent" />
              {Object.keys(COUNTRY_COORDS).map((iso) => {
                const country = COUNTRY_COORDS[iso];
                const data = heatmapData.find((d) => d.iso === iso);
                const clicks = data?.clicks ?? 0;
                const ratio = maxClicks > 0 ? clicks / maxClicks : 0;
                const centerX = 50 + (Object.keys(COUNTRY_COORDS).indexOf(iso) % 5) * 10 - 20;
                const centerY = 50 + Math.floor(Object.keys(COUNTRY_COORDS).indexOf(iso) / 5) * 15 - 15;
                const radius = getRadius(clicks);
                return (
                  <g key={iso}>
                    <circle
                      cx={centerX}
                      cy={centerY}
                      r={radius + 4}
                      fill="url(#heat-gradient)"
                      opacity={ratio * 0.6}
                    />
                    <circle
                      cx={centerX}
                      cy={centerY}
                      r={radius}
                      fill={getColor(ratio)}
                      fillOpacity="0.85"
                      stroke="white"
                      strokeWidth="0.5"
                      className="cursor-pointer transition-all duration-500 ease-out"
                      onMouseEnter={() => setHoveredCountry(iso)}
                      onMouseLeave={() => setHoveredCountry(null)}
                    />
                    <text
                      x={centerX}
                      y={centerY}
                      textAnchor="middle"
                      dy="0.35em"
                      fontSize="3"
                      fill="white"
                      fontWeight="bold"
                      className="pointer-events-none"
                    >
                      {iso}
                    </text>
                  </g>
                );
              })}
            </svg>
            <AnimatePresence>
              {hoveredCountry && (
                <motion.div
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 4 }}
                  className="absolute top-2 left-2 bg-slate-900/90 text-white text-xs rounded-lg px-3 py-2 pointer-events-none shadow-lg"
                >
                  {heatmapData.find((d) => d.iso === hoveredCountry)?.name ?? hoveredCountry}
                  <span className="block text-indigo-300">
                    {heatmapData.find((d) => d.iso === hoveredCountry)?.clicks.toLocaleString() ?? 0} clicks
                  </span>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-slate-200 dark:border-zinc-800 p-6">
          <h4 className="text-sm font-semibold text-slate-900 dark:text-white mb-4">
            Top 5 Countries
          </h4>
          <div className="space-y-3">
            {top5.map((d, idx) => (
              <motion.div
                key={d.iso}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: idx * 0.05 }}
                className="flex items-center justify-between gap-3 p-2 rounded-lg hover:bg-slate-50 dark:hover:bg-zinc-800/50 transition-colors"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className="text-xs font-bold text-slate-400 dark:text-zinc-500 w-4">
                    #{idx + 1}
                  </span>
                  <span className="text-sm font-medium text-slate-900 dark:text-white truncate">
                    {d.name}
                  </span>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-sm font-semibold text-slate-900 dark:text-white">
                    {d.clicks.toLocaleString()}
                  </p>
                  <p className="text-xs text-emerald-600 dark:text-emerald-400">
                    {d.conversionRate.toFixed(2)}% CVR
                  </p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

const AffiliateContent: React.FC<AffiliateProps> = ({ onBack }) => {
  const [activeTab, setActiveTab] = useState("overview");

  const tabs = [
    { id: "overview", label: "Dashboard Overview", icon: LayoutDashboard },
    { id: "heatmap", label: "Click Heatmap", icon: Globe },
    { id: "join-campaign", label: "Join Campaign", icon: Users },
    { id: "my-sales", label: "My Sales & Commissions", icon: DollarSign },
    { id: "claim-payouts", label: "Claim Payouts", icon: TrendingUp },
    { id: "performance", label: "Performance Analytics", icon: BarChart3 },
    { id: "security", label: "Security Settings", icon: Shield },
  ];

  const renderContent = () => {
    switch (activeTab) {
      case "heatmap":
        return <HeatmapVisualizer />;
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
