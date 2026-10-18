import React, { useState, useEffect } from "react";
import {
  type AdvertiserBrandConfig,
  evaluateWcagCompliance,
  uploadBrandConfigToIpfs,
  saveBrandConfig,
  loadBrandConfig,
  isValidSubdomain,
} from "../../lib/branding";
import { useWeb3 } from "../../hooks/useWeb3";
import { useNotification } from "../../context/NotificationContext";
import { Button } from "../ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../ui/card";
import {
  Palette,
  Globe,
  Upload,
  AlertTriangle,
  Smartphone,
  Monitor,
  Sparkles,
  Cloud,
  Loader2,
  ShieldCheck,
  Eye,
} from "lucide-react";
import { BrandedCampaignView } from "../shared/BrandedCampaignView";

const PRESET_COLORS = [
  { name: "Indigo Tech", primary: "#4F46E5", secondary: "#06B6D4" },
  { name: "Emerald Escrow", primary: "#059669", secondary: "#10B981" },
  { name: "Cyberpunk Violet", primary: "#7C3AED", secondary: "#EC4899" },
  { name: "Oceanic Blue", primary: "#2563EB", secondary: "#38BDF8" },
  { name: "Amber Gold", primary: "#D97706", secondary: "#F59E0B" },
  { name: "Crimson Velvet", primary: "#DC2626", secondary: "#F87171" },
];

