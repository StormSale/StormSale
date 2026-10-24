import React, { useState } from "react";
import { Card, CardContent } from "../ui/card";
import { Button } from "../ui/button";
import type { MarketplaceCampaign } from "../../hooks/useCampaigns";
import { formatStellarAddress } from "../../lib/stellar";
import { TrendingUp, Coins, CheckCircle2, Copy, Zap, Tag, Check } from "lucide-react";

interface CampaignCardProps {
  campaign: MarketplaceCampaign;
  viewMode?: "grid" | "list";
  onJoin: (campaignId: string) => Promise<{ success: boolean; referralLink?: string }>;
  isEligible: boolean;
  ineligibilityReason?: string;
}

export const CampaignCard: React.FC<CampaignCardProps> = ({
  campaign,
  viewMode = "grid",
  onJoin,
  isEligible,
  ineligibilityReason,
}) => {
  const [isJoining, setIsJoining] = useState(false);
  const [copied, setCopied] = useState(false);

  const escrowHealth =
    campaign.escrowMax > 0
      ? Math.min(100, Math.round((campaign.escrowBalance / campaign.escrowMax) * 100))
      : 0;

  const handleJoinClick = async () => {
    if (campaign.joined || !isEligible) return;
    setIsJoining(true);
    try {
      await onJoin(campaign.id);
    } finally {
      setIsJoining(false);
    }
  };

  const handleCopyLink = () => {
    const link = `${window.location.origin}/ref/${campaign.id}`;
    navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (viewMode === "list") {
    return (
      <Card className="border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 rounded-2xl shadow-sm hover:border-indigo-400 dark:hover:border-indigo-600 transition-all p-5">
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
          {/* Main Info */}
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-1.5">
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase bg-indigo-50 dark:bg-indigo-950/80 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                {campaign.category}
              </span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300">
                {campaign.asset}
              </span>
              {campaign.joined && (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
                  <CheckCircle2 className="w-3 h-3" />
                  Joined
                </span>
              )}
            </div>
            <h3 className="text-base font-bold text-zinc-900 dark:text-white truncate">
              {campaign.name}
            </h3>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1 line-clamp-1">
              {campaign.description}
            </p>
          </div>

          {/* Metrics */}
          <div className="flex flex-wrap items-center gap-6 text-xs text-zinc-600 dark:text-zinc-300">
            <div>
              <p className="text-[10px] uppercase font-bold text-zinc-400">Reward</p>
              <p className="font-extrabold text-indigo-600 dark:text-indigo-400 text-sm">
                {campaign.rewardFormatted}
              </p>
            </div>
            <div>
              <p className="text-[10px] uppercase font-bold text-zinc-400">Est. ROI</p>
              <span className="inline-flex items-center gap-1 font-extrabold text-emerald-600 dark:text-emerald-400 text-sm">
                <TrendingUp className="w-3.5 h-3.5" />+{campaign.roi}%
              </span>
            </div>
            <div>
              <p className="text-[10px] uppercase font-bold text-zinc-400">Escrow Pool</p>
              <p className="font-bold text-zinc-800 dark:text-zinc-200">
                {campaign.escrowBalance.toLocaleString()} {campaign.asset}
              </p>
            </div>
          </div>

          {/* Action button */}
          <div className="shrink-0 flex items-center gap-2 self-end lg:self-center">
            {campaign.joined ? (
              <Button
                variant="outline"
                size="sm"
                onClick={handleCopyLink}
                className="h-10 px-4 rounded-xl text-xs font-bold border-indigo-200 dark:border-indigo-800 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-50 dark:hover:bg-indigo-950/50"
              >
                {copied ? (
                  <Check className="w-3.5 h-3.5 mr-1.5" />
                ) : (
                  <Copy className="w-3.5 h-3.5 mr-1.5" />
                )}
                {copied ? "Link Copied!" : "Copy Referral Link"}
              </Button>
            ) : (
              <Button
                size="sm"
                onClick={handleJoinClick}
                disabled={!isEligible || isJoining}
                title={!isEligible ? ineligibilityReason : "Join this campaign"}
                className={`h-10 px-5 rounded-xl text-xs font-bold shadow-md transition-all ${
                  isEligible
                    ? "bg-indigo-600 hover:bg-indigo-500 text-white"
                    : "bg-zinc-200 dark:bg-zinc-800 text-zinc-400 cursor-not-allowed"
                }`}
              >
                <Zap className="w-3.5 h-3.5 mr-1.5" />
                {isJoining
                  ? "Joining..."
                  : isEligible
                    ? "Join Campaign"
                    : ineligibilityReason || "Ineligible"}
              </Button>
            )}
          </div>
        </div>
      </Card>
    );
  }

  // Grid View
  return (
    <Card className="border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 rounded-3xl shadow-sm hover:border-indigo-400 dark:hover:border-indigo-600 transition-all hover:shadow-lg flex flex-col justify-between overflow-hidden group">
      <CardContent className="p-6 space-y-4">
        {/* Top Badges */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase bg-indigo-50 dark:bg-indigo-950/80 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
              {campaign.category}
            </span>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300">
              {campaign.asset}
            </span>
          </div>

          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-50 dark:bg-emerald-950/70 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
            <TrendingUp className="w-3 h-3" />+{campaign.roi}% ROI
          </span>
        </div>

        {/* Title & Desc */}
        <div>
          <h3 className="text-lg font-bold text-zinc-900 dark:text-white leading-snug group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
            {campaign.name}
          </h3>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1 line-clamp-2 leading-relaxed">
            {campaign.description}
          </p>
        </div>

        {/* Tags */}
        <div className="flex flex-wrap gap-1.5 pt-1">
          {campaign.tags.slice(0, 3).map((tag, idx) => (
            <span
              key={idx}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium bg-slate-100 dark:bg-zinc-800/80 text-zinc-600 dark:text-zinc-300"
            >
              <Tag className="w-2.5 h-2.5 text-zinc-400" />
              {tag}
            </span>
          ))}
        </div>

        {/* Financials & Escrow Card */}
        <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-zinc-950/50 border border-slate-100 dark:border-zinc-800/80 space-y-2.5">
          <div className="flex items-center justify-between text-xs">
            <span className="text-zinc-500 dark:text-zinc-400 font-medium">Commission Reward</span>
            <span className="font-extrabold text-indigo-600 dark:text-indigo-400 text-sm">
              {campaign.rewardFormatted}
            </span>
          </div>

          {/* Escrow Health bar */}
          <div className="space-y-1">
            <div className="flex items-center justify-between text-[11px] text-zinc-500 dark:text-zinc-400">
              <span className="flex items-center gap-1">
                <Coins className="w-3 h-3 text-amber-500" />
                Escrow Liquidity
              </span>
              <span className="font-bold text-zinc-800 dark:text-zinc-200">
                {campaign.escrowBalance.toLocaleString()} {campaign.asset}
              </span>
            </div>
            <div className="w-full bg-slate-200 dark:bg-zinc-800 h-1.5 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  escrowHealth > 40
                    ? "bg-emerald-500"
                    : escrowHealth > 15
                      ? "bg-amber-500"
                      : "bg-rose-500"
                }`}
                style={{ width: `${escrowHealth}%` }}
              />
            </div>
          </div>
        </div>
      </CardContent>

      {/* Footer Actions */}
      <div className="p-6 pt-0 border-t border-slate-100 dark:border-zinc-800/50 mt-auto">
        <div className="flex items-center justify-between pt-4">
          <div
            className="text-[11px] text-zinc-400 truncate max-w-[140px]"
            title={campaign.advertiserAddress}
          >
            Adv: {formatStellarAddress(campaign.advertiserAddress)}
          </div>

          {campaign.joined ? (
            <Button
              variant="outline"
              size="sm"
              onClick={handleCopyLink}
              className="h-9 px-3.5 rounded-xl text-xs font-bold border-indigo-200 dark:border-indigo-800 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-50 dark:hover:bg-indigo-950/50"
            >
              {copied ? (
                <Check className="w-3.5 h-3.5 mr-1" />
              ) : (
                <Copy className="w-3.5 h-3.5 mr-1" />
              )}
              {copied ? "Copied" : "Copy Link"}
            </Button>
          ) : (
            <Button
              size="sm"
              onClick={handleJoinClick}
              disabled={!isEligible || isJoining}
              title={!isEligible ? ineligibilityReason : "Join this campaign"}
              className={`h-9 px-4 rounded-xl text-xs font-bold shadow-md transition-all ${
                isEligible
                  ? "bg-indigo-600 hover:bg-indigo-500 text-white"
                  : "bg-zinc-200 dark:bg-zinc-800 text-zinc-400 cursor-not-allowed"
              }`}
            >
              <Zap className="w-3.5 h-3.5 mr-1.5" />
              {isJoining
                ? "Joining..."
                : isEligible
                  ? "Join Campaign"
                  : ineligibilityReason || "Ineligible"}
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
};
