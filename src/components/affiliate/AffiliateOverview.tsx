import { useCallback, useState } from "react";
import QRCode from "qrcode";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { ReferralLinkCard } from "./ReferralLinkCard";
import {
  TrendingUp,
  Users,
  DollarSign,
  Target,
  Zap,
  ArrowRight,
  CheckCircle2,
  Copy,
  Download,
  Link2,
  QrCode,
  ShieldCheck,
  Trophy,
  Award,
} from "lucide-react";
import { useWeb3 } from "../../context/Web3Context";
import { getAffiliateProfile } from "../../lib/affiliateLeaderboard";

const toBase64Url = (bytes: Uint8Array) => {
  let binary = "";
  bytes.forEach((byte) => (binary += String.fromCharCode(byte)));
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

async function createEncryptedAffiliateUrl(affiliate: string, campaignId: string) {
  if (!globalThis.crypto?.subtle) throw new Error("Secure link generation requires HTTPS.");

  const key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt"]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const payload = new TextEncoder().encode(
    JSON.stringify({ v: 1, affiliate, campaignId, createdAt: new Date().toISOString() }),
  );
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, payload);
  const rawKey = new Uint8Array(await crypto.subtle.exportKey("raw", key));
  const params = new URLSearchParams({
    ref: `v1.${toBase64Url(iv)}.${toBase64Url(new Uint8Array(ciphertext))}`,
  });
  const url = new URL(window.location.origin);
  url.search = params.toString();
  url.hash = `key=${toBase64Url(rawKey)}`;
  return url.toString();
}

