import { useState, useEffect, useRef } from "react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../ui/card";
import { useTelegram } from "../../hooks/useTelegram";
import { useWeb3 } from "../../hooks/useWeb3";
import { useNotification } from "../../context/NotificationContext";
import {
  Send,
  Copy,
  Check,
  Search,
  Coins,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Users,
} from "lucide-react";

export interface AffiliateCampaignItem {
  id: string;
  name: string;
  advertiser: string;
  category: string;
  asset: "USDC" | "EURC" | "XLM";
  commissionRate: string;
  clearingPeriod: string;
  totalPool: string;
  activeAffiliates: number;
  contractAddress: string;
  description: string;
}

export const DEFAULT_TELEGRAM_CAMPAIGNS: AffiliateCampaignItem[] = [
  {
    id: "camp-usdc-101",
    name: "Stellar USDC High-Yield Staking",
    advertiser: "Stellar Lumens DeFi Alliance",
    category: "DeFi & Yield",
    asset: "USDC",
    commissionRate: "12% per deposit",
    clearingPeriod: "7 Days",
    totalPool: "25,000 USDC",
    activeAffiliates: 48,
    contractAddress: "CCAMPAIGN_USDC_YIELD_01",
    description:
      "Promote Circle USDC liquid staking on Soroban. Instant payouts after 7d clearing.",
  },
  {
    id: "camp-eurc-202",
    name: "EURC Cross-Border Remittance",
    advertiser: "EuroPay Stellar Rail",
    category: "Fintech & Payments",
    asset: "EURC",
    commissionRate: "10 EURC flat / user",
    clearingPeriod: "3 Days",
    totalPool: "15,000 EURC",
    activeAffiliates: 32,
    contractAddress: "CCAMPAIGN_EURC_REMIT_02",
    description: "Attract European Web3 remittances with sub-cent fees on Stellar.",
  },
  {
    id: "camp-xlm-303",
    name: "StormSale Genesis Community Booster",
    advertiser: "StormSale Foundation",
    category: "Crypto Ecosystem",
    asset: "XLM",
    commissionRate: "15% on sale",
    clearingPeriod: "14 Days",
    totalPool: "50,000 XLM",
    activeAffiliates: 95,
    contractAddress: "CCAMPAIGN_XLM_GENESIS_03",
    description: "Official StormSale decentralized affiliate protocol launch campaign.",
  },
  {
    id: "camp-web3-404",
    name: "Web3 Security Audit Pass",
    advertiser: "CertiK & Soroban Guild",
    category: "Security & Dev",
    asset: "USDC",
    commissionRate: "20% per pass",
    clearingPeriod: "10 Days",
    totalPool: "18,000 USDC",
    activeAffiliates: 21,
    contractAddress: "CCAMPAIGN_USDC_AUDIT_04",
    description: "Smart contract automated security scanning subscriptions.",
  },
];

export const MOCK_TELEGRAM_CAMPAIGNS = DEFAULT_TELEGRAM_CAMPAIGNS;

export async function fetchTelegramCampaigns(): Promise<AffiliateCampaignItem[]> {
  return DEFAULT_TELEGRAM_CAMPAIGNS;
}

