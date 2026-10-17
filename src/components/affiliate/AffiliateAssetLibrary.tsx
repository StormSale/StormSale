import React, { useState } from "react";
import { Input } from "../ui/input";
import { Link as LinkIcon, ShieldCheck } from "lucide-react";
import { AssetGallery } from "../advertiser/AssetGallery";
import { getStoredPromotionAssets } from "../../lib/ipfsAssetService";
import { useWeb3 } from "../../hooks/useWeb3";

export const AffiliateAssetLibrary: React.FC = () => {
  const { userAddress } = useWeb3();
  const [affiliateTag, setAffiliateTag] = useState(
    userAddress ? `${userAddress.slice(0, 4)}...${userAddress.slice(-4)}` : "STORM_AFFILIATE",
  );

  const assets = getStoredPromotionAssets();

  return (
    <div className="space-y-8 pb-12">
      {/* Affiliate Hero Banner */}
      <div className="relative overflow-hidden bg-gradient-to-br from-indigo-950 via-zinc-900 to-zinc-950 rounded-[2.5rem] p-8 md:p-12 border border-indigo-900/30 shadow-2xl">
        <div className="relative z-10 flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6">
          <div className="space-y-2">
            <div className="flex items-center space-x-2">
              <span className="px-3 py-1 bg-indigo-500/20 border border-indigo-500/30 rounded-full text-indigo-400 text-xs font-bold uppercase tracking-wider flex items-center">
                <ShieldCheck className="w-3.5 h-3.5 mr-1 text-emerald-400" />
                Verified Decentralized Storage
              </span>
            </div>
            <h1 className="text-3xl md:text-5xl font-black text-white tracking-tight">
              Creative Marketing Assets
            </h1>
            <p className="text-zinc-400 font-medium text-sm md:text-base max-w-xl">
              Download official advertiser banners, logos, and swipe copy pinned to IPFS. Embed
              responsive ads directly on your website or newsletter with your verified referral
              link.
            </p>
          </div>

          {/* Affiliate Tag Personalizer */}
          <div className="w-full lg:w-auto bg-white/10 dark:bg-zinc-900/80 backdrop-blur-xl border border-white/10 dark:border-zinc-800 rounded-2xl p-4 space-y-2 min-w-[280px]">
            <label className="text-[11px] font-bold text-zinc-300 uppercase tracking-wider flex items-center gap-1.5">
              <LinkIcon className="w-3.5 h-3.5 text-indigo-400" />
              Your Affiliate Tracking ID:
            </label>
            <Input
              value={affiliateTag}
              onChange={(e) => setAffiliateTag(e.target.value)}
              placeholder="Your Affiliate ID"
              className="h-10 text-xs font-mono bg-white/10 dark:bg-zinc-950 border-white/20 dark:border-zinc-700 text-white placeholder-zinc-500 rounded-xl"
            />
            <p className="text-[10px] text-zinc-400">
              Embed codes & ZIP bundles will automatically embed this ID.
            </p>
          </div>
        </div>
      </div>

      {/* Media Gallery in Affiliate Mode */}
      <AssetGallery assets={assets} isAffiliateView={true} affiliateReferralCode={affiliateTag} />
    </div>
  );
};
