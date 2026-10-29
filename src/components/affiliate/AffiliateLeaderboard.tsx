import React, { useState, useMemo } from "react";
import {
  Trophy,
  Award,
  Medal,
  Crown,
  Search,
  Eye,
  EyeOff,
  ShieldCheck,
  ChevronRight,
} from "lucide-react";
import { Card, CardContent } from "../ui/card";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import {
  getLeaderboardRankings,
  getAffiliatePrivacy,
  setAffiliatePrivacy,
  MILESTONE_BADGES,
} from "../../lib/affiliateLeaderboard";
import type { LeaderboardTimeframe } from "../../types/affiliateLeaderboard";
import { useWeb3 } from "../../hooks/useWeb3";
import { useNotification } from "../../context/NotificationContext";
import { AffiliateProfileCard } from "./AffiliateProfileCard";
import { motion } from "framer-motion";

interface AffiliateLeaderboardProps {
  onSelectMilestones?: () => void;
}

export const AffiliateLeaderboard: React.FC<AffiliateLeaderboardProps> = ({
  onSelectMilestones,
}) => {
  const { userAddress } = useWeb3();
  const { showNotification } = useNotification();

  const [timeframe, setTimeframe] = useState<LeaderboardTimeframe>("monthly");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<"sales" | "conversions" | "commission">("sales");
  const [isPrivacyMasked, setIsPrivacyMasked] = useState<boolean>(() =>
    userAddress ? getAffiliatePrivacy(userAddress) : false,
  );

  const [selectedProfileAddress, setSelectedProfileAddress] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const data = useMemo(() => {
    return getLeaderboardRankings(timeframe, searchQuery, sortBy, userAddress);
  }, [timeframe, searchQuery, sortBy, userAddress, isPrivacyMasked, refreshKey]);

  const refreshLeaderboard = () => {
    setRefreshKey((k) => k + 1);
  };

  const handleTogglePrivacy = () => {
    if (!userAddress) {
      showNotification({
        type: "info",
        title: "Connect Wallet",
        message: "Connect your Stellar wallet to customize your leaderboard privacy.",
      });
      return;
    }
    const newMaskedState = !isPrivacyMasked;
    setIsPrivacyMasked(newMaskedState);
    setAffiliatePrivacy(userAddress, newMaskedState);
    refreshLeaderboard();
    showNotification({
      type: "success",
      title: newMaskedState ? "Stealth Privacy Enabled" : "Public Address Visible",
      message: newMaskedState
        ? "Your wallet address is now masked with an encrypted pseudonym on the public leaderboard."
        : "Your public Stellar address is now visible on the leaderboard.",
    });
  };

  const top3 = data.items.slice(0, 3);

  return (
    <div className="space-y-8 font-sans">
      {/* Header Banner */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-indigo-900 via-zinc-950 to-purple-950 p-6 md:p-10 border border-indigo-500/20 text-white shadow-xl">
        <div className="absolute top-0 right-0 -mr-20 -mt-20 w-80 h-80 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10 flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/40 mb-3">
              <Trophy className="w-3.5 h-3.5 text-amber-400" />
              Verified On-Chain Volume Rankings
            </div>
            <h1 className="text-2xl md:text-4xl font-black tracking-tight text-white">
              Affiliate Leaderboards
            </h1>
            <p className="text-zinc-300 mt-2 text-sm sm:text-base leading-relaxed">
              Showcasing the top 50 performing affiliate marketers ranked by verified on-chain sales
              volume. Compete, rank up, and claim milestone Soulbound NFT badges.
            </p>
          </div>

          {/* Privacy Toggle Box */}
          <div className="w-full lg:w-auto bg-zinc-900/80 backdrop-blur-md p-4 sm:p-5 rounded-2xl border border-zinc-800 shadow-lg flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div
                className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                  isPrivacyMasked
                    ? "bg-amber-500/20 text-amber-400 border border-amber-500/30"
                    : "bg-indigo-500/20 text-indigo-400 border border-indigo-500/30"
                }`}
              >
                {isPrivacyMasked ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </div>
              <div>
                <div className="text-xs font-bold text-white flex items-center gap-1.5">
                  Leaderboard Privacy
                  {isPrivacyMasked && (
                    <span className="text-[10px] bg-amber-500/20 text-amber-300 px-1.5 py-0.5 rounded font-bold">
                      Stealth Active
                    </span>
                  )}
                </div>
                <div className="text-[11px] text-zinc-400 font-medium">
                  {isPrivacyMasked
                    ? "Address masked with pseudonym"
                    : "Public Stellar address displayed"}
                </div>
              </div>
            </div>

            <Button
              onClick={handleTogglePrivacy}
              size="sm"
              variant={isPrivacyMasked ? "default" : "outline"}
              className={`rounded-xl text-xs font-extrabold h-9 px-4 transition-all ${
                isPrivacyMasked
                  ? "bg-amber-500 hover:bg-amber-400 text-zinc-950 font-black shadow-md"
                  : "border-zinc-700 bg-zinc-800 text-zinc-200 hover:bg-zinc-700"
              }`}
            >
              {isPrivacyMasked ? "Unmask Address" : "Mask My Address"}
            </Button>
          </div>
        </div>
      </div>

      {/* Protocol Leaderboard Summary Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="rounded-2xl border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 shadow-sm">
          <CardContent className="p-4 sm:p-5">
            <div className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-1">
              Monthly Volume
            </div>
            <div className="text-xl sm:text-2xl font-black text-zinc-900 dark:text-white">
              ${data.stats.totalMonthlyVolume.toLocaleString()}
            </div>
            <p className="text-[10px] text-emerald-500 font-bold mt-1">+24.5% vs last month</p>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 shadow-sm">
          <CardContent className="p-4 sm:p-5">
            <div className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-1">
              Top Marketer Volume
            </div>
            <div className="text-xl sm:text-2xl font-black text-amber-500">
              ${data.stats.topAffiliateMonthlyVolume.toLocaleString()}
            </div>
            <p className="text-[10px] text-zinc-400 mt-1">#1 Monthly Titan</p>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 shadow-sm">
          <CardContent className="p-4 sm:p-5">
            <div className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-1">
              Active Affiliates
            </div>
            <div className="text-xl sm:text-2xl font-black text-zinc-900 dark:text-white">
              {data.stats.activeAffiliatesCount}
            </div>
            <p className="text-[10px] text-zinc-400 mt-1">Top 50 listed on board</p>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 shadow-sm">
          <CardContent className="p-4 sm:p-5">
            <div className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-1">
              Badges Minted
            </div>
            <div className="text-xl sm:text-2xl font-black text-indigo-500">
              {data.stats.totalBadgesClaimed} <span className="text-xs">SBTs</span>
            </div>
            <p className="text-[10px] text-zinc-400 mt-1">Non-transferable proofs</p>
          </CardContent>
        </Card>
      </div>

      {/* Control Bar: Timeframe Pill Selector + Search + Sort */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4 bg-white dark:bg-zinc-900/50 p-4 rounded-2xl border border-slate-200 dark:border-zinc-800">
        {/* Timeframe selector pills */}
        <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-zinc-950 p-1.5 rounded-xl border border-slate-200 dark:border-zinc-800">
          {(["monthly", "weekly", "all-time"] as LeaderboardTimeframe[]).map((tf) => (
            <button
              key={tf}
              onClick={() => setTimeframe(tf)}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold capitalize transition-all ${
                timeframe === tf
                  ? "bg-zinc-900 dark:bg-indigo-600 text-white shadow-sm"
                  : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white"
              }`}
            >
              {tf === "monthly"
                ? "This Month (Default)"
                : tf === "weekly"
                  ? "This Week"
                  : "All-Time"}
            </button>
          ))}
        </div>

        {/* Search & Sort */}
        <div className="flex items-center gap-3">
          <div className="relative flex-1 md:w-64">
            <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search address or pseudonym..."
              className="pl-9 h-10 rounded-xl bg-slate-50 dark:bg-zinc-950 border-slate-200 dark:border-zinc-800 text-xs"
            />
          </div>

          <div className="flex items-center gap-1 bg-slate-100 dark:bg-zinc-950 p-1 rounded-xl border border-slate-200 dark:border-zinc-800">
            <button
              onClick={() => setSortBy("sales")}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all ${
                sortBy === "sales"
                  ? "bg-zinc-900 dark:bg-zinc-800 text-white shadow-sm"
                  : "text-zinc-500 hover:text-zinc-900 dark:hover:text-white"
              }`}
            >
              Volume
            </button>
            <button
              onClick={() => setSortBy("conversions")}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all ${
                sortBy === "conversions"
                  ? "bg-zinc-900 dark:bg-zinc-800 text-white shadow-sm"
                  : "text-zinc-500 hover:text-zinc-900 dark:hover:text-white"
              }`}
            >
              Sales #
            </button>
            <button
              onClick={() => setSortBy("commission")}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all ${
                sortBy === "commission"
                  ? "bg-zinc-900 dark:bg-zinc-800 text-white shadow-sm"
                  : "text-zinc-500 hover:text-zinc-900 dark:hover:text-white"
              }`}
            >
              Earnings
            </button>
          </div>
        </div>
      </div>

      {/* Top 3 Podium Showcase */}
      {top3.length >= 3 && !searchQuery && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-4">
          {/* #2 Rank - Silver */}
          <motion.div
            whileHover={{ y: -6 }}
            className="md:order-1 order-2 rounded-3xl p-6 bg-gradient-to-b from-white to-slate-50 dark:from-zinc-900 dark:to-zinc-950 border border-slate-300 dark:border-zinc-800 shadow-lg relative flex flex-col justify-between"
          >
            <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full bg-slate-300 dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 text-xs font-black flex items-center gap-1 shadow-md">
              <Medal className="w-3.5 h-3.5 text-slate-400" /> #2 Rank
            </div>

            <div className="text-center pt-3">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-slate-200 via-indigo-200 to-slate-400 mx-auto p-1 shadow-md mb-3">
                <div className="w-full h-full bg-zinc-950 rounded-xl flex items-center justify-center text-xl font-black text-slate-200">
                  {top3[1].pseudonym.charAt(0)}
                </div>
              </div>

              <h4 className="font-extrabold text-base text-zinc-900 dark:text-white truncate">
                {top3[1].isPrivacyMasked ? top3[1].pseudonym : top3[1].maskedAddress}
              </h4>
              <p className="text-xs text-zinc-400 font-mono mt-0.5">
                {top3[1].isPrivacyMasked ? "Stealth Mode" : top3[1].address.slice(0, 8) + "..."}
              </p>

              <div className="my-4 p-3 rounded-2xl bg-slate-100 dark:bg-zinc-950/70">
                <div className="text-xs font-bold text-zinc-400 uppercase">Verified Volume</div>
                <div className="text-2xl font-black text-zinc-900 dark:text-white mt-0.5">
                  $
                  {(timeframe === "weekly"
                    ? top3[1].weeklyGrossSales
                    : timeframe === "all-time"
                      ? top3[1].allTimeGrossSales
                      : top3[1].monthlyGrossSales
                  ).toLocaleString()}
                </div>
              </div>

              {/* Badges preview */}
              <div className="flex justify-center items-center gap-1.5 mb-4">
                {top3[1].claimedBadges.map((b) => (
                  <span
                    key={b.tier}
                    title={MILESTONE_BADGES[b.tier].name}
                    className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-indigo-100 text-indigo-800 dark:bg-indigo-950/60 dark:text-indigo-300 border border-indigo-400/40"
                  >
                    ${b.tier.toUpperCase()}
                  </span>
                ))}
              </div>
            </div>

            <Button
              onClick={() => setSelectedProfileAddress(top3[1].address)}
              variant="outline"
              className="w-full rounded-xl text-xs font-bold h-10 border-slate-200 dark:border-zinc-800"
            >
              View Profile Card
            </Button>
          </motion.div>

          {/* #1 Rank - Gold Center Champion */}
          <motion.div
            whileHover={{ y: -8 }}
            className="md:order-2 order-1 rounded-3xl p-7 bg-gradient-to-b from-amber-500/10 via-white to-slate-50 dark:from-amber-500/15 dark:via-zinc-900 dark:to-zinc-950 border-2 border-amber-400 dark:border-amber-500/60 shadow-2xl shadow-amber-500/10 relative flex flex-col justify-between -mt-2 md:-mt-4"
          >
            <div className="absolute -top-4 left-1/2 -translate-x-1/2 px-4 py-1 rounded-full bg-gradient-to-r from-amber-400 to-yellow-500 text-zinc-950 text-xs font-black flex items-center gap-1.5 shadow-xl border border-yellow-200">
              <Crown className="w-4 h-4 text-zinc-950" /> #1 Champion
            </div>

            <div className="text-center pt-4">
              <div className="w-20 h-20 rounded-2xl bg-gradient-to-tr from-yellow-400 via-amber-300 to-yellow-600 mx-auto p-1.5 shadow-xl shadow-amber-500/30 mb-3 animate-pulse">
                <div className="w-full h-full bg-zinc-950 rounded-xl flex items-center justify-center text-2xl font-black text-yellow-400">
                  <Trophy className="w-9 h-9" />
                </div>
              </div>

              <h4 className="font-black text-lg text-zinc-900 dark:text-white truncate">
                {top3[0].isPrivacyMasked ? top3[0].pseudonym : top3[0].maskedAddress}
              </h4>
              <p className="text-xs text-amber-500 font-bold mt-0.5">Apex Protocol Marketer</p>

              <div className="my-4 p-4 rounded-2xl bg-amber-500/10 dark:bg-amber-950/30 border border-amber-500/30">
                <div className="text-xs font-extrabold text-amber-600 dark:text-amber-400 uppercase tracking-wider">
                  Verified Volume
                </div>
                <div className="text-3xl font-black text-zinc-900 dark:text-white mt-0.5">
                  $
                  {(timeframe === "weekly"
                    ? top3[0].weeklyGrossSales
                    : timeframe === "all-time"
                      ? top3[0].allTimeGrossSales
                      : top3[0].monthlyGrossSales
                  ).toLocaleString()}
                </div>
                <div className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-1">
                  {top3[0].verifiedSalesCount} sales · {top3[0].conversionRate}% conv.
                </div>
              </div>

              {/* Badges preview */}
              <div className="flex justify-center items-center gap-1.5 mb-4">
                {top3[0].claimedBadges.map((b) => (
                  <span
                    key={b.tier}
                    title={MILESTONE_BADGES[b.tier].name}
                    className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-amber-100 text-amber-900 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-400/50"
                  >
                    ${b.tier.toUpperCase()} Titan
                  </span>
                ))}
              </div>
            </div>

            <Button
              onClick={() => setSelectedProfileAddress(top3[0].address)}
              className="w-full rounded-xl text-xs font-black h-11 bg-gradient-to-r from-amber-500 to-yellow-500 text-zinc-950 hover:from-amber-400 hover:to-yellow-400 shadow-md shadow-amber-500/25"
            >
              View Champion Profile
            </Button>
          </motion.div>

          {/* #3 Rank - Bronze */}
          <motion.div
            whileHover={{ y: -6 }}
            className="md:order-3 order-3 rounded-3xl p-6 bg-gradient-to-b from-white to-slate-50 dark:from-zinc-900 dark:to-zinc-950 border border-slate-300 dark:border-zinc-800 shadow-lg relative flex flex-col justify-between"
          >
            <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full bg-amber-700 text-white text-xs font-black flex items-center gap-1 shadow-md">
              <Medal className="w-3.5 h-3.5 text-amber-300" /> #3 Rank
            </div>

            <div className="text-center pt-3">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-amber-600 via-orange-400 to-amber-700 mx-auto p-1 shadow-md mb-3">
                <div className="w-full h-full bg-zinc-950 rounded-xl flex items-center justify-center text-xl font-black text-amber-400">
                  {top3[2].pseudonym.charAt(0)}
                </div>
              </div>

              <h4 className="font-extrabold text-base text-zinc-900 dark:text-white truncate">
                {top3[2].isPrivacyMasked ? top3[2].pseudonym : top3[2].maskedAddress}
              </h4>
              <p className="text-xs text-zinc-400 font-mono mt-0.5">
                {top3[2].isPrivacyMasked ? "Stealth Mode" : top3[2].address.slice(0, 8) + "..."}
              </p>

              <div className="my-4 p-3 rounded-2xl bg-slate-100 dark:bg-zinc-950/70">
                <div className="text-xs font-bold text-zinc-400 uppercase">Verified Volume</div>
                <div className="text-2xl font-black text-zinc-900 dark:text-white mt-0.5">
                  $
                  {(timeframe === "weekly"
                    ? top3[2].weeklyGrossSales
                    : timeframe === "all-time"
                      ? top3[2].allTimeGrossSales
                      : top3[2].monthlyGrossSales
                  ).toLocaleString()}
                </div>
              </div>

              {/* Badges preview */}
              <div className="flex justify-center items-center gap-1.5 mb-4">
                {top3[2].claimedBadges.map((b) => (
                  <span
                    key={b.tier}
                    title={MILESTONE_BADGES[b.tier].name}
                    className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-orange-100 text-orange-800 dark:bg-orange-950/60 dark:text-orange-300 border border-orange-400/40"
                  >
                    ${b.tier.toUpperCase()}
                  </span>
                ))}
              </div>
            </div>

            <Button
              onClick={() => setSelectedProfileAddress(top3[2].address)}
              variant="outline"
              className="w-full rounded-xl text-xs font-bold h-10 border-slate-200 dark:border-zinc-800"
            >
              View Profile Card
            </Button>
          </motion.div>
        </div>
      )}

      {/* Top 50 Rankings Table */}
      <Card className="rounded-3xl border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-slate-100 dark:border-zinc-800 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-black text-zinc-900 dark:text-white flex items-center gap-2">
              <Trophy className="w-5 h-5 text-indigo-500" />
              Top 50 Affiliate Rankings
            </h3>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
              Verified sales volume updated in real-time from Soroban smart contracts.
            </p>
          </div>

          {onSelectMilestones && (
            <Button
              onClick={onSelectMilestones}
              size="sm"
              className="bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold"
            >
              <Award className="w-4 h-4 mr-1.5" />
              Claim Milestones
            </Button>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-100 dark:border-zinc-800/80 bg-slate-50/70 dark:bg-zinc-950/40 text-[11px] font-extrabold uppercase tracking-wider text-zinc-400">
                <th className="py-3.5 px-4 sm:px-6">Rank</th>
                <th className="py-3.5 px-4">Affiliate Marketer</th>
                <th className="py-3.5 px-4 text-right">Verified Sales Volume</th>
                <th className="py-3.5 px-4 text-center">Conversions</th>
                <th className="py-3.5 px-4 text-center">Trophies</th>
                <th className="py-3.5 px-4 sm:px-6 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-zinc-800/60 text-sm">
              {data.items.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-zinc-400 text-sm font-medium">
                    No affiliates matched your search criteria.
                  </td>
                </tr>
              ) : (
                data.items.map((affiliate) => {
                  const isCurrent =
                    userAddress && affiliate.address.toLowerCase() === userAddress.toLowerCase();
                  const volume =
                    timeframe === "weekly"
                      ? affiliate.weeklyGrossSales
                      : timeframe === "all-time"
                        ? affiliate.allTimeGrossSales
                        : affiliate.monthlyGrossSales;

                  return (
                    <tr
                      key={affiliate.address}
                      className={`hover:bg-slate-50/80 dark:hover:bg-zinc-800/40 transition-colors ${
                        isCurrent ? "bg-indigo-50/50 dark:bg-indigo-950/20 font-semibold" : ""
                      }`}
                    >
                      {/* Rank */}
                      <td className="py-4 px-4 sm:px-6">
                        <div className="flex items-center gap-2">
                          <span
                            className={`w-7 h-7 rounded-xl flex items-center justify-center font-black text-xs ${
                              affiliate.rank === 1
                                ? "bg-amber-400 text-zinc-950 shadow-md shadow-amber-500/20"
                                : affiliate.rank === 2
                                  ? "bg-slate-300 text-zinc-900 shadow-sm"
                                  : affiliate.rank === 3
                                    ? "bg-amber-700 text-white shadow-sm"
                                    : "text-zinc-500 dark:text-zinc-400 font-bold"
                            }`}
                          >
                            {affiliate.rank}
                          </span>
                        </div>
                      </td>

                      {/* Affiliate Identity / Masked */}
                      <td className="py-4 px-4">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-sky-500/20 to-indigo-500/20 border border-indigo-500/30 flex items-center justify-center font-black text-indigo-500 shrink-0">
                            {affiliate.pseudonym.charAt(0)}
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-zinc-900 dark:text-white">
                                {affiliate.isPrivacyMasked
                                  ? affiliate.pseudonym
                                  : affiliate.maskedAddress}
                              </span>
                              {affiliate.isPrivacyMasked ? (
                                <span className="inline-flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 border border-amber-500/30">
                                  <EyeOff className="w-2.5 h-2.5" /> Masked
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                                  <ShieldCheck className="w-2.5 h-2.5" />
                                </span>
                              )}
                              {isCurrent && (
                                <span className="text-[9px] font-extrabold uppercase px-1.5 py-0.2 bg-indigo-600 text-white rounded">
                                  You
                                </span>
                              )}
                            </div>
                            <span className="text-[11px] font-mono text-zinc-400 block mt-0.5 truncate max-w-[160px] sm:max-w-[240px]">
                              {affiliate.isPrivacyMasked
                                ? affiliate.maskedAddress
                                : affiliate.address}
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* Verified Sales Volume */}
                      <td className="py-4 px-4 text-right">
                        <div className="font-black text-sm text-zinc-900 dark:text-white">
                          ${volume.toLocaleString()}
                        </div>
                        <div className="text-[11px] text-zinc-400">
                          {affiliate.commissionEarnedXlm.toLocaleString()} XLM earned
                        </div>
                      </td>

                      {/* Conversions */}
                      <td className="py-4 px-4 text-center">
                        <div className="font-bold text-xs text-zinc-700 dark:text-zinc-300">
                          {affiliate.verifiedSalesCount}
                        </div>
                        <div className="text-[10px] text-zinc-400 font-medium">
                          {affiliate.conversionRate}% conv.
                        </div>
                      </td>

                      {/* Milestone Badges */}
                      <td className="py-4 px-4 text-center">
                        <div className="flex items-center justify-center gap-1">
                          {affiliate.claimedBadges.length === 0 ? (
                            <span className="text-xs text-zinc-400">—</span>
                          ) : (
                            affiliate.claimedBadges.map((badge) => (
                              <span
                                key={badge.tier}
                                title={MILESTONE_BADGES[badge.tier].name}
                                className={`w-6 h-6 rounded-lg flex items-center justify-center text-[10px] font-black border ${
                                  badge.tier === "100k"
                                    ? "bg-amber-100 text-amber-900 dark:bg-amber-950/60 dark:text-amber-300 border-amber-400/50"
                                    : badge.tier === "10k"
                                      ? "bg-indigo-100 text-indigo-900 dark:bg-indigo-950/60 dark:text-indigo-300 border-indigo-400/50"
                                      : "bg-orange-100 text-orange-900 dark:bg-orange-950/60 dark:text-orange-300 border-orange-400/50"
                                }`}
                              >
                                {badge.tier === "100k" ? "G" : badge.tier === "10k" ? "S" : "B"}
                              </span>
                            ))
                          )}
                        </div>
                      </td>

                      {/* Actions */}
                      <td className="py-4 px-4 sm:px-6 text-right">
                        <Button
                          onClick={() => setSelectedProfileAddress(affiliate.address)}
                          size="sm"
                          variant="ghost"
                          className="h-8 px-3 rounded-xl font-bold text-xs text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/40"
                        >
                          View Profile
                          <ChevronRight className="w-3.5 h-3.5 ml-1" />
                        </Button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Public Profile Modal */}
      {selectedProfileAddress && (
        <AffiliateProfileCard
          affiliateAddress={selectedProfileAddress}
          isOpen={Boolean(selectedProfileAddress)}
          onClose={() => setSelectedProfileAddress(null)}
          onBadgeClaimed={refreshLeaderboard}
        />
      )}
    </div>
  );
};