export const TelegramCampaignBrowser = () => {
  const { isTelegram, user, platform, shareReferral, copyReferralLink, triggerHaptic } =
    useTelegram();
  const { userAddress, isConnected, xlmBalance } = useWeb3();
  const { showNotification } = useNotification();

  const [campaigns, setCampaigns] = useState<AffiliateCampaignItem[]>(DEFAULT_TELEGRAM_CAMPAIGNS);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedAsset, setSelectedAsset] = useState<string>("ALL");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const copyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    fetchTelegramCampaigns().then((loaded) => {
      if (Array.isArray(loaded) && loaded.length > 0) {
        setCampaigns(loaded);
      }
    });
    return () => {
      if (copyTimeoutRef.current) {
        clearTimeout(copyTimeoutRef.current);
      }
    };
  }, []);

  const hasPositiveBalance = Boolean(
    isConnected && userAddress && parseFloat(xlmBalance || "0") > 0,
  );

  const canPerformAffiliateAction = Boolean(isConnected && userAddress && hasPositiveBalance);

  const filteredCampaigns = campaigns.filter((campaign) => {
    const matchesSearch =
      campaign.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      campaign.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      campaign.advertiser.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesAsset = selectedAsset === "ALL" || campaign.asset === selectedAsset;
    return matchesSearch && matchesAsset;
  });

  const getReferralUrl = (campaignId: string) => {
    if (!userAddress) return "";
    return `https://stormsale.xyz/c/${campaignId}?ref=${userAddress}`;
  };

  const handleCopy = async (campaignId: string) => {
    if (!isConnected || !userAddress) {
      showNotification({
        type: "warning",
        title: "Wallet Required",
        message: "Please connect your wallet to copy referral links.",
      });
      return;
    }
    if (!hasPositiveBalance) {
      showNotification({
        type: "warning",
        title: "Active Balance Required",
        message: "Your Stellar account requires a positive balance to participate in affiliate campaigns.",
      });
      return;
    }

    const url = getReferralUrl(campaignId);
    const success = await copyReferralLink(url);
    if (success) {
      if (copyTimeoutRef.current) {
        clearTimeout(copyTimeoutRef.current);
      }
      setCopiedId(campaignId);
      copyTimeoutRef.current = setTimeout(() => setCopiedId(null), 2500);
    } else {
      showNotification({
        type: "error",
        title: "Copy Failed",
        message: "Unable to copy referral link to clipboard.",
      });
    }
  };

  const handleShare = (campaign: AffiliateCampaignItem) => {
    if (!isConnected || !userAddress) {
      showNotification({
        type: "warning",
        title: "Wallet Required",
        message: "Please connect your wallet before sharing referral links.",
      });
      return;
    }
    if (!hasPositiveBalance) {
      showNotification({
        type: "warning",
        title: "Active Balance Required",
        message: "Your Stellar account requires a positive balance to participate in affiliate campaigns.",
      });
      return;
    }

    const url = getReferralUrl(campaign.id);
    const shareText = `🔥 Check out "${campaign.name}" on StormSale! Earn ${campaign.commissionRate} in ${campaign.asset}. Join here:`;
    shareReferral(url, shareText);
  };

  return (
    <div className="space-y-6">
      {/* TMA Native Context Header / Banner */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-sky-600 via-indigo-600 to-indigo-700 text-white p-6 sm:p-8 shadow-xl">
        <div className="absolute top-0 right-0 -mt-6 -mr-6 w-36 h-36 bg-white/10 rounded-full blur-2xl pointer-events-none" />

        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-white/20 backdrop-blur-md text-sky-100 border border-white/20">
                <Smartphone className="w-3.5 h-3.5" />
                {isTelegram
                  ? `Telegram Mini App (${platform.toUpperCase()})`
                  : "TMA Optimized Client"}
              </span>
              {user && (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/30 text-emerald-200 border border-emerald-400/30">
                  <Sparkles className="w-3 h-3" />
                  {user.username ? `@${user.username}` : user.first_name}
                </span>
              )}
            </div>
            <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
              Telegram Community Affiliate Hub
            </h2>
            <p className="text-sky-100 text-sm mt-1 max-w-xl">
              Browse verified Soroban campaigns, share one-click referral links directly into
              Telegram chats, and earn multi-asset commissions.
            </p>
          </div>

          <div className="flex items-center gap-3 bg-white/10 backdrop-blur-md p-3.5 rounded-2xl border border-white/20 shrink-0">
            <Coins className="w-6 h-6 text-yellow-300" />
            <div>
              <div className="text-[11px] font-bold text-sky-200 uppercase tracking-wider">
                Connected Affiliate
              </div>
              <div className="text-xs font-mono font-bold text-white">
                {isConnected && userAddress
                  ? `${userAddress.slice(0, 5)}...${userAddress.slice(-4)}`
                  : "Preview Mode"}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between bg-white dark:bg-zinc-900/60 p-4 rounded-2xl border border-slate-200 dark:border-zinc-800 shadow-sm">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search campaigns, tokens, or advertisers..."
            className="pl-10 h-10 border-slate-200 dark:border-zinc-800 rounded-xl bg-slate-50 dark:bg-zinc-950 text-sm"
          />
        </div>

        {/* Asset Filter Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
          {["ALL", "USDC", "EURC", "XLM"].map((asset) => (
            <button
              key={asset}
              onClick={() => {
                triggerHaptic("selection");
                setSelectedAsset(asset);
              }}
              className={`px-3 py-1.5 text-xs font-bold rounded-xl transition-all ${
                selectedAsset === asset
                  ? "bg-indigo-600 text-white shadow-sm"
                  : "bg-slate-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-slate-200 dark:hover:bg-zinc-700"
              }`}
            >
              {asset === "ALL" ? "All Assets" : asset}
            </button>
          ))}
        </div>
      </div>

      {/* Campaigns Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {filteredCampaigns.map((campaign) => {
          const isCopied = copiedId === campaign.id;
          const referralUrl = getReferralUrl(campaign.id);

          return (
            <Card
              key={campaign.id}
              className="border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/50 rounded-2xl shadow-sm hover:shadow-md transition-shadow flex flex-col justify-between"
            >
              <CardHeader className="p-5 pb-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-indigo-50 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800/50">
                        {campaign.category}
                      </span>
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-md border ${
                          campaign.asset === "USDC"
                            ? "bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-900/50"
                            : campaign.asset === "EURC"
                              ? "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-900/50"
                              : "bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-900/50"
                        }`}
                      >
                        {campaign.asset} Escrow
                      </span>
                    </div>
                    <CardTitle className="text-lg font-bold text-zinc-900 dark:text-white leading-snug">
                      {campaign.name}
                    </CardTitle>
                    <CardDescription className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                      By {campaign.advertiser}
                    </CardDescription>
                  </div>

                  <div className="text-right shrink-0">
                    <div className="text-sm font-extrabold text-emerald-600 dark:text-emerald-400">
                      {campaign.commissionRate}
                    </div>
                    <div className="text-[10px] text-zinc-400 font-medium">
                      Clearing: {campaign.clearingPeriod}
                    </div>
                  </div>
                </div>
              </CardHeader>

              <CardContent className="p-5 pt-0 space-y-4">
                <p className="text-xs text-zinc-600 dark:text-zinc-300 leading-relaxed">
                  {campaign.description}
                </p>

                {/* Pool & Affiliates stats bar */}
                <div className="flex items-center justify-between text-xs py-2 px-3 bg-slate-50 dark:bg-zinc-950 rounded-xl border border-slate-100 dark:border-zinc-800/80">
                  <div className="flex items-center gap-1.5 text-zinc-500 dark:text-zinc-400">
                    <ShieldCheck className="w-3.5 h-3.5 text-indigo-500" />
                    <span>Pool: {campaign.totalPool}</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-zinc-500 dark:text-zinc-400">
                    <Users className="w-3.5 h-3.5 text-indigo-500" />
                    <span>{campaign.activeAffiliates} Affiliates</span>
                  </div>
                </div>

                {/* Referral Link Box */}
                <div className="space-y-1.5">
                  <label
                    htmlFor={`referral-link-${campaign.id}`}
                    className="text-[11px] font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider"
                  >
                    Your Referral Link
                  </label>
                  <div className="flex items-center gap-2">
                    <Input
                      id={`referral-link-${campaign.id}`}
                      readOnly
                      value={
                        !isConnected || !userAddress
                          ? "Connect wallet to view referral link"
                          : !hasPositiveBalance
                            ? "Fund account with balance to activate link"
                            : referralUrl
                      }
                      className="h-9 text-xs font-mono bg-slate-50 dark:bg-zinc-950 border-slate-200 dark:border-zinc-800 rounded-lg truncate select-all"
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={!canPerformAffiliateAction}
                      onClick={() => handleCopy(campaign.id)}
                      className="h-9 px-3 rounded-lg border-slate-200 dark:border-zinc-800 shrink-0 hover:bg-slate-100 dark:hover:bg-zinc-800 disabled:opacity-50 disabled:cursor-not-allowed"
                      title={
                        !canPerformAffiliateAction
                          ? "Connect funded wallet to copy"
                          : "Copy Link (triggers haptic)"
                      }
                    >
                      {isCopied ? (
                        <Check className="w-4 h-4 text-emerald-500" />
                      ) : (
                        <Copy className="w-4 h-4 text-zinc-600 dark:text-zinc-400" />
                      )}
                    </Button>
                  </div>
                </div>

                {/* Action Buttons: 1-Click Share & Copy */}
                <div className="grid grid-cols-2 gap-2 pt-1">
                  <Button
                    disabled={!canPerformAffiliateAction}
                    onClick={() => handleShare(campaign)}
                    className="h-10 rounded-xl bg-sky-500 hover:bg-sky-600 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Send className="w-3.5 h-3.5" />
                    Share to Chat
                  </Button>

                  <Button
                    variant="outline"
                    disabled={!canPerformAffiliateAction}
                    onClick={() => handleCopy(campaign.id)}
                    className={`h-10 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 border transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
                      isCopied
                        ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400"
                        : "border-slate-200 dark:border-zinc-800 hover:bg-slate-50 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300"
                    }`}
                  >
                    {isCopied ? (
                      <>
                        <Check className="w-3.5 h-3.5" />
                        Copied!
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        Copy Link
                      </>
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {filteredCampaigns.length === 0 && (
        <div className="text-center py-12 bg-white dark:bg-zinc-900/50 rounded-2xl border border-slate-200 dark:border-zinc-800">
          <p className="text-sm font-semibold text-zinc-500 dark:text-zinc-400">
            No campaigns found matching "{searchQuery}".
          </p>
        </div>
      )}
    </div>
  );
};
