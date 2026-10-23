import React, { useState } from "react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Card, CardContent } from "../ui/card";
import {
  Download,
  Copy,
  Check,
  Code2,
  ExternalLink,
  Trash2,
  Search,
  SlidersHorizontal,
  FolderArchive,
  Image as ImageIcon,
  FileText,
  FileArchive,
  Sparkles,
  Maximize2,
  RefreshCw,
  CheckCircle2,
} from "lucide-react";
import type { PromotionAsset } from "../../types/asset";
import {
  deletePromotionAsset,
  generateEmbedCodes,
  getStoredPromotionAssets,
} from "../../lib/ipfsAssetService";
import { downloadSingleAsset, downloadFullMediaZipBundle } from "../../lib/assetZipBundle";
import { useNotification } from "../../context/NotificationContext";

const buildReferralUrl = (code: string) =>
  `https://stormsale.io/ref/${encodeURIComponent(code.trim() || "YOUR_AFFILIATE_ID")}`;

interface AssetGalleryProps {
  assets?: PromotionAsset[];
  onUploadClick?: () => void;
  onAssetDeleted?: (assetId: string) => void;
  onAssetsChanged?: () => void;
  isAffiliateView?: boolean;
  affiliateReferralCode?: string;
}

export const AssetGallery: React.FC<AssetGalleryProps> = ({
  assets: propAssets,
  onUploadClick,
  onAssetDeleted,
  onAssetsChanged,
  isAffiliateView = false,
  affiliateReferralCode = "AFFILIATE_TOP",
}) => {
  const { showNotification } = useNotification();

  const [internalAssets, setInternalAssets] = useState<PromotionAsset[]>(
    () => propAssets || getStoredPromotionAssets(),
  );

  // Adopt new asset lists from the parent as they arrive
  const [prevPropAssets, setPrevPropAssets] = useState(propAssets);
  if (propAssets !== prevPropAssets) {
    setPrevPropAssets(propAssets);
    if (propAssets) setInternalAssets(propAssets);
  }

  const assets = internalAssets;

  const refreshAssets = () => {
    setInternalAssets(getStoredPromotionAssets());
    if (onAssetsChanged) {
      onAssetsChanged();
    }
  };

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [selectedCampaign, setSelectedCampaign] = useState<string>("all");
  const [selectedFormat, setSelectedFormat] = useState<string>("all");
  const [sortBy, setSortBy] = useState<"newest" | "name" | "size" | "downloads">("newest");

  // Single asset embed modal state
  const [selectedAssetForEmbed, setSelectedAssetForEmbed] = useState<PromotionAsset | null>(null);
  const [embedTab, setEmbedTab] = useState<"html" | "markdown" | "react" | "direct">("html");
  const [customRefUrl, setCustomRefUrl] = useState(() => buildReferralUrl(affiliateReferralCode));

  // Re-derive the referral link when the affiliate edits their tracking ID
  const [prevReferralCode, setPrevReferralCode] = useState(affiliateReferralCode);
  if (affiliateReferralCode !== prevReferralCode) {
    setPrevReferralCode(affiliateReferralCode);
    setCustomRefUrl(buildReferralUrl(affiliateReferralCode));
  }

  // Preview modal state
  const [previewAsset, setPreviewAsset] = useState<PromotionAsset | null>(null);

  // Bundle download state
  const [isBundling, setIsBundling] = useState(false);

  // Copy feedback tracking
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const copyToClipboard = async (text: string, label: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      showNotification({
        type: "success",
        title: "Copied to Clipboard",
        message: `${label} copied successfully.`,
      });
      setTimeout(() => setCopiedKey(null), 2000);
    } catch {
      showNotification({
        type: "error",
        title: "Copy Failed",
        message: "Could not access clipboard.",
      });
    }
  };

  const handleDelete = (asset: PromotionAsset) => {
    if (confirm(`Are you sure you want to delete ${asset.title}?`)) {
      deletePromotionAsset(asset.id);
      refreshAssets();
      if (onAssetDeleted) onAssetDeleted(asset.id);
      showNotification({
        type: "info",
        title: "Asset Removed",
        message: `Removed ${asset.title} from library.`,
      });
    }
  };

  const handleDownloadSingle = async (asset: PromotionAsset) => {
    try {
      await downloadSingleAsset(asset);
      showNotification({
        type: "success",
        title: "Download Started",
        message: `Downloading ${asset.name}...`,
      });
      // Refresh count
      refreshAssets();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Download failed";
      showNotification({
        type: "error",
        title: "Download Error",
        message: msg,
      });
    }
  };

  const handleDownloadFullZip = async () => {
    try {
      setIsBundling(true);
      const filtered = getFilteredAssets();
      const campaignName =
        selectedCampaign !== "all" ? selectedCampaign : "StormSale_All_Campaigns";
      await downloadFullMediaZipBundle(campaignName, filtered, customRefUrl);
      showNotification({
        type: "success",
        title: "Media Bundle Generated",
        message: `Packed ${filtered.length} verified creative assets into ZIP bundle!`,
      });
      refreshAssets();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "ZIP bundling failed";
      showNotification({
        type: "error",
        title: "Bundling Error",
        message: msg,
      });
    } finally {
      setIsBundling(false);
    }
  };

  // Filter & Sort logic
  const getFilteredAssets = () => {
    return assets
      .filter((asset) => {
        if (selectedCategory !== "all" && asset.category !== selectedCategory) return false;
        if (selectedCampaign !== "all" && asset.campaignName !== selectedCampaign) return false;
        if (selectedFormat !== "all" && asset.fileFormat !== selectedFormat) return false;

        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase();
          const matchName = asset.name.toLowerCase().includes(q);
          const matchTitle = asset.title.toLowerCase().includes(q);
          const matchCid = asset.cid.toLowerCase().includes(q);
          const matchCampaign = asset.campaignName.toLowerCase().includes(q);
          return matchName || matchTitle || matchCid || matchCampaign;
        }

        return true;
      })
      .sort((a, b) => {
        if (sortBy === "name") return a.title.localeCompare(b.title);
        if (sortBy === "size") return b.sizeBytes - a.sizeBytes;
        if (sortBy === "downloads") return (b.downloadCount || 0) - (a.downloadCount || 0);
        // Default newest
        return new Date(b.pinnedAt).getTime() - new Date(a.pinnedAt).getTime();
      });
  };

  const filteredAssets = getFilteredAssets();

  const selectedEmbedCodes = selectedAssetForEmbed
    ? generateEmbedCodes(
        selectedAssetForEmbed.cid,
        selectedAssetForEmbed.gatewayUrl,
        selectedAssetForEmbed.title,
        selectedAssetForEmbed.dimensions,
        customRefUrl,
      )
    : null;

  // Campaign list for filter dropdown
  const uniqueCampaigns = Array.from(new Set(assets.map((a) => a.campaignName)));

  return (
    <div className="space-y-6">
      {/* =========================================================================
          CONTROL & FILTER BAR
         ========================================================================= */}
      <div className="bg-white/80 dark:bg-zinc-900/80 backdrop-blur-xl border border-slate-200 dark:border-zinc-800 rounded-3xl p-5 shadow-xs space-y-4">
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4">
          {/* Search Box */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <Input
              type="text"
              placeholder="Search assets by title, dimensions, campaign, or IPFS CID..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 h-11 text-xs rounded-2xl bg-slate-50/50 dark:bg-zinc-950/50 border-slate-200 dark:border-zinc-800"
            />
          </div>

          {/* Quick Action Buttons */}
          <div className="flex flex-wrap items-center gap-2.5">
            {onUploadClick && !isAffiliateView && (
              <Button
                onClick={onUploadClick}
                className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-2xl h-11 px-5 text-xs shadow-md shadow-indigo-500/20"
              >
                <Sparkles className="w-4 h-4 mr-2" />
                Upload New Asset
              </Button>
            )}

            <Button
              variant="outline"
              onClick={handleDownloadFullZip}
              disabled={isBundling || filteredAssets.length === 0}
              className="rounded-2xl border-slate-200 dark:border-zinc-700 h-11 px-5 text-xs font-bold text-zinc-800 dark:text-zinc-200 hover:bg-slate-50 dark:hover:bg-zinc-800 flex items-center gap-2 shadow-xs"
            >
              {isBundling ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin text-indigo-500" />
                  Generating Media ZIP...
                </>
              ) : (
                <>
                  <FolderArchive className="w-4 h-4 text-indigo-500" />
                  Download Full Media ZIP Bundle ({filteredAssets.length})
                </>
              )}
            </Button>
          </div>
        </div>

        {/* Filters Strip */}
        <div className="flex flex-wrap items-center gap-3 pt-3 border-t border-slate-100 dark:border-zinc-800/80">
          <div className="flex items-center space-x-1.5 text-xs font-bold text-zinc-400 uppercase tracking-wider">
            <SlidersHorizontal className="w-3.5 h-3.5" />
            <span>Filter:</span>
          </div>

          {/* Category Filter Pills */}
          <div className="flex flex-wrap items-center gap-1.5">
            {[
              { id: "all", label: "All Assets" },
              { id: "banner", label: "Banners" },
              { id: "logo", label: "Logos" },
              { id: "swipe_copy", label: "Swipe Copy" },
              { id: "bundle", label: "ZIP Bundles" },
            ].map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => setSelectedCategory(cat.id)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                  selectedCategory === cat.id
                    ? "bg-indigo-600 text-white shadow-xs"
                    : "bg-slate-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white"
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>

          {/* Campaign Selector */}
          <select
            value={selectedCampaign}
            onChange={(e) => setSelectedCampaign(e.target.value)}
            className="h-9 px-3 rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-xs font-semibold text-zinc-700 dark:text-zinc-300"
          >
            <option value="all">All Campaigns</option>
            {uniqueCampaigns.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>

          {/* Format Selector */}
          <select
            value={selectedFormat}
            onChange={(e) => setSelectedFormat(e.target.value)}
            className="h-9 px-3 rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-xs font-semibold text-zinc-700 dark:text-zinc-300"
          >
            <option value="all">All Formats</option>
            <option value="png">PNG</option>
            <option value="jpeg">JPEG</option>
            <option value="svg">SVG Vector</option>
            <option value="zip">ZIP Bundle</option>
            <option value="md">Markdown</option>
          </select>

          {/* Sort Selector */}
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as "newest" | "name" | "size" | "downloads")}
            className="h-9 px-3 rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-xs font-semibold text-zinc-700 dark:text-zinc-300 ml-auto"
          >
            <option value="newest">Sort: Newest Pinned</option>
            <option value="downloads">Sort: Most Downloaded</option>
            <option value="size">Sort: File Size</option>
            <option value="name">Sort: Alphabetical</option>
          </select>
        </div>
      </div>

      {/* =========================================================================
          MEDIA GALLERY GRID
         ========================================================================= */}
      {filteredAssets.length === 0 ? (
        <div className="bg-white dark:bg-zinc-900/50 border border-slate-200 dark:border-zinc-800 rounded-3xl p-12 text-center">
          <FolderArchive className="w-12 h-12 text-zinc-400 mx-auto mb-3 opacity-60" />
          <h3 className="text-base font-bold text-zinc-900 dark:text-white">
            No Creative Assets Found
          </h3>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 max-w-sm mx-auto mt-1">
            Try adjusting your search filters or upload a new banner, logo, or ZIP bundle directly
            to IPFS.
          </p>
          {onUploadClick && !isAffiliateView && (
            <Button
              onClick={onUploadClick}
              size="sm"
              className="mt-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold"
            >
              Upload Creative Asset
            </Button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredAssets.map((asset) => (
            <Card
              key={asset.id}
              className="border border-slate-200 dark:border-zinc-800 rounded-3xl bg-white dark:bg-zinc-900 overflow-hidden shadow-xs hover:shadow-lg transition-all group flex flex-col justify-between"
            >
              <div>
                {/* Media Preview Box */}
                <div className="relative h-48 w-full bg-slate-100 dark:bg-zinc-950 border-b border-slate-100 dark:border-zinc-800 flex items-center justify-center p-4 overflow-hidden">
                  {/* Subtle Grid Background */}
                  <div className="absolute inset-0 opacity-20 bg-[radial-gradient(#4f46e5_1px,transparent_1px)] [background-size:16px_16px]" />

                  {/* Visual Render according to format */}
                  {asset.category === "swipe_copy" ? (
                    <div className="relative z-10 w-full h-full p-3 bg-white/90 dark:bg-zinc-900/90 rounded-2xl border border-slate-200 dark:border-zinc-800 overflow-hidden text-left">
                      <div className="flex items-center gap-1.5 text-indigo-500 text-xs font-bold mb-1">
                        <FileText className="w-3.5 h-3.5" />
                        <span>Swipe Copy Snippet</span>
                      </div>
                      <p className="text-xs font-mono text-zinc-700 dark:text-zinc-300 line-clamp-4">
                        {asset.textContent || asset.swipeCopy?.bodyCopy}
                      </p>
                    </div>
                  ) : asset.category === "bundle" ? (
                    <div className="relative z-10 flex flex-col items-center justify-center space-y-2">
                      <div className="w-16 h-16 rounded-2xl bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-100 dark:border-indigo-500/20 flex items-center justify-center text-indigo-600 dark:text-indigo-400 shadow-xs">
                        <FileArchive className="w-8 h-8" />
                      </div>
                      <span className="text-[11px] font-mono font-bold text-zinc-500 uppercase tracking-wider">
                        ZIP Media Bundle
                      </span>
                    </div>
                  ) : asset.contentDataUrl ? (
                    <img
                      src={asset.contentDataUrl}
                      alt={asset.title}
                      className="relative z-10 max-h-full max-w-full object-contain drop-shadow-sm group-hover:scale-105 transition-transform duration-300"
                    />
                  ) : (
                    <div className="relative z-10 flex flex-col items-center justify-center space-y-2">
                      <ImageIcon className="w-12 h-12 text-zinc-400" />
                      <span className="text-[11px] font-mono text-zinc-500">
                        {asset.dimensions
                          ? `${asset.dimensions.width}×${asset.dimensions.height}`
                          : "IPFS Media"}
                      </span>
                    </div>
                  )}

                  {/* Dimension / Category Badges Overlay */}
                  <div className="absolute top-3 left-3 z-20 flex flex-wrap gap-1.5">
                    {asset.dimensions && (
                      <span className="px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider bg-black/75 text-white backdrop-blur-md">
                        {asset.dimensions.width} × {asset.dimensions.height}
                      </span>
                    )}
                    <span className="px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider bg-indigo-600 text-white">
                      {asset.fileFormat}
                    </span>
                  </div>

                  {/* Zoom Preview Trigger */}
                  <button
                    type="button"
                    onClick={() => setPreviewAsset(asset)}
                    className="absolute top-3 right-3 z-20 w-8 h-8 rounded-lg bg-black/60 hover:bg-black/80 text-white flex items-center justify-center backdrop-blur-md opacity-0 group-hover:opacity-100 transition-opacity"
                    title="Inspect Asset"
                  >
                    <Maximize2 className="w-4 h-4" />
                  </button>
                </div>

                {/* Metadata Details */}
                <CardContent className="p-5 space-y-4">
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className="text-[11px] font-bold text-indigo-600 dark:text-indigo-400 truncate">
                        {asset.campaignName}
                      </span>
                      <span className="text-[11px] font-mono text-zinc-400 shrink-0">
                        {asset.formattedSize}
                      </span>
                    </div>
                    <h4 className="text-base font-bold text-zinc-900 dark:text-white leading-snug line-clamp-1">
                      {asset.title}
                    </h4>
                    {asset.description && (
                      <p className="text-xs text-zinc-500 dark:text-zinc-400 line-clamp-2 mt-1">
                        {asset.description}
                      </p>
                    )}
                  </div>

                  {/* Persistent IPFS CID & Pin Status */}
                  <div className="p-3 bg-slate-50 dark:bg-zinc-950/70 rounded-2xl border border-slate-200 dark:border-zinc-800 space-y-1.5">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-zinc-500 dark:text-zinc-400 font-semibold flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                        Pinned IPFS CID:
                      </span>
                      <span className="px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
                        {asset.pinProvider}
                      </span>
                    </div>

                    <div className="flex items-center justify-between font-mono text-xs text-zinc-800 dark:text-zinc-200">
                      <span className="truncate max-w-[160px] sm:max-w-[180px]" title={asset.cid}>
                        {asset.cid}
                      </span>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() =>
                            copyToClipboard(`ipfs://${asset.cid}`, "IPFS URI", `${asset.id}_uri`)
                          }
                          className="p-1 rounded-md hover:bg-slate-200 dark:hover:bg-zinc-800 text-zinc-500"
                          title="Copy ipfs:// URI"
                        >
                          {copiedKey === `${asset.id}_uri` ? (
                            <Check className="w-3.5 h-3.5 text-emerald-500" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                        </button>
                        <a
                          href={asset.gatewayUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-1 rounded-md hover:bg-slate-200 dark:hover:bg-zinc-800 text-zinc-500"
                          title="Open in IPFS Gateway"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </div>

              {/* Action Buttons Footer */}
              <div className="p-5 pt-0 flex items-center justify-between gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSelectedAssetForEmbed(asset)}
                  className="flex-1 rounded-xl border-slate-200 dark:border-zinc-800 text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/30 h-10"
                >
                  <Code2 className="w-3.5 h-3.5 mr-1.5" />
                  Embed Code
                </Button>

                <Button
                  size="sm"
                  onClick={() => handleDownloadSingle(asset)}
                  className="flex-1 rounded-xl bg-zinc-900 hover:bg-zinc-800 dark:bg-white dark:hover:bg-zinc-100 text-white dark:text-zinc-900 text-xs font-bold h-10 shadow-xs"
                >
                  <Download className="w-3.5 h-3.5 mr-1.5" />
                  Download
                </Button>

                {!isAffiliateView && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleDelete(asset)}
                    className="w-10 h-10 rounded-xl text-zinc-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30"
                    title="Delete Asset"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* =========================================================================
          MODAL 1: EMBED CODE & AFFILIATE LINK GENERATOR
         ========================================================================= */}
      {selectedAssetForEmbed && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-3xl max-w-2xl w-full p-6 shadow-2xl space-y-5 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-zinc-800">
              <div className="flex items-center space-x-2">
                <div className="w-8 h-8 rounded-lg bg-indigo-50 dark:bg-indigo-500/10 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
                  <Code2 className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-black text-lg text-zinc-900 dark:text-white">
                    Affiliate Embed Codes & Integration
                  </h3>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">
                    {selectedAssetForEmbed.title}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedAssetForEmbed(null)}
                className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 font-bold"
              >
                ✕
              </button>
            </div>

            {/* Affiliate Referral Link Customizer */}
            <div>
              <label className="text-xs font-bold uppercase tracking-wider text-zinc-500 mb-1.5 block">
                Target Affiliate Referral Link
              </label>
              <Input
                value={customRefUrl}
                onChange={(e) => setCustomRefUrl(e.target.value)}
                placeholder="https://stormsale.io/ref/YOUR_ID"
                className="h-10 text-xs font-mono rounded-xl"
              />
            </div>

            {/* Code Format Tabs */}
            <div className="flex items-center gap-2 border-b border-slate-200 dark:border-zinc-800 pb-2">
              {[
                { id: "html", label: "HTML Banner" },
                { id: "markdown", label: "Markdown" },
                { id: "react", label: "React JSX" },
                { id: "direct", label: "Direct IPFS URI" },
              ].map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setEmbedTab(tab.id as "html" | "markdown" | "react" | "direct")}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                    embedTab === tab.id
                      ? "bg-indigo-600 text-white shadow-xs"
                      : "text-zinc-600 dark:text-zinc-400 hover:bg-slate-100 dark:hover:bg-zinc-800"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Code Box */}
            <div className="relative">
              <pre className="p-4 bg-slate-900 text-zinc-200 rounded-2xl text-xs font-mono overflow-x-auto max-h-48 whitespace-pre-wrap">
                {embedTab === "html" && selectedEmbedCodes?.html}
                {embedTab === "markdown" && selectedEmbedCodes?.markdown}
                {embedTab === "react" && selectedEmbedCodes?.react}
                {embedTab === "direct" &&
                  `IPFS URI:    ipfs://${selectedAssetForEmbed.cid}\nGateway URL: ${selectedAssetForEmbed.gatewayUrl}\nSHA-256:     ${selectedAssetForEmbed.checksumSha256}`}
              </pre>

              <Button
                size="sm"
                onClick={() => {
                  const codes = selectedEmbedCodes!;
                  const textToCopy =
                    embedTab === "html"
                      ? codes.html
                      : embedTab === "markdown"
                        ? codes.markdown
                        : embedTab === "react"
                          ? codes.react
                          : codes.ipfsUri;
                  copyToClipboard(textToCopy, "Embed Code", "embed_code_copied");
                }}
                className="absolute top-3 right-3 bg-white/10 hover:bg-white/20 text-white rounded-xl text-xs font-bold h-8 px-3"
              >
                {copiedKey === "embed_code_copied" ? (
                  <>
                    <Check className="w-3.5 h-3.5 mr-1 text-emerald-400" />
                    Copied!
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5 mr-1" />
                    Copy Code
                  </>
                )}
              </Button>
            </div>

            <div className="flex justify-end pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSelectedAssetForEmbed(null)}
                className="rounded-xl text-xs font-bold"
              >
                Close
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          MODAL 2: HIGH-RES ASSET INSPECTION PREVIEW
         ========================================================================= */}
      {previewAsset && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
          <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-3xl max-w-3xl w-full p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-zinc-800">
              <div>
                <h3 className="font-black text-lg text-zinc-900 dark:text-white">
                  {previewAsset.title}
                </h3>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 font-mono">
                  {previewAsset.dimensions
                    ? `${previewAsset.dimensions.width}×${previewAsset.dimensions.height}px`
                    : "Archive / Document"}{" "}
                  • {previewAsset.formattedSize}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPreviewAsset(null)}
                className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 font-bold"
              >
                ✕
              </button>
            </div>

            <div className="max-h-[60vh] overflow-auto flex items-center justify-center bg-slate-100 dark:bg-zinc-950 rounded-2xl p-6 border border-slate-200 dark:border-zinc-800">
              {previewAsset.contentDataUrl ? (
                <img
                  src={previewAsset.contentDataUrl}
                  alt={previewAsset.title}
                  className="max-h-[50vh] max-w-full object-contain rounded-lg"
                />
              ) : previewAsset.textContent ? (
                <pre className="text-xs font-mono p-4 bg-white dark:bg-zinc-900 rounded-xl w-full max-h-[50vh] overflow-y-auto whitespace-pre-wrap text-zinc-800 dark:text-zinc-200">
                  {previewAsset.textContent}
                </pre>
              ) : (
                <div className="text-center p-8 space-y-2">
                  <FileArchive className="w-16 h-16 text-indigo-500 mx-auto" />
                  <p className="text-sm font-bold text-zinc-900 dark:text-white">
                    {previewAsset.name}
                  </p>
                  <p className="text-xs text-zinc-500 font-mono">IPFS CID: {previewAsset.cid}</p>
                </div>
              )}
            </div>

            <div className="flex items-center justify-between pt-2">
              <span className="text-xs font-mono text-zinc-400">
                SHA-256: {previewAsset.checksumSha256.slice(0, 16)}...
              </span>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={() => handleDownloadSingle(previewAsset)}
                  className="bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold"
                >
                  <Download className="w-3.5 h-3.5 mr-1" /> Download Asset
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPreviewAsset(null)}
                  className="rounded-xl text-xs font-bold"
                >
                  Close
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
