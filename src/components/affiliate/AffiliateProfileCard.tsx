import React, { useState } from "react";
import {
  Trophy,
  Award,
  Shield,
  ShieldCheck,
  CheckCircle2,
  Lock,
  ExternalLink,
  Copy,
  Check,
  Share2,
  Sparkles,
  TrendingUp,
  DollarSign,
  Users,
  EyeOff,
  Flame,
} from "lucide-react";
import { Card, CardContent } from "../ui/card";
import { Button } from "../ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../ui/dialog";
import {
  MILESTONE_BADGES,
  getAffiliateProfile,
  claimMilestoneBadge,
} from "../../lib/affiliateLeaderboard";
import type { MilestoneTier, AffiliateProfileData } from "../../types/affiliateLeaderboard";
import { useWeb3 } from "../../hooks/useWeb3";
import { useNotification } from "../../context/NotificationContext";
import { STELLAR_CONFIG } from "../../config/stellar";
import { motion } from "framer-motion";

interface AffiliateProfileCardProps {
  affiliateAddress: string;
  isOpen?: boolean;
  onClose?: () => void;
  isStandalone?: boolean;
  onBadgeClaimed?: () => void;
}

export const AffiliateProfileCard: React.FC<AffiliateProfileCardProps> = ({
  affiliateAddress,
  isOpen = true,
  onClose,
  isStandalone = false,
  onBadgeClaimed,
}) => {
  const { userAddress, connectorType } = useWeb3();
  const { showNotification } = useNotification();
  const [profile, setProfile] = useState<AffiliateProfileData>(() =>
    getAffiliateProfile(affiliateAddress, userAddress),
  );
  const [copied, setCopied] = useState(false);
  const [claimingTier, setClaimingTier] = useState<MilestoneTier | null>(null);

  const isCurrentUser =
    userAddress && affiliateAddress && userAddress.toLowerCase() === affiliateAddress.toLowerCase();

  const handleCopy = () => {
    const textToCopy = profile.isPrivacyMasked
      ? `${profile.pseudonym} (${profile.maskedAddress})`
      : profile.address;
    navigator.clipboard.writeText(textToCopy);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    showNotification({
      type: "success",
      title: "Address Copied",
      message: "Affiliate identity copied to clipboard.",
    });
  };

  const handleShare = () => {
    const url = `${window.location.origin}?profile=${profile.address}`;
    navigator.clipboard.writeText(url);
    showNotification({
      type: "info",
      title: "Profile Link Ready",
      message: "Public affiliate profile link copied to clipboard.",
    });
  };

  const handleClaim = async (tier: MilestoneTier) => {
    if (!isCurrentUser) return;
    setClaimingTier(tier);
    try {
      const record = await claimMilestoneBadge(userAddress, tier, connectorType || "freighter");
      showNotification({
        type: "success",
        title: "Achievement Unlocked! 🏆",
        message: `Successfully minted ${MILESTONE_BADGES[tier].name} Soulbound Badge (Tx: ${record.txHash.slice(0, 10)}...).`,
      });
      // Refresh profile data
      setProfile(getAffiliateProfile(affiliateAddress, userAddress));
      if (onBadgeClaimed) onBadgeClaimed();
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

  const tiers: MilestoneTier[] = ["1k", "10k", "100k"];

  const content = (
    <div className="space-y-6 font-sans">
      {/* Top Banner / Avatar Header */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-indigo-900 via-zinc-900 to-black p-6 sm:p-8 border border-indigo-500/30 shadow-2xl">
        <div className="absolute top-0 right-0 -mr-16 -mt-16 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 -ml-16 -mb-16 w-64 h-64 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col sm:flex-row items-center sm:items-start justify-between gap-6">
          <div className="flex flex-col sm:flex-row items-center gap-5 text-center sm:text-left">
            {/* 3D-effect Avatar with Rank Halo */}
            <div className="relative group">
              <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-2xl bg-gradient-to-tr from-sky-400 via-indigo-600 to-violet-500 p-1 shadow-xl">
                <div className="w-full h-full rounded-2xl bg-zinc-950 flex items-center justify-center overflow-hidden">
                  <span className="text-3xl sm:text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-sky-400 to-indigo-300">
                    {profile.pseudonym.charAt(0)}
                  </span>
                </div>
              </div>
              <div className="absolute -bottom-2 -right-2 px-2.5 py-0.5 rounded-full bg-amber-500 text-zinc-950 font-black text-xs shadow-lg flex items-center gap-1 border-2 border-zinc-900">
                <Trophy className="w-3 h-3" />
                <span>#{profile.rank}</span>
              </div>
            </div>

            <div>
              <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 mb-1.5">
                <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight">
                  {profile.isPrivacyMasked ? profile.pseudonym : profile.maskedAddress}
                </h2>

                {profile.isPrivacyMasked ? (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                    <EyeOff className="w-3 h-3" />
                    Privacy Masked
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                    <ShieldCheck className="w-3 h-3" />
                    Verified On-Chain
                  </span>
                )}

                {isCurrentUser && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wide bg-indigo-500 text-white">
                    You
                  </span>
                )}
              </div>

              <p className="text-xs font-mono text-zinc-400 max-w-sm break-all">
                {profile.isPrivacyMasked
                  ? "Wallet address masked for stealth competition privacy."
                  : profile.address}
              </p>

              {/* Status pills */}
              <div className="flex flex-wrap items-center justify-center sm:justify-start gap-3 mt-3 text-xs text-zinc-300">
                <span className="flex items-center gap-1.5 bg-zinc-800/80 px-3 py-1 rounded-xl border border-zinc-700/50">
                  <Flame className="w-3.5 h-3.5 text-orange-400" />
                  Top {profile.rank <= 3 ? "Podium" : `${profile.rank}%`} Rank
                </span>
                <span className="flex items-center gap-1.5 bg-zinc-800/80 px-3 py-1 rounded-xl border border-zinc-700/50">
                  <Award className="w-3.5 h-3.5 text-indigo-400" />
                  {profile.claimedBadges.length} Milestone Badges
                </span>
              </div>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleCopy}
              className="h-9 px-3 rounded-xl border-zinc-700 bg-zinc-800/80 text-zinc-200 hover:bg-zinc-700 hover:text-white text-xs font-bold"
              title="Copy identifier"
            >
              {copied ? (
                <Check className="w-3.5 h-3.5 mr-1.5 text-emerald-400" />
              ) : (
                <Copy className="w-3.5 h-3.5 mr-1.5" />
              )}
              {copied ? "Copied" : "Copy"}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleShare}
              className="h-9 px-3 rounded-xl border-zinc-700 bg-zinc-800/80 text-zinc-200 hover:bg-zinc-700 hover:text-white text-xs font-bold"
              title="Share public profile"
            >
              <Share2 className="w-3.5 h-3.5 mr-1.5" />
              Share
            </Button>
          </div>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        <Card className="rounded-2xl border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 shadow-sm">
          <CardContent className="p-4 sm:p-5">
            <div className="flex items-center justify-between text-zinc-500 dark:text-zinc-400 text-xs font-bold mb-1">
              <span>Monthly Volume</span>
              <DollarSign className="w-4 h-4 text-emerald-500" />
            </div>
            <div className="text-xl sm:text-2xl font-black text-zinc-900 dark:text-white">
              ${profile.monthlyGrossSales.toLocaleString()}
            </div>
            <p className="text-[10px] text-zinc-400 mt-1">Verified gross sales</p>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 shadow-sm">
          <CardContent className="p-4 sm:p-5">
            <div className="flex items-center justify-between text-zinc-500 dark:text-zinc-400 text-xs font-bold mb-1">
              <span>All-Time Volume</span>
              <TrendingUp className="w-4 h-4 text-indigo-500" />
            </div>
            <div className="text-xl sm:text-2xl font-black text-zinc-900 dark:text-white">
              ${profile.allTimeGrossSales.toLocaleString()}
            </div>
            <p className="text-[10px] text-zinc-400 mt-1">Lifetime milestone credit</p>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 shadow-sm">
          <CardContent className="p-4 sm:p-5">
            <div className="flex items-center justify-between text-zinc-500 dark:text-zinc-400 text-xs font-bold mb-1">
              <span>Conversions</span>
              <CheckCircle2 className="w-4 h-4 text-sky-500" />
            </div>
            <div className="text-xl sm:text-2xl font-black text-zinc-900 dark:text-white">
              {profile.verifiedSalesCount}
            </div>
            <p className="text-[10px] text-zinc-400 mt-1">Conv. rate: {profile.conversionRate}%</p>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 shadow-sm">
          <CardContent className="p-4 sm:p-5">
            <div className="flex items-center justify-between text-zinc-500 dark:text-zinc-400 text-xs font-bold mb-1">
              <span>Earnings</span>
              <Users className="w-4 h-4 text-amber-500" />
            </div>
            <div className="text-xl sm:text-2xl font-black text-zinc-900 dark:text-white">
              {profile.commissionEarnedXlm.toLocaleString()}{" "}
              <span className="text-xs font-bold">XLM</span>
            </div>
            <p className="text-[10px] text-zinc-400 mt-1">Settled on-chain</p>
          </CardContent>
        </Card>
      </div>

      {/* Profile Trophies: $1K, $10K, $100K Milestones */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg sm:text-xl font-black text-zinc-900 dark:text-white tracking-tight flex items-center gap-2">
              <Trophy className="w-5 h-5 text-amber-500" />
              Gamified Milestone Trophies
            </h3>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 font-medium">
              Non-transferable Soulbound Achievement Badges minted directly on Stellar & Soroban.
            </p>
          </div>
          <span className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800">
            <Shield className="w-3.5 h-3.5" />
            Soulbound Proofs
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
                whileHover={{ y: -4 }}
                transition={{ duration: 0.2 }}
                className={`relative rounded-3xl p-5 border transition-all duration-300 flex flex-col justify-between ${
                  isClaimed
                    ? `bg-gradient-to-b from-white to-slate-50 dark:from-zinc-900 dark:to-zinc-950 ${config.borderGlow} shadow-lg`
                    : isUnlocked
                      ? "bg-white dark:bg-zinc-900 border-indigo-500/60 shadow-md shadow-indigo-500/10"
                      : "bg-slate-50/60 dark:bg-zinc-900/30 border-slate-200 dark:border-zinc-800/80 opacity-80"
                }`}
              >
                <div>
                  {/* Top Badge Tag & Status */}
                  <div className="flex items-center justify-between mb-4">
                    <span
                      className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${
                        config.rarity === "Legendary"
                          ? "bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300 border border-amber-400/40"
                          : config.rarity === "Epic"
                            ? "bg-indigo-100 text-indigo-800 dark:bg-indigo-950/50 dark:text-indigo-300 border border-indigo-400/40"
                            : "bg-orange-100 text-orange-800 dark:bg-orange-950/50 dark:text-orange-300 border border-orange-400/40"
                      }`}
                    >
                      {config.rarity}
                    </span>

                    {isClaimed ? (
                      <span className="flex items-center gap-1 text-[11px] font-black text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-2.5 py-0.5 rounded-full border border-emerald-500/30">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Soulbound Minted
                      </span>
                    ) : isUnlocked ? (
                      <span className="flex items-center gap-1 text-[11px] font-black text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/40 px-2.5 py-0.5 rounded-full border border-indigo-500/30 animate-pulse">
                        <Sparkles className="w-3.5 h-3.5" />
                        Ready to Claim
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-[11px] font-bold text-zinc-500 dark:text-zinc-400 bg-slate-200 dark:bg-zinc-800 px-2 py-0.5 rounded-full">
                        <Lock className="w-3 h-3" />
                        Locked
                      </span>
                    )}
                  </div>

                  {/* 3D-styled Visual Trophy Emblem */}
                  <div className="flex flex-col items-center text-center my-3">
                    <div
                      className={`relative w-20 h-20 rounded-2xl p-1 flex items-center justify-center shadow-lg transition-transform duration-500 ${
                        tier === "100k"
                          ? "bg-gradient-to-tr from-yellow-400 via-amber-300 to-yellow-600 shadow-yellow-500/30"
                          : tier === "10k"
                            ? "bg-gradient-to-tr from-slate-200 via-indigo-200 to-slate-400 shadow-indigo-500/20"
                            : "bg-gradient-to-tr from-amber-600 via-orange-400 to-amber-700 shadow-orange-500/20"
                      }`}
                    >
                      <div className="w-full h-full rounded-xl bg-zinc-950 flex items-center justify-center">
                        <Trophy
                          className={`w-10 h-10 ${
                            tier === "100k"
                              ? "text-yellow-400 drop-shadow-[0_0_12px_rgba(250,204,21,0.6)]"
                              : tier === "10k"
                                ? "text-slate-200 drop-shadow-[0_0_10px_rgba(226,232,240,0.5)]"
                                : "text-amber-500 drop-shadow-[0_0_8px_rgba(245,158,11,0.5)]"
                          }`}
                        />
                      </div>
                    </div>

                    <h4 className="mt-3 text-base font-extrabold text-zinc-900 dark:text-white">
                      {config.name}
                    </h4>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1 line-clamp-2 px-1">
                      {config.description}
                    </p>
                  </div>

                  {/* Progress Indicator */}
                  <div className="mt-4 pt-3 border-t border-slate-100 dark:border-zinc-800/80">
                    <div className="flex justify-between text-[11px] font-bold text-zinc-600 dark:text-zinc-400 mb-1.5">
                      <span>Volume Target</span>
                      <span>
                        $
                        {Math.min(
                          profile.monthlyGrossSales,
                          config.thresholdGrossSales,
                        ).toLocaleString()}{" "}
                        / ${config.thresholdGrossSales.toLocaleString()}
                      </span>
                    </div>
                    <div className="w-full bg-slate-200 dark:bg-zinc-800 h-2 rounded-full overflow-hidden">
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

                {/* Bottom Action / On-Chain Metadata */}
                <div className="mt-5">
                  {isClaimed && claimedRecord ? (
                    <div className="p-3 rounded-xl bg-slate-100 dark:bg-zinc-950/80 border border-slate-200 dark:border-zinc-800 text-[11px] space-y-1">
                      <div className="flex items-center justify-between text-zinc-500 dark:text-zinc-400 font-mono">
                        <span>Token ID:</span>
                        <span className="font-bold text-zinc-900 dark:text-zinc-200 truncate max-w-[120px]">
                          {claimedRecord.tokenId}
                        </span>
                      </div>
                      <div className="flex items-center justify-between pt-1">
                        <span className="text-[10px] text-zinc-400">Non-Transferable SBT</span>
                        <a
                          href={`${STELLAR_CONFIG.explorerUrl}/tx/${claimedRecord.txHash}`}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-[11px] font-bold text-indigo-600 dark:text-indigo-400 hover:underline"
                        >
                          Tx Hash <ExternalLink className="w-3 h-3" />
                        </a>
                      </div>
                    </div>
                  ) : isUnlocked ? (
                    isCurrentUser ? (
                      <Button
                        onClick={() => handleClaim(tier)}
                        disabled={isClaiming}
                        className="w-full h-11 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white font-extrabold text-xs shadow-md shadow-indigo-500/25 transition-all"
                      >
                        {isClaiming ? (
                          "Minting Soulbound Badge..."
                        ) : (
                          <>
                            <Award className="w-4 h-4 mr-1.5" />
                            Claim Milestone Badge
                          </>
                        )}
                      </Button>
                    ) : (
                      <div className="p-2.5 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800 text-center text-xs font-bold text-indigo-700 dark:text-indigo-300">
                        Milestone Reached (Unclaimed)
                      </div>
                    )
                  ) : (
                    <Button
                      disabled
                      variant="outline"
                      className="w-full h-11 rounded-xl border-slate-200 dark:border-zinc-800 text-zinc-400 dark:text-zinc-600 text-xs font-bold cursor-not-allowed"
                    >
                      <Lock className="w-3.5 h-3.5 mr-1.5" />
                      Locked ($
                      {(
                        config.thresholdGrossSales - profile.monthlyGrossSales
                      ).toLocaleString()}{" "}
                      remaining)
                    </Button>
                  )}
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
    </div>
  );

  if (isStandalone) {
    return content;
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto bg-white dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 rounded-3xl p-6 sm:p-8">
        <DialogHeader className="sr-only">
          <DialogTitle>Affiliate Profile - {profile.pseudonym}</DialogTitle>
        </DialogHeader>
        {content}
      </DialogContent>
    </Dialog>
  );
};