export const BrandCustomizer: React.FC = () => {
  const { userAddress } = useWeb3();
  const { showNotification } = useNotification();

  const [config, setConfig] = useState<AdvertiserBrandConfig>(() =>
    loadBrandConfig(userAddress || undefined),
  );

  const [previewMode, setPreviewMode] = useState<"desktop" | "mobile">("desktop");
  const [isPublishingIpfs, setIsPublishingIpfs] = useState(false);
  const [showFullPreview, setShowFullPreview] = useState(false);

  // Evaluate WCAG 2.1 AA contrast
  const contrast = evaluateWcagCompliance(config.primaryColor);
  const isSubdomainValid = isValidSubdomain(config.subdomain);

  useEffect(() => {
    if (userAddress) {
      saveBrandConfig(userAddress, config);
    }
  }, [config, userAddress]);

  const handlePublishToIpfs = async () => {
    if (!isSubdomainValid) {
      showNotification({
        type: "error",
        title: "Invalid Subdomain",
        message: "Subdomain must be lowercase alphanumeric with hyphens (3-30 characters).",
      });
      return;
    }

    setIsPublishingIpfs(true);
    try {
      const res = await uploadBrandConfigToIpfs(config);
      const updated = {
        ...config,
        ipfsHash: res.ipfsUri,
        updatedAt: res.timestamp,
      };
      setConfig(updated);
      if (userAddress) {
        saveBrandConfig(userAddress, updated);
      }

      showNotification({
        type: "success",
        title: "Published to IPFS!",
        message: `Decentralized CID: ${res.cid.slice(0, 16)}...`,
      });
    } catch (err: any) {
      showNotification({
        type: "error",
        title: "IPFS Publishing Failed",
        message: err.message || "Failed to publish metadata to IPFS",
      });
    } finally {
      setIsPublishingIpfs(false);
    }
  };

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        if (typeof reader.result === "string") {
          setConfig((prev) => ({ ...prev, logoUrl: reader.result as string }));
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const handleBannerUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        if (typeof reader.result === "string") {
          setConfig((prev) => ({ ...prev, bannerUrl: reader.result as string }));
        }
      };
      reader.readAsDataURL(file);
    }
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <span className="p-2 bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 rounded-xl">
              <Palette className="w-5 h-5" />
            </span>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-zinc-900 dark:text-white tracking-tight">
              Storefront & Brand Customizer
            </h2>
          </div>
          <p className="text-zinc-500 dark:text-zinc-400 mt-1 font-medium text-sm">
            Customize colors, banner graphics, and copy for your public campaign marketplace with
            dynamic subdomains.
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <Button
            variant="outline"
            onClick={() => setShowFullPreview(true)}
            className="rounded-xl border-slate-200 dark:border-zinc-800 font-semibold text-xs h-10 px-4"
          >
            <Eye className="w-4 h-4 mr-1.5" />
            View Full Public Storefront
          </Button>

          <Button
            onClick={handlePublishToIpfs}
            disabled={isPublishingIpfs || !isSubdomainValid}
            className="rounded-xl bg-zinc-900 hover:bg-zinc-800 dark:bg-indigo-600 dark:hover:bg-indigo-500 text-white font-bold text-xs h-10 px-4 shadow-md"
          >
            {isPublishingIpfs ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin mr-1.5" />
                Publishing to IPFS...
              </>
            ) : (
              <>
                <Cloud className="w-4 h-4 mr-1.5" />
                Publish to IPFS
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Main Grid: Controls on Left, Live Preview on Right */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Column: Customizer Controls (7 cols) */}
        <div className="lg:col-span-6 space-y-6">
          {/* Subdomain & Brand Identity */}
          <Card className="border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/50 rounded-3xl shadow-sm">
            <CardHeader className="pb-4">
              <CardTitle className="text-base font-bold flex items-center space-x-2">
                <Globe className="w-4 h-4 text-indigo-500" />
                <span>Dynamic Subdomain & Identity</span>
              </CardTitle>
              <CardDescription className="text-xs">
                Your public affiliate marketplace will resolve at this custom branded subdomain.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1">
                  Subdomain Name
                </label>
                <div className="flex items-center">
                  <input
                    type="text"
                    value={config.subdomain}
                    onChange={(e) =>
                      setConfig((prev) => ({
                        ...prev,
                        subdomain: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""),
                      }))
                    }
                    placeholder="mybrand"
                    className="flex-1 px-3 py-2 bg-slate-50 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 rounded-l-xl text-xs font-mono text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                  <span className="px-3 py-2 bg-slate-100 dark:bg-zinc-800 text-zinc-500 border border-l-0 border-slate-200 dark:border-zinc-800 rounded-r-xl text-xs font-mono font-semibold">
                    .stormsale.io
                  </span>
                </div>
                {!isSubdomainValid && (
                  <p className="text-[11px] text-rose-500 mt-1 flex items-center">
                    <AlertTriangle className="w-3 h-3 mr-1" />
                    Subdomain must be 3-30 characters with alphanumeric letters or hyphens.
                  </p>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1">
                    Brand Name
                  </label>
                  <input
                    type="text"
                    value={config.brandName}
                    onChange={(e) => setConfig((prev) => ({ ...prev, brandName: e.target.value }))}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 rounded-xl text-xs text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1">
                    Tagline
                  </label>
                  <input
                    type="text"
                    value={config.tagline}
                    onChange={(e) => setConfig((prev) => ({ ...prev, tagline: e.target.value }))}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 rounded-xl text-xs text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Color Scheme & WCAG 2.1 AA Contrast Checker */}
          <Card className="border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/50 rounded-3xl shadow-sm">
            <CardHeader className="pb-4">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base font-bold flex items-center space-x-2">
                  <Palette className="w-4 h-4 text-indigo-500" />
                  <span>Color Theme & WCAG Accessibility</span>
                </CardTitle>
                <span
                  className={`text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full flex items-center space-x-1 ${
                    contrast.passesAaNormalText
                      ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20"
                      : contrast.passesAaLargeText
                        ? "bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/20"
                        : "bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/20"
                  }`}
                >
                  {contrast.passesAaNormalText ? (
                    <ShieldCheck className="w-3 h-3 mr-1" />
                  ) : (
                    <AlertTriangle className="w-3 h-3 mr-1" />
                  )}
                  {contrast.complianceStatus}
                </span>
              </div>
              <CardDescription className="text-xs">
                WCAG 2.1 AA requires minimum 4.5:1 contrast for normal text and 3:1 for large text.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Presets */}
              <div>
                <label className="block text-[11px] font-bold text-zinc-500 uppercase mb-2">
                  Curated Presets
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {PRESET_COLORS.map((preset) => (
                    <button
                      key={preset.name}
                      type="button"
                      onClick={() =>
                        setConfig((prev) => ({
                          ...prev,
                          primaryColor: preset.primary,
                          secondaryColor: preset.secondary,
                        }))
                      }
                      className={`p-2 rounded-xl border text-left flex items-center space-x-2 transition-all ${
                        config.primaryColor.toLowerCase() === preset.primary.toLowerCase()
                          ? "border-indigo-500 bg-indigo-50/50 dark:bg-indigo-950/20"
                          : "border-slate-200 dark:border-zinc-800 hover:border-slate-300 dark:hover:border-zinc-700"
                      }`}
                    >
                      <span
                        className="w-4 h-4 rounded-full shadow-sm shrink-0"
                        style={{ backgroundColor: preset.primary }}
                      />
                      <span className="text-[11px] font-semibold text-zinc-800 dark:text-zinc-200 truncate">
                        {preset.name}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Custom Color Pickers */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1">
                    Primary Brand Color
                  </label>
                  <div className="flex items-center space-x-2">
                    <input
                      type="color"
                      value={config.primaryColor}
                      onChange={(e) =>
                        setConfig((prev) => ({ ...prev, primaryColor: e.target.value }))
                      }
                      className="w-10 h-10 rounded-xl cursor-pointer border border-slate-200 dark:border-zinc-700 p-0.5 bg-transparent"
                    />
                    <input
                      type="text"
                      value={config.primaryColor}
                      onChange={(e) =>
                        setConfig((prev) => ({ ...prev, primaryColor: e.target.value }))
                      }
                      className="flex-1 px-3 py-2 bg-slate-50 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 rounded-xl text-xs font-mono uppercase text-zinc-900 dark:text-white"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1">
                    Accent / Secondary Color
                  </label>
                  <div className="flex items-center space-x-2">
                    <input
                      type="color"
                      value={config.secondaryColor}
                      onChange={(e) =>
                        setConfig((prev) => ({ ...prev, secondaryColor: e.target.value }))
                      }
                      className="w-10 h-10 rounded-xl cursor-pointer border border-slate-200 dark:border-zinc-700 p-0.5 bg-transparent"
                    />
                    <input
                      type="text"
                      value={config.secondaryColor}
                      onChange={(e) =>
                        setConfig((prev) => ({ ...prev, secondaryColor: e.target.value }))
                      }
                      className="flex-1 px-3 py-2 bg-slate-50 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 rounded-xl text-xs font-mono uppercase text-zinc-900 dark:text-white"
                    />
                  </div>
                </div>
              </div>

              {/* Contrast Metrics Card */}
              <div className="p-3.5 bg-slate-50 dark:bg-zinc-950 rounded-2xl border border-slate-200 dark:border-zinc-800 space-y-2 text-xs">
                <div className="flex items-center justify-between text-zinc-600 dark:text-zinc-400">
                  <span>Contrast with White (#FFF):</span>
                  <span className="font-mono font-bold text-zinc-900 dark:text-white">
                    {contrast.contrastRatioWithWhite}:1
                  </span>
                </div>
                <div className="flex items-center justify-between text-zinc-600 dark:text-zinc-400">
                  <span>Contrast with Dark (#09090B):</span>
                  <span className="font-mono font-bold text-zinc-900 dark:text-white">
                    {contrast.contrastRatioWithDark}:1
                  </span>
                </div>
                <div className="pt-1 flex items-center justify-between border-t border-slate-200 dark:border-zinc-800 text-[11px]">
                  <span className="text-zinc-500">Recommended Text Color:</span>
                  <span
                    className="font-bold px-2 py-0.5 rounded"
                    style={{
                      backgroundColor: config.primaryColor,
                      color: contrast.recommendedTextColor,
                    }}
                  >
                    Sample CTA Text ({contrast.recommendedTextColor})
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Logos & Banner Images */}
          <Card className="border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/50 rounded-3xl shadow-sm">
            <CardHeader className="pb-4">
              <CardTitle className="text-base font-bold flex items-center space-x-2">
                <Upload className="w-4 h-4 text-indigo-500" />
                <span>Logo & Banner Graphics</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1">
                  Brand Logo URL or Upload
                </label>
                <div className="flex items-center space-x-3">
                  <img
                    src={config.logoUrl}
                    alt="Logo"
                    className="w-10 h-10 rounded-xl object-cover border border-slate-200 dark:border-zinc-700 shrink-0"
                  />
                  <input
                    type="text"
                    value={config.logoUrl}
                    onChange={(e) => setConfig((prev) => ({ ...prev, logoUrl: e.target.value }))}
                    className="flex-1 px-3 py-2 bg-slate-50 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 rounded-xl text-xs text-zinc-900 dark:text-white"
                  />
                  <label className="cursor-pointer px-3 py-2 bg-slate-100 dark:bg-zinc-800 hover:bg-slate-200 dark:hover:bg-zinc-700 text-xs font-semibold rounded-xl text-zinc-700 dark:text-zinc-300 shrink-0 transition-colors">
                    Upload
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleLogoUpload}
                      className="hidden"
                    />
                  </label>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1">
                  Banner Hero Cover Image URL or Upload
                </label>
                <div className="flex items-center space-x-3">
                  <img
                    src={config.bannerUrl}
                    alt="Banner"
                    className="w-16 h-10 rounded-xl object-cover border border-slate-200 dark:border-zinc-700 shrink-0"
                  />
                  <input
                    type="text"
                    value={config.bannerUrl}
                    onChange={(e) => setConfig((prev) => ({ ...prev, bannerUrl: e.target.value }))}
                    className="flex-1 px-3 py-2 bg-slate-50 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 rounded-xl text-xs text-zinc-900 dark:text-white"
                  />
                  <label className="cursor-pointer px-3 py-2 bg-slate-100 dark:bg-zinc-800 hover:bg-slate-200 dark:hover:bg-zinc-700 text-xs font-semibold rounded-xl text-zinc-700 dark:text-zinc-300 shrink-0 transition-colors">
                    Upload
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleBannerUpload}
                      className="hidden"
                    />
                  </label>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Hero Copy Editor */}
          <Card className="border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/50 rounded-3xl shadow-sm">
            <CardHeader className="pb-4">
              <CardTitle className="text-base font-bold flex items-center space-x-2">
                <Sparkles className="w-4 h-4 text-indigo-500" />
                <span>Marketplace Hero Copy</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1">
                  Hero Headline
                </label>
                <input
                  type="text"
                  value={config.heroHeadline}
                  onChange={(e) => setConfig((prev) => ({ ...prev, heroHeadline: e.target.value }))}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 rounded-xl text-xs text-zinc-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1">
                  Hero Subtitle Description
                </label>
                <textarea
                  rows={2}
                  value={config.heroSubtitle}
                  onChange={(e) => setConfig((prev) => ({ ...prev, heroSubtitle: e.target.value }))}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 rounded-xl text-xs text-zinc-900 dark:text-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1">
                    Call to Action (CTA) Button Text
                  </label>
                  <input
                    type="text"
                    value={config.ctaText}
                    onChange={(e) => setConfig((prev) => ({ ...prev, ctaText: e.target.value }))}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 rounded-xl text-xs text-zinc-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1">
                    Decentralized IPFS URI
                  </label>
                  <input
                    type="text"
                    readOnly
                    value={config.ipfsHash || "ipfs://bafybeic..."}
                    className="w-full px-3 py-2 bg-slate-100 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-xl text-xs font-mono text-zinc-500"
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right Column: Real-Time Live Preview (6 cols) */}
        <div className="lg:col-span-6 sticky top-6 space-y-4">
          <div className="flex items-center justify-between bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 p-3 rounded-2xl">
            <div className="flex items-center space-x-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-xs font-bold uppercase tracking-wider text-zinc-700 dark:text-zinc-300">
                Real-Time Live Preview
              </span>
            </div>

            <div className="flex items-center space-x-1 bg-slate-100 dark:bg-zinc-800 p-1 rounded-xl">
              <button
                type="button"
                onClick={() => setPreviewMode("desktop")}
                className={`p-1.5 rounded-lg text-xs font-bold flex items-center space-x-1 transition-colors ${
                  previewMode === "desktop"
                    ? "bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white shadow-sm"
                    : "text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
                }`}
              >
                <Monitor className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Desktop</span>
              </button>
              <button
                type="button"
                onClick={() => setPreviewMode("mobile")}
                className={`p-1.5 rounded-lg text-xs font-bold flex items-center space-x-1 transition-colors ${
                  previewMode === "mobile"
                    ? "bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white shadow-sm"
                    : "text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
                }`}
              >
                <Smartphone className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Mobile</span>
              </button>
            </div>
          </div>

          {/* Frame Container */}
          <div
            className={`border border-slate-300 dark:border-zinc-800 bg-slate-200 dark:bg-zinc-950 rounded-3xl p-2 shadow-2xl transition-all duration-300 overflow-hidden mx-auto ${
              previewMode === "mobile" ? "max-w-[375px]" : "w-full"
            }`}
          >
            <div className="rounded-2xl overflow-hidden max-h-[720px] overflow-y-auto border border-slate-200 dark:border-zinc-800">
              <BrandedCampaignView brandConfig={config} />
            </div>
          </div>
        </div>
      </div>

      {/* Fullscreen Storefront Modal */}
      {showFullPreview && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/80 backdrop-blur-md">
          <BrandedCampaignView
            brandConfig={config}
            onClose={() => setShowFullPreview(false)}
            isStandalone
          />
        </div>
      )}
    </div>
  );
};
