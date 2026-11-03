import React, { useState, useMemo, useEffect } from "react";
import { Input } from "../ui/input";
import { Button } from "../ui/button";
import { useCampaigns } from "../../hooks/useCampaigns";
import { CampaignCard } from "./CampaignCard";
import {
  Search,
  LayoutGrid,
  List,
  Filter,
  TrendingUp,
  Coins,
  Sparkles,
  RefreshCw,
  X,
  Compass,
} from "lucide-react";

export const BrowseCampaigns: React.FC = () => {
  const { campaigns, isLoading, refreshCampaigns, joinCampaign, checkEligibility } = useCampaigns();

  // Search state & Debounced value
  const [searchInput, setSearchInput] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedQuery(searchInput);
    }, 300);
    return () => clearTimeout(handler);
  }, [searchInput]);

  // View Mode: Grid or List
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");

  // Filter States
  const [selectedCategory, setSelectedCategory] = useState<string>("All");
  const [minReward, setMinReward] = useState<number>(0);
  const [minRoi, setMinRoi] = useState<number>(0);
  const [sortBy, setSortBy] = useState<"roi" | "reward" | "escrow" | "newest">("roi");

  // Extract Categories
  const categories = useMemo(() => {
    const set = new Set<string>();
    campaigns.forEach((c) => set.add(c.category));
    return ["All", ...Array.from(set)];
  }, [campaigns]);

  // Filter & Sort Logic
  const filteredCampaigns = useMemo(() => {
    return campaigns
      .filter((c) => {
        // Search query match
        if (debouncedQuery.trim()) {
          const q = debouncedQuery.toLowerCase();
          const matchName = c.name.toLowerCase().includes(q);
          const matchDesc = c.description.toLowerCase().includes(q);
          const matchAdv = c.advertiser.toLowerCase().includes(q);
          const matchTag = c.tags.some((t) => t.toLowerCase().includes(q));
          if (!matchName && !matchDesc && !matchAdv && !matchTag) return false;
        }

        // Category match
        if (selectedCategory !== "All" && c.category !== selectedCategory) {
          return false;
        }

        // Reward match
        if (c.rewardAmount < minReward) {
          return false;
        }

        // ROI match
        if (c.roi < minRoi) {
          return false;
        }

        return true;
      })
      .sort((a, b) => {
        if (sortBy === "roi") return b.roi - a.roi;
        if (sortBy === "reward") return b.rewardAmount - a.rewardAmount;
        if (sortBy === "escrow") return b.escrowBalance - a.escrowBalance;
        if (sortBy === "newest") return b.createdAt.localeCompare(a.createdAt);
        return 0;
      });
  }, [campaigns, debouncedQuery, selectedCategory, minReward, minRoi, sortBy]);

  const totalMarketplaceEscrow = useMemo(() => {
    return campaigns.reduce((acc, c) => acc + c.escrowBalance, 0);
  }, [campaigns]);

  const averageRoi = useMemo(() => {
    if (campaigns.length === 0) return 0;
    return Math.round(campaigns.reduce((acc, c) => acc + c.roi, 0) / campaigns.length);
  }, [campaigns]);

  const handleClearFilters = () => {
    setSearchInput("");
    setDebouncedQuery("");
    setSelectedCategory("All");
    setMinReward(0);
    setMinRoi(0);
    setSortBy("roi");
  };

  const hasActiveFilters =
    debouncedQuery !== "" ||
    selectedCategory !== "All" ||
    minReward > 0 ||
    minRoi > 0 ||
    sortBy !== "roi";

  return (
    <div className="space-y-8">
      {/* Header Banner */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center bg-white dark:bg-zinc-900/50 p-6 md:p-8 rounded-3xl border border-slate-200 dark:border-zinc-800 shadow-sm">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl md:text-3xl font-extrabold text-zinc-900 dark:text-white tracking-tight">
              Campaign Marketplace
            </h1>
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-indigo-100 text-indigo-700 dark:bg-indigo-950/80 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
              <Compass className="w-3.5 h-3.5" />
              Live Marketplace
            </span>
          </div>
          <p className="text-zinc-500 dark:text-zinc-400 mt-2 font-medium">
            Discover verified affiliate campaigns, filter by category & ROI, and join with immediate
            smart contract feedback.
          </p>
        </div>

        {/* View Toggle & Refresh */}
        <div className="flex items-center gap-3 mt-6 lg:mt-0">
          <div className="flex items-center p-1 rounded-2xl bg-slate-100 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700">
            <button
              type="button"
              onClick={() => setViewMode("grid")}
              className={`p-2 rounded-xl transition-all cursor-pointer ${
                viewMode === "grid"
                  ? "bg-white dark:bg-zinc-900 text-indigo-600 dark:text-indigo-400 shadow-sm font-bold"
                  : "text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
              }`}
              aria-label="Grid view"
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => setViewMode("list")}
              className={`p-2 rounded-xl transition-all cursor-pointer ${
                viewMode === "list"
                  ? "bg-white dark:bg-zinc-900 text-indigo-600 dark:text-indigo-400 shadow-sm font-bold"
                  : "text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
              }`}
              aria-label="List view"
            >
              <List className="w-4 h-4" />
            </button>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={refreshCampaigns}
            disabled={isLoading}
            className="h-10 px-4 rounded-xl text-xs font-semibold border-slate-200 dark:border-zinc-800 hover:bg-slate-50 dark:hover:bg-zinc-800"
          >
            <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${isLoading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Marketplace Metrics Ribbon */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-5 rounded-2xl bg-white dark:bg-zinc-900/60 border border-slate-200 dark:border-zinc-800 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-[10px] uppercase font-bold text-zinc-400">Total Active Campaigns</p>
            <p className="text-2xl font-extrabold text-zinc-900 dark:text-white mt-1">
              {campaigns.length}
            </p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-950/80 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
            <Sparkles className="w-5 h-5" />
          </div>
        </div>

        <div className="p-5 rounded-2xl bg-white dark:bg-zinc-900/60 border border-slate-200 dark:border-zinc-800 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-[10px] uppercase font-bold text-zinc-400">Available Escrow Pool</p>
            <p className="text-2xl font-extrabold text-indigo-600 dark:text-indigo-400 mt-1">
              {totalMarketplaceEscrow.toLocaleString()} XLM
            </p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-amber-50 dark:bg-amber-950/80 text-amber-600 dark:text-amber-400 flex items-center justify-center">
            <Coins className="w-5 h-5" />
          </div>
        </div>

        <div className="p-5 rounded-2xl bg-white dark:bg-zinc-900/60 border border-slate-200 dark:border-zinc-800 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-[10px] uppercase font-bold text-zinc-400">Average Affiliate ROI</p>
            <p className="text-2xl font-extrabold text-emerald-600 dark:text-emerald-400 mt-1">
              +{averageRoi}%
            </p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-950/80 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
            <TrendingUp className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Filter & Search Bar Toolbar */}
      <div className="space-y-4 bg-white dark:bg-zinc-900/50 p-6 rounded-3xl border border-slate-200 dark:border-zinc-800 shadow-sm">
        <div className="flex flex-col md:flex-row items-stretch md:items-center gap-3">
          {/* Debounced Search */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400" />
            <Input
              type="text"
              placeholder="Search campaigns by name, category, or keyword..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="pl-10 h-11 rounded-2xl bg-slate-50 dark:bg-zinc-950/50 border-slate-200 dark:border-zinc-800 text-sm focus-visible:ring-indigo-500"
            />
            {searchInput && (
              <button
                type="button"
                onClick={() => setSearchInput("")}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Sort By Dropdown */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-zinc-400 shrink-0">Sort By:</span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as "roi" | "reward" | "escrow" | "newest")}
              className="h-11 px-3.5 rounded-2xl bg-slate-50 dark:bg-zinc-950/50 border border-slate-200 dark:border-zinc-800 text-xs font-bold text-zinc-800 dark:text-zinc-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="roi">Highest Estimated ROI</option>
              <option value="reward">Highest Reward Rate</option>
              <option value="escrow">Largest Escrow Pool</option>
              <option value="newest">Newest Added</option>
            </select>
          </div>
        </div>

        {/* Category Pills & Threshold Filters */}
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 pt-3 border-t border-slate-100 dark:border-zinc-800/60">
          {/* Categories */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold text-zinc-400 mr-1 flex items-center gap-1">
              <Filter className="w-3.5 h-3.5" /> Category:
            </span>
            {categories.map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setSelectedCategory(cat)}
                className={`px-3 py-1 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  selectedCategory === cat
                    ? "bg-indigo-600 text-white shadow-sm"
                    : "bg-slate-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 hover:bg-slate-200 dark:hover:bg-zinc-700"
                }`}
              >
                {cat}
              </button>
            ))}
          </div>

          {/* Advanced Sliders / Inputs */}
          <div className="flex flex-wrap items-center gap-4 text-xs font-semibold text-zinc-600 dark:text-zinc-300">
            <div className="flex items-center gap-2">
              <span className="text-zinc-400">Min Reward:</span>
              <select
                value={minReward}
                onChange={(e) => setMinReward(Number(e.target.value))}
                className="h-8 px-2.5 rounded-xl bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 text-xs font-bold"
              >
                <option value={0}>Any Reward</option>
                <option value={10}>&gt;= 10%</option>
                <option value={15}>&gt;= 15%</option>
                <option value={20}>&gt;= 20%</option>
                <option value={25}>&gt;= 25%</option>
              </select>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-zinc-400">Min ROI:</span>
              <select
                value={minRoi}
                onChange={(e) => setMinRoi(Number(e.target.value))}
                className="h-8 px-2.5 rounded-xl bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 text-xs font-bold"
              >
                <option value={0}>Any ROI</option>
                <option value={150}>&gt;= +150%</option>
                <option value={200}>&gt;= +200%</option>
                <option value={300}>&gt;= +300%</option>
              </select>
            </div>

            {hasActiveFilters && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleClearFilters}
                className="h-8 px-2.5 text-xs text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 font-bold"
              >
                <X className="w-3.5 h-3.5 mr-1" />
                Reset Filters
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Campaign Cards Section */}
      {filteredCampaigns.length === 0 ? (
        <div className="p-12 text-center rounded-3xl bg-white dark:bg-zinc-900/40 border border-slate-200 dark:border-zinc-800">
          <div className="max-w-md mx-auto space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center mx-auto">
              <Search className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-bold text-zinc-900 dark:text-white">
              No Matching Campaigns Found
            </h3>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              We couldn't find any campaigns matching your current search or filter criteria. Try
              loosening your filters or resetting your search.
            </p>
            {hasActiveFilters && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleClearFilters}
                className="mt-2 text-xs font-bold"
              >
                Clear All Filters
              </Button>
            )}
          </div>
        </div>
      ) : viewMode === "grid" ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {filteredCampaigns.map((campaign) => {
            const eligibility = checkEligibility(campaign);
            return (
              <CampaignCard
                key={campaign.id}
                campaign={campaign}
                viewMode="grid"
                onJoin={joinCampaign}
                isEligible={eligibility.eligible}
                ineligibilityReason={eligibility.reason}
              />
            );
          })}
        </div>
      ) : (
        <div className="space-y-4">
          {filteredCampaigns.map((campaign) => {
            const eligibility = checkEligibility(campaign);
            return (
              <CampaignCard
                key={campaign.id}
                campaign={campaign}
                viewMode="list"
                onJoin={joinCampaign}
                isEligible={eligibility.eligible}
                ineligibilityReason={eligibility.reason}
              />
            );
          })}
        </div>
      )}
    </div>
  );
};
