import React, { useState } from "react";
import {
  Trophy,
  Award,
  Shield,
  Sparkles,
  Lock,
  CheckCircle2,
  ExternalLink,
  Share2,
  ArrowRight,
  PlusCircle,
} from "lucide-react";
import { Card, CardContent } from "../ui/card";
import { Button } from "../ui/button";
import { useWeb3 } from "../../hooks/useWeb3";
import { useNotification } from "../../context/NotificationContext";
import {
  MILESTONE_BADGES,
  getAffiliateProfile,
  claimMilestoneBadge,
  setUserGrossSales,
} from "../../lib/affiliateLeaderboard";
import type { MilestoneTier, AffiliateProfileData } from "../../types/affiliateLeaderboard";
import { STELLAR_CONFIG } from "../../config/stellar";
import { AffiliateProfileCard } from "./AffiliateProfileCard";
import { motion } from "framer-motion";

export const MilestoneBadges: React.FC = () => {
  const { userAddress, connectorType } = useWeb3();
  const { showNotification } = useNotification();

  const [profile, setProfile] = useState<AffiliateProfileData>(() =>
    getAffiliateProfile(userAddress || "", userAddress),
  );
  const [claimingTier, setClaimingTier] = useState<MilestoneTier | null>(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [showSimModal, setShowSimModal] = useState(false);

  const refreshData = () => {
    if (!userAddress) return;
    setProfile(getAffiliateProfile(userAddress, userAddress));
  };

  const handleClaim = async (tier: MilestoneTier) => {
    if (!userAddress) {
      showNotification({
        type: "error",
        title: "Wallet Required",
        message: "Please connect your Stellar wallet to claim milestone badges.",
      });
      return;
    }

    setClaimingTier(tier);
    try {
      const record = await claimMilestoneBadge(userAddress, tier, connectorType || "freighter");
      showNotification({
        type: "success",
        title: "Soulbound NFT Minted! 🏆",
        message: `Successfully minted ${MILESTONE_BADGES[tier].name} on Stellar (Tx: ${record.txHash.slice(0, 10)}...).`,
      });
      refreshData();
    } catch (err: any) {
      showNotification({
        type: "error",
        title: "Claim Failed",
        message: err?.message || "Failed to mint milestone badge on-chain.",
      });
    } finally {
      setClaimingTier(null);
    }
  };

  const handleSimulateSales = (amount: number) => {
    if (!userAddress) return;
    setUserGrossSales(userAddress, { monthly: amount });
    refreshData();
    setShowSimModal(false);
    showNotification({
      type: "success",
      title: "Sales Volume Updated",
      message: `Verified gross sales updated to $${amount.toLocaleString()}. Milestone locks recalculated!`,
    });
  };

  const tiers: MilestoneTier[] = ["1k", "10k", "100k"];

  return (
    <div className="space-y-8 font-sans">
      {/* Header Banner */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-amber-600 via-indigo-950 to-zinc-950 p-6 md:p-10 border border-amber-500/20 text-white shadow-xl">
        <div className="absolute top-0 right-0 -mr-20 -mt-20 w-80 h-80 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10 flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40 mb-3">
              <Sparkles className="w-3.5 h-3.5" />
              Gamified On-Chain Reputation
            </div>
            <h1 className="text-2xl md:text-4xl font-black tracking-tight text-white">
              Milestone Badges & Soulbound Trophies
            </h1>
            <p className="text-zinc-300 mt-2 text-sm sm:text-base leading-relaxed">
              Unlock non-transferable Soulbound achievement badges as you hit $1K, $10K, and $100K
              gross sales milestones. Minted directly to your Stellar account to prove verified
              marketer excellence.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button
              onClick={() => setIsPreviewOpen(true)}
              className="bg-white text-zinc-950 hover:bg-zinc-100 rounded-2xl h-12 px-5 font-bold shadow-lg"
            >
              <Share2 className="w-4 h-4 mr-2" />
              View Public Profile Card
            </Button>
            <Button
              onClick={() => setShowSimModal(!showSimModal)}
              variant="outline"
              className="border-zinc-700 bg-zinc-900/80 text-zinc-200 hover:bg-zinc-800 rounded-2xl h-12 px-4 font-bold text-xs"
              title="Simulate sales volume for test milestones"
            >
              <PlusCircle className="w-4 h-4 mr-1.5 text-amber-400" />
              Adjust Volume (Testnet)
            </Button>
          </div>
        </div>

        {/* Volume simulation helper bar */}
        {showSimModal && (
          <div className="mt-6 pt-6 border-t border-zinc-800 flex flex-wrap items-center gap-3 animate-in fade-in">
            <span className="text-xs font-bold text-zinc-400">Quick Test Presets:</span>
            <Button
              size="sm"
              variant="outline"
              onClick={() => handleSimulateSales(500)}
              className="h-8 rounded-xl text-xs bg-zinc-900/90 border-zinc-700 text-zinc-200"
            >
              $500 (Pre-Milestone)
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => handleSimulateSales(1500)}
              className="h-8 rounded-xl text-xs bg-amber-950/40 border-amber-600/50 text-amber-300"
            >
              $1,500 (Unlocks $1K)
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => handleSimulateSales(12500)}
              className="h-8 rounded-xl text-xs bg-indigo-950/40 border-indigo-500/50 text-indigo-300"
            >
              $12,500 (Unlocks $10K)
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => handleSimulateSales(125000)}
              className="h-8 rounded-xl text-xs bg-yellow-950/40 border-yellow-500/50 text-yellow-300"
            >
              $125,000 (Unlocks $100K Titan)
            </Button>
          </div>
        )}
      </div>

      {/* Progress Status Bar */}
      <Card className="rounded-3xl border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 shadow-sm overflow-hidden">
        <CardContent className="p-6 md:p-8">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-4">
            <div>
              <div className="text-xs font-bold uppercase tracking-wider text-zinc-400">
                Your Current Verified Volume
              </div>
              <div className="text-3xl font-black text-zinc-900 dark:text-white mt-1">
                ${profile.monthlyGrossSales.toLocaleString()}{" "}
                <span className="text-sm font-semibold text-zinc-400">Gross Sales</span>
              </div>
            </div>

            <div className="flex items-center gap-4">
              <div className="text-right">
                <div className="text-xs font-bold text-zinc-400 uppercase">Next Milestone</div>
                <div className="text-sm font-black text-indigo-600 dark:text-indigo-400">
                  {profile.nextMilestoneProgress.nextTierName || "All Milestones Achieved! 🎉"}
                </div>
              </div>
              <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-500">
                <Trophy className="w-6 h-6" />
              </div>
            </div>
          </div>

          {/* Large Multi-tier Progress Bar */}
          <div className="relative mt-6 pt-2">
            <div className="w-full bg-slate-100 dark:bg-zinc-800 h-3 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-amber-500 via-indigo-500 to-yellow-400 rounded-full transition-all duration-700"
                style={{
                  width: `${Math.min(100, Math.max(3, (profile.monthlyGrossSales / 100000) * 100))}%`,
                }}
              />
            </div>

            {/* Checkpoints */}
            <div className="flex justify-between items-center text-xs font-bold text-zinc-500 dark:text-zinc-400 mt-2 px-1">
              <span
                className={profile.monthlyGrossSales >= 1000 ? "text-amber-500 font-black" : ""}
              >
                $1K Pioneer
              </span>
              <span
                className={profile.monthlyGrossSales >= 10000 ? "text-indigo-500 font-black" : ""}
              >
                $10K Vanguard
              </span>
              <span
                className={profile.monthlyGrossSales >= 100000 ? "text-yellow-500 font-black" : ""}
              >
                $100K Titan
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 3 Milestone Trophy Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {tiers.map((tier) => {
          const config = MILESTONE_BADGES[tier];
          const isUnlocked = profile.unlockedTiers.includes(tier);
          const claimedRecord = profile.claimedBadges.find((b) => b.tier === tier);
          const isClaimed = Boolean(claimedRecord);
          const isClaiming = claimingTier === tier;
          const progress = Math.min(
            100,
            Math.round((profile.monthlyGrossSales / config.thresholdGrossSales) * 100),
          );

          return (
            <motion.div
              key={tier}
              whileHover={{ y: -6 }}
              transition={{ duration: 0.2 }}
              className={`rounded-3xl p-6 sm:p-7 border flex flex-col justify-between transition-all duration-300 ${
                isClaimed
                  ? `bg-white dark:bg-zinc-900 ${config.borderGlow} shadow-xl`
                  : isUnlocked
                    ? "bg-white dark:bg-zinc-900 border-indigo-500/60 shadow-lg shadow-indigo-500/10"
                    : "bg-slate-50 dark:bg-zinc-900/40 border-slate-200 dark:border-zinc-800/80 opacity-80"
              }`}
            >
              <div>
                {/* Header */}
                <div className="flex items-center justify-between mb-5">
                  <span
                    className={`px-3 py-1 rounded-full text-[11px] font-black uppercase tracking-wider ${
                      config.rarity === "Legendary"
                        ? "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-400/50"
                        : config.rarity === "Epic"
                          ? "bg-indigo-100 text-indigo-800 dark:bg-indigo-950/60 dark:text-indigo-300 border border-indigo-400/50"
                          : "bg-orange-100 text-orange-800 dark:bg-orange-950/60 dark:text-orange-300 border border-orange-400/50"
                    }`}
                  >
                    {config.rarity} Trophy
                  </span>

                  {isClaimed ? (
                    <span className="flex items-center gap-1 text-xs font-black text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-3 py-1 rounded-full border border-emerald-500/30">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Claimed
                    </span>
                  ) : isUnlocked ? (
                    <span className="flex items-center gap-1 text-xs font-black text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/40 px-3 py-1 rounded-full border border-indigo-500/30 animate-pulse">
                      <Sparkles className="w-3.5 h-3.5" />
                      Ready to Claim
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-xs font-bold text-zinc-500 dark:text-zinc-400 bg-slate-200 dark:bg-zinc-800 px-2.5 py-1 rounded-full">
                      <Lock className="w-3 h-3" />
                      Locked
                    </span>
                  )}
                </div>

                {/* 3D Visual Trophy Emblem */}
                <div className="flex flex-col items-center text-center my-4">
                  <div
                    className={`relative w-28 h-28 rounded-3xl p-1.5 flex items-center justify-center shadow-2xl ${
                      tier === "100k"
                        ? "bg-gradient-to-tr from-yellow-400 via-amber-300 to-yellow-600 shadow-yellow-500/30"
                        : tier === "10k"
                          ? "bg-gradient-to-tr from-slate-200 via-indigo-200 to-slate-400 shadow-indigo-500/20"
                          : "bg-gradient-to-tr from-amber-600 via-orange-400 to-amber-700 shadow-orange-500/20"
                    }`}
                  >
                    <div className="w-full h-full rounded-2xl bg-zinc-950 flex items-center justify-center">
                      <Trophy
                        className={`w-14 h-14 ${
                          tier === "100k"
                            ? "text-yellow-400 drop-shadow-[0_0_16px_rgba(250,204,21,0.7)]"
                            : tier === "10k"
                              ? "text-slate-200 drop-shadow-[0_0_12px_rgba(226,232,240,0.6)]"
                              : "text-amber-500 drop-shadow-[0_0_10px_rgba(245,158,11,0.6)]"
                        }`}
                      />
                    </div>
                  </div>

                  <h3 className="mt-4 text-xl font-black text-zinc-900 dark:text-white">
                    {config.name}
                  </h3>
                  <div className="text-xs font-extrabold text-amber-600 dark:text-amber-400 mt-0.5">
                    ${config.thresholdGrossSales.toLocaleString()} Gross Volume Threshold
                  </div>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-2 leading-relaxed px-2">
                    {config.description}
                  </p>
                </div>

                {/* Perks List */}
                <div className="mt-4 p-4 rounded-2xl bg-slate-50 dark:bg-zinc-950/60 border border-slate-100 dark:border-zinc-800 text-xs space-y-2">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 mb-1">
                    Unlocked Perks
                  </div>
                  {config.perks.map((perk, idx) => (
                    <div
                      key={idx}
                      className="flex items-start gap-2 text-zinc-700 dark:text-zinc-300"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" />
                      <span>{perk}</span>
                    </div>
                  ))}
                </div>

                {/* Progress */}
                <div className="mt-4 pt-4 border-t border-slate-100 dark:border-zinc-800">
                  <div className="flex justify-between text-xs font-bold text-zinc-600 dark:text-zinc-400 mb-2">
                    <span>Progress to Milestone</span>
                    <span>
                      $
                      {Math.min(
                        profile.monthlyGrossSales,
                        config.thresholdGrossSales,
                      ).toLocaleString()}{" "}
                      / ${config.thresholdGrossSales.toLocaleString()} ({progress}%)
                    </span>
                  </div>
                  <div className="w-full bg-slate-200 dark:bg-zinc-800 h-2.5 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-700 ${
                        tier === "100k"
                          ? "bg-gradient-to-r from-yellow-500 to-amber-400"
                          : tier === "10k"
                            ? "bg-gradient-to-r from-indigo-500 to-slate-300"
                            : "bg-gradient-to-r from-amber-600 to-orange-500"
                      }`}
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                </div>
              </div>

              {/* Bottom Action Area */}
              <div className="mt-6">
                {isClaimed && claimedRecord ? (
                  <div className="p-3.5 rounded-2xl bg-emerald-50/50 dark:bg-zinc-950/90 border border-emerald-500/30 text-xs space-y-1.5">
                    <div className="flex items-center justify-between text-zinc-500 dark:text-zinc-400 font-mono">
                      <span>Token ID:</span>
                      <span className="font-bold text-zinc-900 dark:text-white truncate max-w-[130px]">
                        {claimedRecord.tokenId}
                      </span>
                    </div>
                    <div className="flex items-center justify-between pt-1">
                      <span className="text-[10px] text-zinc-400">Non-Transferable Soulbound</span>
                      <a
                        href={`${STELLAR_CONFIG.explorerUrl}/tx/${claimedRecord.txHash}`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 font-bold text-indigo-600 dark:text-indigo-400 hover:underline"
                      >
                        Verify on Explorer <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                  </div>
                ) : isUnlocked ? (
                  <Button
                    onClick={() => handleClaim(tier)}
                    disabled={isClaiming}
                    className="w-full h-12 rounded-2xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white font-extrabold text-sm shadow-lg shadow-indigo-500/25 transition-all"
                  >
                    {isClaiming ? (
                      "Minting Non-Transferable Soulbound Badge..."
                    ) : (
                      <>
                        <Award className="w-5 h-5 mr-2" />
                        Claim Milestone Badge
                      </>
                    )}
                  </Button>
                ) : (
                  <Button
                    disabled
                    variant="outline"
                    className="w-full h-12 rounded-2xl border-slate-200 dark:border-zinc-800 text-zinc-400 dark:text-zinc-600 font-bold text-xs cursor-not-allowed"
                  >
                    <Lock className="w-4 h-4 mr-2" />
                    Locked (Need $
                    {(config.thresholdGrossSales - profile.monthlyGrossSales).toLocaleString()} more
                    volume)
                  </Button>
                )}
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* Soulbound Verification Info Card */}
      <Card className="rounded-3xl border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/50 shadow-sm">
        <CardContent className="p-6 md:p-8 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-500 shrink-0">
              <Shield className="w-6 h-6" />
            </div>
            <div>
              <h4 className="text-base font-extrabold text-zinc-900 dark:text-white">
                Cryptographically Verifiable Soulbound Badges
              </h4>
              <p className="text-xs sm:text-sm text-zinc-500 dark:text-zinc-400 mt-1 max-w-2xl leading-relaxed">
                StormSale badges utilize Soroban smart contract soulbound tokens (SBTs). They are
                bound permanently to the recipient wallet and cannot be sold, transferred, or
                spoofed. Advertisers can verify your credentials trustlessly on Stellar ledger.
              </p>
            </div>
          </div>
          <Button
            variant="outline"
            onClick={() => setIsPreviewOpen(true)}
            className="rounded-2xl border-slate-200 dark:border-zinc-800 font-bold shrink-0 h-11 px-5"
          >
            Preview Profile Card
            <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        </CardContent>
      </Card>

      {/* Public Profile Modal */}
      {isPreviewOpen && (
        <AffiliateProfileCard
          affiliateAddress={userAddress || ""}
          isOpen={isPreviewOpen}
          onClose={() => setIsPreviewOpen(false)}
          onBadgeClaimed={refreshData}
        />
      )}
    </div>
  );
};
