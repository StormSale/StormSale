import React from "react";
import { type AdvertiserBrandConfig, evaluateWcagCompliance } from "../../lib/branding";
import { Shield, CheckCircle2, ArrowRight, Sparkles, X } from "lucide-react";
import { Button } from "../ui/button";

interface BrandedCampaignViewProps {
  brandConfig: AdvertiserBrandConfig;
  onClose?: () => void;
  isStandalone?: boolean;
}

export const BrandedCampaignView: React.FC<BrandedCampaignViewProps> = ({
  brandConfig,
  onClose,
  isStandalone = false,
}) => {
  const contrast = evaluateWcagCompliance(brandConfig.primaryColor);
  const textColor = contrast.recommendedTextColor;

  const mockCampaigns = [
    {
      id: 101,
      name: "Apex Ultra Pro SaaS Launch",
      commission: "25%",
      avgPayout: "120 XLM",
      escrowLocked: "5,000 XLM",
      clearingDays: 7,
      category: "Software & Cloud",
    },
    {
      id: 102,
      name: "Quantum Enterprise AI Bridge",
      commission: "18%",
      avgPayout: "240 XLM",
      escrowLocked: "12,500 XLM",
      clearingDays: 14,
      category: "Enterprise AI",
    },
    {
      id: 103,
      name: "Stellar Cross-Border Remittance App",
      commission: "30%",
      avgPayout: "75 XLM",
      escrowLocked: "8,200 XLM",
      clearingDays: 3,
      category: "Fintech",
    },
  ];

  return (
    <div
      className={`min-h-screen bg-slate-50 dark:bg-zinc-950 font-sans text-zinc-900 dark:text-white ${
        isStandalone ? "fixed inset-0 z-50 overflow-y-auto" : ""
      }`}
      style={
        {
          "--brand-primary": brandConfig.primaryColor,
          "--brand-secondary": brandConfig.secondaryColor,
        } as React.CSSProperties
      }
    >
      {/* Top Bar for Dynamic Subdomain Notice */}
      <div className="bg-zinc-900 text-white text-xs px-4 py-2 flex items-center justify-between border-b border-zinc-800">
        <div className="flex items-center space-x-2">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span className="font-mono text-zinc-400">
            https://{brandConfig.subdomain}.stormsale.io
          </span>
          <span className="bg-zinc-800 text-[10px] uppercase font-bold px-2 py-0.5 rounded text-zinc-300">
            Verified Merchant Subdomain
          </span>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="text-zinc-400 hover:text-white flex items-center space-x-1 text-xs transition-colors"
          >
            <span>Close Preview</span>
            <X className="w-4 h-4 ml-1" />
          </button>
        )}
      </div>

      {/* Brand Header */}
      <header className="sticky top-0 z-40 bg-white/80 dark:bg-zinc-900/80 backdrop-blur-xl border-b border-slate-200/80 dark:border-zinc-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <img
              src={brandConfig.logoUrl}
              alt={brandConfig.brandName}
              className="w-12 h-12 rounded-2xl object-cover shadow-md border border-slate-200 dark:border-zinc-700"
              onError={(e) => {
                // Fallback icon placeholder if image fails to load
                (e.target as HTMLImageElement).src =
                  "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=200&auto=format&fit=crop&q=80";
              }}
            />
            <div>
              <h1 className="text-xl font-black tracking-tight text-zinc-900 dark:text-white">
                {brandConfig.brandName}
              </h1>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 font-medium">
                {brandConfig.tagline}
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-3">
            <div className="hidden sm:flex items-center space-x-1 text-xs text-zinc-500 dark:text-zinc-400 mr-2">
              <Shield className="w-3.5 h-3.5 text-emerald-500" />
              <span>Soroban Escrow Protected</span>
            </div>
            <Button
              style={{
                backgroundColor: brandConfig.primaryColor,
                color: textColor,
              }}
              className="rounded-xl font-bold text-sm shadow-lg hover:opacity-90 transition-opacity"
            >
              {brandConfig.ctaText || "Join Brand Marketplace"}
            </Button>
          </div>
        </div>
      </header>

      {/* Hero Banner Section */}
      <div className="relative overflow-hidden bg-zinc-900 text-white">
        <div
          className="absolute inset-0 bg-cover bg-center opacity-30 blur-[1px]"
          style={{ backgroundImage: `url(${brandConfig.bannerUrl})` }}
        />
        <div
          className="absolute inset-0"
          style={{
            background: `linear-gradient(135deg, ${brandConfig.primaryColor}88 0%, #09090b 100%)`,
          }}
        />

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 lg:py-28">
          <div className="max-w-3xl space-y-6">
            <div className="inline-flex items-center space-x-2 px-3 py-1.5 rounded-full bg-white/10 backdrop-blur-md border border-white/20 text-xs font-semibold text-white">
              <Sparkles className="w-3.5 h-3.5 text-amber-300" />
              <span>Official Merchant Partner Portal</span>
            </div>

            <h2 className="text-3xl sm:text-5xl lg:text-6xl font-black tracking-tight leading-tight">
              {brandConfig.heroHeadline}
            </h2>

            <p className="text-base sm:text-lg text-zinc-200 leading-relaxed max-w-2xl">
              {brandConfig.heroSubtitle}
            </p>

            <div className="pt-2 flex flex-wrap gap-4">
              <Button
                size="lg"
                style={{
                  backgroundColor: brandConfig.primaryColor,
                  color: textColor,
                }}
                className="rounded-2xl font-black text-base shadow-2xl hover:opacity-95 px-8 h-14"
              >
                <span>{brandConfig.ctaText}</span>
                <ArrowRight className="w-5 h-5 ml-2" />
              </Button>
              <Button
                variant="outline"
                size="lg"
                className="rounded-2xl bg-white/10 hover:bg-white/20 text-white border-white/30 backdrop-blur-md h-14 px-6 text-base font-bold"
              >
                Contact Merchant
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Stats Bar */}
      <div className="bg-white dark:bg-zinc-900 border-b border-slate-200 dark:border-zinc-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
            <div>
              <div
                className="text-2xl sm:text-3xl font-black"
                style={{ color: brandConfig.primaryColor }}
              >
                25%
              </div>
              <div className="text-xs text-zinc-500 dark:text-zinc-400 font-semibold mt-1">
                Top Commission Rate
              </div>
            </div>
            <div>
              <div
                className="text-2xl sm:text-3xl font-black"
                style={{ color: brandConfig.secondaryColor }}
              >
                25,700 XLM
              </div>
              <div className="text-xs text-zinc-500 dark:text-zinc-400 font-semibold mt-1">
                Active Escrow Locked
              </div>
            </div>
            <div>
              <div className="text-2xl sm:text-3xl font-black text-emerald-600 dark:text-emerald-400">
                100%
              </div>
              <div className="text-xs text-zinc-500 dark:text-zinc-400 font-semibold mt-1">
                On-Chain Guaranteed
              </div>
            </div>
            <div>
              <div className="text-2xl sm:text-3xl font-black text-purple-600 dark:text-purple-400">
                3 - 14 Days
              </div>
              <div className="text-xs text-zinc-500 dark:text-zinc-400 font-semibold mt-1">
                Maturity Clearing Window
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Available Campaigns Grid */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="flex flex-col md:flex-row md:items-end justify-between mb-8">
          <div>
            <h3 className="text-2xl sm:text-3xl font-black tracking-tight">
              Active Campaigns on Stellar Escrow
            </h3>
            <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
              Affiliates join campaigns directly on Soroban smart contracts with automated postbacks
            </p>
          </div>
          <div className="mt-4 md:mt-0 flex items-center space-x-2 text-xs font-mono text-zinc-500">
            <span>Decentralized IPFS Metadata:</span>
            <span className="font-bold text-zinc-800 dark:text-zinc-200">
              {brandConfig.ipfsHash || "ipfs://bafybeic7stormsalebrand"}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {mockCampaigns.map((camp) => (
            <div
              key={camp.id}
              className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-3xl p-6 shadow-sm hover:shadow-xl transition-all flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between text-xs font-semibold text-zinc-500 mb-2">
                  <span className="px-2.5 py-1 bg-slate-100 dark:bg-zinc-800 rounded-full font-mono">
                    #{camp.id}
                  </span>
                  <span className="text-emerald-600 dark:text-emerald-400 font-bold flex items-center">
                    <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                    Escrow Funded
                  </span>
                </div>

                <h4 className="text-lg font-bold text-zinc-900 dark:text-white mt-1">
                  {camp.name}
                </h4>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                  Category: {camp.category}
                </p>

                <div className="mt-6 p-4 rounded-2xl bg-slate-50 dark:bg-zinc-800/50 space-y-2 text-xs">
                  <div className="flex justify-between">
                    <span className="text-zinc-500">Commission Rate:</span>
                    <span
                      className="font-bold text-base"
                      style={{ color: brandConfig.primaryColor }}
                    >
                      {camp.commission}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-500">Avg Affiliate Payout:</span>
                    <span className="font-bold text-zinc-800 dark:text-zinc-200">
                      {camp.avgPayout}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-500">Locked Campaign Escrow:</span>
                    <span className="font-bold text-zinc-800 dark:text-zinc-200">
                      {camp.escrowLocked}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-500">Clearing Maturity:</span>
                    <span className="font-bold text-zinc-800 dark:text-zinc-200">
                      {camp.clearingDays} Days
                    </span>
                  </div>
                </div>
              </div>

              <div className="mt-6">
                <Button
                  style={{
                    backgroundColor: brandConfig.primaryColor,
                    color: textColor,
                  }}
                  className="w-full rounded-xl font-bold text-sm shadow hover:opacity-90"
                >
                  Join Campaign as Affiliate
                </Button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 py-8 text-center text-xs text-zinc-500">
        <p>
          © 2026 {brandConfig.brandName}. Powered by{" "}
          <span className="font-bold text-zinc-800 dark:text-zinc-200">StormSale Protocol</span> on
          the Stellar Network.
        </p>
      </footer>
    </div>
  );
};