const AffiliateLinkGenerator = () => {
  const { userAddress } = useWeb3();
  const [campaignId, setCampaignId] = useState("");
  const [affiliateOverride, setAffiliateOverride] = useState<string | null>(null);
  const affiliateAddress = affiliateOverride ?? userAddress ?? "";
  const [shareUrl, setShareUrl] = useState("");
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [message, setMessage] = useState("");

  const generate = useCallback(async () => {
    setMessage("");
    setShareUrl("");
    setQrDataUrl("");
    if (!affiliateAddress.trim() || !campaignId.trim()) {
      setMessage("Enter an affiliate wallet and campaign ID to create a link.");
      return;
    }
    setIsGenerating(true);
    try {
      const nextUrl = await createEncryptedAffiliateUrl(affiliateAddress.trim(), campaignId.trim());
      const qr = await QRCode.toDataURL(nextUrl, {
        errorCorrectionLevel: "H",
        margin: 2,
        width: 220,
        color: { dark: "#18181b", light: "#ffffff" },
      });
      setShareUrl(nextUrl);
      setQrDataUrl(qr);
      setMessage("Encrypted link and QR code are ready.");
    } catch {
      setMessage("Could not create your link. Use a secure (HTTPS) connection and try again.");
    } finally {
      setIsGenerating(false);
    }
  }, [affiliateAddress, campaignId]);

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setMessage("Link copied to clipboard.");
    } catch {
      setMessage("Clipboard access is unavailable. Select and copy the link below.");
    }
  };

  return (
    <Card className="overflow-hidden border border-slate-200 dark:border-zinc-800 shadow-sm rounded-2xl bg-white dark:bg-zinc-900/50">
      <CardHeader className="border-b border-slate-100 dark:border-zinc-800/70 bg-gradient-to-r from-indigo-50/80 to-white dark:from-indigo-500/10 dark:to-zinc-900/40">
        <div className="flex items-start gap-4">
          <div className="w-11 h-11 rounded-xl bg-indigo-600 text-white flex items-center justify-center shrink-0 shadow-sm shadow-indigo-600/20">
            <Link2 className="w-5 h-5" />
          </div>
          <div>
            <CardTitle className="text-lg font-bold text-zinc-900 dark:text-white">
              Encrypted link & QR code
            </CardTitle>
            <CardDescription className="mt-1 text-zinc-500 dark:text-zinc-400">
              Create a private, campaign-specific tracking link to share anywhere.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-5 md:p-6">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_240px]">
          <div className="space-y-4">
            <div>
              <label
                htmlFor="affiliate-wallet"
                className="mb-1.5 block text-xs font-semibold text-zinc-600 dark:text-zinc-300"
              >
                Affiliate wallet
              </label>
              <input
                id="affiliate-wallet"
                value={affiliateAddress}
                onChange={(event) => setAffiliateOverride(event.target.value)}
                placeholder="G... wallet address"
                className="w-full h-11 rounded-xl border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3.5 text-sm text-zinc-900 dark:text-white outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/15"
              />
            </div>
            <div>
              <label
                htmlFor="campaign-id"
                className="mb-1.5 block text-xs font-semibold text-zinc-600 dark:text-zinc-300"
              >
                Campaign ID
              </label>
              <input
                id="campaign-id"
                value={campaignId}
                onChange={(event) => setCampaignId(event.target.value)}
                placeholder="e.g. spring-launch"
                className="w-full h-11 rounded-xl border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3.5 text-sm text-zinc-900 dark:text-white outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/15"
              />
            </div>
            <Button
              onClick={generate}
              disabled={isGenerating}
              className="h-11 w-full rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold"
            >
              <QrCode className="mr-2 h-4 w-4" />
              {isGenerating
                ? "Generating secure link…"
                : shareUrl
                  ? "Generate a new link"
                  : "Generate link & QR code"}
            </Button>
            {message && (
              <p
                role="status"
                aria-live="polite"
                className="text-xs text-zinc-500 dark:text-zinc-400"
              >
                {message}
              </p>
            )}
            {shareUrl && (
              <div className="space-y-2">
                <label
                  htmlFor="share-link"
                  className="block text-xs font-semibold text-zinc-600 dark:text-zinc-300"
                >
                  Your share link
                </label>
                <div className="flex gap-2">
                  <input
                    id="share-link"
                    readOnly
                    value={shareUrl}
                    className="min-w-0 flex-1 h-10 rounded-lg border border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-950 px-3 text-xs text-zinc-600 dark:text-zinc-300"
                  />
                  <Button
                    variant="outline"
                    onClick={copyLink}
                    aria-label="Copy affiliate link"
                    className="h-10 rounded-lg px-3"
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
            <div className="flex gap-2 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 p-3 text-xs leading-relaxed text-emerald-800 dark:text-emerald-300">
              <ShieldCheck className="h-4 w-4 shrink-0" />
              <span>
                AES-256-GCM encrypts your affiliate and campaign details. The key stays in the URL
                fragment and is not sent with the request.
              </span>
            </div>
          </div>
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 dark:border-zinc-700 bg-slate-50/70 dark:bg-zinc-950/40 p-5 text-center">
            {qrDataUrl ? (
              <>
                <img
                  src={qrDataUrl}
                  alt="QR code for encrypted affiliate tracking link"
                  className="h-[180px] w-[180px] rounded-xl bg-white p-2 shadow-sm"
                />
                <p className="mt-3 text-xs font-medium text-zinc-600 dark:text-zinc-300">
                  Scan to open your affiliate link
                </p>
                <a
                  href={qrDataUrl}
                  download="stormsale-affiliate-qr.png"
                  className="mt-3 inline-flex h-9 items-center gap-2 rounded-lg border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 text-xs font-semibold text-zinc-700 dark:text-zinc-200 hover:border-indigo-400"
                >
                  <Download className="h-3.5 w-3.5" /> Download QR
                </a>
              </>
            ) : (
              <>
                <div className="flex h-[180px] w-[180px] items-center justify-center rounded-xl bg-white dark:bg-zinc-900 text-slate-300 dark:text-zinc-700">
                  <QrCode className="h-16 w-16" strokeWidth={1.25} />
                </div>
                <p className="mt-3 text-xs text-zinc-500 dark:text-zinc-400">
                  Your QR code appears here
                </p>
              </>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

import { TerminologyTooltip, TerminologyGuideButton } from "../../components/ui/tooltip";

const AFFILIATE_QUICK_ACTIONS = [
  {
    id: "leaderboard",
    label: "Affiliate Leaderboard",
    description: "Rank top 50 by verified volume",
    icon: Trophy,
  },
  {
    id: "milestones",
    label: "Milestone Badges",
    description: "Claim $1K, $10K, $100K Soulbound SBTs",
    icon: Award,
  },
  {
    id: "custom-links",
    label: "Custom Short Links",
    description: "Branded cloaked URLs",
    icon: Link2,
  },
  {
    id: "join-campaign",
    label: "Join New Campaign",
    description: "Discover high-paying campaigns",
    icon: Users,
  },
  {
    id: "my-sales",
    label: "Track Performance",
    description: "View analytics and insights",
    icon: TrendingUp,
  },
  {
    id: "claim-payouts",
    label: "Withdraw Earnings",
    description: "Claim your commissions",
    icon: DollarSign,
  },
] as const;

type AffiliateQuickActionTab = (typeof AFFILIATE_QUICK_ACTIONS)[number]["id"];

interface AffiliateOverviewProps {
  onNavigate?: (tab: AffiliateQuickActionTab) => void;
  onNavigateToLeaderboard?: () => void;
  onNavigateToMilestones?: () => void;
}

export const AffiliateOverview: React.FC<AffiliateOverviewProps> = ({
  onNavigate,
  onNavigateToLeaderboard,
  onNavigateToMilestones,
}) => {
  const { userAddress } = useWeb3();
  const profile = getAffiliateProfile(userAddress || "", userAddress);
  const stats = [
    {
      title: "Total Earnings",
      value: "$12,847",
      change: "+18% this month",
      icon: DollarSign,
    },
    { title: "Active Campaigns", value: "8", change: "+2 this week", icon: Users },
    {
      title: "Conversion Rate",
      value: "3.2%",
      change: "+0.4% vs last month",
      icon: TrendingUp,
    },
    { title: "Monthly Goal", value: "85%", change: "On track", icon: Target },
  ];

  const recentPayouts = [
    {
      campaign: "Tech Gadgets Pro",
      amount: "$1,250",
      date: "2 days ago",
      status: "Completed",
    },
    {
      campaign: "Web3 Masterclass",
      amount: "$890",
      date: "1 week ago",
      status: "Completed",
    },
    {
      campaign: "Crypto Tools",
      amount: "$2,150",
      date: "2 weeks ago",
      status: "Completed",
    },
  ];

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center bg-white dark:bg-zinc-900/50 p-6 md:p-8 rounded-3xl border border-slate-200 dark:border-zinc-800 shadow-sm">
        <div>
          <h1 className="text-2xl md:text-3xl font-extrabold text-zinc-900 dark:text-white tracking-tight">
            Affiliate Dashboard
          </h1>
          <p className="text-zinc-500 dark:text-zinc-400 mt-2 font-medium">
            Track your performance and maximize your{" "}
            <TerminologyTooltip term="soroban">on-chain earnings</TerminologyTooltip>.
          </p>
        </div>
        <div className="mt-6 lg:mt-0 flex items-center gap-3">
          <TerminologyGuideButton className="h-12 px-5 rounded-full" />
          <Button className="bg-zinc-900 hover:bg-zinc-800 dark:bg-indigo-600 dark:hover:bg-indigo-500 text-white rounded-full px-6 h-12 font-semibold shadow-md transition-all">
            <Zap className="w-5 h-5 mr-2" />
            Quick Start Guide
          </Button>
        </div>
      </div>

      <ReferralLinkCard />

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {stats.map((stat, index) => {
          const IconComponent = stat.icon;
          return (
            <Card
              key={index}
              className="bg-white dark:bg-zinc-900/80 shadow-sm border border-slate-200 dark:border-zinc-800 hover:shadow-md transition-shadow rounded-2xl"
            >
              <CardContent className="p-6">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                      {stat.title}
                    </p>
                    <p className="text-2xl font-extrabold text-zinc-900 dark:text-white mt-2 mb-1">
                      {stat.value}
                    </p>
                    <p className="text-xs font-medium text-indigo-600 dark:text-indigo-400">
                      {stat.change}
                    </p>
                  </div>
                  <div className="w-10 h-10 bg-slate-100 dark:bg-zinc-800 rounded-xl flex items-center justify-center border border-slate-200 dark:border-zinc-700 shrink-0">
                    <IconComponent className="w-5 h-5 text-zinc-900 dark:text-indigo-400" />
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <AffiliateLinkGenerator />

      {/* Gamification & Leaderboard Progress Banner */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-amber-500/10 via-indigo-500/10 to-violet-500/10 border border-amber-500/30 p-6 sm:p-8">
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/30">
                Rank #{profile.rank} on Monthly Leaderboard
              </span>
              <span className="text-xs font-bold text-zinc-500 dark:text-zinc-400">
                {profile.claimedBadges.length} Badges Claimed
              </span>
            </div>
            <h2 className="text-xl sm:text-2xl font-black text-zinc-900 dark:text-white tracking-tight">
              Milestone Badges: ${profile.monthlyGrossSales.toLocaleString()} / Next Goal ($
              {profile.nextMilestoneProgress.targetSales.toLocaleString()})
            </h2>
            <p className="text-xs sm:text-sm text-zinc-600 dark:text-zinc-400 max-w-xl">
              Hit $1K, $10K, and $100K gross sales milestones to unlock non-transferable Soulbound
              NFT achievement badges minted on Stellar.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto">
            {onNavigateToMilestones && (
              <Button
                onClick={onNavigateToMilestones}
                className="flex-1 lg:flex-none h-11 px-5 rounded-xl bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-400 hover:to-yellow-400 text-zinc-950 font-black text-xs shadow-md shadow-amber-500/25"
              >
                <Award className="w-4 h-4 mr-1.5" />
                Claim Badges
              </Button>
            )}
            {onNavigateToLeaderboard && (
              <Button
                onClick={onNavigateToLeaderboard}
                variant="outline"
                className="flex-1 lg:flex-none h-11 px-5 rounded-xl border-slate-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-xs font-bold"
              >
                <Trophy className="w-4 h-4 mr-1.5 text-amber-500" />
                View Leaderboard
              </Button>
            )}
          </div>
        </div>

        {/* Mini Progress */}
        <div className="mt-5 pt-4 border-t border-slate-200/60 dark:border-zinc-800/60">
          <div className="flex justify-between items-center text-xs font-bold mb-1.5 text-zinc-600 dark:text-zinc-400">
            <span>
              Progress to {profile.nextMilestoneProgress.nextTierName || "Top Tier Milestone"}
            </span>
            <span>{profile.nextMilestoneProgress.progressPercentage}%</span>
          </div>
          <div className="w-full bg-slate-200/80 dark:bg-zinc-800 h-2 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-amber-500 to-indigo-500 rounded-full transition-all duration-700"
              style={{ width: `${profile.nextMilestoneProgress.progressPercentage}%` }}
            />
          </div>
        </div>
      </div>

      {/* Two Column Layout */}
      <div className="grid lg:grid-cols-2 gap-8">
        {/* Recent Payouts */}
        <Card className="border border-slate-200 dark:border-zinc-800 shadow-sm rounded-2xl bg-white dark:bg-zinc-900/50">
          <CardHeader className="border-b border-slate-100 dark:border-zinc-800/50 pb-4">
            <CardTitle className="text-lg font-bold text-zinc-900 dark:text-white">
              Recent Payouts
            </CardTitle>
            <CardDescription className="text-zinc-500 dark:text-zinc-400">
              Your latest commission payments
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-6">
            <div className="space-y-4">
              {recentPayouts.map((payout, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between p-4 bg-slate-50 dark:bg-zinc-950/50 border border-slate-100 dark:border-zinc-800/50 rounded-xl hover:border-slate-200 dark:hover:border-zinc-700 transition-colors"
                >
                  <div className="flex items-center space-x-3">
                    <div className="w-10 h-10 bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-100 dark:border-indigo-500/20 rounded-xl flex items-center justify-center shrink-0">
                      <DollarSign className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                    </div>
                    <div>
                      <div className="font-bold text-sm text-zinc-900 dark:text-white">
                        {payout.campaign}
                      </div>
                      <div className="text-xs font-medium text-zinc-400 dark:text-zinc-500 mt-0.5">
                        {payout.date}
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-bold text-sm text-zinc-900 dark:text-white">
                      {payout.amount}
                    </div>
                    <div className="flex items-center justify-end gap-1 mt-1">
                      <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                      <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wide">
                        {payout.status}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <Button
              variant="ghost"
              className="w-full mt-6 text-indigo-600 dark:text-indigo-400 font-semibold hover:bg-slate-50 dark:hover:bg-zinc-900/50"
            >
              View All Payouts
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </CardContent>
        </Card>

        {/* Performance Tips */}
        <Card className="border border-slate-200 dark:border-zinc-800 shadow-sm rounded-2xl bg-white dark:bg-zinc-900/50">
          <CardHeader className="border-b border-slate-100 dark:border-zinc-800/50 pb-4">
            <CardTitle className="text-lg font-bold text-zinc-900 dark:text-white">
              Performance Tips
            </CardTitle>
            <CardDescription className="text-zinc-500 dark:text-zinc-400">
              Boost your affiliate earnings
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-6">
            <div className="space-y-4">
              {[
                {
                  tip: "Optimize your content for higher conversions",
                  impact: "High",
                },
                { tip: "Join trending campaigns early", impact: "Medium" },
                { tip: "Use multiple promotion channels", impact: "High" },
                {
                  tip: "Engage with your audience regularly",
                  impact: "Medium",
                },
              ].map((item, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between p-4 bg-slate-50 dark:bg-zinc-950/50 border border-slate-100 dark:border-zinc-800/50 rounded-xl"
                >
                  <div className="text-sm font-medium text-zinc-700 dark:text-zinc-300 pr-4">
                    {item.tip}
                  </div>
                  <span
                    className={`shrink-0 text-[10px] uppercase tracking-wider font-bold px-3 py-1 rounded-full ${
                      item.impact === "High"
                        ? "bg-indigo-100 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-400"
                        : "bg-slate-200 text-slate-600 dark:bg-zinc-800 dark:text-zinc-400"
                    }`}
                  >
                    {item.impact}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions */}
      <Card className="border border-slate-200 dark:border-zinc-800 shadow-sm rounded-2xl bg-white dark:bg-zinc-900/50">
        <CardHeader className="border-b border-slate-100 dark:border-zinc-800/50 pb-4">
          <CardTitle className="text-lg font-bold text-zinc-900 dark:text-white">
            Quick Actions
          </CardTitle>
          <CardDescription className="text-zinc-500 dark:text-zinc-400">
            Get started quickly
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {AFFILIATE_QUICK_ACTIONS.map((action, index) => {
              const IconComponent = action.icon;
              return (
                <Button
                  key={index}
                  variant="outline"
                  onClick={() =>
                    action.id === "leaderboard"
                      ? onNavigateToLeaderboard?.()
                      : action.id === "milestones"
                        ? onNavigateToMilestones?.()
                        : onNavigate?.(action.id)
                  }
                  className="h-24 flex-col gap-3 rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 hover:bg-slate-50 dark:hover:bg-zinc-800 hover:border-slate-300 dark:hover:border-zinc-700 transition-all group"
                >
                  <IconComponent className="w-6 h-6 text-zinc-400 dark:text-zinc-500 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors" />
                  <div className="text-center">
                    <div className="text-sm font-bold text-zinc-700 dark:text-zinc-300">
                      {action.label}
                    </div>
                    <div className="text-[10px] font-medium text-zinc-400 dark:text-zinc-500 mt-0.5">
                      {action.description}
                    </div>
                  </div>
                </Button>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};